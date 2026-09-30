# 语言下拉菜单完成报告

日期：2026-10-01。状态：本地实现与验证完成，未提交、推送或部署。

右上角语言入口已简化为地球图标与下拉箭头，展开显示 English、繁體中文、한국어、简体中文、ไทย，当前语言带勾选标记。手机宽度下，品牌与语言入口同排，业务导航位于下一排。

保留既有语言链接与页面路径，包括租车详情 ID 和查询参数；加油站油种偏好及信息页语言切换已有回归检查。菜单支持键盘 Tab、Enter、Esc，以及点击外部关闭和焦点移出收起。使用原生折叠元素及链接，无 JavaScript 时仍可展开并切换语言。没有新增依赖、定位请求或分析服务。

| 最终检查 | 结果 |
| --- | --- |
| `npm run check` | PASS，退出码 0 |
| lint / typecheck / build | PASS |
| 单元测试 | 22 个文件、330 项通过 |
| Chromium 浏览器检查 | 293 项通过，0 失败、0 跳过、0 不稳定 |
| WebKit 定向检查 | 9 项通过，0 失败、0 跳过、0 不稳定 |
| 320px / 1280px 菜单 | 点击区域、菜单可见性、焦点、关闭与边界检查通过 |

首轮 WebKit 补测发现两类问题：无 JavaScript 测试缺少端口环境参数而访问了未启动的 4173；语言链接在默认键盘设置下被 Tab 跳过。前者通过传入现有预览端口修正，后者通过语言链接显式 `tabIndex={0}` 修正；原失败用例随后全部通过。初次日志与结果保留，未将环境问题归为网站缺陷。

已在本机浏览器目视确认桌面与窄屏菜单。WebKit 属于自动化补测，不代表实体手机测试。历史报告截图已按本轮前备份恢复并逐文件核对，新截图单独归档。

- [本地预览](http://127.0.0.1:4174/zh-Hans/)
- [完整检查日志](evidence/language-dropdown/check.txt)、[Chromium 结果](evidence/language-dropdown/chromium-results.json)
- [WebKit 最终日志](evidence/language-dropdown/webkit.txt)、[结果](evidence/language-dropdown/webkit-results.json)、[配置](evidence/language-dropdown/webkit-config.txt)
- [WebKit 初次日志](evidence/language-dropdown/webkit-initial.txt)、[初次结果](evidence/language-dropdown/webkit-initial-results.json)
- [桌面展开截图](evidence/language-dropdown/preview-desktop-open.png)、[收起截图](evidence/language-dropdown/preview-desktop-closed.png)、[窄屏截图](evidence/language-dropdown/preview-compact.png)
