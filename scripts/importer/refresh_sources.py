#!/usr/bin/env python3
"""Acquire reviewed public sources and build a checked local candidate; never deploy."""
import argparse
from datetime import date, datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urljoin, urlparse

from common import atomic_write, digest, encode, require
from download import open_source
from pipeline import fetch_price
from types import SimpleNamespace

OSM_INDEX = 'https://download.geofabrik.de/asia/japan.html'
PRICE_INDEX = 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html'
PATTERNS = {
    'osm': r'https://download\.geofabrik\.de/asia/japan-(\d{6})\.osm\.pbf',
    'prices': r'https://www\.enecho\.meti\.go\.jp/statistics/petroleum_and_lpgas/pl007/xlsx/(\d{6})\.xlsx',
}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attributes):
        if tag == 'a':
            self.links.extend(value for key, value in attributes if key == 'href' and value)


def latest_url(html, index, kind, today=None):
    """Choose an actual listed, exact reviewed URL; never invent a dated filename."""
    parser = Links()
    parser.feed(html)
    candidates = []
    for link in parser.links:
        url = urljoin(index, link)
        match = re.fullmatch(PATTERNS[kind], url)
        if not match:
            continue
        try:
            stamp = match[1]
            published = date(2000 + int(stamp[:2]), int(stamp[2:4]), int(stamp[4:]))
        except ValueError:
            continue
        if published <= (today or date.today()):
            candidates.append((published, url))
    require(candidates, f'No reviewed {kind} file link found; source layout may have changed')
    return max(candidates)[1]


def fetch_bytes(url, limit):
    with open_source(url, timeout=45, headers={'User-Agent': 'FuelMeJapan/0.1 (public data refresh)'}) as response:
        payload = response.read(limit + 1)
    require(len(payload) <= limit, 'Source response exceeds limit')
    return payload


def acquire_osm(url, directory):
    checksum = fetch_bytes(url + '.md5', 1024).decode('ascii').split()[0]
    require(re.fullmatch('[a-fA-F0-9]{32}', checksum), 'Invalid Geofabrik MD5')
    target = directory / Path(urlparse(url).path).name
    with open_source(url, timeout=45, headers={'User-Agent': 'FuelMeJapan/0.1 (public data refresh)'}) as response, target.open('xb') as output:
        total = 0
        for chunk in iter(lambda: response.read(8 * 1024 * 1024), b''):
            total += len(chunk)
            require(total <= 6 * 1024**3, 'Extract exceeds reviewed 6 GiB download limit')
            output.write(chunk)
    require(total > 0 and digest(target, 'md5') == checksum.lower(), 'Geofabrik checksum mismatch')
    metadata = {'sourceUrl': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(),
                'sha256': digest(target), 'md5': checksum.lower(), 'bytes': total,
                'acquisition': 'Listed dated Geofabrik extract and publisher MD5'}
    proof = directory / 'osm-metadata.json'
    atomic_write(proof, encode(metadata))
    return target, proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=['osm', 'prices'])
    parser.add_argument('--download-dir', required=True, help='Temporary raw-input storage outside the repository')
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[2] / 'public/data'))
    parser.add_argument('--report', help='Optional diagnostic JSON outside published data')
    args = parser.parse_args()
    raw = Path(args.download_dir).resolve()
    require(not raw.is_relative_to(Path(args.output).resolve()), 'Raw inputs must stay outside published data')
    raw.mkdir(parents=True, exist_ok=True)
    index = OSM_INDEX if args.kind == 'osm' else PRICE_INDEX
    output = Path(args.output).resolve()
    report = Path(args.report).resolve() if args.report else None
    require(report is None or not report.is_relative_to(output), 'Diagnostic report must stay outside published data')
    def pointers():
        return {name: digest(output / name) if (output / name).exists() else None
                for name in ['manifest.json', 'source-registry.json']}
    evidence = {'schemaVersion': 1, 'kind': args.kind, 'status': 'RUNNING',
                'startedAt': datetime.now(timezone.utc).isoformat(), 'sourceUrl': index,
                'stage': 'DISCOVERY', 'before': pointers()}
    failure = None
    try:
        url = latest_url(fetch_bytes(index, 2 * 1024 * 1024).decode('utf-8', errors='replace'), index, args.kind)
        evidence.update(sourceUrl=url, stage='DOWNLOAD')
        print(json.dumps({'kind': args.kind, 'sourceUrl': url}), flush=True)
        with tempfile.TemporaryDirectory(prefix='fmj-refresh-', dir=raw) as temporary:
            directory = Path(temporary)
            command = [sys.executable, str(Path(__file__).with_name('pipeline.py')), 'refresh', args.kind, '--output', args.output]
            if args.kind == 'osm':
                data, metadata = acquire_osm(url, directory)
                command += ['--pbf', str(data), '--osm-metadata', str(metadata)]
            else:
                target = directory / 'official.xlsx'
                fetch_price(SimpleNamespace(url=url, destination=str(target)))
                command += ['--workbook', str(target), '--price-metadata', str(target) + '.json']
            evidence['stage'] = 'VALIDATION'
            subprocess.run(command, check=True)
            evidence.update(status='PASS', stage='COMPLETE')
    except Exception as error:
        failure = error
        evidence.update(status='BLOCKED', error=str(error))
    finally:
        evidence.update(finishedAt=datetime.now(timezone.utc).isoformat(), after=pointers())
        evidence['retainedPreviousPointers'] = evidence['before'] == evidence['after']
        evidence['说明'] = '仅校验候选数据；没有提交或部署。失败时核对前后指针哈希，成功候选仍需应用检查和审核发布。'
        if report:
            atomic_write(report, encode(evidence))
    if failure:
        parser.exit(1, f'BLOCKED: {failure}. No source substitution and no deployment; retain the published snapshot.\n')


if __name__ == '__main__':
    main()
