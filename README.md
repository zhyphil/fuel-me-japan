# Fuel Me Japan

面向赴日自驾游客的多语言加油站地图。正式网站：[fuel-me-japan.com](https://fuel-me-japan.com/zh-Hans/)。

本轮已完成并发布手动选油收尾、加油指引和还车前加油。应用提交 `1ba391f`，生产部署 `b79cc5d7`；完整检查和正式域名20项资源比对通过，见 [中文发布报告](reports/M0.4-release.md)。最新任务状态见 [TASKS.md](TASKS.md)，原始 00–10 规格保持不变。车型识别和厂家资料咨询已暂缓。

## 当前功能

- 地图与列表、品牌水滴、显式定位、已有数据支持的筛选、最便宜／最近／收藏、逐站小地图、悬停联动和油种多选。
- “我的用油”只提供普通汽油／高辛烷值汽油／柴油的手动下拉选择，在当前浏览器保存并联动地图；地图多选时不擅自猜测单一偏好。无法使用本地存储时，当前页面仍可操作。
- “加油指引”提供五个短步骤、七个日文识别标签和安全提示。手动选择只是显示设置，不代表核验车辆用油；实际以租车文件和油箱盖为准。
- “还车加油”目前只收录 Times 那霸、新千岁和福冈机场国际线三家门店，显示门店 10 公里内最多 10 个加油候选。选站后先导航至站点，明确点击“已完成加油”后再显示返店导航。本次油种选择不会修改地图偏好。

界面提供 en、zh-Hant、ko、zh-Hans、th 五种语言，保留日文油种及现场标签。

## 本地运行与检查

使用 `.nvmrc` 指定的 Node 24 和锁定依赖：

```sh
npm ci
npx playwright install chromium
npm run dev
npm run check
```

`check` 依次运行 lint、TypeScript、单元测试、静态构建和 Chromium 浏览器测试。测试使用拦截的外部导航、模拟定位及合成底图；不会读取开发者真实位置。额外的 WebKit／Android 模拟和 macOS Safari 实测应按报告的实际范围理解，不等同于实体手机测试。

独立数据检查：`npm run test:data`。Python 环境和数据更新命令见 [数据流程说明](docs/data-pipeline.md)。

## 架构、来源与隐私

React + TypeScript + Vite 静态网站，五语言各有静态目录，根路径为英文后备页。无后台、数据库、账号、支付或站内路线引擎。

- 地图复用 Leaflet 实例。选择都道府县加载相应分区；拖图只浏览已加载数据，不自动下载邻省。
- 显式点击定位才请求权限；精确位置不持久化、不进入分析事件。分析默认 no-op。
- 导航链接只传送选定目的地，路线和定位权限由用户选择的外部地图处理。没有通用外部地图搜索入口。
- OSM 标准瓦片独立配置在 `public/runtime-map-provider.json`；瓦片服务会收到浏览区域及普通网络信息。无预取和离线瓦片缓存，保留可见署名。
- `public/data/manifest.json` 和来源登记记录版本、校验和、采集时间及来源时间。站点信息缺失保持 UNKNOWN；已记录营业时间按界面语言显示，不推断实时营业状态。
- 官方都道府县价格为注明调查／发布日期的参考价，不能替代单站报价。当前没有站点即时报价；gogo.gs 咨询等待外部答复，不运行抓取。
- `public/field-guides/refuel-sources.json` 独立记录消防庁资料整理、翻译和 JAF 事实交叉核对范围。
- `public/data/rental/locations.json` 是三条有限门店记录及出处，不是租车公司整库授权。两个 OSM 参考点遵循 ODbL 并提供署名和下载；规则仅适用于 Times，个人合同优先，资料满 90 天提示重新核对。
- 构建校验核心数据、指引及门店来源并写入 `dist/build-provenance.json`。其中 `milestone: M0.1` 标识核心站点导入数据阶段，新增模块另有独立版本。

保留 `noindex`，没有启用坐标分析。自动化检查和 AI 来源核对不能作为母语真人安全审查或实体手机验收。

## 数据维护与部署

既有 GitHub 更新任务只生成待审候选，不推送或部署；任务失败也保留诊断。已完成一次真实 OSM 远端运行，候选与现有 51 个核心文件相同。官方参考价自动获取仍返回 HTTP 403，保留旧数据和真实日期，不能称为更新成功。具体运行记录见 [维护报告](reports/data-maintenance-completion.md)。

使用现有 Cloudflare Pages 和项目 Wrangler 配置。部署需要任务授权和检查证据，不由数据工作流自动执行：

```sh
npx wrangler login
npm run deploy
```

凭据、原始 PBF／表格、依赖和构建缓存不进入 Git。

## 完成报告

- [手动选油收尾](reports/M0.2-manual-only-completion.md)
- [M0.3 加油指引](reports/M0.3-completion.md)
- [M0.4 还车前加油](reports/M0.4-completion.md)
- [浏览器和移动布局验收](reports/mobile-browser-acceptance.md)
- 历史发布：[M0.2 手动设置](reports/M0.2-release.md)、[M0.1 地图增强](reports/M0.1-enhancements-release.md)、[M0.0 域名配置](reports/M0.0-domain-configuration.md)。这些报告保留当时的版本、检查数量和限制。

M0.4 完成后停止新增功能，交回实际用户使用验证。
