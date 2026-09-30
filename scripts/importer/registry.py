"""Approval gate shared by every offline promotion; no implicit activation."""
import re
from urllib.parse import urlparse
from common import day, require, timestamp

APPROVED = {'osm', 'geofabrik', 'meti-prices'}
FIELDS = ['id', 'source', 'owner', 'sourceUrl', 'purpose', 'termsUrl', 'license', 'allowedUseAssessment', 'attribution', 'refreshPolicy', 'transformationVersion']

def https(value):
    u = urlparse(value if isinstance(value, str) else '')
    return u.scheme == 'https' and bool(u.hostname) and not u.username and not u.password

def validate_registry(registry, manifest=None):
    require(registry.get('schemaVersion') == 1 and registry.get('milestone') == 'M0.1', 'Invalid registry schema/milestone')
    require(isinstance(registry.get('sources'), list) and registry['sources'], 'Empty registry')
    seen, active = set(), set()
    for entry in registry['sources']:
        require(all(isinstance(entry.get(k), str) and entry[k].strip() for k in FIELDS), 'Missing source review field')
        ident = entry['id']
        require(ident not in seen and entry['source'] == ident, 'Duplicate/mismatched source identifier')
        seen.add(ident)
        require(https(entry['sourceUrl']) and https(entry['termsUrl']), 'Unsafe source/terms URL')
        if entry.get('productionEnabled') is False and entry.get('status') == 'PENDING_REVIEW':
            require(all(entry.get(k) is None for k in ['reviewDate', 'fetchedAt', 'sourceUpdatedAt']) and entry['transformationVersion'] == 'not-ingested' and 'inputSha256' not in entry and 'manifestPath' not in entry, 'Pending source cannot have ingestion proof')
            continue
        require(ident in APPROVED and entry.get('productionEnabled') is True and entry.get('status') == 'APPROVED', f'Unapproved source: {ident}')
        active.add(ident)
        day(entry.get('reviewDate'))
        license_url = 'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0' if ident == 'meti-prices' else 'https://opendatacommons.org/licenses/odbl/1-0/'
        require(entry.get('licenseUrl') == license_url, 'Unreviewed license')
        if manifest is not None:
            timestamp(entry.get('fetchedAt'))
            updated = entry.get('sourceUpdatedAt')
            day(updated) if ident == 'meti-prices' else timestamp(updated)
            require(entry.get('manifestPath') == '/data/manifest.json' and re.fullmatch('[a-f0-9]{64}', entry.get('inputSha256', '')), 'Missing ingestion proof')
            pattern = r'https://www\.enecho\.meti\.go\.jp/statistics/petroleum_and_lpgas/pl007/xlsx/\d{6}\.xlsx' if ident == 'meti-prices' else r'https://download\.geofabrik\.de/asia/japan-\d{6}\.osm\.pbf'
            require(re.fullmatch(pattern, entry.get('ingestedSourceUrl', '')), 'Unreviewed input source URL')
            proofs = [p for p in manifest.get('sources', []) if p.get('sourceId') == ident]
            require(len(proofs) == 1, 'Missing/duplicate manifest source proof')
            p = proofs[0]
            require(all(entry[k] == p.get(k) for k in ['inputSha256', 'fetchedAt', 'sourceUpdatedAt', 'transformationVersion']) and p.get('sourceUrl') == entry['ingestedSourceUrl'], 'Manifest/source registry proof mismatch')
            dataset = manifest['prices' if ident == 'meti-prices' else 'stations']
            require(dataset['inputSha256'] == p['inputSha256'] and ident in dataset['sourceIds'] and dataset['transformationVersion'] == p['transformationVersion'] == manifest['transformationVersion'], 'Dataset source/hash mismatch')
    require(active == APPROVED, 'Exactly the three reviewed data sources required')
    if manifest is not None:
        require(len(manifest.get('sources', [])) == 3 and {p['sourceId'] for p in manifest['sources']} == APPROVED, 'Unapproved manifest source')
