# 独立还车业务浏览器测试迁移交接

日期：2026-09-30。当前状态：**测试实现就绪，浏览器验收尚未执行**。遵守本节点补充指令，未启动浏览器／监听端口，未运行完整 `npm run check`，未提交、推送或部署。全国数据使用 `rental-v1-8f12d997103769bc`（7,387 条）。

## 本次修改

- `tests/e2e/return-car.spec.ts`：原 23 项全部迁移到独立目录／详情页面，保留选油、UNKNOWN／NO、来源日期、加油完成前不得返店、不同目的地、取消与迟到请求、候选小地图、失败、滚动、尺寸和首页状态保护；新增 4 项，共 27 项。modal 的关闭／焦点陷阱断言改为站内返回／导航焦点断言；旧三店及坐标假设改为当前全国数据。
- `tests/e2e/rental-directory.spec.ts`：49 项；五语言 × 320／390／1280px，组合检索、重置、分页、总地图、缩略图坐标反算、44px、7 机场直达刷新、metadata、别名／非法路径、语言切换、焦点滚动恢复、鼠标／键盘／触摸、柜台与公司规则、59 下载项、取消和失败重试。
- `tests/e2e/rental-fixtures.ts`：全国原文件按原字节离线提供，真实加载器继续执行 SHA-256、字节数、来源和分区契约校验。只有加油站测试夹具重新生成相匹配的 manifest。哈希回归将末尾换行换成制表符，JSON 和字节数完全相同，必须因哈希不符拒绝。
- **没有修改生产源码、数据、冻结规格或其他 e2e 文件。** 新截图按 Playwright project 分目录存储，避免 Chromium／WebKit 互相覆盖。

## 已实际执行

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test -- tests/unit/rental.test.ts tests/unit/rental-routes.test.ts tests/unit/return-car.test.ts tests/unit/station-mini-map.test.ts tests/unit/opening-hours.test.ts` | 5 文件、124 项通过，0 失败 |
| `playwright test tests/e2e/return-car.spec.ts tests/e2e/rental-directory.spec.ts --list` | 76 项发现成功，执行 0 项 |
| `playwright test --config /tmp/fmj-rental-browser-webkit.config.ts --list` | 85 项发现成功，执行 0 项 |
| `npm run test:e2e -- --list` | 18 文件、257 项发现成功，执行 0 项 |
| `git diff --check` | PASS |
| 浏览器／完整 `npm run check` | NOT_RUN，由父级执行 |

首次发现检查曾因测试直接导入 i18n 的 JSON 触发 Node 24 import attribute 错误。已保存失败日志，修复测试导入并重新发现通过；没有修改应用 JSON 导入方式。日志及机器可读记录在 [本轮证据](evidence/rental-expansion/browser/prepared.json)。

## 父级执行入口

使用 Node 24：`PATH=/Users/haoyuzuo/.nvm/versions/node/v24.18.0/bin:$PATH`。先在父级获准环境构建，避免旧 dist；4174 用户预览不得停止。

```sh
npm run build
PLAYWRIGHT_JSON_OUTPUT_NAME=reports/evidence/rental-expansion/browser/chromium-results.json npx playwright test tests/e2e/return-car.spec.ts tests/e2e/rental-directory.spec.ts --workers=2 --reporter=list,json --output=reports/evidence/rental-expansion/browser/chromium-artifacts
npx playwright test --config /tmp/fmj-rental-browser-webkit.config.ts
npm run check
```

默认 Chromium 使用 4173；临时 WebKit 配置使用 4175。WebKit iPhone 不运行合成 wheel，桌面项目单独覆盖 wheel、1280px、悬停和键盘聚合。配置原文保存为 `evidence/rental-expansion/browser/webkit-config.txt`。完整 check 后将实际日志和 `test-results/results.json` 复制到本轮证据目录，不沿用旧 248／204／23 数量。

## 待实测风险及历史证据保护

以下不是本叶子的浏览器失败结论，严格断言仍保留：当前 `.rental-map-point` 源码为 38px；返回链接、部分目录控件缺少 44px 最小高度；390px 的候选地图受新 110px 样式覆盖旧上下布局；编辑名称后更改地区时 `update` 读取已提交 query，可能留下可见草稿与 URL 不一致。父级应先记录实际失败，再作必要最小修复；未将这些检查跳过或放宽。

工作期间观察到最初干净的 4 张 M0.1 小地图历史截图被并行检查覆盖。已将观察到的新字节保存在 `browser/home-regression-observed/` 后恢复 HEAD 历史版本，记录见 `historical-evidence-restored.json`。本叶子没有运行产生这些截图的浏览器命令，不把它们当作本叶子通过证据；父级之后若再次运行旧截图测试，仍需恢复历史覆盖。

没有实体设备或真人母语审核；离线灰色瓦片仅测试加载与交互，不证明真实 OSM 服务可用。

## 父级最终实测补充（2026-09-30）

以上表格是测试叶子交接时的历史状态；随后父级在获准的工作区实际运行了浏览器与原始构建命令，结果如下。

| 检查 | 最终结果 |
| --- | --- |
| 原始 `npm run check` | PASS：lint、typecheck、21 文件 302 单元测试、构建、257 Chromium 浏览器测试；0 失败、0 跳过 |
| 独立还车 Chromium 专项 | 76/76 PASS；包含在最终 257 项中，不重复计入总数 |
| 完整 WebKit 专项 | 85/85 PASS，0 失败、0 跳过；iPhone 模拟 + 桌面项目 |
| 数据 Python 测试 | 40/40 PASS，另见数据阶段日志 |
| 重复生成 | 同一输入及 identity 生成的 manifest、identity、全部下载文件逐字节一致 |
| 本地实际界面 | 已核对真实 OSM 底图、目录、机场检索、详情及 320px 无横向溢出；不代表实体 iPhone 验收 |

实测发现并修复：地图点/链接/柜台开关不足44px、390px候选地图宽度退化、编辑名称后切地区丢失可见查询、`OKA` 误命中其他地名，以及 WebKit 点击链接不自动获得焦点导致返回列表丢失焦点。没有跳过失败用例或放宽这些验收要求。

非法 UTF-8 路径的原测试错误地假定会进入应用；实际 Vite preview 先返回404，因此改为验证404且无业务界面。普通未知ID、编码斜线和多级非法路径仍检查应用的可访问错误界面。

失败与修复日志保留于 `evidence/rental-expansion/browser/`：最终 `final-check.txt`、`chromium-full-final.json`、`webkit-final.txt`、`webkit-full-final.json` 为当前结论依据。本轮截图写入新证据目录，11张被旧测试覆盖的历史 M0.1 PNG已逐一保存新副本并恢复HEAD，记录为 `historical-evidence-restored-final.json`。

独立审查与交付结论见 [完整完成报告](rental-expansion.md)。

## 独立审查修复后的最终验收

上述302／257／85／40是审查前实际结果。审查发现同页跳转主内容失效与键盘展开聚合丢失焦点，新增3条跨首页／目录／详情的回归并加强聚合焦点断言，修复前4项均失败。共享汽车分类与发布数据先出现2项失败。

最终原始 `npm run check` 退出0：**302单元、260 Chromium**通过；完整WebKit **91项**通过；数据 **41项**通过，均无失败或跳过。WebKit桌面项目新增覆盖跳转链接，因此比上轮增加6项（移动3、桌面3）。当前最终日志／JSON已更新；审查前的原始证据保留在 `evidence/rental-expansion/review/before-fixes-*`。详见 [审查处理记录](rental-review-resolution.md)。
