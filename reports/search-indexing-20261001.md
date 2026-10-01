# 20个主页面开放搜索收录 — 2026-10-01

用户已明确回复“允许”，授权五语言的找加油站首页、还车目录、加油指引和About开放Google收录。本轮解除这些页面的限制；此前报告中的待确认状态和自动审批拒绝已有新的明确授权，未绕过审批。

## 实现范围

- 现有预渲染流程输出20个主页面的`index, follow`；根地址作为英文首页别名，canonical统一指向`/en/`，不重复加入sitemap。原始应用回退模板继续noindex。
- 客户端路由同步索引策略；主页面的末尾斜线、语言替换和canonical与静态HTML一致。查询参数页、门店详情和错误页保持客户端noindex，不加入sitemap。
- 通用robots规则只允许20个主页面的规范路径、无末尾斜线别名、根别名及必要JS／CSS／图片／本地数据资源。用`$`限定页面路径，详情和筛选参数网址继续不获准抓取。保留现有AdSense审核爬虫规则。
- 门店详情同时通过Cloudflare的`X-Robots-Tag`保留noindex，包括有／无末尾斜线；数据文件及两个层级的pages.dev部署别名也禁止收录。
- Sitemap仍为20个正式HTTPS规范网址，不虚构`lastmod`；没有新增站点数据、即时油价、广告脚本、分析或产品功能。

## 检查结果

| 项目 | 状态 |
| --- | --- |
| lint、typecheck、静态构建 | PASS |
| 单元测试 | PASS，363项 |
| 完整Chromium测试 | PASS，342项；无失败、重试或跳过 |
| 新规则与规范网址定向检查 | 旧代码4项失败，修复后4项通过，最终纳入完整套件 |
| 本地Cloudflare Pages配置 | PASS，35项HTTP检查；20个主页面与根别名、XML、robots、10种详情路径、数据和ads.txt |
| 本地pages.dev响应头 | PASS，主项目与版本域名都返回noindex |
| 历史报告截图 | 已恢复原始版本，未将本轮画面覆盖历史证据 |
| 正式部署与线上核对 | PENDING |
| GSC读取／实际收录 | PENDING／NOT_VERIFIED |

证据目录：`reports/evidence/search-indexing-20261001/`。代码验收通过并不等于Google已经抓取或收录；发布后使用Google实际报告核对，不以模拟User-Agent替代Google证据。

## 范围说明

参数网址在普通静态响应中复用主页面HTML；客户端会将其设为noindex，robots精确路径许可不会放行查询网址，canonical仍指向无参数主页面。详情页额外具有服务器响应头noindex。未知网址沿用原客户端错误界面与禁止抓取，不新增后台或改变路由架构。

没有修改原00–10冻结规格，也不把所有全国候选门店批量提交搜索。Google是否收录及处理时间由其决定。

依据：[Google noindex规则](https://developers.google.com/search/docs/crawling-indexing/block-indexing)、[规范网址说明](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[Cloudflare响应头及部署别名限制](https://developers.cloudflare.com/pages/configuration/headers/)。
