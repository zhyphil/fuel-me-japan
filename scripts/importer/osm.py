"""OSM objects and administrative areas; no nearest-prefecture inference."""
from collections import Counter
from datetime import datetime, timezone
import json
from shapely import make_valid
from shapely.geometry import shape
from shapely.strtree import STRtree
from common import CODES, require, validate_station

BRANDS = {'eneos': 'ENEOS', 'エネオス': 'ENEOS', 'apollostation': 'apollostation', 'アポロステーション': 'apollostation', 'idemitsu': 'Idemitsu', '出光': 'Idemitsu', 'cosmo': 'Cosmo', 'cosmo oil': 'Cosmo', 'コスモ石油': 'Cosmo', 'shell': 'Shell', '昭和シェル石油': 'Shell'}
RANK = {'Point': 1, 'LineString': 2, 'MultiLineString': 2, 'Polygon': 3, 'MultiPolygon': 4}

def tri(tags, keys, parent=None):
    if any(key + ':conditional' in tags for key in keys + ([parent] if parent else [])):
        return 'UNKNOWN'
    values = [str(tags[k]).strip().lower() for k in keys if k in tags]
    if not values or any(v not in {'yes', 'no'} for v in values) or len(set(values)) > 1:
        return 'UNKNOWN'
    value = values[0]
    # A positive specific tag conflicting with an explicit negative parent is ambiguous.
    if value == 'yes' and parent and tags.get(parent) == 'no':
        return 'UNKNOWN'
    return 'YES' if value == 'yes' else 'NO'

def service_type(tags):
    # A single enum cannot express mixed or time-dependent service. Do not guess.
    if any(key in tags for key in ['self_service:conditional', 'full_service:conditional',
                                   'opening_hours:self_service', 'opening_hours:full_service']):
        return 'UNKNOWN'
    own, attended = tags.get('self_service'), tags.get('full_service')
    if own in {'yes', 'only'} and attended in {None, 'no'}:
        return 'SELF'
    if own == 'no' and attended == 'yes':
        return 'FULL'
    return 'UNKNOWN'

def clean_geometry(feature, audit, category):
    p = feature['properties']
    ident = f"{p.get('@type')}:{p.get('@id')}"
    geometry = shape(feature['geometry'])
    require(not geometry.is_empty, f'Empty {category} geometry: {ident}')
    if not geometry.is_valid:
        geometry = make_valid(geometry)
        audit['repaired'].append({'object': ident, 'category': category, 'resultType': geometry.geom_type})
    require(geometry.is_valid and not geometry.is_empty and geometry.geom_type in RANK, f'Unusable geometry: {ident}; publication blocked, object not silently discarded')
    return geometry

def station(feature, point, code, method):
    tags = feature['properties']
    osm_type, osm_id = tags.get('@type'), tags.get('@id')
    require((osm_type == 'node') == (method == 'OSM_NODE'), 'OSM object type/geometry mismatch')
    updated = tags.get('@timestamp')
    require(type(updated) in {int, float}, 'Missing OSM timestamp')
    s = {'id': f'osm:{osm_type}:{osm_id}', 'osmType': osm_type, 'osmId': osm_id,
         'lat': round(point.y, 7), 'lon': round(point.x, 7), 'prefectureCode': code,
         'positionMethod': method, 'source': 'osm',
         'sourceUpdatedAt': datetime.fromtimestamp(updated, timezone.utc).isoformat().replace('+00:00', 'Z'),
         # self_service=no alone does not prove full attendant service.
         'serviceType': service_type(tags),
         'paymentVisa': tri(tags, ['payment:visa'], 'payment:credit_cards'),
         'paymentMastercard': tri(tags, ['payment:mastercard'], 'payment:credit_cards'),
         'fuelRegular': tri(tags, ['fuel:regular', 'fuel:レギュラー'], 'fuel:gasoline'),
         'fuelHighOctane': tri(tags, ['fuel:high_octane', 'fuel:ハイオク'], 'fuel:gasoline'),
         'fuelDiesel': tri(tags, ['fuel:diesel', 'fuel:軽油'])}
    for key, tag in [('name', 'name'), ('openingHours', 'opening_hours'), ('originalBrand', 'brand'), ('city', 'addr:city')]:
        if isinstance(tags.get(tag), str) and tags[tag].strip():
            s[key] = tags[tag].strip()
    if 'originalBrand' in s and s['originalBrand'].casefold() in BRANDS:
        s['normalizedBrand'] = BRANDS[s['originalBrand'].casefold()]
    address = tags.get('addr:full') or ' '.join(str(tags[k]) for k in ['addr:province', 'addr:city', 'addr:suburb', 'addr:quarter', 'addr:street', 'addr:housenumber'] if tags.get(k))
    if address:
        s['address'] = address
    validate_station(s)
    return s

def parse_osm(path):
    objects, boundaries = {}, {}
    audit = {'inputFuelFeatures': 0, 'duplicatesRemoved': 0, 'inputGeometryTypes': Counter(), 'selectedGeometryTypes': Counter(), 'repaired': [], 'rejected': [], 'unknownAssignments': [], 'ignoredSupportFeatures': 0}
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            feature = json.loads(line.lstrip('\x1e'))
            tags = feature['properties']
            if tags.get('amenity') == 'fuel':
                audit['inputFuelFeatures'] += 1
                geometry_type = feature['geometry']['type']
                audit['inputGeometryTypes'][geometry_type] += 1
                require(geometry_type in RANK, f'Unsupported station geometry: {geometry_type}')
                key = (tags.get('@type'), tags.get('@id'))
                if key in objects:
                    old = objects[key]
                    require(old['properties'] == tags, f'Conflicting duplicate tags: {key}')
                    audit['duplicatesRemoved'] += 1
                    old_type = old['geometry']['type']
                    if RANK[geometry_type] == RANK[old_type]:
                        require(feature['geometry'] == old['geometry'], f'Conflicting duplicate geometry: {key}')
                    if RANK[geometry_type] <= RANK[old_type]:
                        continue
                objects[key] = feature
            elif tags.get('@type') == 'relation' and tags.get('admin_level') == '4' and tags.get('ISO3166-2') in CODES and tags.get('boundary') == 'administrative':
                code = tags['ISO3166-2']
                require(code not in boundaries, f'Duplicate prefecture boundary: {code}')
                geometry = clean_geometry(feature, audit, 'prefecture')
                require(geometry.geom_type in {'Polygon', 'MultiPolygon'}, f'Non-area prefecture: {code}')
                boundaries[code] = geometry
            else:
                audit['ignoredSupportFeatures'] += 1
    require(set(boundaries) == set(CODES), 'Exactly 47 complete prefecture relation geometries required')
    require(objects, 'Empty OSM output')
    codes = sorted(boundaries)
    tree = STRtree([boundaries[c] for c in codes])
    partitions = {c: [] for c in CODES + ['UNKNOWN']}
    for key, feature in sorted(objects.items()):
        geometry = clean_geometry(feature, audit, 'station')
        audit['selectedGeometryTypes'][geometry.geom_type] += 1
        if geometry.geom_type == 'Point':
            point, method = geometry, 'OSM_NODE'
        elif geometry.geom_type in {'Polygon', 'MultiPolygon'}:
            point, method = geometry.representative_point(), 'SURFACE_POINT'
        else:
            point, method = geometry.interpolate(.5, normalized=True), 'LINE_MIDPOINT'
        matches = [codes[i] for i in tree.query(point, predicate='covered_by')]
        code = matches[0] if len(matches) == 1 else 'UNKNOWN'
        s = station(feature, point, code, method)
        if code == 'UNKNOWN':
            audit['unknownAssignments'].append({'id': s['id'], 'reason': 'OUTSIDE_AVAILABLE_BOUNDARIES' if not matches else 'AMBIGUOUS_BOUNDARIES', 'candidates': matches})
        partitions[code].append(s)
    for rows in partitions.values():
        rows.sort(key=lambda s: s['id'])
    audit['uniqueObjects'] = len(objects)
    audit['assigned'] = len(objects) - len(partitions['UNKNOWN'])
    audit['unassigned'] = len(partitions['UNKNOWN'])
    require(sum(map(len, partitions.values())) == len(objects), 'Station loss')
    return partitions, audit
