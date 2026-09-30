> 🖥️ **Frontend Developer** | 步骤 1/1 | 68.2s

---

发现 **2 项本次应修复的 P2 问题**：

1. **从列表打开详情后，选中站点被裁在地图左上角。**  
   [FuelMap.tsx:159](</Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/src/components/FuelMap.tsx:159>)、[FuelMap.tsx:190](</Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/src/components/FuelMap.tsx:190>)：列表隐藏地图后，定位可能仍使用零尺寸；随后 `invalidateSize({ pan: false })` 不恢复中心。现有 `map-detail-390-offline-tiles.png` 和 `map-detail-1280-offline-tiles.png` 均显示选中标记被左上边界裁切。应在地图恢复可见、尺寸更新后定位选中站点，并验证标记完整可见。

2. **关闭详情时，焦点可能回到滚动区域外的站点卡片。**  
   [FindFuel.tsx:151](</Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/src/components/FindFuel.tsx:151>)：普通列表重新挂载后滚动归零；成员列表返回时也会被第 36 行重置滚动，但恢复焦点使用 `preventScroll: true`。打开靠后的卡片再关闭详情，会留下不可见的键盘焦点。应恢复原滚动位置，或让目标卡片滚入面板可视范围。现有测试只断言 `toBeFocused()`，未验证目标可见。

第二轮日志已完整结束：lint、typecheck、构建通过，73 项单元测试、46 项浏览器测试通过。与 baseline 对比，71 个规格及数据文件未变。底图测试均为离线拦截，不能证明真实服务可靠性。本次未写文件、运行检查或启动浏览器。

## 主代理处置

两项 P2 已复现并修复：更新地图可见尺寸后居中所选站点；恢复卡片焦点时允许滚入可视区域。新增标记完整位于地图内及成员卡片在视窗内的断言，修复前两项实际失败，修复后通过。另处理福冈和佐贺相同汇总锚点的地区选择，以及小屏聚合放大不前进的问题。最终完整检查：73 项单元测试、47 项浏览器测试、lint/typecheck/build 全部通过。主代理亲自读取最终差异及截图；未再次启动完整独立审查。
