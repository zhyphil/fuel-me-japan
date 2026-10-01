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
| 正式部署与线上核对 | PASS，36项；含实际生产与部署版本域名 |
| GSC重新提交 | ACCEPTED；Google已受理提交 |
| GSC读取／实际收录 | FAILED／NOT_VERIFIED；读取失败、发现0页 |

证据目录：`reports/evidence/search-indexing-20261001/`。代码验收通过并不等于Google已经抓取或收录；发布后使用Google实际报告核对，不以模拟User-Agent替代Google证据。

## 范围说明

参数网址在普通静态响应中复用主页面HTML；客户端会将其设为noindex，robots精确路径许可不会放行查询网址，canonical仍指向无参数主页面。详情页额外具有服务器响应头noindex。未知网址沿用原客户端错误界面与禁止抓取，不新增后台或改变路由架构。

没有修改原00–10冻结规格，也不把所有全国候选门店批量提交搜索。Google是否收录及处理时间由其决定。

依据：[Google noindex规则](https://developers.google.com/search/docs/crawling-indexing/block-indexing)、[规范网址说明](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[Cloudflare响应头及部署别名限制](https://developers.cloudflare.com/pages/configuration/headers/)。

## 发布证据

应用提交`cdb71777d6e51ba2ac735bf8a05af001c4c1b38a`已推送main及当前开发分支。Cloudflare生产部署`2cad1d21-69f0-4c5b-96a4-3d6c8fbdff00`已完成；[正式网站](https://fuel-me-japan.com/zh-Hans/)、[sitemap](https://fuel-me-japan.com/sitemap.xml)。12:51 UTC线上核对36项通过，20个网页和XML与已测试构建的哈希一致；生产网页没有禁止收录响应头，实际版本域名仍有noindex。

## Google实际检查与剩余事项

部署后已在原GSC资源重新提交一次sitemap，出现“Sitemap envoyé”受理提示。提交列表仍显示“Impossible de récupérer le sitemap”、发现0页；14:56:25（巴黎时间，12:56:25 UTC）的Google智能手机实时网址检查仍报告“Bloquée par le fichier robots.txt”。14:57:27对中文首页的独立实时测试得到相同的robots阻止结果。没有请求将XML文件本身加入搜索索引。

当前生产robots与构建文件哈希一致，已经允许sitemap和20个主页面；Google的robots报告目前显示没有文件记录，也没有可用的重新抓取入口。Google可能尚未更新缓存规则，但本次无法取得其使用的具体文件，**缓存仅为可能原因，未证实**。不会为消除后台红色状态扩大到全站抓取，也不把普通HTTP访问或模拟User-Agent算作Google抓取成功。

网站配置、代码检查和发布已完成；GSC读取未通过、实际收录未验证。下一次应在Google更新抓取状态后检查读取结果与发现页数；若仍失败，再结合其robots报告中的抓取时间和内容继续定位。此轮不重复提交、不启动定时任务。

依据：[Google Sitemap报告说明](https://support.google.com/webmasters/answer/7451001?hl=en)、[robots缓存规则](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)。

截图证据：[Sitemap提交状态](evidence/search-indexing-20261001/gsc-sitemap-status.png)、[Sitemap实时测试](evidence/search-indexing-20261001/gsc-sitemap-live.png)、[中文首页实时测试](evidence/search-indexing-20261001/gsc-homepage-live.png)。
