"""全国租车数据契约、保守去重和完整产物的离线回归。"""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from collections import Counter
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/importer'))
import rental
from common import atomic_write

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


class ReviewedAirportTests(unittest.TestCase):
    def setUp(self):
        self.path = ROOT / 'data/curation/rental-airports.json'
        self.data = json.loads(self.path.read_text())

    def test_reviewed_nineteen_rows_with_original_times_dates(self):
        data = rental.official_rows(self.path)
        self.assertEqual(len(data['records']), 19)
        self.assertEqual(Counter(r['companyId'] for r in data['records']), {'times': 7, 'nippon': 6, 'toyota': 6})
        self.assertTrue(all(r['checkedAt'] == '2026-09-30' for r in data['records'] if r['companyId'] == 'times'))

    def test_nippon_branch_urls_match_legacy_mapion_not_homepage(self):
        self.assertEqual(rental.url_keys(['https://store.nipponrentacar.co.jp/b/nrs/info/810034/']), {'nippon-shop:810034'})
        self.assertEqual(rental.url_keys(['http://sasp.mapion.co.jp/b/nrs/info/810034/']), {'nippon-shop:810034'})
        self.assertFalse(rental.url_keys(['https://store.nipponrentacar.co.jp/', 'https://sasp.mapion.co.jp/']))

    def test_unreviewed_contract_changes_are_rejected(self):
        for field, value in [('companyId', 'orix'), ('sourceId', 'unreviewed-official'), ('id', 'nippon-made-up'), ('recordId', '000000'), ('checkedAt', '2099-01-01'), ('officialCheckUrl', 'https://store.nipponrentacar.co.jp/'), ('summaryKey', 'rental.airport.NRT'), ('vehicleEntranceStatus', 'VERIFIED')]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                data = copy.deepcopy(self.data); data['records'][7][field] = value
                path = Path(tmp) / 'facts.json'; path.write_text(json.dumps(data))
                with self.assertRaises(ValueError): rental.official_rows(path)

    def candidate(self, fact, match):
        return row(match['key'], name=fact['nameJa'], url=fact['officialCheckUrl'], lat=fact['lat'], lon=fact['lon'], address=fact['addressJa'])

    def test_new_reviewed_keys_are_required_and_guarded(self):
        fact = self.data['records'][7]
        source = self.candidate(fact, fact['reviewedSourceMatches'][0])
        for change in [None, {'companyId': 'times'}, {'candidateStatus': 'COUNTER_ONLY'}, {'lat': fact['lat'] + .01}, {'officialFact': {'id': 'already-owned'}}, {'websites': ['https://store.nipponrentacar.co.jp/b/nrs/info/999999/']}]:
            with self.subTest(change=change):
                candidate = copy.deepcopy(source)
                if change: candidate.update(change)
                with self.assertRaises(ValueError): rental.apply_official([[candidate]] if change else [], {'records': [fact]}, audit())

    def test_only_explicit_keys_merge_and_duplicate_ownership_is_rejected(self):
        fact = self.data['records'][7]
        source = self.candidate(fact, fact['reviewedSourceMatches'][0])
        neighbour = copy.deepcopy(source); neighbour['key'] = 'osm-n99999999'
        groups = rental.apply_official([[source, neighbour]], {'records': [fact]}, audit())
        reviewed = next(g for g in groups if any('officialFact' in q for q in g))
        self.assertEqual({q['key'] for q in reviewed}, {source['key'], 'official-' + fact['id']})
        with self.assertRaises(ValueError): rental.apply_official([[source]], {'records': [fact, fact]}, audit())

    def test_new_group_distance_still_limited_to_200m(self):
        fact = next(r for r in self.data['records'] if r['id'] == 'toyota-fukuoka-airport-international')
        a, b = [self.candidate(fact, match) for match in fact['reviewedSourceMatches']]
        b['lat'] += .0019
        self.assertLess(rental.distance(b, fact), 250)
        self.assertGreater(rental.distance(a, b), 200)
        with self.assertRaisesRegex(ValueError, '组内距离超过200米'): rental.apply_official([[a], [b]], {'records': [fact]}, audit())


    def test_snapshot_hash_lock_rejects_changed_bytes_and_changed_osm_date(self):
        names = list(rental.INPUT_LOCK['inputs'])
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name in names:
                path = Path(tmp) / name
                path.write_bytes(b'{}')
                paths[name] = path
            # 所有文件名齐全仍不能把其他快照标为固定旧日期。
            with self.assertRaisesRegex(ValueError, '快照不同'): rental.validate_inputs(paths)
            metadata = {name: {'bytes': 2, 'sha256': hashlib.sha256(b'{}').hexdigest()} for name in names}
            paths['osm-audit.json'].write_text(json.dumps({'osmSnapshot': '2026-10-02T00:00:00Z'}))
            payload = paths['osm-audit.json'].read_bytes()
            metadata['osm-audit.json'] = {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
            with patch.dict(rental.INPUT_LOCK, {'inputs': metadata}):
                with self.assertRaisesRegex(ValueError, 'OSM快照日期'): rental.validate_inputs(paths)


class RentalPublicationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.output = self.base / 'published'
        self.osm = self.base / 'osm.geojsonseq'
        self.write_osm(1)
        (self.base / 'osm-audit.json').write_text(json.dumps({'taggedWithoutExportedGeometry': [], 'independentPbfObjectCount': 1, 'inputPbfSha256': 'a' * 64, 'osmSnapshot': rental.OSM_DATE}))
        self.overture = self.base / 'overture.json'
        self.overture.write_text(json.dumps({'release': rental.RELEASE, 'records': []}))
        (self.base / 'overture-inventory.json').write_text(json.dumps({'release': rental.RELEASE, 'files': [{'name': f'offline-fixture-{i}'} for i in range(16)]}))
        self.bounds = self.base / 'boundaries.geojsonseq'
        features = []
        for i, code in enumerate(rental.CODES):
            x = 122 + i / 2
            coordinates = [[x, 20], [x + .4, 20], [x + .4, 21], [x, 21], [x, 20]]
            features.append({'properties': {'ISO3166-2': code, 'admin_level': '4'}, 'geometry': {'type': 'Polygon', 'coordinates': [coordinates]}})
        self.bounds.write_text('\n'.join(json.dumps(f) for f in features))
        published = json.loads((DATA / 'manifest.json').read_text())
        self.official = ROOT / ('public' + published['officialOverrides']['url'])

    def write_osm(self, identifier):
        self.osm.write_text(json.dumps({'properties': {'@type': 'node', '@id': identifier, '@timestamp': 1700000000, 'amenity': 'car_rental', 'name': 'Offline fixture'}, 'geometry': {'type': 'Point', 'coordinates': [139, 35]}}))

    def generate(self, identity_path=None):
        # 此组只隔离测试发布原子性，合成源不冒充受审生产快照。严格输入另有独立回归。
        facts = json.loads((ROOT / 'data/curation/rental-airports.json').read_text())
        facts['records'] = [r for r in facts['records'] if r['companyId'] == 'times']
        with patch('rental.validate_inputs'), patch('rental.official_rows', return_value=facts):
            return rental.generate(self.osm, self.overture, self.bounds, self.official, DATA / 'licenses', self.output, identity_path)

    def fail_manifest(self, path, payload):
        if Path(path) == self.output / 'manifest.json':
            self.promoted_identity = (self.output / 'identity.json').read_bytes()
            raise OSError('Simulated final manifest write failure')
        atomic_write(path, payload)

    def test_final_publication_failure_restores_identity_bytes_and_old_snapshots(self):
        first, _ = self.generate()
        manifest = (self.output / 'manifest.json').read_bytes()
        identity_path = self.output / 'identity.json'
        # Preserve exact bytes, including noncanonical whitespace in the alias.
        identity_path.write_text(json.dumps(json.loads(identity_path.read_text()), indent=2))
        identity = identity_path.read_bytes()
        snapshots = {p: p.read_bytes() for p in (self.output / 'snapshots').rglob('*.json')}
        self.write_osm(2)
        with patch('rental.atomic_write', side_effect=self.fail_manifest):
            with self.assertRaisesRegex(OSError, 'final manifest'):
                self.generate()
        self.assertNotEqual(self.promoted_identity, identity)
        self.assertEqual(identity_path.read_bytes(), identity)
        self.assertEqual((self.output / 'manifest.json').read_bytes(), manifest)
        for path, payload in snapshots.items():
            self.assertEqual(path.read_bytes(), payload)
        self.assertGreater(len(list((self.output / 'snapshots').rglob('*.json'))), len(snapshots))
        retried, _ = self.generate()
        self.assertNotEqual(retried['version'], first['version'])

    def test_final_publication_failure_restores_missing_identity_with_external_history(self):
        self.generate()
        manifest = (self.output / 'manifest.json').read_bytes()
        identity = self.output / 'identity.json'
        history = self.base / 'external-identity.json'
        history.write_bytes(identity.read_bytes())
        historical_bytes = history.read_bytes()
        identity.unlink()
        self.write_osm(2)
        with patch('rental.atomic_write', side_effect=self.fail_manifest):
            with self.assertRaisesRegex(OSError, 'final manifest'):
                self.generate(history)
        self.assertTrue(self.promoted_identity)
        self.assertFalse(identity.exists())
        self.assertEqual(history.read_bytes(), historical_bytes)
        self.assertEqual((self.output / 'manifest.json').read_bytes(), manifest)

    def test_first_publication_failure_leaves_both_pointers_absent(self):
        with patch('rental.atomic_write', side_effect=self.fail_manifest):
            with self.assertRaisesRegex(OSError, 'final manifest'):
                self.generate()
        self.assertFalse((self.output / 'identity.json').exists())
        self.assertFalse((self.output / 'manifest.json').exists())
        self.assertTrue(list((self.output / 'snapshots').rglob('identity.json')))

    def test_success_and_same_input_keep_version_and_snapshot_bytes(self):
        first, _ = self.generate()
        before = {p: p.read_bytes() for p in self.output.rglob('*') if p.is_file()}
        mtimes = {p: p.stat().st_mtime_ns for p in (self.output / 'snapshots').rglob('*.json')}
        second, _ = self.generate()
        self.assertEqual(first, second)
        self.assertEqual(before, {p: p.read_bytes() for p in self.output.rglob('*') if p.is_file()})
        self.assertEqual(mtimes, {p: p.stat().st_mtime_ns for p in mtimes})
        manifest = json.loads((self.output / 'manifest.json').read_text())
        immutable_identity = self.output / manifest['identity']['url'].removeprefix(rental.BASE)
        self.assertEqual(immutable_identity.read_bytes(), (self.output / 'identity.json').read_bytes())


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
        self.assertEqual(len(self.manifest['downloads']), 59)
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
        self.assertEqual(sum(s['sourceId'] in {'osm', 'overture'} for s in members) + self.audit['excludedCount'], self.audit['inputObjectsTotalKnown'])
        self.assertEqual(self.audit['count'] + self.audit['sourceObjectsMerged'], self.audit['retainedSourceObjects'] + 19)
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
        self.assertEqual(len(official), 19)
        self.assertTrue({'times-naha-airport', 'times-new-chitose-airport', 'times-fukuoka-airport-international'} <= {r['id'] for r in official})
        for r in official:
            self.assertEqual(r['official']['checkedAt'], '2026-09-30' if r['companyId'] == 'times' else '2026-10-01')
            self.assertEqual(r['vehicleEntranceStatus'], 'NOT_VERIFIED')
        kix = next(r for r in official if r['id'] == 'times-kansai-airport')
        self.assertIn('2F', kix['address'])
        self.assertEqual(kix['positionKind'], 'FACILITY_REFERENCE')
        nrt = next(r for r in official if r['id'] == 'times-narita-airport')
        self.assertEqual(set(nrt['sourceIds']), {'osm', 'overture', 'times-official'})
        self.assertIn('成田', nrt['names']['primary'])
        self.assertNotIn('宮崎', nrt['names']['primary'])

    def test_old_official_details_and_all_prior_links_remain_unchanged_or_resolvable(self):
        current = {r['id']: r for r in self.records}
        aliases = {a: r['id'] for r in self.records for a in r['aliases']}
        new_members = {s['key']: s for r in self.records for s in r['sources'] if s['sourceId'] in {'osm', 'overture'}}
        for version in ('rental-v1-1b43cbc1f43d95a5', 'rental-v1-4292016845adde58'):
            with self.subTest(previous=version):
                previous = DATA / 'snapshots' / version
                old = [r for path in (previous / 'partitions').glob('*.json') for r in json.loads(path.read_text())['records']]
                self.assertTrue(old)
                for r in old:
                    for key in [r['id'], *r['aliases']]:
                        self.assertIn(aliases.get(key, key), current)
                    if r['official']:
                        self.assertEqual(current[r['id']], r)
                old_members = {s['key']: s for r in old for s in r['sources'] if s['sourceId'] in {'osm', 'overture'}}
                self.assertEqual(old_members, new_members)

    def test_published_source_inputs_equal_pinned_reviewed_hashes_and_dates(self):
        sources = self.load(self.manifest['sourceRegistry'])
        self.assertEqual({i['name']: {'sha256': i['sha256'], 'bytes': i['bytes']} for i in sources['inputs']}, rental.INPUT_LOCK['inputs'])
        self.assertEqual(sources['osmUpstreamGeometryAudit']['osmSnapshot'], rental.INPUT_LOCK['osmSnapshot'])
        self.assertEqual(sources['overtureRelease'], '2026-09-23.1')
        self.assertEqual(self.manifest['reviewDate'], '2026-10-01')
        self.assertEqual({s['id']: s['sourceDate'] for s in self.manifest['sources']}, {'osm': '2026-09-29', 'overture': '2026-09-23', 'times-official': '2026-09-30', 'nippon-official': '2026-10-01', 'toyota-official': '2026-10-01'})

    def test_new_facilities_use_exact_reviewed_sources_and_phones(self):
        facts = json.loads((ROOT / 'data/curation/rental-airports.json').read_text())['records'][7:]
        for fact in facts:
            record = next(r for r in self.records if r['id'] == fact['id'])
            self.assertEqual(record['phones'], [fact['officialPhone']])
            self.assertEqual(record['official']['summaryKey'], fact['summaryKey'])
            self.assertIsNone(record['returnRule'])
            self.assertEqual({s['key'] for s in record['sources'] if s['sourceId'] in {'osm', 'overture'}}, {m['key'] for m in fact['reviewedSourceMatches']})
            official = next(s for s in record['sources'] if s['sourceId'] == fact['sourceId'])
            self.assertEqual(official['recordId'], fact['recordId'])
            self.assertEqual((record['lat'], record['lon']), (fact['lat'], fact['lon']))

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
