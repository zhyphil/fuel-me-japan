# 独立还车业务 UI 实现交接

日期：2026-09-30。仅在 `fuel-find` 工作区完成本地实现；未提交、推送或部署。原有加油候选小地图及全国数据文件保留，冻结规格、导入器和既有浏览器测试未修改。

## 已实现

- 首页“还车加油”改为真实链接；业务代码按需加载，首页不请求全国租车数据。首页地图及筛选组件在同页跳转时保留挂载。
- 五语言目录 `/{locale}/return-car/` 与详情 `/{locale}/return-car/{stable-id}/`；支持别名替换、未知 ID 提示、语言切换保留 ID／查询、浏览器前进后退。目录查询使用 `region/company/q/page/counters`，滚动与焦点只放在当前浏览历史中，不写精确位置。
- 地区／公司／名称组合筛选、20 条分页、柜台显式开关、整体地图及逐店缩略图。地图复用单个实例，使用缓存网格聚合及视窗筛选；悬停和键盘焦点延迟 180ms 预览，切换或离开清理计时器。聚合成员按 20 条增量显示。
- `MapThumbnail` 提供中性坐标预览；`StationMiniMap` 保留旧燃油站按钮／静态预览 DOM 和 ARIA 包装。租车采用独立通用 SVG；缩略图仅在可见时加载瓦片。业务内共享一份严格检查的 OSM provider 状态及可见署名。
- 详情按地区请求并验签；保留原文名称／地址、电话、来源日期、核对状态及 HTTPS 网站。未经核对的网站称为“已记录网站”。7 个机场说明完成五语言键，明确参考点与未经实测的车辆入口，KIX 2F 不作车辆入口，NGO 提供已核对机场指引。
- 复用选油、10km 内最多 10 站、NO 排除／UNKNOWN 保留、营业时间本地化及候选小地图。必须先选站，再主动确认加完油才进入返店步骤；更换油种或门店取消旧请求并清空步骤。柜台不提供该流程；未核对候选还需确认预约地址。Times 规则仅显示于已核对的 Times 设施，其他记录提示核对合同。
- 来源折叠区提供 OSM／Overture 署名、ODbL、全部原许可证及 Foursquare NOTICE，列出 manifest 的全部 59 个下载项。
- 构建校验全国 manifest、索引、48 分区和全部下载文件的字节数／SHA-256，并验证分区计数与数据契约。`build-provenance.json` 记录 7,390 条、32 柜台及 7 个机场设施，不再使用旧三家统计。
- 仅生成五语言首页和目录壳，加英文根页共 11 个 HTML；Cloudflare 局部 `_redirects` 回退目录壳。详情／未知路由使用 `createRoot`，避免把回退 HTML 当作详情 hydration。客户端更新当前路径的标题、描述、canonical 和 hreflang；noindex 保留。Vite 使用现有 SPA HTML fallback，已核对本地 Vite 实现，尚未实际浏览器验证。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| 相关 5 个单元测试文件 | PASS，101 项；含新路由／查询／文本转义／柜台禁用／缩略图兼容测试 |
| Vite 构建 + `node --import tsx scripts/prerender.tsx` | PASS；全国文件校验及 11 个静态壳生成完成 |
| `git diff --check` | PASS |
| 原 `npm run build` 命令 | BLOCKED：Vite 成功，`tsx` CLI 创建 IPC 管道遭 `EPERM`；上述等价 Node 导入方式已完成预渲染 |
| Vite preview / 浏览器 smoke | BLOCKED：本地端口监听遭 `EPERM`；独立尝试 Playwright Chromium 也未能启动。未运行页面交互测试 |
| 完整 `npm run check`、全套 e2e、实体设备／母语审核 | NOT_RUN；属于后续阶段 |

日志与校验记录见 `reports/evidence/rental-expansion/ui/`。本报告不将代码审阅或构建成功等同于浏览器验收。

## 下一阶段入口

- 核心组件：`RentalBusiness`、`RentalDirectory`、`RentalDetail`、`RentalMap`、`RentalSources`、区块化 `ReturnCar`；路径与 URL 状态在 `src/lib/routes.ts`、`rental-view.ts`。
- 稳定选择器：`#return-car-link`、`[data-testid=rental-directory]`、`#rental-region`、`#rental-company`、`#rental-query`、`.rental-counters`、`.rental-card[data-rental-id]`、`[data-testid=rental-map]`、`[data-testid=rental-detail]`、`#return-fuel`、`.return-candidates`、`.return-navigation`、`.rental-confirm`。
- `tests/e2e/return-car.spec.ts` 原 modal、`#return-location`、三门店数据和旧坐标假设尚未迁移，文件原有 dirty 改动完整保留，不能直接按原断言宣称通过。
- 浏览器阶段重点：五语言直接刷新／别名／无效 ID 与 metadata、主页不下载租车索引、目录返回焦点滚动和首页筛选保持、移动宽度与地图缩略图可见加载、键盘标记／聚合、快速悬停取消、分区失败／重试／旧请求取消、加油前后两步目的地坐标、候选地址确认、柜台禁用及公司规则隔离。全部外部瓦片与导航须拦截为离线夹具。

## 集成验收补充（2026-09-30）

上文 7,390 条是 UI 叶子开始时的初版统计。官方源记录追加人工对照后，去重后的最终版本为 `rental-v1-8f12d997103769bc`，实际构建记录 **7,387 条、32 个柜台、7 个官方核对设施**。

浏览器测试已完成独立页面迁移；父级获准环境执行原始 `npm run check` 成功（302 单元、257 Chromium），完整 WebKit 专项 85 项通过。因此上文叶子环境 IPC／端口限制已由父级实际验证补足，不是当前交付阻塞。细节和真实失败修复记录见 [浏览器验收补充](rental-browser-verification.md) 与 [完整完成报告](rental-expansion.md)。

## 独立审查收尾

最终版本 `rental-v1-1b43cbc1f43d95a5` 为7,385条，排除了2条明确共享汽车来源。根代理修复同页锚点及聚合键盘焦点；最终302单元、260 Chromium、91 WebKit及41数据测试通过。此前交接表保留当时证据，当前结论见 [完整完成报告](rental-expansion.md)。
