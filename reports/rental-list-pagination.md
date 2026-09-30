# 门店列表限高与分页完成报告

日期：2026-10-01（Europe/Paris）。分支：`codex/m0-2-my-fuel`；基线提交：`9c8151de6a2bb56372eb3698efecbdba986e8b85`。

本地实现及验证完成，预览已更新。本次工作基于独立还车业务的现有未提交实现，没有提交、推送或部署。

## 界面变化

- 右侧列表按照视口高度设置显示区域，上限700px，超出内容在列表内部滚动。桌面下与左侧地图总高度对齐，手机下地图与列表上下排列。
- 缩小卡片内边距和小地图，地区与地址合并展示，状态与“查看门店”在同一行；保留完整门店名称、地址与地图署名。较长文字自然换行。
- 分页区域固定在列表下方，不随卡片滚动。可选每页10／25／50／100条，默认25条，并显示当前页／总页数及上一页、下一页。
- 每页条数记录在页面地址中，刷新和查询筛选后保留；改变条数回到第一页。翻页重置列表内部滚动，保留网页滚动位置；进入详情再返回时恢复原页、筛选、焦点和列表滚动位置。
- 沿用总地图与卡片悬停／键盘聚焦联动。五种界面语言均补齐“每页条数”。

本机内置浏览器1280×720实测：每页25条和100条时，列表可滚动区域均为428px，网页总高度均为1166px，不随条数增加而变长。当前桌面示例卡片约139px高。

## 验证结果

| 检查 | 本次实际结果 |
| --- | --- |
| `npm run check` | PASS，退出0 |
| lint／typecheck | PASS |
| 单元测试 | 21个文件，314／314通过 |
| 静态构建与内置数据完整性校验 | PASS |
| 完整 Chromium 浏览器回归 | 264／264通过，0跳过、0失败、0重试通过 |
| WebKit 定向回归 | 7个场景各运行2遍，14／14通过，0跳过、0失败、0重试通过 |
| 差异空白检查 | PASS |

新增回归覆盖默认25条、四种条数、非法参数回退、刷新／筛选保留、末页边界、超过500页的可达性、320／390／1280px限高与横向溢出、翻页滚动及详情返回位置。实现前分页相关单元测试出现14项预期失败，修复后通过。

WebKit回归曾发现延后的列表复位覆盖刚发生的滚动；已改为页面绘制前恢复列表位置，定向重复验证和最终完整检查均通过。

原始证据：[完整检查日志](evidence/rental-expansion/pagination/check.txt)、[Chromium结果](evidence/rental-expansion/pagination/chromium.json)、[WebKit日志](evidence/rental-expansion/pagination/webkit.txt)、[WebKit结果](evidence/rental-expansion/pagination/webkit.json)、[布局实测](evidence/rental-expansion/pagination/layout-measurements.json)、[检查汇总与源码哈希](evidence/rental-expansion/pagination/verification.json)。

## 预览与边界

[本地还车目录](http://127.0.0.1:4174/zh-Hans/return-car/)；[桌面实际底图截图](evidence/rental-expansion/pagination/desktop.png)；[320px布局截图](evidence/rental-expansion/pagination/directory-zh-Hans-320.png)。

自动化浏览器拦截外部底图请求，小屏截图仅作为布局证据。WebKit为引擎模拟，不代表实体手机测试。本轮没有修改或重新导入门店数据，也没有重跑数据Python测试；此前数据及机场核对结论仍以原报告为准。历史验收报告及截图保留。

## 2026-10-01 后续复核：直接输入页码

按用户反馈，将当前页码改为可输入框：输入页码后按回车或点击“跳转”即可直达指定页，同时保留上一页／下一页。每页条数、地区、公司及搜索条件保持原值；刷新及浏览器返回时页码输入与结果同步。

超过总页数时跳到最后一页，0或负整数回到第一页，空白、非数字与小数恢复当前页；只有一页或无结果时禁用跳转。五语言已补齐，手机显示数字键盘并采用分行布局，输入与按钮点击区域至少44px。

本机实际预览已从第一页直接跳到第295页，显示最后3家门店。新增3个浏览器回归在实现前因缺少输入框失败；首次实现验证还发现英文按钮点击区域不足44px，修复后最终完整检查通过：lint、typecheck、build、314项单元测试和267项Chromium浏览器测试；WebKit桌面／手机配置另有6项定向回归通过，均无跳过或重试通过。未重跑数据Python测试；未更新门店数据或进行发布。

[最新检查汇总](evidence/rental-expansion/page-jump/verification.json) · [完整检查日志](evidence/rental-expansion/page-jump/check.txt) · [WebKit日志](evidence/rental-expansion/page-jump/webkit.txt) · [第295页实际截图](evidence/rental-expansion/page-jump/last-page.png)。前文测试数量保留为上一轮结果，本节为页码输入改动后的最新验收。
