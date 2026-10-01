#!/usr/bin/env python3
"""Manual data refresh. No scheduler, deployment or runtime network service."""
import argparse
from contextlib import contextmanager
import fcntl
import json
from pathlib import Path
import subprocess
import tempfile
from datetime import datetime, timezone
from common import CODES, VERSION, atomic_write, count_gate, digest, encode, immutable_write, read_json, require, sha, timestamp, verified_input
from download import open_source
from osm import parse_osm
from prices import parse_prices, validate_prices
from registry import validate_registry

ROOT = Path(__file__).resolve().parents[2]

def artifact(output, relative, data):
    payload = encode(data)
    immutable_write(output / relative, payload)
    return {'path': '/data/' + relative, 'sha256': sha(payload), 'bytes': len(payload)}

def load_artifact(output, descriptor):
    import re
    require(re.fullmatch(r'/data/[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_-]+)?\.json', descriptor['path']) and '..' not in descriptor['path'], 'Unsafe artifact path')
    path = output / descriptor['path'].removeprefix('/data/')
    require(digest(path) == descriptor['sha256'] and path.stat().st_size == descriptor['bytes'], f'Artifact hash/size mismatch: {path}')
    return read_json(path)

def proof(source, metadata, updated):
    return {'sourceId': source, 'sourceUrl': metadata['sourceUrl'], 'inputSha256': metadata['sha256'], 'fetchedAt': metadata['fetchedAt'], 'sourceUpdatedAt': updated, 'transformationVersion': VERSION}

@contextmanager
def lock(output):
    output.mkdir(parents=True, exist_ok=True)
    with open(output / '.import.lock', 'a') as file:
        fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield

def update(args):
    output = Path(args.output).resolve()
    with lock(output):
        current = read_json(output / 'manifest.json') if (output / 'manifest.json').exists() else None
        previous_registry_bytes = (output / 'source-registry.json').read_bytes()
        registry = json.loads(previous_registry_bytes)
        validate_registry(registry, current)
        approved = {s['id']: s for s in registry['sources'] if s.get('productionEnabled') and s.get('status') == 'APPROVED'}
        for source in ['osm', 'geofabrik', 'meti-prices']:
            require(source in approved and approved[source].get('reviewDate'), f'Source not approved: {source}')
        manifest = {'schemaVersion': 1, 'milestone': 'M0.1', 'transformationVersion': VERSION, 'sources': list(current['sources']) if current else []}
        proofs = {p['sourceId']: p for p in manifest['sources']}
        changed = False
        if args.kind in {'all', 'osm'}:
            require(args.pbf and args.osm_metadata, '--pbf and --osm-metadata required')
            meta = verified_input(args.pbf, read_json(args.osm_metadata), 'download.geofabrik.de')
            fileinfo = json.loads(subprocess.check_output([args.osmium, 'fileinfo', '-j', args.pbf]))
            updated = fileinfo['header']['option']['osmosis_replication_timestamp']
            timestamp(updated)
            require(timestamp(updated) <= timestamp(meta['fetchedAt']), 'OSM updated after fetch')
            old = current.get('stations') if current else None
            if old:
                require(timestamp(updated) >= timestamp(old['sourceUpdatedAt']), 'Older OSM replacement blocked')
            if old and old['inputSha256'] == meta['sha256'] and old['transformationVersion'] == VERSION:
                manifest['stations'] = old
                print('OSM input unchanged: no-op')
            else:
                # Original PBF is the reproducible path. Existing intermediates require an exact,
                # trusted derivation descriptor tying their SHA to this verified PBF SHA.
                with tempfile.TemporaryDirectory(prefix='fmj-osm-') as temp:
                    if args.intermediate:
                        require(args.intermediate_proof, 'Intermediate requires --intermediate-proof')
                        derivation = read_json(args.intermediate_proof)
                        require(derivation.get('inputSha256') == meta['sha256'] and derivation.get('intermediateSha256') == digest(args.intermediate), 'Intermediate provenance mismatch')
                        require(derivation.get('filter') == ['nwr/amenity=fuel', 'r/admin_level=4'] and derivation.get('attributes') == ['type', 'id', 'timestamp'], 'Intermediate transformation mismatch')
                        intermediate = args.intermediate
                    else:
                        filtered, intermediate = str(Path(temp) / 'filtered.osm.pbf'), str(Path(temp) / 'export.geojsonseq')
                        subprocess.run([args.osmium, 'tags-filter', args.pbf, 'nwr/amenity=fuel', 'r/admin_level=4', '-o', filtered], check=True)
                        subprocess.run([args.osmium, 'export', filtered, '-f', 'geojsonseq', '--attributes=type,id,timestamp', '-o', intermediate], check=True)
                        derivation = {'inputSha256': meta['sha256'], 'intermediateSha256': digest(intermediate), 'filter': ['nwr/amenity=fuel', 'r/admin_level=4'], 'attributes': ['type', 'id', 'timestamp'], 'osmiumVersion': subprocess.check_output([args.osmium, '--version'], text=True).splitlines()[0]}
                    partitions, audit = parse_osm(intermediate)
                counts = {c: len(rows) for c, rows in partitions.items()}
                audit['countReview'] = count_gate({p['code']: p['count'] for p in old['partitions']} if old else None, counts, args.bootstrap, args.review_count_change)
                audit['derivation'] = derivation
                version = f"{updated[:10]}-{meta['sha256'][:12]}-{VERSION}"
                entries = []
                for code, rows in partitions.items():
                    bounds = [min(s['lon'] for s in rows), min(s['lat'] for s in rows), max(s['lon'] for s in rows), max(s['lat'] for s in rows)] if rows else None
                    # 0.5-degree occupied cell bboxes avoid island-prefecture broad-envelope overfetch.
                    cells = sorted({(int(s['lon'] * 2), int(s['lat'] * 2)) for s in rows})
                    entry = {'code': code, 'count': len(rows), 'bbox': bounds, 'cells': [[x / 2, y / 2, (x + 1) / 2, (y + 1) / 2] for x, y in cells], **artifact(output, f'stations/{version}/{code}.json', {'schemaVersion': 1, 'version': version, 'prefectureCode': code, 'stations': rows})}
                    entries.append(entry)
                manifest['stations'] = {'version': version, 'transformationVersion': VERSION, 'inputSha256': meta['sha256'], 'sourceIds': ['osm', 'geofabrik'], 'sourceUpdatedAt': updated, 'count': sum(counts.values()), 'partitions': entries, 'audit': artifact(output, f'stations/{version}/audit.json', audit), 'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'noticeUrl': '/data/OSM-NOTICE.txt', 'coverage': 'Partial OpenStreetMap coverage; not a complete inventory of businesses'}
                proofs.update({s: proof(s, meta, updated) for s in ['osm', 'geofabrik']})
                changed = True
        else:
            require(current, 'Initial build requires both datasets')
            manifest['stations'] = current['stations']
        if args.kind in {'all', 'prices'}:
            require(args.workbook and args.price_metadata, '--workbook and --price-metadata required')
            meta = verified_input(args.workbook, read_json(args.price_metadata), 'www.enecho.meti.go.jp')
            old = current.get('prices') if current else None
            if old and old['inputSha256'] == meta['sha256'] and old['transformationVersion'] == VERSION:
                manifest['prices'] = old
                print('Price input unchanged: no-op')
            else:
                data = parse_prices(args.workbook, meta)
                previous = load_artifact(output, old) if old else None
                validate_prices(data, previous)
                manifest['prices'] = {**artifact(output, f"prices/archive/{data['publishedAt']}-{sha(encode(data))[:12]}.json", data), 'transformationVersion': VERSION, 'inputSha256': meta['sha256'], 'sourceIds': ['meti-prices'], 'count': len(data['records']), 'surveyDate': data['surveyDate'], 'publishedAt': data['publishedAt'], 'unit': data['unit'], 'basis': data['basis']}
                proofs['meti-prices'] = proof('meti-prices', meta, data['publishedAt'])
                changed = True
        else:
            require(current, 'Initial build requires both datasets')
            manifest['prices'] = current['prices']
        manifest['sources'] = [proofs[s] for s in sorted(proofs)]
        # Verify all referenced immutable files, including reused datasets, before promotion.
        seen = set()
        for entry in manifest['stations']['partitions']:
            data = load_artifact(output, entry)
            require(len(data['stations']) == entry['count'], 'Partition count mismatch')
            for s in data['stations']:
                from common import validate_station
                validate_station(s)
                require(s['id'] not in seen and s['prefectureCode'] == entry['code'], 'Duplicate/mispartitioned station')
                seen.add(s['id'])
        require(len(seen) == manifest['stations']['count'] and set(e['code'] for e in manifest['stations']['partitions']) == set(CODES + ['UNKNOWN']), 'Invalid manifest coverage')
        validate_prices(load_artifact(output, manifest['prices']))
        load_artifact(output, manifest['stations']['audit'])
        if not changed:
            print('All input hashes unchanged; pointers and fetchedAt retained')
            return
        for source, p in proofs.items():
            for field in ['fetchedAt', 'sourceUpdatedAt', 'transformationVersion', 'inputSha256']:
                approved[source][field] = p[field]
            approved[source]['ingestedSourceUrl'] = p['sourceUrl']
            approved[source]['manifestPath'] = '/data/manifest.json'
        registry['milestone'] = 'M0.1'
        validate_registry(registry, manifest)
        registry_bytes = encode(registry)
        manifest['sourceRegistry'] = artifact(output, f'registry/{sha(registry_bytes)[:16]}.json', registry)
        # Authoritative pointer is promoted LAST, atomically. Readers must follow this pointer,
        # not directory scans. A failure can leave harmless unreferenced immutable files.
        immutable_write(output / f"manifests/{sha(encode(manifest))}.json", encode(manifest))
        atomic_write(output / 'source-registry.json', registry_bytes)
        try:
            atomic_write(output / 'manifest.json', encode(manifest))
        except BaseException:
            # Readers follow the immutable registry referenced by the old manifest.
            # Restore the human-readable alias too if final pointer promotion fails.
            atomic_write(output / 'source-registry.json', previous_registry_bytes)
            raise
        print(json.dumps({'stations': manifest['stations']['count'], 'prices': manifest['prices']['count'], 'manifestSha256': sha(encode(manifest)), 'assigned': manifest['stations']['count'] - next(p['count'] for p in manifest['stations']['partitions'] if p['code'] == 'UNKNOWN')}, indent=2))

def fetch_price(args):
    """Explicit dated URL only. HTTP failures never touch the published dataset."""
    from urllib.parse import urlparse
    from prices import SHEET, date_cell
    import openpyxl
    url = urlparse(args.url)
    require(url.scheme == 'https' and url.netloc == 'www.enecho.meti.go.jp' and url.path.startswith('/statistics/petroleum_and_lpgas/pl007/xlsx/') and url.path.endswith('.xlsx'), 'Only exact official XLSX URLs accepted')
    target = Path(args.destination)
    require(not target.exists() and not Path(str(target) + '.json').exists(), 'Download destination must be new')
    with open_source(args.url, timeout=60) as response:
        payload = response.read(5 * 1024 * 1024 + 1)
        require(len(payload) <= 5 * 1024 * 1024 and payload.startswith(b'PK'), 'Invalid workbook download')
    with tempfile.TemporaryDirectory(prefix='fmj-price-') as temp:
        file = Path(temp) / 'download.xlsx'
        file.write_bytes(payload)
        workbook = openpyxl.load_workbook(file, read_only=True, data_only=True)
        try:
            sheet = workbook[SHEET]
            published, survey = date_cell(sheet['E2'].value), date_cell(sheet['D6'].value)
        finally:
            workbook.close()
        meta = {'sourceUrl': args.url, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'sha256': sha(payload), 'bytes': len(payload), 'publishedAt': published, 'surveyDate': survey, 'acquisition': 'HTTP official workbook download'}
        parse_prices(file, meta)
    atomic_write(target, payload)
    atomic_write(str(target) + '.json', encode(meta))
    print(f'Validated workbook saved: {target}; run refresh prices to promote')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    refresh = sub.add_parser('refresh')
    refresh.add_argument('kind', choices=['all', 'osm', 'prices'])
    refresh.add_argument('--output', default=str(ROOT / 'public/data'))
    refresh.add_argument('--pbf')
    refresh.add_argument('--osm-metadata')
    refresh.add_argument('--osmium', default='osmium')
    refresh.add_argument('--intermediate')
    refresh.add_argument('--intermediate-proof')
    refresh.add_argument('--workbook')
    refresh.add_argument('--price-metadata')
    refresh.add_argument('--bootstrap', action='store_true')
    refresh.add_argument('--review-count-change')
    download = sub.add_parser('fetch-price')
    download.add_argument('--url', required=True)
    download.add_argument('--destination', required=True)
    args = parser.parse_args()
    try:
        update(args) if args.command == 'refresh' else fetch_price(args)
    except Exception as error:
        parser.exit(1, f'BLOCKED: {error}; no automatic fallback or deployment. Check the authoritative manifest before retrying.\n')

if __name__ == '__main__':
    main()
