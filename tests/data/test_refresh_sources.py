from datetime import date
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/importer'))
from refresh_sources import latest_url, OSM_INDEX, PRICE_INDEX


class SourceDiscoveryTests(unittest.TestCase):
    def test_osm_uses_dated_publisher_link_not_latest_alias_or_future_file(self):
        html = '<a href="japan-latest.osm.pbf">alias</a><a href="japan-260928.osm.pbf">old</a><a href="japan-260929.osm.pbf">latest</a><a href="japan-261001.osm.pbf">future</a>'
        self.assertEqual(latest_url(html, OSM_INDEX, 'osm', date(2026, 9, 30)), 'https://download.geofabrik.de/asia/japan-260929.osm.pbf')

    def test_prices_reject_foreign_urls_wrong_dataset_and_invalid_dates(self):
        html = '<a href="https://example.com/260930.xlsx">foreign</a><a href="xlsx/260930.xlsx">current</a><a href="xlsx/260914.xlsx">older</a><a href="xlsx/260931.xlsx">invalid</a><a href="other/261001.xlsx">other dataset</a>'
        self.assertEqual(latest_url(html, PRICE_INDEX, 'prices', date(2026, 9, 30)), 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/xlsx/260930.xlsx')

    def test_changed_layout_stops_instead_of_guessing_filename(self):
        for kind, index in [('osm', OSM_INDEX), ('prices', PRICE_INDEX)]:
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'No reviewed'):
                latest_url('<p>403 or redesigned source page</p>', index, kind)


if __name__ == '__main__':
    unittest.main()
