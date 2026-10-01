# AdSense 脚本验证（2026-10-01）

## 修改与边界

按用户提供的代码，在根页面与五语言各业务页面的静态 `<head>` 中加入且只加入一次发布者 `ca-pub-8063428584007009` 的异步 AdSense 脚本，保留 `crossorigin="anonymous"`。公共模板也覆盖客户端详情路径。

- Google 官方要求脚本位于页面 head，参见[安装说明](https://support.google.com/adsense/answer/9274516?hl=en)。
- 先同步执行本地初始化，再加载 Google 异步脚本；广告请求维持 `pauseAdRequests = 1`。这是 Google 提供的[暂停广告请求方式](https://support.google.com/adsense/answer/9042142?hl=en)，不会把本次验证当作用户同意或正式投放。
- CSP 仅在 script-src 增加 `https://pagead2.googlesyndication.com`，其余限制保留；robots 仅补充允许读取新增初始化脚本，既有搜索收录范围不变。
- 五语言 About 新增 Google 网络请求、可能读取已有 Cookie、暂停广告请求的说明与 Google 隐私链接。未完成的审核／CMP不记录为通过。
- 不新增广告位，不开启统计、定位、价格采集或其他业务功能。

## 验证

| 检查 | 结果 |
| --- | --- |
| lint、typecheck、静态构建 | PASS |
| 单元测试 | 363 / 363 PASS |
| 全部 Chromium 回归 | 378 / 378 PASS |
| WebKit 广告脚本专项 | 7 / 7 PASS |
| 最终 robots 微调后的构建及 AdSense／sitemap 复验 | 11 / 11 PASS |
| 根页面与20份预渲染页面的 head、发布者ID、async、crossorigin | PASS |
| 五语言脚本只加载一次、暂停先于Google脚本执行、CSP放行 | PASS |
| 广告被浏览器拦截时仍可用地图、语言及导航 | PASS |
| 本地生产CSP下真实Google启动及后续脚本 | HTTP 200，未发现脚本加载错误 |

浏览器自动回归拦截第三方广告请求，使用明确夹具，不会自动访问或点击真实广告。另用用户浏览器验证真实 Google 文件加载，证据单独记录。WebKit 为桌面测试引擎，不代表实体手机验收。

先确认缺少脚本的基线测试失败，再完成实现。专项测试中曾因隐去的首页与About同时保留h1导致定位器歧义，已改为按可见语义标题检查；最终完整检查通过。完整检查后仅补充robots对本地初始化脚本的读取许可，并重新构建和运行相关11项检查。

证据位于 `reports/evidence/adsense-script-20261001/`，历史测试截图已恢复，未改写旧报告。

## 发布及Google后台

已完成 Conventional Commit `82adcfd`（`feat(adsense): add publisher script for site verification`），原子快进推送GitHub的main与当前分支。

- Cloudflare生产：`5e28e685-d333-4a3d-bc16-b7b7ba58d969`，main，来源提交`82adcfd`。
- 正式网站：[Fuel Me Japan](https://fuel-me-japan.com/zh-Hans/)。
- 33项正式域名页面、初始化脚本、应用资源、ads.txt、robots和sitemap的HTTP／SHA-256核对通过，匹配已验收构建。21份HTML均含正确发布者代码、初始化顺序及CSP。
- 正式浏览器实际取得Google启动与后续执行脚本（HTTP200）；页面隐私说明正确。Google尝试额外加载的`fundingchoicesmessages.google.com`组件仍被CSP限制，证据已单独记录。本轮是暂停广告的站点验证，尚未完成CMP／正式投放配置，未为额外组件扩大权限，也不声称完整广告运行已通过。
- 点击后台代码验证后显示 **Votre site est validé（网站已验证）**。
- 随后提交审核，刷新后台后仍显示 **En préparation／Examen demandé（准备中／已请求审核）**，两个步骤显示绿色勾选；本次请求于2026-10-01 16:16 CEST记录。
- **Google内容审核尚未通过，广告请求仍暂停**。后台ads.txt状态仍为`Introuvable`（未找到），虽然线上文件HTTP200且内容匹配；不将网站代码验证成功写成ads.txt后台识别成功，不推测其原因。

后台成功截图与结构化结果已保存。报告补充提交后同步推送，不为纯文档更新重复部署。

本轮发布前实际刷新AdSense后台，显示“需要审核”（Examen requis）及代码验证入口。此前缓存页及历史报告中的审核中状态不能作为当前状态，本报告以后续实际验证结果为准。安装脚本不等于网站审核通过；Google的[站点验证流程](https://support.google.com/adsense/answer/7584263?hl=en)及[用户同意平台要求](https://support.google.com/adsense/answer/13554116?hl=en)仍分别适用。
