# 租车数据质量维护与七机场有限事实扩充

日期：2026-10-01。范围：现有数据更新可靠性、七机场门店官方事实复查与本地页面验收。本轮已完成并通过全部本地检查；尚未提交、推送或部署。公开官网已逐页核对；全国候选使用锁定的既有OSM／Overture输入，没有重新下载全库。

## 本批结果

新增 **8条**：6家Nippon、Toyota羽田国际线与新千岁Poplar。连同原7家Times为 **15条**；并非14条新增，也不是七机场各新增两家。旧Times详情对象（含ID、日期、所有字段和规则）与历史快照逐项相同。

| 门店ID | 公司／机场 | 官方核对出处 | 日期 |
| --- | --- | --- | --- |
| `nippon-narita-airport` | nippon／NRT | [560379](https://store.nipponrentacar.co.jp/b/nrs/info/560379/) | 2026-10-01 |
| `nippon-haneda-airport` | nippon／HND | [512479](https://store.nipponrentacar.co.jp/b/nrs/info/512479/) | 2026-10-01 |
| `nippon-kansai-airport` | nippon／KIX | [340902](https://store.nipponrentacar.co.jp/b/nrs/info/340902/) | 2026-10-01 |
| `nippon-chubu-centrair-airport` | nippon／NGO | [470186](https://store.nipponrentacar.co.jp/b/nrs/info/470186/) | 2026-10-01 |
| `nippon-new-chitose-airport` | nippon／CTS | [810034](https://store.nipponrentacar.co.jp/b/nrs/info/810034/) | 2026-10-01 |
| `nippon-naha-airport-toyosaki` | nippon／OKA | [020660](https://store.nipponrentacar.co.jp/b/nrs/info/020660/) | 2026-10-01 |
| `toyota-haneda-airport-international` | toyota／HND | [63601:06V](https://rent.toyota.co.jp/shop/detail.aspx?rCode=63601&eCode=06V) | 2026-10-01 |
| `toyota-new-chitose-airport-poplar` | toyota／CTS | [61201:002](https://rent.toyota.co.jp/shop/detail.aspx?rCode=61201&eCode=002) | 2026-10-01 |

旧Times核对日期仍为2026-09-30；新增8条为2026-10-01；manifest批次日期为2026-10-01。七机场均已检索；福冈等6条候选未充分对应，不接入有限官方事实，不调整其候选坐标，逐项说明见[未纳入的六条记录](rental-airport-review-20261001.md)。

核对范围为门店身份、地址与归还安排。新增地图坐标均沿用本次明确匹配的OSM／Overture参考点，不采用官网不同坐标字段或转换测地系，不声称现场车辆入口、实时营业或路线可通行已核验。全部 `vehicleEntranceStatus` 仍为 `NOT_VERIFIED`。

## 输入和生成契约

- `data/curation/rental-airports.json`：完整15条可复现审核输入，来自 `/tmp/fmj-quality-20261001-research/reviewed-airports-20261001.json`；仅有限自编审核简述，没有HTML、PDF、照片、地图、商标或凭据。
- `src/lib/rental-reviewed.json`：生成器、运行时共用精确白名单，逐条固定ID、公司、编号、URL、日期、坐标、状态、摘要key与来源key；不无限放宽来源。
- `data/curation/rental-input-lock.json`：固定真实OSM/Overture/边界输入、osm-audit、Overture清单和审核输入的SHA-256及字节数。OSM仍为2026-09-29（审计时间2026-09-29T20:22:51Z），Overture仍为2026-09-23.1，不允许换数据却沿用旧日期。
- 新增仅依赖显式审核源key，全部必须存在、同公司、非柜台、无其他官方归属；分店URL身份冲突、参考点超过250米、组内超过200米或参考坐标漂移均阻断。不会自动吸收同名近邻或创建无匹配官方设施。Times历史无匹配例外保留。
- Nippon官方分店路径与旧Mapion同编号支持身份归一，主页不算分店证据；Toyota的编号显式保存为 `63601:06V`、`61201:002`。
- 新增联系电话以 `officialPhone` 为准；旧名称、旧电话及全部上游属性留在来源成员。OSM／Overture来源成员与历史快照逐项相同。

## 页面与公司规则

详情使用 `official.summaryKey`，新增8条 `rental.shop.*` 均有en、zh-Hant、ko、zh-Hans、th自编说明，保留日文地名、现场标签及限制。其他公司不显示Times摘要、官网按钮或满油／收据规则；`returnRule` 保持null，提示按合同核对。通用核对范围及90天提醒已更新。

Toyota官网按钮按网站提示指向 `https://rent.toyota.co.jp/`，原店页链接作为核对来源保留；Nippon使用本次核对门店页；Times按钮及公司规则沿用原范围。仅展示有限事实与自编摘要，不表示公司整库授权、商标授权、商业背书或法律许可审查完成。

## 生成产物与兼容

生成版本：`rental-v1-4292016845adde58`。共7,384条：7,337候选、32柜台、15条官方有限事实；默认隐藏柜台为7,352条。48分区（47地区和UNKNOWN空分区）、59下载项。相比上一批减少1条，来自Toyota Poplar两个来源对象按显式审核合并，原始来源未丢失。

旧快照 `rental-v1-1b43cbc1f43d95a5` 保留；所有旧ID及alias仍能解析，新增门店的旧候选链接转为alias。原下载可靠性与identity最终发布失败回滚修复均保留。重新生成前后manifest、identity、新旧快照与许可共114个文件SHA-256完全一致。

离线生成命令见 [数据契约](../docs/rental-data.md)。所有输入哈希、字节数、来源许可和OSM缺几何审计继续随本批 `sources.json` 下载。

## 最终验收

| 检查 | 最终结果 |
| --- | --- |
| 完整 `npm run check` | **通过**：lint、typecheck、22文件／362单元测试、Vite构建、静态预渲染、315项Chromium浏览器测试；无跳过、失败或重试掩盖 |
| `/opt/anaconda3/bin/python3 -m unittest discover -s tests/data -v` | **63项通过**，涵盖重定向拒绝、下载失败保旧、identity回滚、审核来源异常拒绝、旧Times数据、输入锁与下载完整性 |
| WebKit定向检查 | **30项通过**：15家官方详情的直达、刷新、来源／官网／合同规则隔离，以及五语言在320／390／1280宽度的目录筛选、分页和布局 |
| 生成产物 | 59下载项字节数／SHA-256均匹配；同输入重复生成114文件完全一致；旧ID与别名均能解析 |
| 独立只读审查 | 未发现P1；发现1项P2（JSON导入缺少类型属性），已修复并通过完整复验；未发现其他需修改缺陷 |
| 截图复核 | 已查看Chromium新增Toyota Poplar详情及WebKit中文窄屏目录，无横向溢出或内容覆盖；截图中的灰色底图是离线测试瓦片 |

检查原始证据：[完整检查](evidence/data-quality-20261001/check-final.log)、[数据检查](evidence/data-quality-20261001/data-tests-final.log)、[WebKit](evidence/data-quality-20261001/webkit-final.log)、[结构化验收记录](evidence/data-quality-20261001/verification.json)。审查原文见[独立审查](evidence/data-quality-20261001/independent-review.md)，其当时尚未通过的结论已由上述修复后结果关闭；不改写历史审查意见。

实施阶段的受限运行曾因本地IPC／监听权限报EPERM，未启动浏览器。随后在允许本地预览的环境执行完整检查，又暴露JSON导入缺少类型属性；补充 `with { type: "json" }` 后重新执行全套检查成功。早期新来源回归测试亦先出现预期失败，随后修复。上述早期失败均不冒充已通过。

构建保留已有主包超过500kB的提示，不影响本轮构建成功；本轮没有额外扩大性能优化范围。浏览器验证使用离线外部请求拦截，不代表实时底图、母语真人、实体手机、现场入口或生产环境已验收。

## 数据更新复查与交付边界

官方参考价索引和已知工作簿于本轮实际探测中仍返回HTTP403；保留141条既有都道府县参考价以及原调查、发布和取得日期。Geofabrik索引及校验和能访问，但没有重新下载日本全量PBF。GitHub历史运行只读核对，没有触发新远端任务。详见[数据更新可靠性复查](data-quality-maintenance-20261001.md)及[探测证据](data-quality-probes-20261001.json)。

本轮修复严格下载入口及最终发布失败的identity恢复；不尝试绕过403，不用省级参考价替代单站即时价格。未完成的6条机场候选继续保持原状态，见[逐项原因](rental-airport-review-20261001.md)。

本次测试截图保存在独立日期目录；既有测试助手覆盖的历史截图已恢复原字节，其本轮输出另存临时证据。主项目目录、冻结00–10规格、燃油站点与参考价数据、品牌素材、分析和noindex均未修改。

TASKS已同步当前结果。gogo.gs已收到付费许可方案，但尚未签约、未接入；私有PDF没有复制进仓库。本批未涉及车型推荐、实时油价、路线引擎、新定位权限或新数据服务。代码、数据和报告现位于fuel-find工作区，**本轮未commit、push或部署**。
