# Fuel Me Japan — implementation boundaries

Read every file in `Fuel-Me-Japan-M0-Handoff-Package/00–10` (actual filenames are numbered 00 through 10) before changing scope. `10-CLAUDE-CODEX-HANDOFF.md` defines the handoff requirements.

Current authorization: **The user has now requested completion of all remaining tasks in TASKS.md: manual-only M0.2 cleanup, mobile/browser verification, existing data-refresh reliability, M0.3 refuelling guidance and M0.4 return-car refuelling. Finish checks, Chinese reports, commit/push and deployment to the existing production project. Stop adding features after M0.4. Vehicle-based recommendations and manufacturer data enquiries remain deferred.** No UHR game-engine rules apply here.

2026-09-30 用户已授权 M0.1 首页改为找站地图：替换旧 hero 和四卡，保留五语言、地区选择、显式定位、列表与完整站点详情。全国概览只读取 manifest 及 registry；拖图只浏览已加载数据，不自动下载邻省。底图独立配置为 OSM 标准瓦片，披露外部浏览区域请求，保留可见署名；不预取、不离线缓存。此次调整不修改原 00–10 规格，不授权 M0.2、部署或新 POI 数据。

- Static React + TypeScript + Vite; no backend/database, accounts, AI, payment, internal routing, live-price scraping.
- Exactly en, zh-Hant, ko, zh-Hans, th. All visible UI copy uses locale keys. Preserve Japanese safety labels in later authorized screens.
- UNKNOWN must not become fabricated facts. Source-registry candidates are not approved production datasets.
- 按用户审核意见，M0.1 不提供通用外部地图搜索入口，加载失败和无结果提示只引导站内重试或调整查询。
- 已记录营业时间按当前界面语言展示；无法可靠解释的规则完整保留原文并说明，不丢弃例外，不推断实时营业状态。
- M0.1 geolocation is allowed only after explicit user action. No precise-location persistence or analytics coordinates. Analytics defaults to no-op.
- Keep supplied specs unchanged. Do not publish local ZIPs, credentials, build caches or node_modules.
- Run `npm run check` (lint, typecheck, unit tests, static build, browser tests). Record M0.1 output and limitations in `reports/M0.1-*`; preserve historical M0.0 evidence.
- Deployment acceptance requires a verified Cloudflare production URL. A missing login is a blocker, not PASS.

## 本轮发布授权

2026-09-30 用户对“推送 GitHub，并发布到 fuel-me-japan.com”明确回复“好”。本轮允许提交、推送当前已验收的完整地图版本并部署既有 Cloudflare Pages 生产项目；该后续授权覆盖上文地图改版时尚未授权部署的历史边界。保留现有数据和 noindex，不新增功能、数据源或定位权限。

## 本轮列表模式本地实现授权

2026-09-30 用户在已审地图版本后授权 M0.1 增加“最便宜 / 最近 / 收藏”列表模式及当前浏览器本地收藏。收藏只持久化带版本的 OSM 站点 ID 与分区代码，显式进入收藏后按需加载分区；生产站点报价仍为空，价格排序仅用测试夹具验证。本轮仅本地实现及离线检查，不提交、推送、部署或进行线上服务测试；不修改冻结规格、生产数据、导入器、品牌素材、底图服务及 noindex，不扩展 M0.2+。

## 本轮列表小地图本地实现授权

2026-09-30 用户要求在列表视图同时显示对应小地图。复用同一地图实例和筛选/收藏结果：桌面左右并排，手机地图置于列表上方；支持站点及聚合详情返回原列表，保留显式定位、署名与既有缩放交互。仅本地实现、构建和验证，沿用上一轮不提交、不推送、不部署的边界，不改冻结规格及生产数据。

## 本轮逐站小地图本地实现授权

2026-09-30 用户补充：除总地图外，列表中每个站点也要有各自的小地图，参考 restareasoceania.com 的逐条地图布局。仅为既有加油站记录增加可点击缩略图；点击打开该站点总地图与详情，返回恢复原列表焦点。沿用已批准 OSM 瓦片配置，仅加载进入可见区域的缩略图，不创建多份交互地图、不新增休息站数据或定位权限。保留五语言、品牌水滴、价格未知不显示以及现有排序和筛选。仍仅本地实现与验证，不提交、推送、部署或进入 M0.2+。

## 本轮列表悬停联动本地实现授权

2026-09-30 用户要求鼠标移动到列表站点时，总地图放大显示对应坐标。增加短暂停留后定位及列表／单站标记突出显示，点击仍打开详情；键盘焦点提供同等预览，触摸滚动不触发悬停。快速移动只保留最后目标，切换数据、视图或聚合成员时清理旧预览。保留既有总地图、逐站小地图、排序和筛选；仍仅本地实现与验证，不提交、推送、部署或扩展数据范围。

## 报告语言

- 面向用户的所有报告统一使用简体中文，包括完成报告、数据报告、审查报告和配置报告，以及 JSON 报告中的说明文字。
- 文件名、代码标识、命令、URL、哈希和机器可读状态枚举保持原样；原始工具日志、API 返回字段和截图保留原文。
- 翻译历史报告时保留当时的日期、验收结果、测试数量与限制，不将后续进展写成历史事实。

## 本轮多油种本地实现授权

2026-09-30 用户要求“显示油种”可同时选择三种燃油中的任意一种、两种或全部三种。同步展示所选有效报价，未知仍不显示；不同油种独立比价，“最便宜”明确选择一个已选油种作为排序依据。兼容旧本地单油种偏好，不增加定位或数据请求。沿用仅本地实现与验证、不提交、不推送、不部署的边界。

## 最新发布与后续执行授权

2026-09-30 用户明确表示“我验证好了，发布到github上，部署上线，然后接着做接下来该做的”。本轮允许提交、推送及部署已审核的 M0.1 列表排序与收藏、总地图与逐站小地图、悬停联动、多油种选择及文字点击崩溃修复，覆盖上文各轮仅本地实现的历史边界。生产验证及中文报告完成后，按 00–10 规格继续 M0.2 My Fuel；保持地图首页，不恢复旧四卡。显示油种偏好不得作为车辆核验结果。来源权利不清时停止对应接入；未完成安全文案审查的新增车辆用油内容不提升到生产。M0.2 验收完成前不进入 M0.3。

## 最新手动油种发布授权

2026-09-30 用户审核“我的用油”手动下拉菜单后明确要求“很好，代码commit，push，部署上线”。允许提交、推送当前已审核的 M0.2 界面、独立核验基础和手动显示油种设置，发布到既有 Cloudflare Pages 生产项目并验证。此授权覆盖此前该界面仅本地的限制；真实车型映射保持为空，来源与安全文案登记维持原审核状态，不宣称车型服务已完成验收，不进入 M0.3。

## 最新范围调整：我的用油仅手动选择

2026-09-30 用户明确：“目前只需要通过用户自己手动选择就行，现在还有什么任务要继续做的”。此要求覆盖原 M0.2 的车型自动核验目标及上方历史计划：当前只需要普通汽油／高辛烷值汽油／柴油的手动下拉选择、本地记忆、地图默认显示联动；地图仍允许多选。用户选择不代表车型核验结果。

- 车型数据库、按配置或年款判断用油、丰田等厂家的车型资料与相关授权咨询暂缓，不再作为当前手动功能的阻塞项。
- 下一项建议为清理现有车型核验界面、无数据提示、运行时请求及不再需要的依赖，再按手动功能重新验收。当前代码尚未完成该清理，不能仅因改了范围就记录为完成。
- 保留日文油种识别标签和简短的现场核对提示；不扩展车型推荐。
- 原 00–10 规格和历史报告保持原样，当前范围以本条及 TASKS.md 为准。此前的来源待审、车型核验人工审核报告作为暂缓功能的历史记录，不继续推动其对外咨询。
- 本轮只更新范围与待办，不表示已执行清理、重新发布或开始 M0.3／M0.4。后续开发仍保持地图首页、五语言、UNKNOWN、定位隐私等既有要求。

## 当前执行授权：完成剩余任务

2026-09-30 用户明确要求“把该做的任务都做完”，授权按 TASKS.md 完成手动选油收尾、浏览器与移动布局验收、现有数据更新核验、M0.3 加油指引及 M0.4 还车前加油，并按已约定流程提交、推送和部署。此条覆盖上方历史阶段的暂不进入下一阶段或仅更新待办限制。保留地图首页、五语言、隐私、noindex、分析 no-op 和未知数据边界；不研究车型、不接入未经许可的即时油价。真实设备或外部许可缺失应如实记录，不冒充验收通过。完成 M0.4 后停止新增功能。

## 本轮执行已完成

2026-09-30：M0.2手动选油收尾、M0.3指引、有限M0.4还车流程及浏览器修复已提交、推送和部署。应用1ba391f，生产b79cc5d7；中文证据见reports/M0.4-release.md。现有数据更新的失败保留与诊断核验完成，官方价HTTP403仍属外部阻塞。实体手机与母语真人审核未执行。当前停止新增功能；不要自动推进车型资料、即时油价接入、放开noindex或开启分析。后续以用户新的具体要求为准。
