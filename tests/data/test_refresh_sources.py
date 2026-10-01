from datetime import date
from contextlib import contextmanager
from email.message import Message
import hashlib
import io
from pathlib import Path
import sys
import unittest
import tempfile
import json
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.response import addinfourl

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/importer'))
from refresh_sources import latest_url, OSM_INDEX, PRICE_INDEX, main, fetch_bytes, acquire_osm
from pipeline import fetch_price

OSM_FILE = 'https://download.geofabrik.de/asia/japan-260929.osm.pbf'
PRICE_FILE = 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/xlsx/260930.xlsx'


@contextmanager
def offline_http(responses):
    """Replace only transport; retain urllib's real status/redirect processing."""
    requested = []
    def receive(opener, request, data):
        requested.append(request.full_url)
        result = responses[request.full_url]
        if isinstance(result, Exception):
            raise result
        code, headers, payload = result
        message = Message()
        for key, value in headers.items():
            message[key] = value
        response = addinfourl(io.BytesIO(payload), message, request.full_url, code)
        response.msg = str(code)
        return response
    with patch('urllib.request.OpenerDirector._open', new=receive):
        yield requested


class SourceDownloadTests(unittest.TestCase):
    def test_redirect_target_is_never_requested_for_any_download(self):
        content = b'offline PBF transport fixture'
        checksum = hashlib.md5(content).hexdigest().encode()
        for source in [OSM_INDEX, PRICE_INDEX, OSM_FILE + '.md5', OSM_FILE, PRICE_FILE]:
            host = urlparse(source).netloc
            for code in [301, 302, 303, 307, 308]:
                for location in ['https://example.com/unapproved', f'http://{host}/insecure', '/unapproved-path', source.replace('2609', '2608') if source in [OSM_FILE, PRICE_FILE] else source + '?redirect=1']:
                    with self.subTest(source=source, code=code, location=location), tempfile.TemporaryDirectory() as temporary:
                        directory = Path(temporary)
                        target = urljoin(source, location)
                        responses = {OSM_FILE + '.md5': (200, {}, checksum), source: (code, {'Location': location}, b''), target: (200, {}, content)}
                        with offline_http(responses) as requested:
                            with self.assertRaises((ValueError, HTTPError)) as failure:
                                if source == OSM_FILE:
                                    acquire_osm(source, directory)
                                elif source == PRICE_FILE:
                                    fetch_price(SimpleNamespace(url=source, destination=str(directory / 'price.xlsx')))
                                else:
                                    fetch_bytes(source, 1024)
                            if isinstance(failure.exception, HTTPError):
                                failure.exception.close()
                        expected = [OSM_FILE + '.md5', source] if source == OSM_FILE else [source]
                        self.assertEqual(requested, expected)

    def test_unapproved_initial_url_is_rejected_before_transport(self):
        for url in ['http://download.geofabrik.de/asia/japan.html', 'https://example.com/asia/japan.html', OSM_INDEX + '?extra=1', 'https://download.geofabrik.de/asia/other.html']:
            with self.subTest(url=url), offline_http({url: (200, {}, b'content')}) as requested:
                with self.assertRaises(ValueError):
                    fetch_bytes(url, 1024)
                self.assertEqual(requested, [])

    def test_direct_downloads_preserve_limits_checksum_and_metadata(self):
        content = b'offline PBF transport fixture'
        checksum = hashlib.md5(content).hexdigest()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            responses = {OSM_INDEX: (200, {}, b'index'), PRICE_INDEX: (200, {}, b'prices'), OSM_FILE + '.md5': (200, {}, (checksum + '  japan.osm.pbf').encode()), OSM_FILE: (200, {}, content)}
            with offline_http(responses):
                self.assertEqual(fetch_bytes(OSM_INDEX, 5), b'index')
                self.assertEqual(fetch_bytes(PRICE_INDEX, 6), b'prices')
                with self.assertRaisesRegex(ValueError, 'exceeds limit'):
                    fetch_bytes(OSM_INDEX, 4)
                target, proof = acquire_osm(OSM_FILE, directory)
            self.assertEqual(target.read_bytes(), content)
            metadata = json.loads(proof.read_text())
            self.assertEqual(metadata['sourceUrl'], OSM_FILE)
            self.assertEqual(metadata['md5'], checksum)
            self.assertEqual(metadata['sha256'], hashlib.sha256(content).hexdigest())
            self.assertEqual(metadata['bytes'], len(content))

    def test_bad_publisher_checksum_produces_no_proof(self):
        for checksum in [b'invalid', b'0' * 32]:
            with self.subTest(checksum=checksum), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                with offline_http({OSM_FILE + '.md5': (200, {}, checksum), OSM_FILE: (200, {}, b'PBF fixture')}):
                    with self.assertRaises(ValueError):
                        acquire_osm(OSM_FILE, directory)
                self.assertFalse((directory / 'osm-metadata.json').exists())


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


class RefreshFailureEvidenceTests(unittest.TestCase):
    def test_index_denial_emits_blocked_report_and_keeps_both_pointers(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            output = base / 'published'
            output.mkdir()
            (output / 'manifest.json').write_bytes(b'unchanged manifest')
            (output / 'source-registry.json').write_bytes(b'unchanged registry')
            report = base / 'evidence' / 'refresh.json'
            argv = ['refresh_sources.py', 'prices', '--download-dir', str(base / 'raw'), '--output', str(output), '--report', str(report)]
            with patch('sys.argv', argv), offline_http({PRICE_INDEX: (403, {}, b'Forbidden')}):
                with self.assertRaises(SystemExit) as result:
                    main()
            self.assertEqual(result.exception.code, 1)
            data = json.loads(report.read_text())
            self.assertEqual(data['status'], 'BLOCKED')
            self.assertEqual(data['stage'], 'DISCOVERY')
            self.assertEqual(data['sourceUrl'], PRICE_INDEX)
            self.assertTrue(data['retainedPreviousPointers'])
            self.assertEqual(data['before'], data['after'])
            self.assertEqual((output / 'manifest.json').read_bytes(), b'unchanged manifest')
            self.assertEqual((output / 'source-registry.json').read_bytes(), b'unchanged registry')

    def test_download_failures_keep_pointers_and_never_start_import(self):
        for kind, index, source in [('prices', PRICE_INDEX, PRICE_FILE), ('osm', OSM_INDEX, OSM_FILE)]:
            for failure in [(403, {}, b'Forbidden'), URLError('offline interrupted download'), (302, {'Location': 'https://example.com/blocked'}, b'')]:
                with self.subTest(kind=kind, failure=failure), tempfile.TemporaryDirectory() as temporary:
                    base = Path(temporary)
                    output = base / 'published'
                    output.mkdir()
                    before = {'manifest.json': b'previous manifest', 'source-registry.json': b'previous registry'}
                    for name, payload in before.items():
                        (output / name).write_bytes(payload)
                    report = base / 'report.json'
                    argv = ['refresh_sources.py', kind, '--download-dir', str(base / 'raw'), '--output', str(output), '--report', str(report)]
                    responses = {index: (200, {}, f'<a href="{source}">download</a>'.encode()), source: failure, OSM_FILE + '.md5': (200, {}, b'0' * 32), 'https://example.com/blocked': (200, {}, b'invalid')}
                    with patch('sys.argv', argv), offline_http(responses), patch('refresh_sources.subprocess.run') as promote:
                        with self.assertRaises(SystemExit) as result:
                            main()
                        self.assertEqual(result.exception.code, 1)
                        promote.assert_not_called()
                    evidence = json.loads(report.read_text())
                    self.assertEqual(evidence['status'], 'BLOCKED')
                    self.assertEqual(evidence['stage'], 'DOWNLOAD')
                    self.assertTrue(evidence['retainedPreviousPointers'])
                    for name, payload in before.items():
                        self.assertEqual((output / name).read_bytes(), payload)


if __name__ == '__main__':
    unittest.main()
