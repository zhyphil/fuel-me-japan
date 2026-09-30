"""Publish JSON Schema 2020-12 contracts; cross-file proofs also need runtime validators."""
from pathlib import Path
from common import CODES, encode

STR = {'type': 'string', 'minLength': 1}
DAY = {'type': 'string', 'format': 'date'}
TIME = {'type': 'string', 'format': 'date-time'}
SHA = {'type': 'string', 'pattern': '^[a-f0-9]{64}$'}
TRI = {'enum': ['YES', 'NO', 'UNKNOWN']}
PREF = {'enum': CODES}
PART = {'enum': CODES + ['UNKNOWN']}
NUM = {'type': 'integer', 'minimum': 0}
URL = {'type': 'string', 'format': 'uri', 'pattern': '^https://'}

def obj(properties, required=None, additional=False):
    return {'type': 'object', 'properties': properties, 'required': required if required is not None else list(properties), 'additionalProperties': additional}

def array(items, **kwargs):
    return {'type': 'array', 'items': items, **kwargs}

ART = obj({'path': {'type': 'string', 'pattern': '^/data/[A-Za-z0-9_/-]+(?:\\.[A-Za-z0-9_-]+)?\\.json$'}, 'sha256': SHA, 'bytes': {'type': 'integer', 'minimum': 1}})
BBOX = {'type': 'array', 'prefixItems': [{'type': 'number', 'minimum': 122, 'maximum': 155}, {'type': 'number', 'minimum': 20, 'maximum': 46}, {'type': 'number', 'minimum': 122, 'maximum': 155}, {'type': 'number', 'minimum': 20, 'maximum': 46}], 'minItems': 4, 'maxItems': 4}
station_props = {'id': {'type': 'string', 'pattern': '^osm:(node|way|relation):[1-9][0-9]*$'}, 'osmType': {'enum': ['node', 'way', 'relation']}, 'osmId': {'type': 'integer', 'minimum': 1}, 'lat': {'type': 'number', 'minimum': 20, 'maximum': 46}, 'lon': {'type': 'number', 'minimum': 122, 'maximum': 155}, 'serviceType': {'enum': ['SELF', 'FULL', 'UNKNOWN']}, **{k: TRI for k in ['paymentVisa', 'paymentMastercard', 'fuelRegular', 'fuelHighOctane', 'fuelDiesel']}, 'source': {'const': 'osm'}, 'sourceUpdatedAt': TIME, 'prefectureCode': PART, 'positionMethod': {'enum': ['OSM_NODE', 'SURFACE_POINT', 'LINE_MIDPOINT']}}
station_required = list(station_props)
station_props.update({k: STR for k in ['name', 'originalBrand', 'normalizedBrand', 'address', 'openingHours', 'city']})
STATION = obj(station_props, station_required)
PRICE_ROW = obj({'prefectureCode': PREF, 'fuelType': {'enum': ['REGULAR', 'HIGH_OCTANE', 'DIESEL']}, 'priceJpy': {'type': 'number', 'minimum': 50, 'maximum': 400}, 'surveyDate': DAY, 'publishedAt': DAY, 'fetchedAt': TIME, 'sourceUrl': URL})
PRICE = obj({'schemaVersion': {'const': 1}, 'source': {'const': 'meti-prices'}, 'unit': {'const': 'JPY/L'}, 'basis': {'const': 'CASH_TAX_INCLUDED_PREFECTURAL_REFERENCE'}, 'surveyDate': DAY, 'publishedAt': DAY, 'fetchedAt': TIME, 'sourceUrl': URL, 'records': array(PRICE_ROW, minItems=141, maxItems=141)})
PROOF = obj({'sourceId': {'enum': ['osm', 'geofabrik', 'meti-prices']}, 'sourceUrl': URL, 'inputSha256': SHA, 'fetchedAt': TIME, 'sourceUpdatedAt': {'anyOf': [DAY, TIME]}, 'transformationVersion': STR})
PARTITION = obj({**ART['properties'], 'code': PART, 'count': NUM, 'bbox': {'anyOf': [BBOX, {'type': 'null'}]}, 'cells': array(BBOX)})
MANIFEST = obj({'schemaVersion': {'const': 1}, 'milestone': {'const': 'M0.1'}, 'transformationVersion': STR, 'sourceRegistry': ART, 'sources': array(PROOF, minItems=3, maxItems=3), 'stations': obj({'version': STR, 'transformationVersion': STR, 'inputSha256': SHA, 'sourceIds': {'const': ['osm', 'geofabrik']}, 'sourceUpdatedAt': TIME, 'count': {'type': 'integer', 'minimum': 1}, 'partitions': array(PARTITION, minItems=48, maxItems=48), 'audit': ART, 'license': {'const': 'ODbL-1.0'}, 'licenseUrl': {'const': 'https://opendatacommons.org/licenses/odbl/1-0/'}, 'noticeUrl': {'const': '/data/OSM-NOTICE.txt'}, 'coverage': STR}), 'prices': obj({**ART['properties'], 'transformationVersion': STR, 'inputSha256': SHA, 'sourceIds': {'const': ['meti-prices']}, 'count': {'const': 141}, 'surveyDate': DAY, 'publishedAt': DAY, 'unit': {'const': 'JPY/L'}, 'basis': {'const': 'CASH_TAX_INCLUDED_PREFECTURAL_REFERENCE'}})})
SOURCE = obj({**{k: STR for k in ['id', 'source', 'owner', 'purpose', 'license', 'allowedUseAssessment', 'attribution', 'refreshPolicy', 'transformationVersion']}, 'sourceUrl': URL, 'termsUrl': URL, 'licenseUrl': URL, 'reviewDate': {'anyOf': [DAY, {'type': 'null'}]}, 'status': {'enum': ['APPROVED', 'PENDING_REVIEW']}, 'productionEnabled': {'type': 'boolean'}, 'fetchedAt': {'anyOf': [TIME, {'type': 'null'}]}, 'sourceUpdatedAt': {'anyOf': [DAY, TIME, {'type': 'null'}]}, 'inputSha256': SHA, 'ingestedSourceUrl': URL, 'manifestPath': {'const': '/data/manifest.json'}}, ['id', 'source', 'owner', 'sourceUrl', 'purpose', 'termsUrl', 'license', 'allowedUseAssessment', 'attribution', 'refreshPolicy', 'transformationVersion', 'reviewDate', 'status', 'productionEnabled', 'fetchedAt', 'sourceUpdatedAt'])
SOURCE['allOf'] = [{'if': {'properties': {'productionEnabled': {'const': True}}}, 'then': {'required': ['licenseUrl', 'inputSha256', 'ingestedSourceUrl', 'manifestPath'], 'properties': {'status': {'const': 'APPROVED'}, 'reviewDate': DAY, 'fetchedAt': TIME, 'sourceUpdatedAt': {'anyOf': [DAY, TIME]}}}, 'else': {'properties': {'status': {'const': 'PENDING_REVIEW'}, 'reviewDate': {'type': 'null'}, 'fetchedAt': {'type': 'null'}, 'sourceUpdatedAt': {'type': 'null'}, 'transformationVersion': {'const': 'not-ingested'}}}}]
SCHEMAS = {'station': STATION, 'station-file': obj({'schemaVersion': {'const': 1}, 'version': STR, 'prefectureCode': PART, 'stations': array(STATION)}), 'price-file': PRICE, 'data-manifest': MANIFEST, 'source-registry': obj({'schemaVersion': {'const': 1}, 'milestone': {'const': 'M0.1'}, 'sources': array(SOURCE, minItems=1)})}

if __name__ == '__main__':
    target = Path(__file__).resolve().parents[2] / 'public/data/schemas'
    target.mkdir(parents=True, exist_ok=True)
    for name, schema in SCHEMAS.items():
        schema = {'$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': f'https://fuel-me-japan.com/data/schemas/{name}.schema.json', 'title': f'Fuel Me Japan M0.1 {name}', '$comment': 'Runtime validators additionally enforce stable-ID equality, uniqueness, timestamps, exact prefecture/fuel coverage, hash/source consistency, bbox/cell membership and source approval.', **schema}
        (target / f'{name}.schema.json').write_bytes(encode(schema))
