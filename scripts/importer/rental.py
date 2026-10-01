"""全国租车候选离线导入。原始输入留在临时目录；不联网，不自动更新核对日期。"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlparse, parse_qs

from shapely import make_valid
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

from common import CODES, encode, sha, atomic_write, immutable_write, require

TRANSFORM = 'rental-v1'
BASE = '/data/rental/nationwide/'
OSM_DATE = '2026-09-29'
RELEASE = '2026-09-23.1'
LICENSES = {'Foursquare': 'Apache-2.0', 'Overture': 'CDLA-Permissive-2.0',
            'meta': 'CDLA-Permissive-2.0', 'AllThePlaces': 'CC0-1.0'}
COMPANIES = {
    'toyota': ('Toyota Rent a Car', ['トヨタ', 'toyota', 'rent.toyota.co.jp']),
    'nippon': ('Nippon Rent-A-Car', ['ニッポン', 'nippon', 'nipponrentacar.co.jp']),
    'orix': ('ORIX Rent a Car', ['オリックス', 'orix', 'car.orix.co.jp']),
    'times': ('Times CAR RENTAL', ['タイムズ', 'times', 'mazda-rentacar.co.jp']),
    'nissan': ('Nissan Rent a Car', ['日産', 'nissan', 'nissan-rentacar.com']),
    'budget': ('Budget Rent a Car', ['バジェット', 'budget']),
    'niconico': ('Niconico Rent a Car', ['ニコニコ', 'niconico', '2525r.com']),
    'honda': ('Honda Rent a Car', ['ホンダ', 'honda']),
    'ekiren': ('JR Rent-A-Car', ['駅レンタカー', '駅レンタカ', 'ekiren']),
    'ots': ('OTS Rent a Car', ['otsレンタカー', 'ots rent', 'otsinternational.jp']),
}
RANK = {'Point': 1, 'LineString': 2, 'MultiLineString': 2, 'Polygon': 3, 'MultiPolygon': 4}
FORBIDDEN = {'__proto__', 'prototype', 'constructor'}
ROOT = Path(__file__).resolve().parents[2]
REVIEWED = json.loads((ROOT / 'src/lib/rental-reviewed.json').read_text())
INPUT_LOCK = json.loads((ROOT / 'data/curation/rental-input-lock.json').read_text())
OFFICIAL_SOURCES = {
    'times-official': ('times', '2026-09-30', 'https://www.timescar-rental.com/en/'),
    'nippon-official': ('nippon', '2026-10-01', 'https://www.nipponrentacar.co.jp/'),
    'toyota-official': ('toyota', '2026-10-01', 'https://rent.toyota.co.jp/'),
}


def safe_tree(value):
    if isinstance(value, dict):
        require(not FORBIDDEN.intersection(value), '不允许原型污染键')
        for v in value.values():
            safe_tree(v)
    elif isinstance(value, list):
        for v in value:
            safe_tree(v)
    elif isinstance(value, float):
        require(math.isfinite(value), '不允许非有限数值')


def read(path):
    def pairs(items):
        result = {}
        for k, v in items:
            require(k not in result, '重复 JSON 键')
            result[k] = v
        return result
    v = json.loads(Path(path).read_text(), object_pairs_hook=pairs)
    safe_tree(v)
    return v


def normalized(value):
    return re.sub(r'[\W_]+', '', unicodedata.normalize('NFKC', value).casefold())


def company(name, websites=(), brand=''):
    # 原 name 优先；错误 brand 分店不能替换原名称。
    for text in [name, ' '.join(websites), brand]:
        found = [k for k, (_, tokens) in COMPANIES.items() if any(normalized(t) in normalized(text) for t in tokens)]
        if len(found) == 1:
            return found[0], COMPANIES[found[0]][0]
    return 'UNKNOWN', None


def branch_name(row):
    n = normalized(row['names']['primary'] or '')
    cid = row['companyId']
    tokens = ['レンタカー', 'カーレンタル', 'カー', 'rentalcar', 'carrental', 'rentacar', 'rentcar']
    if cid in COMPANIES:
        tokens += COMPANIES[cid][1] + [COMPANIES[cid][0]]
    for t in sorted(tokens, key=len, reverse=True):
        n = n.replace(normalized(t), '')
    return n if len(n) >= 3 and n not in {'rent', 'rental', '営業所', '店舗', '店', 'ステーション'} else ''


def url_keys(urls):
    result = set()
    for url in urls:
        u = urlparse(url)
        host = (u.hostname or '').lower().removeprefix('www.')
        path = u.path.rstrip('/')
        if host in {'rental.timescar.jp', 'timescar-rental.com', 'mazda-rentacar.co.jp'}:
            m = re.search(r'/shop/(\d+)(?:\.html)?$', path)
            if m:
                result.add('times-shop:' + m[1])
            continue
        if host in {'store.nipponrentacar.co.jp', 'sasp.mapion.co.jp'}:
            m = re.fullmatch(r'/b/nrs/info/(\d{6})', path)
            if m:
                result.add('nippon-shop:' + m[1])
            continue
        # 只接受带分店身份的路径/查询参数，主页、目录和联系页不作证据。
        qs = parse_qs(u.query)
        if host == 'rent.toyota.co.jp':
            region = qs.get('rCode', qs.get('rShop', []))
            branch = qs.get('eCode', qs.get('eShop', []))
            if len(region) == len(branch) == 1 and all(re.fullmatch(r'[A-Za-z0-9]+', v) for v in [region[0], branch[0]]):
                result.add('toyota-shop:' + region[0].lower() + ':' + branch[0].lower())
            continue
        ids = [(k, v[0]) for k, v in qs.items() if k in {'shops_pk', 'shop_id', 'shopId', 'store_id', 'storeId', 'id', 'code'} and re.fullmatch(r'[A-Za-z0-9_-]+', v[0])]
        if re.search(r'(shop|store|office|branch)', path, re.I) and ids:
            result.add(host + path + '?' + '&'.join(f'{k}={v}' for k, v in sorted(ids)))
        elif re.search(r'/(?:shops?|stores?|offices?|branches)/.+[0-9][^/]*$', path, re.I):
            result.add(host + path)
    return result


def phone_key(phone):
    digits = re.sub(r'\D', '', phone)
    if digits.startswith('81'):
        digits = '0' + digits[2:]
    return digits if len(digits) in {10, 11} and not digits.startswith(('0120', '0800', '0570')) else None


def distance(a, b):
    p1, p2 = math.radians(a['lat']), math.radians(b['lat'])
    x = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(b['lon']-a['lon'])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(x)))


def precise_address(a, b):
    x, y = normalized(a or ''), normalized(b or '')
    return min(len(x), len(y)) >= 7 and bool(re.search(r'\d', x)) and (x == y or x.endswith(y) or y.endswith(x))


def match_reason(a, b, shared_phones=frozenset()):
    if distance(a, b) > 200 or a['candidateStatus'] != b['candidateStatus']:
        return None
    if a['companyId'] != b['companyId'] and 'UNKNOWN' not in {a['companyId'], b['companyId']}:
        return None
    ua, ub = url_keys(a['websites']), url_keys(b['websites'])
    # 两个明确分店 URL 不一致时不因电话或名称覆盖冲突。
    if ua and ub and not ua.intersection(ub):
        return None
    if ua.intersection(ub):
        return 'BRANCH_URL_NEARBY'
    phones = {phone_key(p) for p in a['phones']} & {phone_key(p) for p in b['phones']}
    phones -= {None} | set(shared_phones)
    name_equal = bool(branch_name(a)) and branch_name(a) == branch_name(b)
    address_equal = precise_address(a['address'], b['address'])
    if phones and (name_equal or address_equal):
        return 'UNSHARED_PHONE_AND_BRANCH_OR_ADDRESS'
    # 同分店名本身不够；还必须有精确地址。
    if name_equal and address_equal:
        return 'BRANCH_NAME_AND_ADDRESS'
    return None


def classify(name, urls, raw, key):
    text = unicodedata.normalize('NFKC', name or '').casefold()
    compact = normalized(text)
    if key == 'osm-n4926916121':
        return 'EXCLUDE', 'OLD_CHITOSE_LOCATION'
    if 'シェアサイクル' in compact:
        return 'EXCLUDE', 'NON_CAR_RENTAL'
    if any(x in compact for x in ['カーシェア', 'carshare', 'carsharing', 'timesplus', 'タイムズプラス', 'トヨタシェア', 'toyotashare', 'オートシェア']) or re.search(r'times?carplus', compact) or any((urlparse(u).hostname or '') in {'plus.timescar.jp', 'share.timescar.jp', 'carshare.earth-car.com'} for u in urls) or raw.get('amenity') == 'car_sharing':
        return 'EXCLUDE', 'CAR_SHARING'
    if raw.get('operating_status') in {'permanently_closed', 'closed'} or any(raw.get(k) in {'yes', 'car_rental'} for k in ['disused', 'abandoned', 'disused:amenity', 'abandoned:amenity']) or any(x in text for x in ['閉店', '閉業', '閉鎖', 'permanently closed']):
        return 'EXCLUDE', 'CLOSED'
    if any(x in text for x in ['カウンター', 'counter', '受付のみ', '受付専用']):
        return 'COUNTER_ONLY', None
    return 'CANDIDATE', None


def valid_url(url):
    try:
        u = urlparse(url)
        return u.scheme in {'http', 'https'} and bool(u.hostname) and not u.username and not u.password
    except ValueError:
        return False


def point_of(geometry):
    require(isinstance(geometry, dict), 'MISSING_COORDINATES')
    safe_tree(geometry)
    g = shape(geometry)
    require(g.geom_type in RANK and not g.is_empty, 'INVALID_GEOMETRY')
    if not g.is_valid:
        g = make_valid(g)
    require(g.geom_type in RANK and not g.is_empty and g.is_valid, 'INVALID_GEOMETRY')
    if g.geom_type == 'Point':
        point, kind = g, 'SOURCE_POINT'
    elif g.geom_type in {'Polygon', 'MultiPolygon'}:
        point, kind = g.representative_point(), 'AREA_REFERENCE'
    else:
        point, kind = g.interpolate(.5, normalized=True), 'LINE_REFERENCE'
    require(math.isfinite(point.x) and math.isfinite(point.y) and 122 <= point.x <= 155 and 20 <= point.y <= 46, 'OUTSIDE_JAPAN_BOUNDS')
    return round(point.y, 7), round(point.x, 7), kind


class Boundaries:
    def __init__(self, path):
        areas = {}
        for line in Path(path).read_text().split('\n'):
            if not line.strip('\x1e \r'):
                continue
            f = json.loads(line.lstrip('\x1e'))
            p = f['properties']
            if p.get('ISO3166-2') in CODES and p.get('admin_level') == '4':
                code = p['ISO3166-2']
                require(code not in areas, '重复行政区边界')
                g = make_valid(shape(f['geometry']))
                require(g.is_valid and not g.is_empty and g.geom_type in {'Polygon', 'MultiPolygon'}, '无效行政区边界')
                areas[code] = g
        require(set(areas) == set(CODES), '必须有47个完整行政区')
        self.codes = sorted(areas)
        self.tree = STRtree([areas[c] for c in self.codes])

    def locate(self, lat, lon):
        hits = [self.codes[i] for i in self.tree.query(Point(lon, lat), predicate='covered_by')]
        return (hits[0] if len(hits) == 1 else 'UNKNOWN'), hits


def member(source, key, record_id, date, url, licenses, attributes):
    return {'sourceId': source, 'key': key, 'recordId': record_id, 'sourceDate': date,
            'url': url, 'licenses': sorted(licenses), 'attributes': attributes}


def base_row(key, names, phones, urls, address, lat, lon, kind, raw, provenance, brand=''):
    urls = sorted(set(u.strip() for u in urls if isinstance(u, str) and valid_url(u.strip())))
    cid, cname = company(names['primary'] or '', urls, brand)
    status, excluded = classify(names['primary'], urls, raw, key)
    return {'key': key, 'names': names, 'companyId': cid, 'companyName': cname,
            'lat': lat, 'lon': lon, 'positionKind': kind, 'address': address or None,
            'phones': sorted(set(p for p in phones if isinstance(p, str) and p.strip())),
            'websites': urls, 'candidateStatus': status, 'excluded': excluded,
            'sources': [provenance]}


def read_osm(path, audit):
    by_key = defaultdict(list)
    for line in Path(path).read_text().split('\n'):
        if not line.strip('\x1e \r'):
            continue
        f = json.loads(line.lstrip('\x1e'))
        safe_tree(f)
        p = f['properties']
        require(p.get('@type') in {'node', 'way', 'relation'} and type(p.get('@id')) is int and p['@id'] > 0, '无效 OSM ID')
        key = 'osm-' + p['@type'][0] + str(p['@id'])
        by_key[key].append(f)
    audit['osmInputFeatures'] = sum(map(len, by_key.values()))
    audit['osmUniqueObjects'] = len(by_key)
    audit['osmRentalFeatures'] = sum(v['properties'].get('amenity') == 'car_rental' for vv in by_key.values() for v in vv)
    audit['osmRentalUniqueObjects'] = sum(any(v['properties'].get('amenity') == 'car_rental' for v in variants) for variants in by_key.values())
    audit['osmGeometryDuplicatesRemoved'] = audit['osmInputFeatures'] - len(by_key)
    audit['osmRentalGeometryDuplicatesRemoved'] = audit['osmRentalFeatures'] - audit['osmRentalUniqueObjects']
    rows = []
    for key, variants in sorted(by_key.items()):
        f = max(variants, key=lambda x: RANK.get((x.get('geometry') or {}).get('type'), 0))
        p = f['properties']
        raw = {'properties': p, 'geometryVariants': [v.get('geometry') for v in variants]}
        if p.get('amenity') != 'car_rental':
            audit['excluded'].append({'key': key, 'reason': 'OSM_SUPPORT_FEATURE', 'attributes': raw})
            continue
        if any(v['properties'] != p for v in variants):
            audit['excluded'].append({'key': key, 'reason': 'SAME_ID_PROPERTY_CONFLICT', 'attributes': variants})
            continue
        top = [v for v in variants if RANK.get((v.get('geometry') or {}).get('type'), 0) == RANK.get((f.get('geometry') or {}).get('type'), 0)]
        if any(v.get('geometry') != f.get('geometry') for v in top):
            audit['excluded'].append({'key': key, 'reason': 'SAME_ID_GEOMETRY_CONFLICT', 'attributes': variants})
            continue
        try:
            lat, lon, kind = point_of(f.get('geometry'))
        except (ValueError, TypeError, KeyError) as e:
            audit['excluded'].append({'key': key, 'reason': str(e), 'attributes': raw})
            continue
        date = datetime.fromtimestamp(p['@timestamp'], timezone.utc).isoformat().replace('+00:00', 'Z')
        langs = {k[5:]: v for k, v in p.items() if k.startswith('name:') and isinstance(v, str) and v.strip()}
        name = p.get('name') or p.get('brand')
        if p.get('branch') and p['branch'] not in (name or ''):
            name = ((name or '') + ' ' + p['branch']).strip()
        address = p.get('addr:full') or ' '.join(str(p[k]) for k in ['addr:province', 'addr:city', 'addr:suburb', 'addr:quarter', 'addr:neighbourhood', 'addr:block_number', 'addr:street', 'addr:housenumber'] if p.get(k))
        urls = [p[k] for k in ['website', 'contact:website', 'url'] if p.get(k)]
        phones = [p[k] for k in ['phone', 'contact:phone'] if p.get(k)]
        m = member('osm', key, f"{p['@type']}/{p['@id']}", date, f"https://www.openstreetmap.org/{p['@type']}/{p['@id']}", ['ODbL-1.0'], raw)
        rows.append(base_row(key, {'primary': name or None, 'languages': langs}, phones, urls, address, lat, lon, kind, p, m, p.get('brand', '')))
    return rows


def read_overture(path, audit):
    data = read(path)
    require(data['release'] == RELEASE and isinstance(data['records'], list), '不支持的 Overture 版本')
    audit['overtureInputRecords'] = len(data['records'])
    rows, seen = [], set()
    for r in data['records']:
        require((r.get('taxonomy') or {}).get('primary') == 'car_rental_service', '非汽车租赁分类不得进入门店导入')
        require(any(a.get('country') == 'JP' for a in r.get('addresses') or []), '非日本记录不得进入门店导入')
        require(re.fullmatch(r'[0-9a-f-]{36}', r['id']) and r['id'] not in seen, '无效或重复 Overture ID')
        seen.add(r['id'])
        key = 'overture-' + r['id']
        require(r.get('sources'), '缺少 Overture 来源')
        for s in r['sources']:
            require(s['dataset'] in LICENSES and s['license'] == LICENSES[s['dataset']], '未审核 Overture 来源或许可')
        try:
            lat, lon, kind = point_of(r.get('geometry'))
        except (ValueError, TypeError, KeyError) as e:
            audit['excluded'].append({'key': key, 'reason': str(e), 'attributes': r})
            continue
        names = r.get('names') or {}
        common = names.get('common') or {}
        if isinstance(common, list):
            require(all(isinstance(pair, list) and len(pair) == 2 and isinstance(pair[0], str) for pair in common), '无效名称语言映射')
            require(len({pair[0] for pair in common}) == len(common), '名称语言映射含重复语言')
            common = dict(common)
        require(isinstance(common, dict), '无效名称语言映射')
        langs = {k: v for k, v in common.items() if isinstance(v, str) and v.strip()}
        address = ' '.join(str(a[k]) for a in (r.get('addresses') or []) for k in ['region', 'locality', 'freeform'] if a.get(k))
        m = member('overture', key, r['id'], RELEASE[:10], 'https://explore.overturemaps.org/#id=' + r['id'], {s['license'] for s in r['sources']}, r)
        rows.append(base_row(key, {'primary': names.get('primary'), 'languages': langs}, r.get('phones') or [], r.get('websites') or [], address, lat, lon, kind, r, m, ((r.get('brand') or {}).get('names') or {}).get('primary') or ''))
    return rows


def deduplicate(rows, audit):
    rows = sorted(rows, key=lambda r: r['key'])
    phone_rows = defaultdict(list)
    for r in rows:
        for p in {phone_key(p) for p in r['phones']} - {None}:
            phone_rows[p].append(r)
    shared = set()
    for p, rr in phone_rows.items():
        if any(distance(a, b) > 200 or (branch_name(a) and branch_name(b) and branch_name(a) != branch_name(b)) for i, a in enumerate(rr) for b in rr[i+1:]):
            shared.add(p)
    audit['sharedPhoneKeys'] = sorted(shared)
    url_rows = defaultdict(list)
    for r in rows:
        for url_key in url_keys(r['websites']):
            url_rows[url_key].append(r)
    for url_key, rr in sorted(url_rows.items()):
        for i, a in enumerate(rr):
            for b in rr[i+1:]:
                if distance(a, b) > 200:
                    audit['conflicts'].append({'keys': [a['key'], b['key']], 'reason': 'BRANCH_URL_COORDINATE_CONFLICT', 'branchUrlKey': url_key})
    # 完全连接组：每个新成员必须与全组直接符合证据，禁止传递链吞并。
    groups, grid = [], defaultdict(set)
    for r in rows:
        cell = (int(r['lat'] * 300), int(r['lon'] * 150))
        candidates = set()
        for x in range(cell[0]-1, cell[0]+2):
            for y in range(cell[1]-1, cell[1]+2):
                candidates.update(grid[(x, y)])
        matches = []
        for i in sorted(candidates):
            group = groups[i]
            reasons = [match_reason(r, q, shared) for q in group]
            if all(reasons):
                matches.append((i, reasons))
            elif any(distance(r, q) <= 100 and r['companyId'] == q['companyId'] != 'UNKNOWN' for q in group):
                audit['conflicts'].append({'keys': [q['key'] for q in group] + [r['key']], 'reason': 'INSUFFICIENT_OR_CONFLICTING_BRANCH_EVIDENCE'})
        if len(matches) == 1:
            i, reasons = matches[0]
            audit['merges'].append({'keys': [q['key'] for q in groups[i]] + [r['key']], 'reasons': sorted(set(reasons))})
            groups[i].append(r)
        else:
            if len(matches) > 1:
                audit['conflicts'].append({'keys': [r['key']] + [q['key'] for i, _ in matches for q in groups[i]], 'reason': 'MULTIPLE_STRONG_MATCHES'})
            i = len(groups)
            groups.append([r])
        grid[cell].add(i)
    return groups


def official_attributes(fact):
    return {k: v for k, v in fact.items() if k not in {'notesZhHans', 'coordinateEvidence', 'possibleOsmMatch', 'reviewedSourceMatches'}}


def official_rows(path):
    data = read(path)
    expected = REVIEWED['records']
    require(data['reviewDate'] == REVIEWED['reviewDate'] and len(data['records']) == len(expected), '仅接受本批已审核19条事实')
    require({r['id'] for r in data['records']} == set(expected), '官方门店白名单不符')
    owners = set()
    for r in data['records']:
        approved = expected[r['id']]
        require(official_attributes(r) == approved['attributes'], '官方事实、公司、URL、日期或摘要不在审核契约内')
        point_of({'type': 'Point', 'coordinates': [r['lon'], r['lat']]})
        reviewed = r.get('reviewedSourceMatches', [])
        require(isinstance(reviewed, list) and all(isinstance(x, dict) and set(x) == {'key', 'reasonZhHans'} and isinstance(x['key'], str) and re.fullmatch(r'(osm-[nwr][0-9]+|overture-[a-f0-9-]{36})', x['key']) and isinstance(x['reasonZhHans'], str) and x['reasonZhHans'].strip() for x in reviewed), '人工来源映射必须附核对理由')
        source_keys = [x['key'] for x in reviewed]
        require(source_keys == approved['reviewedSourceKeys'] and not owners.intersection(source_keys), '人工来源映射不在审核契约内或重复归属')
        owners.update(source_keys)
    return data


def validate_inputs(paths):
    require(set(paths) == set(INPUT_LOCK['inputs']), '缺少已审核输入')
    for name, path in paths.items():
        payload = Path(path).read_bytes()
        require({'bytes': len(payload), 'sha256': sha(payload)} == INPUT_LOCK['inputs'][name], '输入与已审核快照不同：' + name)
    upstream = read(paths['osm-audit.json'])
    require(upstream['osmSnapshot'] == INPUT_LOCK['osmSnapshot'] and upstream['osmSnapshot'][:10] == OSM_DATE, 'OSM快照日期不符')
    require(read(paths['overture-inventory.json'])['release'] == INPUT_LOCK['overtureRelease'] == RELEASE, 'Overture快照不符')


def apply_official(groups, data, audit):
    claimed = set()
    for fact in data['records']:
        require(fact['id'] in REVIEWED['records'], '未审核的官方门店')
        approved = REVIEWED['records'][fact['id']]
        key = 'official-' + fact['id']
        # 运行时使用受审 summaryKey；简短自写中文事实和匹配理由仅存在审计。
        limited = official_attributes(fact)
        m = member(approved['sourceId'], key, approved['recordId'], fact['checkedAt'], fact['officialCheckUrl'], ['LIMITED_FACTS'], limited)
        r = base_row(key, {'primary': fact['nameJa'], 'languages': {'ja': fact['nameJa']}}, [], [fact['officialCheckUrl']], fact['addressJa'], fact['lat'], fact['lon'], fact['positionKind'], {}, m)
        if fact['companyId'] != 'times':
            # 新批次只提升明确审核的源对象，不自动吸收同名近邻或同组其他对象。
            wanted = {x['key'] for x in fact.get('reviewedSourceMatches', [])}
            require(wanted and wanted == set(approved['reviewedSourceKeys']) and not wanted.intersection(claimed), '新增官方映射缺失或重复归属')
            chosen = [q for g in groups for q in g if q['key'] in wanted]
            require(len(chosen) == len(wanted) and {q['key'] for q in chosen} == wanted, '新增官方映射源key缺失或重复')
            for group in groups:
                if any(q['key'] in wanted for q in group):
                    require(not any('officialFact' in q for q in group), '源对象已有其他官方归属')
            for q in chosen:
                require(q['companyId'] == fact['companyId'] and q['candidateStatus'] == 'CANDIDATE' and not q.get('excluded') and distance(q, r) <= 250, '新增官方来源公司、柜台状态或距离冲突')
                branch_keys = url_keys(q['websites'])
                require(not branch_keys or branch_keys <= url_keys(r['websites']), '新增官方分店身份冲突')
            require(all(distance(a, b) <= 200 for i, a in enumerate(chosen) for b in chosen[i+1:]), '新增官方组内距离超过200米')
            require(any(q['lat'] == fact['lat'] and q['lon'] == fact['lon'] for q in chosen), '新增坐标必须沿用已审核源参考点')
            groups = [[q for q in g if q['key'] not in wanted] for g in groups]
            groups = [g for g in groups if g]
            r['officialFact'] = fact
            groups.append(chosen + [r])
            claimed.update(wanted)
            audit['merges'].append({'keys': [q['key'] for q in chosen] + [key], 'reasons': ['REVIEWED_SOURCE_ID_AND_OFFICIAL_ADDRESS']})
            audit['officialOverrides'].append({'canonicalId': fact['id'], 'matchedKeys': [q['key'] for q in chosen], 'reason': 'OFFICIAL_DIRECT_IDENTITY_EVIDENCE', **fact})
            continue
        matches = []
        for i, group in enumerate(groups):
            if any('officialFact' in q or q['candidateStatus'] == 'COUNTER_ONLY' or q['companyId'] != fact['companyId'] or distance(q, r) > 250 for q in group):
                continue
            reasons = []
            for q in group:
                if q['key'] in {x['key'] for x in fact.get('reviewedSourceMatches', [])}:
                    reasons.append('REVIEWED_SOURCE_ID_AND_OFFICIAL_ADDRESS')
                elif q['key'] == fact['possibleOsmMatch']:
                    reasons.append('REVIEWED_OSM_ID_AND_OFFICIAL_ADDRESS')
                elif url_keys(q['websites']) & url_keys(r['websites']):
                    reasons.append('OFFICIAL_BRANCH_URL_NEARBY')
                elif branch_name(q) == branch_name(r) and precise_address(q['address'], r['address']):
                    reasons.append('OFFICIAL_BRANCH_NAME_AND_ADDRESS')
                else:
                    reasons = []
                    break
            if reasons:
                matches.append((i, reasons))
        # 已人工确认的 OSM 映射可与同一官方分店 URL 的候选共同合并；每一成员直接关联官方记录。
        chosen = [q for i, _ in matches for q in groups[i]]
        compatible = all(distance(a, b) <= 200 and not (url_keys(a['websites']) and url_keys(b['websites']) and not url_keys(a['websites']) & url_keys(b['websites'])) for i, a in enumerate(chosen) for b in chosen[i+1:])
        if matches and compatible:
            indices = {i for i, _ in matches}
            groups = [g for i, g in enumerate(groups) if i not in indices]
            merged = chosen + [r]
            reason = 'OFFICIAL_DIRECT_IDENTITY_EVIDENCE'
            audit['merges'].append({'keys': [q['key'] for q in merged], 'reasons': sorted({x for _, rr in matches for x in rr})})
        else:
            merged = [r]
            reason = 'NO_UNIQUE_MATCH_ADD_LIMITED_OFFICIAL_FACTS' if not matches else 'AMBIGUOUS_MATCH_ADD_LIMITED_OFFICIAL_FACTS'
        r['officialFact'] = fact
        groups.append(merged)
        audit['officialOverrides'].append({'canonicalId': fact['id'], 'matchedKeys': [q['key'] for q in merged if q != r], 'reason': reason, **fact})
    return groups


def assign_identity(groups, historical):
    require(historical.get('schemaVersion') == 1, '不支持 identity 版本')
    old = historical.get('sourceToCanonical', {})
    aliases = dict(historical.get('aliases', {}))
    safe_tree(historical)
    require(isinstance(old, dict) and isinstance(aliases, dict), '无效 identity 映射')
    require(all(isinstance(k, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,119}', k) and isinstance(v, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,119}', v) for k, v in list(old.items()) + list(aliases.items())), '无效 identity ID')
    def resolve(k):
        visited = set()
        while k in aliases:
            require(k not in visited, 'identity alias 循环')
            visited.add(k)
            k = aliases[k]
        return k
    mapping = {k: resolve(v) for k, v in old.items()}
    assigned, used = [], set()
    for group in sorted(groups, key=lambda g: min(r['key'] for r in g)):
        official = [r['officialFact']['id'] for r in group if 'officialFact' in r]
        require(len(official) <= 1, '不得合并不同官方门店')
        prior = sorted({resolve(old[r['key']]) for r in group if r['key'] in old})
        ident = official[0] if official else (prior[0] if prior else 'rental-' + min(r['key'] for r in group))
        require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,119}', ident) and ident not in used, 'identity 拆分或重复，需人工迁移')
        used.add(ident)
        for p in prior:
            if p != ident:
                aliases[p] = ident
        for r in group:
            mapping[r['key']] = ident
        assigned.append((ident, group))
    aliases = {k: resolve(v) for k, v in aliases.items()}
    mapping = {k: resolve(v) for k, v in mapping.items()}
    return assigned, {'schemaVersion': 1, 'sourceToCanonical': dict(sorted(mapping.items())), 'aliases': dict(sorted(aliases.items()))}


INDEX_KEYS = ['id', 'aliases', 'names', 'companyId', 'companyName', 'prefectureCode', 'lat', 'lon', 'address', 'positionKind', 'candidateStatus', 'verification', 'vehicleEntranceStatus', 'airportCode', 'sourceIds']


def build_record(ident, group, identity, boundaries, audit):
    official = next((r for r in group if 'officialFact' in r), None)
    selected = official or sorted(group, key=lambda r: (not r['key'].startswith('osm-'), -RANK.get(r['positionKind'], 0), r['key']))[0]
    names = {'primary': selected['names']['primary'], 'languages': {}}
    for r in sorted(group, key=lambda r: r != selected, reverse=True):
        if names['primary'] is None and r['names']['primary']:
            names['primary'] = r['names']['primary']
        names['languages'].update(r['names']['languages'])
    code, hits = boundaries.locate(selected['lat'], selected['lon'])
    if official:
        official_code = official['officialFact']['prefectureCode']
        require(code in {official_code, 'UNKNOWN'}, '官方行政区和空间归属冲突')
        code = official_code
    if code == 'UNKNOWN':
        audit['unknownAssignments'].append({'id': ident, 'reason': 'OUTSIDE_BOUNDARIES' if not hits else 'AMBIGUOUS_BOUNDARIES', 'candidates': hits})
    sources = [s for r in sorted(group, key=lambda r: r['key']) for s in r['sources']]
    cid = selected['companyId']
    if cid == 'UNKNOWN':
        known = {r['companyId'] for r in group} - {'UNKNOWN'}
        cid = next(iter(known)) if len(known) == 1 else 'UNKNOWN'
    fact = official['officialFact'] if official else None
    approved = REVIEWED['records'][fact['id']] if fact else None
    return {'id': ident, 'aliases': sorted(k for k, v in identity['aliases'].items() if v == ident),
            'names': names, 'companyId': cid, 'companyName': COMPANIES[cid][0] if cid in COMPANIES else None,
            'prefectureCode': code, 'lat': selected['lat'], 'lon': selected['lon'], 'address': selected['address'],
            'phones': [fact['officialPhone']] if fact and fact.get('officialPhone') else sorted({p for r in group for p in r['phones']}), 'websites': sorted({u for r in group for u in r['websites']}),
            'positionKind': selected['positionKind'], 'candidateStatus': 'OFFICIAL_RETURN_FACILITY' if official else selected['candidateStatus'],
            'verification': 'OFFICIAL_FACILITY_CHECKED' if official else 'NOT_VERIFIED', 'vehicleEntranceStatus': 'NOT_VERIFIED',
            'airportCode': official['officialFact']['airportCode'] if official else None,
            'sourceIds': sorted({s['sourceId'] for s in sources}), 'sources': sources,
            'official': ({'sourceId': approved['sourceId'], 'checkedAt': fact['checkedAt'], 'url': fact['officialCheckUrl'], 'supplementaryUrls': fact['supplementarySourceUrls'], 'summaryKey': approved['summaryKey']} if official else None),
            'returnRule': ({'companyId': 'times', 'sourceId': 'times-official', 'url': 'https://www.timescar-rental.com/en/agreement/gas.html', 'checkedAt': '2026-09-30', 'fullTank': 'STANDARD_SUBJECT_TO_CONTRACT', 'receipt': 'MAY_BE_REQUESTED'} if cid == 'times' else None)}


def generate(osm_path, overture_path, boundaries_path, official_path, licenses_path, output, identity_path=None):
    output = Path(output)
    paths = {'osm-rental-full.geojsonseq': osm_path, 'overture-car-rental-full.json': overture_path, 'prefecture-boundaries.geojsonseq': boundaries_path, 'reviewed-airports.json': official_path, 'osm-audit.json': Path(osm_path).parent / 'osm-audit.json', 'overture-inventory.json': Path(overture_path).parent / 'overture-inventory.json'}
    validate_inputs(paths)
    official_data = official_rows(official_path)
    audit = {'osmInputFeatures': 0, 'excluded': [], 'conflicts': [], 'merges': [], 'officialOverrides': [], 'unknownAssignments': []}
    boundaries = Boundaries(boundaries_path)
    rows = read_osm(osm_path, audit) + read_overture(overture_path, audit)
    upstream_path = Path(osm_path).parent / 'osm-audit.json'
    upstream = read(upstream_path)
    missing = upstream['taggedWithoutExportedGeometry']
    require(isinstance(missing, list) and len(missing) == upstream['independentPbfObjectCount'] - audit['osmRentalUniqueObjects'], '上游缺几何审计数量不符')
    for key in missing:
        require(re.fullmatch(r'[nwr][1-9][0-9]*', key), '无效缺几何源ID')
        require(not any(r['key'] == 'osm-' + key for r in rows), '缺几何记录实际已导出')
        audit['excluded'].append({'key': 'osm-' + key, 'reason': 'MISSING_EXPORTED_GEOMETRY', 'sourceId': 'osm', 'sourceDate': OSM_DATE, 'inputPbfSha256': upstream['inputPbfSha256'], 'evidence': 'osm-audit.json', 'evidenceSha256': sha(upstream_path.read_bytes())})
    audit['osmPbfRentalObjects'] = upstream['independentPbfObjectCount']
    audit['osmUnexportedGeometryObjects'] = len(missing)
    kept = []
    for r in rows:
        if r['excluded']:
            audit['excluded'].append({'key': r['key'], 'reason': r['excluded'], 'sources': r['sources']})
        else:
            kept.append(r)
    audit['inputObjectsAfterGeometrySelection'] = audit['osmUniqueObjects'] + audit['overtureInputRecords']
    audit['inputObjectsTotalKnown'] = audit['inputObjectsAfterGeometrySelection'] + len(missing)
    audit['retainedSourceObjects'] = len(kept)
    # 为本批新增对象保留独立审核边界，先去重其他候选，避免自动扩张审核组。
    explicit = {x['key'] for f in official_data['records'] if f['companyId'] != 'times' for x in f['reviewedSourceMatches']}
    groups = deduplicate([r for r in kept if r['key'] not in explicit], audit) + [[r] for r in kept if r['key'] in explicit]
    groups = apply_official(groups, official_data, audit)
    identity_file = Path(identity_path) if identity_path else output / 'identity.json'
    historical = read(identity_file) if identity_file.exists() else {'schemaVersion': 1, 'sourceToCanonical': {}, 'aliases': {}}
    assigned, identity = assign_identity(groups, historical)
    records = sorted([build_record(i, g, identity, boundaries, audit) for i, g in assigned], key=lambda r: r['id'])
    audit.update({'count': len(records), 'sourceObjectsMerged': len(kept) + len(official_data['records']) - len(records), 'excludedCount': len(audit['excluded']), 'unknownCount': sum(r['prefectureCode'] == 'UNKNOWN' for r in records), 'statusCounts': dict(sorted(Counter(r['candidateStatus'] for r in records).items())), 'companyCounts': dict(sorted(Counter(r['companyId'] for r in records).items()))})
    inputs = [{'name': name, 'sha256': sha(Path(path).read_bytes()), 'bytes': Path(path).stat().st_size} for name, path in [('osm-rental-full.geojsonseq', osm_path), ('overture-car-rental-full.json', overture_path), ('prefecture-boundaries.geojsonseq', boundaries_path), ('reviewed-airports.json', official_path), ('osm-audit.json', upstream_path)]]
    sources = [
        {'id': 'osm', 'name': 'OpenStreetMap contributors', 'sourceDate': OSM_DATE, 'url': 'https://download.geofabrik.de/asia/japan-260929.osm.pbf', 'licenses': ['ODbL-1.0'], 'attribution': '© OpenStreetMap contributors; distributed by Geofabrik'},
        {'id': 'overture', 'name': 'Overture Maps Foundation', 'sourceDate': RELEASE[:10], 'url': 'https://docs.overturemaps.org/attribution/', 'licenses': sorted(set(LICENSES.values())), 'attribution': 'Overture Maps; Meta; © 2026 Foursquare Labs, Inc.; AllThePlaces'},
        *[{'id': sid, 'name': COMPANIES[cid][0], 'sourceDate': date, 'url': url, 'licenses': ['LIMITED_FACTS'], 'attribution': COMPANIES[cid][0] + '；仅人工核对有限事实，摘要自行编写'} for sid, (cid, date, url) in OFFICIAL_SOURCES.items()]]
    inventory_path = Path(overture_path).parent / 'overture-inventory.json'
    inventory = read(inventory_path)
    require(inventory.get('release') == RELEASE and len(inventory.get('files', [])) == 16, '缺少已固定 Overture 下载清单')
    inputs.append({'name': inventory_path.name, 'sha256': sha(inventory_path.read_bytes()), 'bytes': inventory_path.stat().st_size})
    sources_doc = {'osmUpstreamGeometryAudit': {'inputPbfSha256': upstream['inputPbfSha256'], 'osmSnapshot': upstream['osmSnapshot'], 'independentPbfObjectCount': upstream['independentPbfObjectCount'], 'taggedWithoutExportedGeometry': missing, 'note': '沿用已交接的PBF与几何导出核对；本节点未重新读取PBF。完整导出文件哈希单列于inputs，不能和早期导出哈希混用。'}, 'overtureInventory': inventory, 'schemaVersion': 1, 'sources': sources, 'inputs': inputs, 'overtureRelease': RELEASE, 'upstreamLicenses': LICENSES, 'license': 'ODbL-1.0', 'modifications': '日本分类筛选、排除明确共享汽车及停业点、几何选取、严格行政区归属、保守分店去重、稳定ID、有限官方事实叠加。置信度不作为核验。', 'refreshPolicy': '手动获取和复核；默认日期不刷新。官方事实90天起提示重新核对。', 'scope': '七机场共19条有限官方事实：7家Times、6家Nippon和6家Toyota。核对地址与归还安排；新增坐标沿用OSM/Overture参考点，不是已核验入口。全国候选不是完整营业门店清单。'}
    version = TRANSFORM + '-' + sha(encode({'records': records, 'audit': audit, 'sources': sources_doc, 'identity': identity}))[:16]
    prefix = 'snapshots/' + version + '/'
    def artifact(name, data, count=None):
        payload = encode(data)
        immutable_write(output / (prefix + name), payload)
        result = {'url': BASE + prefix + name, 'sha256': sha(payload), 'bytes': len(payload)}
        if count is not None:
            result['count'] = count
        return result
    partitions = []
    for code in CODES + ['UNKNOWN']:
        rr = [r for r in records if r['prefectureCode'] == code]
        partitions.append({'code': code, **artifact('partitions/' + code + '.json', {'schemaVersion': 1, 'version': version, 'prefectureCode': code, 'count': len(rr), 'records': rr}, len(rr))})
    index = artifact('index.json', {'schemaVersion': 1, 'version': version, 'count': len(records), 'records': [{k: r[k] for k in INDEX_KEYS} for r in records]}, len(records))
    audit_artifact = artifact('audit.json', audit)
    official_artifact = artifact('official-overrides.json', {'schemaVersion': 1, 'reviewDate': official_data['reviewDate'], 'records': audit['officialOverrides']})
    sources_artifact = artifact('sources.json', sources_doc)
    identity_artifact = artifact('identity.json', identity)
    license_links = []
    for name in ['ODbL-1.0.txt', 'Apache-2.0.txt', 'CDLA-Permissive-2.0.txt', 'CC0-1.0.txt', 'Foursquare-NOTICE.txt']:
        content = (Path(licenses_path) / name).read_bytes()
        require(len(content) > 1000 and b'<html' not in content.lower(), '许可证不完整')
        immutable_write(output / 'licenses' / name, content)
        license_links.append({'url': BASE + 'licenses/' + name, 'sha256': sha(content), 'bytes': len(content)})
    notice = ('全国租车候选衍生数据库：ODbL 1.0。© OpenStreetMap contributors，Geofabrik 分发；Overture Maps、Meta、© 2026 Foursquare Labs, Inc.、AllThePlaces。\n'
              '修改：筛选日本租赁分类、排除共享汽车/停业、选取几何、空间分区、公司归一化、保守去重及官方有限事实核对。保留来源记录ID、原始属性及各自许可。\n'
              'ODbL全文、Apache 2.0全文、Foursquare完整NOTICE、CDLA 2.0全文、CC0全文见 licenses/。公司网页仅有限事实，不包含原网页正文/图片/商标，不代表整库授权。\n'
              'manifest.json 的 downloads 列出完整48分区、索引、审计、来源、identity和许可证下载。sources字段及详情sources.attributes保留上游归属。\n'
              'https://www.openstreetmap.org/copyright\nhttps://docs.overturemaps.org/attribution/\nhttps://docs.overturemaps.org/guides/places/\n').encode()
    atomic_write(output / 'NOTICE.txt', notice)
    notice_link = {'url': BASE + 'NOTICE.txt', 'sha256': sha(notice), 'bytes': len(notice)}
    downloads = [index, *[{k: v for k, v in p.items() if k != 'code'} for p in partitions], audit_artifact, official_artifact, sources_artifact, identity_artifact, notice_link, *license_links]
    manifest = {'schemaVersion': 1, 'transformationVersion': TRANSFORM, 'version': version, 'count': len(records), 'reviewDate': official_data['reviewDate'], 'license': 'ODbL-1.0', 'sources': sources, 'index': index, 'partitions': partitions, 'audit': audit_artifact, 'officialOverrides': official_artifact, 'sourceRegistry': sources_artifact, 'identity': identity_artifact, 'notice': notice_link, 'licenses': license_links, 'downloads': downloads}
    # 全部不可变产物完成后最后替换入口，失败时保留上次 manifest。
    identity_alias = output / 'identity.json'
    previous_identity = identity_alias.read_bytes() if identity_alias.exists() else None
    atomic_write(identity_alias, encode(identity))
    try:
        atomic_write(output / 'manifest.json', encode(manifest))
    except BaseException:
        # 恢复输出别名本身；--identity 可以是另一个只读历史输入。
        # 不可变快照留存，原 manifest 继续指向上次完整发布。
        if previous_identity is None:
            identity_alias.unlink()
        else:
            atomic_write(identity_alias, previous_identity)
        raise
    return manifest, audit


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['osm', 'overture', 'boundaries', 'official', 'licenses', 'output']:
        p.add_argument('--' + name, required=True, type=Path)
    p.add_argument('--identity', type=Path)
    a = p.parse_args()
    manifest, audit = generate(a.osm, a.overture, a.boundaries, a.official, a.licenses, a.output, a.identity)
    print(json.dumps({k: audit[k] for k in ['count', 'osmInputFeatures', 'osmUniqueObjects', 'osmRentalUniqueObjects', 'osmGeometryDuplicatesRemoved', 'overtureInputRecords', 'sourceObjectsMerged', 'excludedCount', 'unknownCount', 'statusCounts', 'companyCounts']} | {'version': manifest['version'], 'indexBytes': manifest['index']['bytes'], 'partitionBytes': sum(p['bytes'] for p in manifest['partitions'])}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
