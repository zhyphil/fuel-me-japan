"""Offline, deterministic serialization and fail-closed input/publication helpers."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
from datetime import date, datetime, timezone

VERSION = 'm01-data-v2'
PREFECTURES = '北海道 青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 東京 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 京都 大阪 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄'.split()
CODES = [f'JP-{i:02}' for i in range(1, 48)]
TRI = {'YES', 'NO', 'UNKNOWN'}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()

def read_json(path):
    return json.loads(Path(path).read_text())

def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def verified_input(path, metadata, domain):
    from urllib.parse import urlparse
    require(urlparse(metadata.get('sourceUrl', '')).scheme == 'https' and urlparse(metadata['sourceUrl']).hostname == domain, 'Unapproved input URL')
    require(re.fullmatch('[0-9a-f]{64}', metadata.get('sha256', '')) is not None, 'Missing source SHA256')
    require(Path(path).stat().st_size == metadata.get('bytes'), 'Source byte count mismatch')
    require(digest(path) == metadata['sha256'], 'Source SHA256 mismatch')
    timestamp(metadata.get('fetchedAt'))
    if domain == 'download.geofabrik.de' or 'md5' in metadata:
        md5 = metadata.get('md5')
        require(isinstance(md5, str) and re.fullmatch('[0-9a-fA-F]{32}', md5), 'Missing or invalid publisher MD5')
        require(digest(path, 'md5') == md5.lower(), 'Source MD5 mismatch')
    return metadata

def timestamp(value):
    require(isinstance(value, str), 'Missing timestamp')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(result.tzinfo is not None and result <= datetime.now(timezone.utc), 'Invalid/future timestamp')
    return result

def day(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), 'Invalid date')
    result = date.fromisoformat(value)
    require(result <= date.today(), 'Future date')
    return result

def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.staging-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def immutable_write(path, data):
    path = Path(path)
    if path.exists():
        require(path.read_bytes() == data, f'Immutable path collision: {path}')
    else:
        atomic_write(path, data)

def validate_station(s):
    require(s.get('osmType') in {'node', 'way', 'relation'}, 'Invalid OSM type')
    require(type(s.get('osmId')) is int and s['osmId'] > 0, 'Invalid OSM id')
    require(s.get('id') == f"osm:{s['osmType']}:{s['osmId']}", 'Unstable station id')
    require(type(s.get('lat')) in {float, int} and math.isfinite(s['lat']) and 20 <= s['lat'] <= 46, 'Invalid Japan latitude')
    require(type(s.get('lon')) in {float, int} and math.isfinite(s['lon']) and 122 <= s['lon'] <= 155, 'Invalid Japan longitude')
    for key in ['paymentVisa', 'paymentMastercard', 'fuelRegular', 'fuelHighOctane', 'fuelDiesel']:
        require(s.get(key) in TRI, f'Invalid {key}')
    require(s.get('serviceType') in {'SELF', 'FULL', 'UNKNOWN'}, 'Invalid serviceType')
    require(s.get('prefectureCode') in CODES + ['UNKNOWN'], 'Invalid prefecture')
    require(s.get('positionMethod') in {'OSM_NODE', 'SURFACE_POINT', 'LINE_MIDPOINT'}, 'Invalid position method')
    require('price' not in s and 'gogoUrl' not in s, 'Unapproved station field')
    timestamp(s.get('sourceUpdatedAt'))

def count_gate(previous, current, bootstrap=False, review_reason=None):
    if previous is None:
        require(bootstrap, 'Initial dataset requires explicit --bootstrap')
        return {'kind': 'BOOTSTRAP', 'reason': 'Initial verified input; no earlier baseline'}
    require(not bootstrap, '--bootstrap cannot bypass an existing baseline')
    changes = []
    for code in CODES + ['UNKNOWN']:
        before, after = previous[code], current[code]
        if (before == 0 and after != 0) or (before and abs(after - before) / before > .25):
            changes.append({'partition': code, 'before': before, 'after': after})
    require(not changes or (review_reason and len(review_reason.strip()) >= 12), 'Partition count changed >25%; requires --review-count-change with recorded review reason')
    return {'kind': 'MANUAL_REVIEW' if changes else 'WITHIN_THRESHOLD', 'changes': changes, 'reason': review_reason}
