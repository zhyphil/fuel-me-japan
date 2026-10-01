# 全国租车候选数据契约

本模块用于独立还车目录与详情页。当前本地版本 `rental-v1-2769bcab1437116e`，批次日期为 `2026-10-01`；原7家Times保留 `2026-09-30`，6家Nippon及5家Toyota为 `2026-10-01`。旧 `public/data/rental/locations.json` 保留历史兼容；新页面使用全国数据。`src/lib/return-car.ts` 的加油候选逻辑继续复用。全国索引只能在进入还车业务时按需请求；首页不得预取。

## 加载与检索接口

入口：`src/lib/rental.ts`。模块仅静态导入小型受审白名单 `rental-reviewed.json`，不导入全国数据；无模块级请求、定位请求、存储或统计。

| 导出 | 契约 |
| --- | --- |
| `rentalManifestUrl` | `/data/rental/nationwide/manifest.json` |
| `rentalTransformationVersion` | `rental-v1` |
| `rentalPrefectureCodes`、`rentalSourceIds` | 47 地区 + `UNKNOWN`；`osm`、`overture`、`times-official`、`nippon-official`、`toyota-official` |
| `parseManifest(value)` | 拒绝错误版本、来源、许可、路径、计数、重复分区及不完整下载清单 |
| `parseIndex(value, manifest?)` | 校验枚举、坐标、日本范围、ID/alias唯一性、七机场18条精确白名单；传入 manifest 时核对版本及所有分区计数 |
| `parsePartition(value, manifest?, index?)` | 详情来源成员、上游许可及官方事实校验；传入 index 后逐项验证索引/详情一致 |
| `loadRentalManifest(signal?)` | 单次入口请求，严格解析 |
| `loadRentalIndex(manifest, signal?)` | 仅请求索引；检查字节数、SHA-256、版本与计数 |
| `loadRentalPartition(manifest, code, signal?, index?)` | 仅请求指定地区；不存在的地区在请求前失败 |
| `loadRentalLocation(manifest, index, id, signal?)` | 支持 canonical ID / alias；仅请求对应详情分区，并核对 index |
| `findRentalById(index, id)` | 内存中解析 canonical ID 或历史 alias，找不到返回 `undefined` |
| `searchRentals(index, options?)` | 纯内存地区、公司、名称/已有语言名/地址/机场代码搜索；NFKC归一化；整词为已支持的7机场代码时仅精确匹配机场字段，避免 `OKA` 误匹配 `Fukuoka`，普通名称仍使用文本匹配。选项：`query`、`companyId`、`prefectureCode`、`airportCode`、`includeCounters`、`limit`。默认隐藏柜台，默认最多100条；全国地图需明确传 `limit: 10000` |
| `canSelectRentalDestination(row)` | 柜台返回 `false`；候选可由后续UI在明确未核验状态下选择，不代表已确认可归还 |
| `rentalNeedsRecheck(checkedAt, now?)` | 90天起需要复核；不会改写日期或自动提升状态 |
| `rentalRuleFor(row)` | Times返回公司特定规则，其他公司返回 `null`（未知） |

所有请求支持 `AbortSignal`，请求前、读取后及哈希检查后均检查取消；HTTP错误、JSON错误、哈希或字节数不符均抛错。不做后台重试或失败后切换为未经核验的数据。调用方负责取消旧请求、展示现有五语言错误提示和手动重试。

所有解析器递归拒绝 `__proto__`、`constructor`、`prototype`，拒绝非普通对象、非有限数值及未声明的领域字段。允许路径严格限定本地全国数据目录；索引/分区必须属于同一个版本目录。浏览器哈希验证依赖安全上下文中的 Web Crypto，现有 HTTPS 生产环境和 localhost 均具备该条件。

```ts
// 仅在进入还车业务后执行；不放在首页预加载流程中。
const manifest = await loadRentalManifest(signal);
const index = await loadRentalIndex(manifest, signal);
const matches = searchRentals(index, { query: "NRT", companyId: "times" });
const location = await loadRentalLocation(manifest, index, matches[0].id, signal);
```

## 模型和未知状态

核心类型：`RentalManifest`、`RentalIndex`、`RentalIndexEntry`、`RentalPartition`、`RentalLocation`、`RentalMember`、`RentalSource`、`RentalArtifact`、`RentalPartitionArtifact`、`RentalNames`、`RentalOfficialCheck`、`RentalReturnRule`、`RentalSearchOptions`。同时导出公司、来源、机场、候选、核验和位置枚举类型。

- 坐标为 flat `lat` / `lon`，可直接传给现有只要求坐标的 Point 函数。
- `id` 不依赖名称；`aliases` 用于历史 URL 兼容。`names.primary` 保留原文或为 `null`，`names.languages` 只保留已有语言名，不机器编造翻译。OSM `branch` 可拼入主名称；原始字段仍保留在来源成员中。
- `companyId` 支持 Toyota、Nippon、Orix、Times、Nissan、Budget、Niconico、Honda、JR、OTS；无法唯一归一化时为 `UNKNOWN`，`companyName: null`。
- `prefectureCode` 按47个真实边界严格空间归属；边界外或多重覆盖为 `UNKNOWN`，不使用最近行政区猜测。官方18条的地址行政区可补充海岸设施，明确冲突会阻断生成。
- `address: null`、`phones: []`、`websites: []` 表示未知/缺少可用值，不表示没有地址或联系方式。原始无效URL仍保留在 source attributes，不作为可点击网站输出。
- `positionKind`：`SOURCE_POINT`、`AREA_REFERENCE`、`LINE_REFERENCE`、`SHOP_REFERENCE`、`FACILITY_REFERENCE`。全部 `vehicleEntranceStatus: NOT_VERIFIED`；没有任何入口已实测声明。
- `candidateStatus: CANDIDATE` 为分类候选；`COUNTER_ONLY` 为柜台，不可选作还车目的地；`OFFICIAL_RETURN_FACILITY` 仅用于本批受审18条设施（7家Times、6家Nippon、5家Toyota）。
- `verification` 为 `NOT_VERIFIED` / `OFFICIAL_FACILITY_CHECKED`。上游 `confidence` 只存在原属性，绝不映射为核验状态。
- `sourceIds` 供索引归属展示；manifest `sources` 提供归属/许可证，详情 `sources[]` 提供稳定源key、原始记录ID、来源日期、URL、原许可证及完整源属性。Overture的嵌套 `sources` 继续保留贡献者、record_id、版本、更新时间及许可。
- `official: null` 表示未经官方核对；有值时使用各记录的 `official.summaryKey`；旧Times仍为 `rental.airport.<IATA>`，11条新增为 `rental.shop.<canonical-id>`。这些 key 已映射到五语言界面。18条简短中文审核事实在 `official-overrides.json`，不把中文审计直接作为五语言UI文案。
- `returnRule: null` 表示公司规则未知。Times `STANDARD_SUBJECT_TO_CONTRACT` / `MAY_BE_REQUESTED` 以合同为准，来源为已交接核对的 `https://www.timescar-rental.com/en/agreement/gas.html`。公司规则不意味着该候选分店已核验。
- Times官网主按钮沿用 `https://www.timescar-rental.com/en/`；Nippon使用已审核门店页，Toyota按网站提示使用 `https://rent.toyota.co.jp/`。原始核对页URL保存在来源中供追溯，Toyota的 `recordId` 显式保留 `rCode:eCode`，不从URL末段截取。新增 `officialPhone` 为本次核对联系电话，提供时 `phones` 只展示该号码；旧电话完整保留在来源属性。

## 去重、稳定ID和审计

同OSM对象的多种几何优先面；同层级不同几何或不同属性发生冲突时排除并保留原输入。行政区支撑要素不是租车记录。源内不同ID与跨源合并要求200米内、状态兼容、公司不冲突，以及分店专属URL，或非共享电话加分店名/精确地址，或分店名加精确地址。分店URL互相矛盾时禁止电话覆盖该冲突；丰田的 rCode/eCode 与 rShop/eShop 参数归一为相同的分店标识，追踪参数不参与身份。Nippon的 `store.nipponrentacar.co.jp/b/nrs/info/<编号>/` 与旧 `sasp.mapion.co.jp/b/nrs/info/<编号>/` 按明确相同编号归一。公司主页、总机、泛品牌名、距离本身均不构成合并依据。

整组要求每对成员直接满足证据；不进行传递链式合并。模糊近邻保留独立记录和冲突审计。相同分店URL但坐标超过200米也单列冲突。官方覆盖是显式人工证据通道：候选必须直接关联已审核OSM ID、带中文理由的 reviewedSourceMatches 人工来源映射、分店URL或名称+地址，250米内且各成员相互不超过200米；柜台不能通过同机场同公司升级。原Times保留历史无匹配例外。新增11条必须全部匹配本次 `reviewedSourceMatches` 明示源key；缺失、重复归属、其他官方归属、错公司、柜台、分店URL冲突、超过距离约束或不沿用已匹配参考坐标均阻断。不会自动吸收同名近邻，也不会新增无匹配官方设施。

首次排序确定ID；以后默认读取输出根目录 `identity.json`，也可用 `--identity` 指定历史文件。名称/URL变化不会改源ID对应的canonical ID。合并保留旧canonical ID为alias，并压平传递alias；不同官方门店不能合并，旧ID需要拆分时阻断生成，等待明确迁移。历史映射可保留不在当前展示集的已排除源key，这不代表该记录仍可选。前端只用当前index解析URL，不用历史identity作展示索引。

生成器把 records、审计、来源说明和identity共同计算为内容版本；每个分区文件有SHA-256与字节数。先写不可变快照，再写identity，最后原子替换manifest；失败不替换旧入口。不会修改核对日期或自动联网。

## 输入、许可和可复现命令

原始大文件仍在 `/tmp/fmj-rental-source-research-20260930`，本批复现审核输入已保存为 `data/curation/rental-airports.json`（来自根代理逐页核对后的交接）。`src/lib/rental-reviewed.json` 是生成器及运行时共用的18条固定契约；`data/curation/rental-input-lock.json` 锁定实际原始输入、边界、OSM审计、Overture清单和审核输入的SHA-256及字节数。替换快照却保留旧日期会在生成前被拒绝。官方HTML和整页文字未复制入仓库。每个输入文件的字节数和哈希记录在快照 `sources.json`。

OSM来源是已批准的日本2026-09-29快照和同快照47个边界；上游PBF审计记录2298个租车对象，其中 `r17176820` 未导出几何。本节点导入完整带type/id/timestamp的GeoJSON Sequence，读取交接 `osm-audit.json` 的缺几何证据，不宣称重新执行PBF核对。OSM提取沿用现有 `osmium tags-filter ... nwr/amenity=car_rental` 及 `osmium export ... --attributes=type,id,timestamp`；输出包含支撑对象和同一way的线/面，必须交由本导入器处理，不能直接数行当门店数。

Overture为 `2026-09-23.1` 的完整精确筛选输入，未使用早期简化bbox文件。`sources.json.overtureInventory` 保存16个Parquet清单。以下下载器仅显式调用才联网，本节点未执行下载或在线服务测试；输出只能写入 `/tmp`，依赖现有 pyarrow、shapely：

```sh
/opt/anaconda3/bin/python3 scripts/importer/rental_fetch_overture.py \
  --inventory public/data/rental/nationwide/snapshots/rental-v1-1b43cbc1f43d95a5/sources.json \
  --output-dir /tmp/fmj-rental-download
```

离线生成还需同目录下的 `overture-inventory.json` 和 `osm-audit.json`（上述来源文件保存前者完整内容、后者必要PBF证据；本次使用完整交接原件）。不得把新快照伪装成相同release。当前版本的固定源日期和18条有限事实需要复核后才能调整共用契约、输入锁和审核输入；日期不随重新生成自动刷新。

```sh
/opt/anaconda3/bin/python3 scripts/importer/rental.py \
  --osm /tmp/fmj-rental-source-research-20260930/osm-rental-full.geojsonseq \
  --overture /tmp/fmj-rental-source-research-20260930/overture-car-rental-full.json \
  --boundaries /tmp/fmj-rental-source-research-20260930/prefecture-boundaries.geojsonseq \
  --official data/curation/rental-airports.json \
  --licenses /tmp/fmj-rental-source-research-20260930/licenses \
  --output public/data/rental/nationwide \
  --identity public/data/rental/nationwide/identity.json
```

衍生数据按ODbL提供；各源原许可和记录ID保持。随数据携带ODbL全文、Apache 2.0全文、Foursquare完整NOTICE、CDLA Permissive 2.0全文、CC0全文、OSM署名及修改说明。Times、Nippon及Toyota资料仅使用已逐条核对的有限事实，不包含公司图片/商标/网页正文，也不主张公司整库授权。

manifest `downloads` 提供完整48分区、索引、审计、官方覆盖、来源、identity、署名及许可证共59个下载项。独立业务页面的来源折叠区提供这些链接与来源署名。

最终审查补充：明确使用 `carshare.earth-car.com` 的两条记录按共享汽车排除，原来源仍在排除审计；不以任意网址中的营销关键词推断共享汽车。当前共7,383条，默认目录7,351条，32柜台另选显示；其中官方有限事实18条。上一批Toyota Poplar合并减少1条，本次成田Toyota两条候选按明确证据合并又减少1条；原始来源成员与历史链接完整保留，旧快照不变。

2026-10-01上一批维护验收见 [数据质量报告](../reports/rental-quality-20261001.md)。最新补核剩余6家，新增成田、中部及福冈Toyota的3家有限事实，与原15家合计18家。关西Toyota、福冈Nippon及那霸Toyota Seaside继续保留未核验状态。详见 [本次补核报告](../reports/rental-airport-followup-20261001.md)。所有新增坐标沿用既有OSM参考点；国土地理院测地系换算仅作交叉核对，不批量更正候选坐标，也不代表车辆入口已核实。
