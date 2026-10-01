# GSC Sitemap 接入 — 2026-10-01

本轮为正式站点生成并准备提交 `https://fuel-me-japan.com/sitemap.xml`。Sitemap 覆盖五语言的首页、还车目录、加油指引和 About，共20个规范URL；重复根地址、筛选参数、仅客户端加载的门店详情及非页面数据文件不在本次清单中。

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
| 正式域名HTTP及文件核对 | PENDING，部署后记录 |
| GSC Sitemap提交 | PENDING，部署后操作 |
| 页面可收录／实际收录 | PENDING_USER_DECISION／NOT_VERIFIED |

证据目录：`reports/evidence/gsc-sitemap-20261001/`。

## 当前限制

Sitemap文件可提交，不表示其中网页已获准抓取或收录。现有页面同时保留noindex与禁止抓取；需用户确认解除指定主页面限制，才可完成搜索公开阶段。即使解除，Google也不保证立即收录。根地址运行时canonical与`/en/`的归一化提议亦未执行；本次清单只列`/en/`，不重复列根地址。

不新增数据或页面，不改定位、分析、广告脚本、CSP或冻结规格。后续页面和门店详情若要进入sitemap，须先满足独立内容、规范网址和可收录条件。

依据：[Google Sitemap制作与提交](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[多语言页面标注](https://developers.google.com/search/docs/specialty/international/localized-versions)、[noindex说明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)。
