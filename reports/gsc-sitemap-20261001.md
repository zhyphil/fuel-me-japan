# GSC Sitemap 接入 — 2026-10-01

本轮为正式站点生成、发布并提交 `https://fuel-me-japan.com/sitemap.xml`。Sitemap 覆盖五语言的首页、还车目录、加油指引和 About，共20个规范URL；重复根地址、筛选参数、仅客户端加载的门店详情及非页面数据文件不在本次清单中。

## 实现

- 由现有预渲染流程按实际页面生成XML，使用正式HTTPS域名，去重并稳定排序；不手写另一套页面列表，不伪造 `lastmod`。
- 五语言关系继续通过已有HTML `hreflang` 表达，含双向关系及 `x-default`；20个列出的URL与静态HTML canonical一致。
- `robots.txt` 增加 `Sitemap` 地址，仅额外允许读取 `/sitemap.xml`；已上线的ads.txt与AdSense专用审核规则保留。
- 页面 `noindex, nofollow`、通用爬虫 `Disallow: /` 和运行时 canonical 均未修改。开放收录的提议因现有授权边界被自动审批拒绝；已经向用户请求具体确认，该部分不执行。

## 验收

| 项目 | 结果 |
| --- | --- |
| lint、typecheck、构建 | PASS |
| 单元测试 | PASS，363项 |
| Chromium完整测试 | PASS，340项（新增2项sitemap检查） |
| XML结构、20个规范URL、静态页面及语言映射 | PASS |
| 历史截图 | 已恢复原版本，未覆写 |
| 与上次部署的运行资源对比 | 338文件不变；仅robots、构建时间变化，新增sitemap |
| 正式域名HTTP及文件核对 | PASS，24项请求；XML、20个页面、robots及ads.txt均与构建产物一致 |
| GSC Sitemap提交 | ACCEPTED，已显示“已发送sitemap” |
| GSC读取及发现页面 | FAILED，通用HTTP错误；发现0页；真实Google实时检查显示robots拦截 |
| 页面可收录／实际收录 | PENDING_USER_DECISION／NOT_VERIFIED |

证据目录：`reports/evidence/gsc-sitemap-20261001/`。

## 当前限制

Sitemap文件可提交，不表示其中网页已获准抓取或收录。现有页面同时保留noindex与禁止抓取；需用户确认解除指定主页面限制，才可完成搜索公开阶段。即使解除，Google也不保证立即收录。根地址运行时canonical与`/en/`的归一化提议亦未执行；本次清单只列`/en/`，不重复列根地址。

不新增数据或页面，不改定位、分析、广告脚本、CSP或冻结规格。后续页面和门店详情若要进入sitemap，须先满足独立内容、规范网址和可收录条件。

依据：[Google Sitemap制作与提交](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[多语言页面标注](https://developers.google.com/search/docs/specialty/international/localized-versions)、[noindex说明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)。

## 发布与Google端实际状态

- 应用提交：`5697d9602802266b9187a092f3b114c70379991a`，已推送`main`和当前开发分支。
- 生产部署：`2732a9cd-eef4-42da-8f22-86a8891f4183`，环境Production、分支main；[Cloudflare部署](https://2732a9cd.fuel-me-japan.pages.dev)、[正式sitemap](https://fuel-me-japan.com/sitemap.xml)。
- 2026-10-01 12:19 UTC，正式域名24项HTTP验证通过。模拟Googlebot请求返回200只能证明该请求成功，不能代替真实Google抓取。
- GSC已受理提交，随后显示“无法获取sitemap／通用HTTP错误”，发现0页。12:21 UTC，Google实时检查明确显示`Bloquée par le fichier robots.txt`。
- 当前公开robots文件已经允许`/sitemap.xml`，其内容与构建一致。旧规则缓存是可能原因，但尚无Google缓存内容证据，因此不把它记录为已确认根因。
- GSC设置页显示属性在当天新增，robots报告无数据、入口禁用；未能请求robots重新抓取，不记录为已发起刷新。网站端配置已发布，Google端读取验收仍未通过。
- Google通常缓存robots至多24小时；如缓存未能刷新可能更久。Google会在sitemap抓取失败后继续尝试数日。依据：[robots缓存说明](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)、[Sitemaps报告及错误诊断](https://support.google.com/webmasters/answer/7451001?hl=en)、[robots报告及刷新入口](https://support.google.com/webmasters/answer/6062598?hl=en)。

后续需在Google更新抓取规则后核对sitemap读取状态；若仍失败，再查看robots实际版本或Cloudflare抓取日志。另需用户明确授权这20个主页面开放收录后，才可调整页面noindex与相应抓取规则并重新验收。没有建立定时监控，也没有把外部待处理状态标为PASS。
