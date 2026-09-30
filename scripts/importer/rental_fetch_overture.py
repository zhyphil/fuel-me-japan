"""显式手动下载已固定版本的 Overture 日本租车候选。输出只写 /tmp，不在构建中调用。"""
import argparse
from collections import Counter
import concurrent.futures
import hashlib
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.dataset as ds
import pyarrow.fs as fs
from shapely import wkb

RELEASE = '2026-09-23.1'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if not output.is_relative_to(Path('/tmp').resolve()):
        raise ValueError('原始下载只能写入 /tmp')
    inventory = json.loads(args.inventory.read_text())
    inventory = inventory.get('overtureInventory', inventory)
    if inventory.get('release') != RELEASE or len(inventory.get('files', [])) != 16:
        raise ValueError('仅接受已固定的2026-09-23.1清单')
    prefix = f'overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/'
    paths = [i['path'] for i in inventory['files']]
    if len(set(paths)) != len(paths) or any(not p.startswith(prefix) or not p.endswith('.parquet') or '..' in p for p in paths):
        raise ValueError('无效下载路径')
    pa.set_cpu_count(2)
    pa.set_io_thread_count(8)
    s3 = fs.S3FileSystem(anonymous=True, region='us-west-2')
    predicate = ((ds.field(('bbox', 'xmin')) >= 122) & (ds.field(('bbox', 'xmax')) <= 154) &
                 (ds.field(('bbox', 'ymin')) >= 20) & (ds.field(('bbox', 'ymax')) <= 46) &
                 (ds.field(('taxonomy', 'primary')) == 'car_rental_service'))
    columns = ['id', 'geometry', 'confidence', 'websites', 'phones', 'brand', 'addresses', 'names',
               'sources', 'operating_status', 'taxonomy', 'version']

    def fetch(path):
        rows = ds.dataset(path, filesystem=s3, format='parquet').to_table(columns=columns, filter=predicate).to_pylist()
        selected = []
        for row in rows:
            if not any(a.get('country') == 'JP' for a in row.get('addresses') or []):
                continue
            point = wkb.loads(row.pop('geometry'))
            if point.geom_type != 'Point' or point.is_empty or not point.is_valid:
                raise ValueError(f"不支持的点几何: {row['id']}")
            row['geometry'] = {'type': 'Point', 'coordinates': [point.x, point.y]}
            selected.append(row)
        print(json.dumps({'file': path.split('/')[-1], 'count': len(selected)}), flush=True)
        return selected

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        rows = [r for batch in pool.map(fetch, paths) for r in batch]
    rows.sort(key=lambda r: r['id'])
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('重复 Overture ID')
    payload = json.dumps({'release': RELEASE, 'records': rows}, ensure_ascii=False, separators=(',', ':')).encode()
    output.mkdir(parents=True, exist_ok=True)
    (output / 'overture-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2))
    destination = output / 'overture-car-rental-full.json'
    staging = output / '.overture-car-rental-full.json.tmp'
    staging.write_bytes(payload)
    staging.replace(destination)
    audit = {'release': RELEASE, 'count': len(rows), 'sha256': hashlib.sha256(payload).hexdigest(),
             'licenseCounts': dict(Counter(s.get('license') or 'UNKNOWN' for r in rows for s in r['sources'] or [])),
             'datasetCounts': dict(Counter(s.get('dataset') or 'UNKNOWN' for r in rows for s in r['sources'] or [])),
             'note': '从官方Parquet筛选日本汽车租赁分类；保留真实几何和来源，置信度不是官方核验。'}
    (output / 'overture-car-rental-full-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
