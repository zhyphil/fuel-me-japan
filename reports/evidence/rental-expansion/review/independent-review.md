> 🔎 **独立审查工程师** | 步骤 1/1 | 232.2s

---

发现 **3 项 P2，未发现有证据的 P1**。

1. 🟡 **P2：明确带共享汽车来源的记录仍可进入还车流程。**  
   [rental.py:163](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/scripts/importer/rental.py:163) 只检查名称中的共享汽车关键词及 Times 的两个共享域名，遗漏了当前数据中的 `carshare.earth-car.com`。例如 JP-29 的 `rental-overture-036e397c-6db7-47dd-887f-b41364227105`，原始网址明确为 `/carshare/vehicle-detail/431000058`，仍被输出为 `CANDIDATE`；JP-13 另有同类记录。搜索“アースカー 生駒谷田町ステーション”即可进入详情，而 [rental.ts:266](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/src/lib/rental.ts:266) 仅排除柜台，因此这些记录也能启动加油及返店流程。建议补充明确共享汽车来源的分类规则，保留排除审计并重新生成数据。

2. 🟡 **P2：“跳到主要内容”链接被新路由拦截后失效。**  
   [App.tsx:27](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/src/App.tsx:27) 将当前页面的 `#main` 链接也纳入 `preventDefault()`，随后使用 `pushState`；[App.tsx:46](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/src/App.tsx:46) 又在存在 hash 时直接返回。浏览器的原生锚点滚动、焦点转移因此都未执行。复现条件：进入 `/en/` 或还车页面，按 Tab 聚焦跳转链接，再按 Enter。建议放行同页锚点，或显式执行目标滚动和聚焦；这是原首页的键盘功能回归。

3. 🟡 **P2：键盘展开地图聚合后丢失焦点。**  
   [RentalMap.tsx:51](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/src/components/RentalMap.tsx:51) 创建的聚合按钮没有稳定 ID；按 Enter 后调用 `fitBounds`，触发重绘中的 `layer.clearLayers()`，移除当前获得焦点的按钮。第 57 行的恢复逻辑只覆盖有 ID 的单店标记，也没有把焦点移入新展开的成员面板。全国地图中键盘展开聚合即可触发。建议展开后聚焦成员面板，或实现聚合按钮的稳定焦点恢复。现有聚合测试只检查成员出现，没有检查展开后的焦点。

本次仅阅读代码、数据、差异、截图和已有日志，没有运行测试、构建或写文件。独立核对结果：证据记录的 **247 个文件哈希全部匹配当前文件**；59 个下载项的大小和 SHA-256 全部匹配。既有日志记录为 302 单元、40 数据、257 Chromium、85 WebKit 通过，不能替代上述遗漏路径的验证。

实现保留了来源属性、许可、候选与官方设施区分、Times 规则边界及加油完成确认。可继续本地人工审核，但应修正上述 P2 后再记录独立审查通过。剩余可接受限制包括候选库非穷尽、仅七机场各一家 Times、入口均未实测，以及实体手机、母语审核和 Cloudflare 线上深层路径尚未验证。