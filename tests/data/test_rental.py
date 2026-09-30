"""全国租车数据契约、保守去重和完整产物的离线回归。"""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/importer'))
import rental

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'public/data/rental/nationwide'


def row(key, name='トヨタレンタカー 新宿店', phone='03-1234-5678', url='https://rent.toyota.co.jp/', lat=35.7, lon=139.7, address='東京都新宿区西新宿1-2-3'):
    return rental.base_row(key, {'primary': name, 'languages': {}}, [phone] if phone else [], [url] if url else [], address, lat, lon, 'SOURCE_POINT', {}, {'key': key}, '')


def audit():
    return {'merges': [], 'conflicts': [], 'excluded': [], 'officialOverrides': []}


class RentalDedupTests(unittest.TestCase):
    def test_adjacent_same_company_and_generic_name_not_merged(self):
        a, b = row('osm-n1', name='トヨタレンタカー', phone=None), row('osm-n2', name='トヨタレンタカー', phone=None, lat=35.7001)
        self.assertIsNone(rental.match_reason(a, b))
        b['names']['primary'] = 'トヨタレンタカー 新宿西口店'
        self.assertIsNone(rental.match_reason(a, b))

    def test_homepage_and_shared_toll_free_phone_are_not_identity(self):
        a, b = row('osm-n1', phone='0120-123-456', address=''), row('osm-n2', phone='0120-123-456', address='')
        self.assertIsNone(rental.match_reason(a, b))
        self.assertFalse(rental.url_keys(['https://rent.toyota.co.jp/', 'https://car.orix.co.jp/shops/']))

    def test_shared_local_phone_different_branches_not_merged(self):
        a, b, c = row('osm-n1', address=''), row('osm-n2', address=''), row('osm-n3', name='トヨタレンタカー 池袋店', lat=35.72, address='')
        log = audit()
        self.assertEqual(len(rental.deduplicate([a, b, c], log)), 3)
        self.assertIn('0312345678', log['sharedPhoneKeys'])

    def test_branch_url_across_times_domains_and_distance(self):
        a = row('osm-n1', name='タイムズカー', url='https://rental.timescar.jp/chiba/shop/1209/', phone=None)
        b = row('overture-1', name='タイムズカーレンタル成田空港店', url='http://www.mazda-rentacar.co.jp/shop/1209.html', phone=None)
        self.assertEqual(rental.match_reason(a, b), 'BRANCH_URL_NEARBY')
        b['lat'] += .01
        self.assertIsNone(rental.match_reason(a, b))

    def test_nonshared_phone_needs_branch_or_address(self):
        a, b = row('osm-n1', address=''), row('osm-n2', address='', phone='+81 3 1234 5678')
        self.assertEqual(rental.match_reason(a, b), 'UNSHARED_PHONE_AND_BRANCH_OR_ADDRESS')
        b['names']['primary'] = 'トヨタレンタカー'
        self.assertIsNone(rental.match_reason(a, b))

    def test_different_branch_url_blocks_other_matching_evidence(self):
        a, b = row('osm-n1', url='https://x.test/shop/123'), row('osm-n2', url='https://x.test/shop/456')
        self.assertIsNone(rental.match_reason(a, b))

    def test_complete_link_prevents_chain_merge(self):
        rows = [row('osm-n1', url='https://x.test/shop/123', lat=35.7), row('osm-n2', url='https://x.test/shop/123', lat=35.7015), row('osm-n3', url='https://x.test/shop/123', lat=35.703)]
        groups = rental.deduplicate(rows, audit())
        self.assertEqual(sorted(map(len, groups)), [1, 2])

    def test_counter_never_merges_into_shop(self):
        a, b = row('osm-n1'), row('osm-n2')
        b['candidateStatus'] = 'COUNTER_ONLY'
        self.assertIsNone(rental.match_reason(a, b))
        for n, u in [('TimesPLUS X', []), ('x', ['https://plus.timescar.jp/view/station/detail.jsp?scd=1']), ('カーシェア A', []), ('Times Car PLUS', []), ('TimesCarPlus', []), ('TimeCarPlus', []), ('トヨタシェア X', []), ('Car-sharing X', [])]:
            self.assertEqual(rental.classify(n, u, {}, 'overture-1'), ('EXCLUDE', 'CAR_SHARING'))
        self.assertEqual(rental.classify('タイムズ 羽田空港カウンター', [], {}, 'x')[0], 'COUNTER_ONLY')
        self.assertEqual(rental.classify('閉店 トヨタ', [], {}, 'x')[1], 'CLOSED')
        self.assertEqual(rental.classify('旧CTS', [], {}, 'osm-n4926916121')[1], 'OLD_CHITOSE_LOCATION')

    def test_explicit_earth_car_sharing_domain_is_not_a_rental_branch(self):
        for url in ['https://carshare.earth-car.com/', 'https://carshare.earth-car.com/carshare/vehicle-detail/431000058']:
            self.assertEqual(rental.classify('アースカー 生駒谷田町ステーション', [url], {}, 'overture-x'), ('EXCLUDE', 'CAR_SHARING'))
        self.assertEqual(rental.classify('レンタカー支店', ['https://example.com/shop/carshare-promotion'], {}, 'overture-x'), ('CANDIDATE', None))

    def test_toyota_official_branch_identifiers_ignore_tracking(self):
        first = 'https://rent.toyota.co.jp/shop/detail.aspx?rCode=65201&eCode=009&udFlg=2'
        second = 'https://rent.toyota.co.jp/eng/reservation/index01.aspx?rShop=65201&eShop=009'
        self.assertEqual(rental.url_keys([first]), {'toyota-shop:65201:009'})
        self.assertEqual(rental.url_keys([first]), rental.url_keys([second]))
        self.assertFalse(rental.url_keys(['https://rent.toyota.co.jp/shop/?rCode=65201']))
        self.assertFalse(rental.url_keys([second]) & rental.url_keys([second.replace('009', '010')]))

    def test_overture_category_country_and_language_map(self):
        record = {'id': '00000000-0000-0000-0000-000000000001', 'geometry': {'type': 'Point', 'coordinates': [139.7, 35.7]}, 'names': {'primary': 'Rent A Car', 'common': [['ja', 'レンタカー店舗']]}, 'sources': [{'dataset': 'meta', 'license': 'CDLA-Permissive-2.0'}], 'addresses': [{'country': 'JP'}], 'taxonomy': {'primary': 'car_rental_service'}}
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'overture.json'
            def put(r):
                p.write_text(json.dumps({'release': rental.RELEASE, 'records': [r]}))
            put(record)
            self.assertEqual(rental.read_overture(p, audit())[0]['names']['languages'], {'ja': 'レンタカー店舗'})
            for change in [{'addresses': [{'country': 'US'}]}, {'taxonomy': {'primary': 'rental_kiosk'}}, {'names': {'primary': 'x', 'common': [['ja', 'x'], ['ja', 'y']]}}]:
                put(record | change)
                with self.assertRaises(ValueError):
                    rental.read_overture(p, audit())

    def test_brand_does_not_override_branch_name(self):
        a = row('x', name='タイムズカーレンタル成田空港店')
        self.assertEqual(a['names']['primary'], 'タイムズカーレンタル成田空港店')
        self.assertEqual(rental.company(a['names']['primary'], [], 'タイムズカーレンタル宮崎駅前店')[0], 'times')
        self.assertEqual(rental.company('トヨタレンタカー X', [], '日産レンタカー')[0], 'toyota')

    def test_missing_coordinates_and_invalid_bounds_fail(self):
        for geometry in [None, {'type': 'Point', 'coordinates': [139, 48]}, {'type': 'Point', 'coordinates': [float('nan'), 35]}]:
            with self.assertRaises((ValueError, TypeError)):
                rental.point_of(geometry)

    def test_osm_same_id_prefers_area_preserves_variants_and_conflicts(self):
        def feature(kind, coords, name='x'):
            return {'properties': {'@type': 'way', '@id': 1, '@timestamp': 1700000000, 'amenity': 'car_rental', 'name': name}, 'geometry': {'type': kind, 'coordinates': coords}}
        line = feature('LineString', [[139, 35], [139.01, 35], [139.01, 35.01], [139, 35]])
        area = feature('Polygon', [line['geometry']['coordinates']])
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'input.jsonseq'
            p.write_text('\n'.join('\x1e' + json.dumps(x) for x in [line, area]))
            log = audit(); result = rental.read_osm(p, log)
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]['positionKind'], 'AREA_REFERENCE')
            self.assertEqual(len(result[0]['sources'][0]['attributes']['geometryVariants']), 2)
            self.assertEqual(log['osmGeometryDuplicatesRemoved'], 1)
            area['properties']['name'] = 'different'
            p.write_text('\n'.join(json.dumps(x) for x in [line, area]))
            log = audit(); self.assertEqual(rental.read_osm(p, log), [])
            self.assertEqual(log['excluded'][0]['reason'], 'SAME_ID_PROPERTY_CONFLICT')
            line['geometry'] = None
            p.write_text(json.dumps(line)); log = audit()
            self.assertEqual(rental.read_osm(p, log), [])
            self.assertEqual(log['excluded'][0]['reason'], 'MISSING_COORDINATES')

    def test_support_objects_excluded_and_official_never_upgrades_counter(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'input.jsonseq'
            p.write_text(json.dumps({'properties': {'@type': 'node', '@id': 7, '@timestamp': 1700000000, 'barrier': 'gate'}, 'geometry': {'type': 'Point', 'coordinates': [139, 35]}}))
            log = audit()
            self.assertEqual(rental.read_osm(p, log), [])
            self.assertEqual(log['excluded'][0]['reason'], 'OSM_SUPPORT_FEATURE')
        candidate = row('osm-n1', name='タイムズ 羽田空港カウンター', url='https://rental.timescar.jp/tokyo/shop/1325/')
        self.assertEqual(candidate['candidateStatus'], 'COUNTER_ONLY')
        fact = {'id': 'times-haneda-airport', 'airportCode': 'HND', 'companyId': 'times', 'nameJa': 'タイムズカー 羽田店', 'addressJa': '東京都大田区萩中3-3-3', 'lat': candidate['lat'], 'lon': candidate['lon'], 'positionKind': 'SHOP_REFERENCE', 'officialCheckUrl': 'https://www.timescar-rental.com/en/tokyo/shop/1325/', 'checkedAt': '2026-09-30', 'possibleOsmMatch': 'osm-n1'}
        log = audit()
        groups = rental.apply_official([[candidate]], {'records': [fact]}, log)
        self.assertEqual(len(groups), 2)
        self.assertEqual(log['officialOverrides'][0]['matchedKeys'], [])
        self.assertNotIn('officialFact', candidate)

    def test_reviewed_cross_language_source_mapping_is_guarded(self):
        candidate = row('overture-reviewed', name='Times Car Rental Naha Airport Shop', url='https://rental.timescar.jp/', address='Naha 457-1 Kagamizu')
        fact = {'id': 'times-naha-airport', 'airportCode': 'OKA', 'companyId': 'times', 'nameJa': 'タイムズカー 那覇空港店', 'addressJa': '沖縄県那覇市鏡水457-1', 'lat': candidate['lat'], 'lon': candidate['lon'], 'positionKind': 'SHOP_REFERENCE', 'officialCheckUrl': 'https://www.timescar-rental.com/en/okinawa/shop/4701/', 'checkedAt': '2026-09-30', 'possibleOsmMatch': None, 'reviewedSourceMatches': [{'key': 'overture-reviewed', 'reasonZhHans': '地址和电话与官方资料一致，人工核对英日文记录。'}]}
        log = audit()
        groups = rental.apply_official([[candidate]], {'records': [fact]}, log)
        self.assertEqual(len(groups), 1)
        self.assertEqual(log['officialOverrides'][0]['matchedKeys'], ['overture-reviewed'])
        for patch in [{'candidateStatus': 'COUNTER_ONLY'}, {'companyId': 'toyota'}, {'lat': candidate['lat'] + .01}]:
            changed = copy.deepcopy(candidate); changed.update(patch)
            self.assertEqual(len(rental.apply_official([[changed]], {'records': [fact]}, audit())), 2)

    def test_stable_id_after_rename_reorder_and_merge_alias(self):
        a, b = row('osm-n1'), row('osm-n2')
        blank = {'schemaVersion': 1, 'sourceToCanonical': {}, 'aliases': {}}
        first, history = rental.assign_identity([[b], [a]], blank)
        a['names']['primary'] = 'changed'; a['websites'] = ['https://x.test/new/']
        second, history2 = rental.assign_identity([[a], [b]], copy.deepcopy(history))
        self.assertEqual([x[0] for x in first], [x[0] for x in second])
        self.assertEqual(history, history2)
        merged, history3 = rental.assign_identity([[a, b]], history2)
        self.assertEqual(merged[0][0], 'rental-osm-n1')
        self.assertEqual(history3['aliases'], {'rental-osm-n2': 'rental-osm-n1'})
        self.assertEqual(history3['sourceToCanonical']['osm-n2'], 'rental-osm-n1')
        with self.assertRaises(ValueError):
            rental.assign_identity([[a], [b]], history3)

    def test_official_preserves_existing_ids_and_aliases(self):
        a = row('osm-n1', name='タイムズ X'); a['officialFact'] = {'id': 'times-naha-airport'}
        history = {'schemaVersion': 1, 'sourceToCanonical': {'osm-n1': 'rental-osm-n1'}, 'aliases': {}}
        assigned, updated = rental.assign_identity([[a]], history)
        self.assertEqual(assigned[0][0], 'times-naha-airport')
        self.assertEqual(updated['aliases']['rental-osm-n1'], 'times-naha-airport')

    def test_prototype_pollution_rejected(self):
        with self.assertRaises(ValueError):
            rental.safe_tree({'sources': [{'__proto__': {}}]})

    def test_spatial_boundaries_unknown_and_ambiguous(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'bounds.jsonseq'
            features = []
            for i, code in enumerate(rental.CODES):
                x = 122 + i / 2
                coords = [[x, 20], [x+.4, 20], [x+.4, 21], [x, 21], [x, 20]]
                features.append({'properties': {'ISO3166-2': code, 'admin_level': '4'}, 'geometry': {'type': 'Polygon', 'coordinates': [coords]}})
            p.write_text('\n'.join(json.dumps(f) for f in features))
            bounds = rental.Boundaries(p)
            self.assertEqual(bounds.locate(20.5, 122.2)[0], 'JP-01')
            self.assertEqual(bounds.locate(35, 139)[0], 'UNKNOWN')
            features[1]['geometry'] = features[0]['geometry']
            p.write_text('\n'.join(json.dumps(f) for f in features))
            self.assertEqual(rental.Boundaries(p).locate(20.5, 122.2)[0], 'UNKNOWN')


class PublishedRentalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((DATA / 'manifest.json').read_text())
        cls.load = staticmethod(lambda a: json.loads((ROOT / ('public' + a['url'])).read_text()))
        cls.index = cls.load(cls.manifest['index'])
        cls.partitions = [cls.load(p) for p in cls.manifest['partitions']]
        cls.records = [r for p in cls.partitions for r in p['records']]
        cls.audit = cls.load(cls.manifest['audit'])

    def test_all_downloads_hashes_counts_and_licenses(self):
        self.assertEqual(len(self.manifest['partitions']), 48)
        self.assertEqual({p['prefectureCode'] for p in self.partitions}, set(rental.CODES + ['UNKNOWN']))
        for a in self.manifest['downloads']:
            content = (ROOT / ('public' + a['url'])).read_bytes()
            self.assertEqual(len(content), a['bytes'])
            self.assertEqual(hashlib.sha256(content).hexdigest(), a['sha256'])
        self.assertEqual(sum(p['count'] for p in self.partitions), self.manifest['count'])
        self.assertEqual(len(self.records), self.manifest['count'])
        self.assertEqual(len(self.manifest['licenses']), 5)
        for p in self.partitions:
            self.assertEqual(p['count'], len(p['records']))
            self.assertEqual(p['version'], self.manifest['version'])
            self.assertTrue(all(r['prefectureCode'] == p['prefectureCode'] for r in p['records']))
        self.assertEqual(sorted([{k: r[k] for k in rental.INDEX_KEYS} for r in self.records], key=lambda r: r['id']), self.index['records'])

    def test_every_source_accounted_for_and_original_licenses_retained(self):
        members = [s for r in self.records for s in r['sources']]
        self.assertEqual(len({s['key'] for s in members}), len(members))
        self.assertEqual(sum(s['sourceId'] != 'times-official' for s in members) + self.audit['excludedCount'], self.audit['inputObjectsTotalKnown'])
        self.assertEqual(self.audit['count'] + self.audit['sourceObjectsMerged'], self.audit['retainedSourceObjects'] + 7)
        identity = self.load(self.manifest['identity'])
        for r in self.records:
            for s in r['sources']:
                self.assertEqual(identity['sourceToCanonical'][s['key']], r['id'])
                self.assertTrue(s['sourceDate'])
                if s['sourceId'] == 'overture':
                    self.assertEqual(s['recordId'], s['attributes']['id'])
                    for upstream in s['attributes']['sources']:
                        self.assertEqual(upstream['license'], rental.LICENSES[upstream['dataset']])
                        self.assertIn(upstream['license'], s['licenses'])
        self.assertEqual(self.audit['unknownCount'], sum(r['prefectureCode'] == 'UNKNOWN' for r in self.records))

    def test_seven_airports_official_evidence_no_entrance_claim(self):
        official = [r for r in self.records if r['verification'] == 'OFFICIAL_FACILITY_CHECKED']
        self.assertEqual({r['airportCode'] for r in official}, {'NRT', 'HND', 'KIX', 'NGO', 'CTS', 'FUK', 'OKA'})
        self.assertEqual(len(official), 7)
        self.assertTrue({'times-naha-airport', 'times-new-chitose-airport', 'times-fukuoka-airport-international'} <= {r['id'] for r in official})
        for r in official:
            self.assertEqual(r['official']['checkedAt'], '2026-09-30')
            self.assertEqual(r['companyId'], 'times')
            self.assertEqual(r['vehicleEntranceStatus'], 'NOT_VERIFIED')
        kix = next(r for r in official if r['airportCode'] == 'KIX')
        self.assertIn('2F', kix['address'])
        self.assertEqual(kix['positionKind'], 'FACILITY_REFERENCE')
        nrt = next(r for r in official if r['airportCode'] == 'NRT')
        self.assertEqual(set(nrt['sourceIds']), {'osm', 'overture', 'times-official'})
        self.assertIn('成田', nrt['names']['primary'])
        self.assertNotIn('宮崎', nrt['names']['primary'])

    def test_company_rule_isolation_and_counter_status(self):
        for r in self.records:
            if r['companyId'] != 'times':
                self.assertIsNone(r['returnRule'])
            else:
                self.assertEqual(r['returnRule']['fullTank'], 'STANDARD_SUBJECT_TO_CONTRACT')
            if r['candidateStatus'] == 'COUNTER_ONLY':
                self.assertEqual(r['verification'], 'NOT_VERIFIED')
                self.assertIsNone(r['official'])
                self.assertIsNone(r['airportCode'])
        source_keys = {s['key'] for r in self.records for s in r['sources']}
        self.assertNotIn('overture-036e397c-6db7-47dd-887f-b41364227105', source_keys)
        self.assertNotIn('overture-4c690ad2-1d15-4c9c-a959-42e728ffef5e', source_keys)
        self.assertNotIn('osm-n4926916121', source_keys)
        self.assertNotIn('overture-000f65bf-20e0-457d-a883-edae3da42c96', source_keys)
        counts = Counter(r['candidateStatus'] for r in self.records)
        self.assertEqual(dict(counts), self.audit['statusCounts'])


if __name__ == '__main__':
    unittest.main()
