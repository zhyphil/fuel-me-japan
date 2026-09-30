# 页头导航与独立加油指引页完成报告

日期：2026-10-01。状态：本地实现与验证完成，供用户审核；尚未提交、推送或部署。

## 页面调整

- 所有页面共用“搜索加油站／还车加油／加油指引”三个页头入口，标示当前页面；还车门店详情归属“还车加油”。语言选择仍在页头，切换语言后保留当前业务页面。
- “我的用油”移至找站页面的标题右侧，与“日本概览”同属页面内操作。手动下拉选择、浏览器本地记忆、多油种显示和地图联动保持原有行为。还车页面和指引页不显示这一入口。
- “加油指引”改为独立的 `/语言/refuel-guide/` 信息页。五种语言都有完整静态 HTML，可直接访问、刷新，关闭 JavaScript 也可阅读。保留已有五步说明、日文油种／机器标识、加错油提示、资料核对日期和四个来源链接；不再显示地图偏好面板。
- 从指引返回找站页时，已有地图实例、地区、列表视图、搜索词与油种选择仍保留。手机布局按空间换行，三个业务入口保持可见；可点击区域至少 44×44 像素。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 通过 |
| lint / typecheck | 通过 |
| 单元测试 | 22 个文件、325 项通过 |
| 静态构建与预渲染 | 通过，增加五语言完整指引页 |
| Chromium 全部浏览器回归 | 279 项通过 |
| WebKit 定向补测 | 18 项通过，包含手机视口与桌面配置 |
| 320 / 1280 像素五语言指引与导航 | 无横向溢出；入口尺寸、内容和返回行为通过 |
| 本地实际页面 | 已查看门店详情页导航、独立指引页和首页内的“我的用油”位置 |

新导航的单元回归先在原实现得到 10 项预期失败，再完成实现并通过。浏览器检查覆盖独立地址与刷新、同页语言切换、浏览器前进后退、正确标题与 canonical/hreflang、地图状态与偏好保留，以及无需 JavaScript 的静态内容。独立打开指引页不请求地图配置、站点／租车数据或定位；分析仍为 no-op。

未新增依赖、后端、数据来源或安全指导事实。既有安全正文与来源登记未变，资料核对日期没有改写为本轮日期。`noindex` 保持原样。自动化使用现有离线网络拦截；WebKit 是浏览器测试，不等于实体 iPhone 验收，本轮未进行生产验证。

## 证据和预览

- [完整检查日志](evidence/site-navigation/check.txt)与[Chromium 结果](evidence/site-navigation/chromium-results.json)
- [WebKit 日志](evidence/site-navigation/webkit.txt)与[结果](evidence/site-navigation/webkit-results.json)
- [中文验证记录](evidence/site-navigation/verification.json)
- [实际指引页截图](evidence/site-navigation/guide-desktop.png)
- [手机完整指引页](evidence/site-navigation/chromium/guide-320.png)与[桌面完整指引页](evidence/site-navigation/chromium/guide-1280.png)
- [本地找站首页](http://127.0.0.1:4174/zh-Hans/)
- [本地独立加油指引](http://127.0.0.1:4174/zh-Hans/refuel-guide/)

此前报告引用的历史截图已恢复，本轮证据单独保存。工作区沿用 `/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan`，保留此前未提交的全国租车业务与分页改动。
