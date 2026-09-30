# Fuel Me Japan — implementation boundaries

Read every file in `Fuel-Me-Japan-M0-Handoff-Package/00–10` (actual filenames are numbered 00 through 10) before changing scope. `10-CLAUDE-CODEX-HANDOFF.md` defines the handoff requirements.

Current authorization: **M0.1 Find Fuel and the user-approved publication of the current reviewed map version to GitHub and fuel-me-japan.com. Stop after publication verification and its report; do not begin M0.2+.** No UHR game-engine rules apply here.

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

## 报告语言

- 面向用户的所有报告统一使用简体中文，包括完成报告、数据报告、审查报告和配置报告，以及 JSON 报告中的说明文字。
- 文件名、代码标识、命令、URL、哈希和机器可读状态枚举保持原样；原始工具日志、API 返回字段和截图保留原文。
- 翻译历史报告时保留当时的日期、验收结果、测试数量与限制，不将后续进展写成历史事实。
