# Sitemap代码及Google读取复核（2026-10-01）

## 结论

现有代码与线上配置正确。用户截图中的“Impossible de récupérer le sitemap”表示Google上次未能获取文件，不等于文件不存在。本轮Google实时测试已经允许抓取并成功读取，重新提交一次后，GSC显示绿色“Opération effectuée”，已发现20个页面。

## 代码与线上验证

- `scripts/prerender.tsx:103`收集实际预渲染页面，`:145`生成`dist/sitemap.xml`；`package.json`的build会运行该流程，部署使用dist。
- 清单包含5种语言的首页、还车目录、加油指引、About，共20个唯一正式HTTPS规范网址。未把查询参数、候选详情或重复根地址扩大纳入。
- `public/robots.txt:59`明确允许`/sitemap.xml`，`:62`声明完整Sitemap地址；20个页面各自有精确Allow规则。通用`Disallow: /`不会覆盖更具体的Allow规则，这是[Google的规则优先级](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec#order-of-precedence-for-rules)。
- 本轮26项线上HTTP核对通过：三种User-Agent各读取robots与sitemap，共6项；另检查20个页面。XML返回200、`application/xml`、1380字节，无跳转或noindex响应头。三种请求内容一致，XML及robots与当前构建逐字节一致。
- 20个页面全部200、canonical等于清单URL、`index, follow`，无服务器noindex，HTML与当前构建一致。模拟Googlebot／InspectionTool请求仅作为HTTP差异检查，不冒充真实Google抓取。
- 现有`sitemap.spec.ts`覆盖XML、页面规范地址、语言关系、抓取范围与索引边界；代码未改动，上一轮同一应用版本的完整385项浏览器检查已经包含它。本次不为只读核验重复构建或新增测试设施。

## Google实际结果

最初点击截图对应记录，详情仍显示通用HTTP错误、发现0页。随后使用[Google官方建议的实时网址检查流程](https://support.google.com/webmasters/answer/7451001?hl=en#debugging)验证同一XML地址：

- 界面记录时间：`1 oct. 2026, 16:40:19`。
- 爬虫：Google智能手机检查工具。
- 允许抓取：`Oui`。
- 页面获取：`Réussie`。
- 重新提交一次现有sitemap后，Google受理并更新列表：类型`Sitemap`，状态`Opération effectuée`，发现页面`20`，读取日期`1 oct. 2026`。

此前的robots拦截未在本轮实时测试中出现。旧robots缓存是否是早期失败原因没有直接证据，不推定根因；以本轮Google成功抓取和清单读取结果结束此项排查。未请求将XML本身编入搜索，也未改变Cloudflare安全配置。

**20个页面已被清单识别，不等于20页已进入搜索结果。** Google后续抓取和收录另行处理，参见[Google Sitemap报告说明](https://support.google.com/webmasters/answer/7451001?hl=en)。

证据位于`reports/evidence/gsc-sitemap-recheck-20261001/`。本轮仅归档中文报告和状态，不改网站运行代码、不重复部署、不新增后台监控。生产仍为已验收的`38dc6770`部署（应用`d9813bd`）。
