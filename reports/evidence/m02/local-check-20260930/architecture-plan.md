> 🏛️ **Software Architect** | 步骤 1/1 | 120.2s

---

建议采用**独立车辆数据校验模块 + 首页紧凑入口 + 原生对话框**。可以先完成本地功能与安全 UNKNOWN，但没有真实、获准使用的车辆映射及安全文案审核，不能宣布 M0.2 验收完成。

已读完 `AGENTS.md`、全部 00–10 规格及相关代码。基线为 `codex/m0-2-my-fuel` / `4fc858c`，工作区干净；Node `24.18.0`、npm `11.16.0`、`node_modules` 存在。本轮未修改文件，未运行构建、测试或线上检查。

**架构决策与范围**

| 方案 | 收益 | 代价／判断 |
|---|---|---|
| 扩展 M0.1 数据登记与 manifest | 复用现有加载路径 | 耦合站点与车辆批准规则，需要改动受保护数据；不采用 |
| 独立车辆 artifact、registry 和校验入口 | 审查范围清楚；车辆失败不影响找站 | 增加小型校验与加载模块；推荐 |

依据：现有 [source-registry.ts](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/src/lib/source-registry.ts:28) 明确限定 M0.1 来源；[FindFuel.tsx](/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel%20Me%20Japan/src/components/FindFuel.tsx:31) 独立管理价格显示偏好。两者均无需修改。

允许修改限定为：

- `src/App.tsx`：增加入口，保持 `FindFuel` 挂载；新增 `src/components/MyFuel.tsx`。
- 新增 `src/lib/vehicle-fuel.ts`：数据类型、严格解析、精确匹配；`vehicle-sources.ts`：来源审批校验；`vehicle-data.ts`：同源静态加载。
- `src/styles.css`、现有五个 locale JSON；使用 `myFuel*` 键，避免占用已有多油种 `mf*`。
- 新增 `public/data/vehicles/` 下独立 manifest、registry、版本化 mappings；只加入已批准内容或明确的空集合。
- `scripts/prerender.tsx`：增加车辆数据构建门槛，并输出独立车辆 provenance；保留 M0.1 校验与 provenance 含义。
- 新增车辆单元／浏览器测试和测试夹具；适量扩展现有 analytics、i18n、foundation 测试；新增中文 `reports/M0.2-*`。

冻结规格、既有数据及 schemas、导入器、M0.1 registry 白名单、地图服务、品牌、noindex、依赖与锁文件不在允许修改范围。

**必须先固定的契约**

1. **精确核验。** 输入为可选 rentalCompany，加 make、model、variant、modelYear。VERIFIED 必须命中唯一、已复核且证据明确覆盖完整选择的记录。缺项、未知版本／年份、重复、重叠或冲突记录均返回 UNKNOWN；同油种重复也不能用“取第一条”消除歧义。不得模糊匹配型号、推算车型年款，或把登记年份当车型年份。
2. **公司作用域。** 未选择公司时，只接受明确获批、适用于该精确车辆的公司无关记录；不能自动采用某租车公司的映射。已选公司不能触发未经批准的跨公司回退。
3. **来源与安全门槛。** 每个启用来源必须记录 owner、准确 URL、purpose、terms/license、allowed-use assessment、attribution、refreshPolicy、reviewDate，以及 fetchedAt、transformationVersion 和具体证据定位。`sourceUpdatedAt` 无资料则明确 UNKNOWN，不编造。映射关联 sourceId、verifiedAt、车辆适用范围与证据版本；manifest 绑定 registry/mappings 的版本、字节数和 SHA-256。机器校验只检查完整性与一致性，不能代替真实权利审核。
4. **结果隔离。** 匹配器只接收车辆选择和已校验车辆数据，不接收价格偏好、站点油种、价格或定位。选择变化立即清除旧结果，并清理失效的下级选项；结果绑定当前选择及数据版本。取消、重试、关闭或迟到响应不得恢复旧 VERIFIED。
5. **安全界面。** 所有状态保留日文识别标签：`レギュラー`、`ハイオク`、`軽油`。UNKNOWN 时仅作中立对照，不突出推荐油种；引导核对租赁文件、油箱盖标识，仍不确定则联系租车公司。VERIFIED 展示精确适用车辆、来源和核验日期。五语言安全文案须有对应版本的人工审核记录。

**执行计划：每阶段不超过四步，推荐一名实施者，然后一名独立只读审查者。**

| 步骤 | 前驱与交付 | 验收 |
|---|---|---|
| 1. 数据契约及纯函数 | 实施者建立独立 parser、registry gate、resolver 和同源 loader；来源研究未完成时使用空生产映射 | 唯一精确获批匹配通过；其余路径失败关闭；畸形 artifact 整体不可用于核验 |
| 2. My Fuel 面板 | 接步骤 1；首页紧凑按钮打开原生 `<dialog>`，参考现有 `StationFilters` 的焦点管理 | 手机／桌面可操作；加载、失败、空数据均安全；关闭恢复焦点；地图与显示油种保持原状态 |
| 3. 构建门槛与验证 | 接步骤 1–2；接入独立构建校验，完成测试和中文报告 | 本地执行现有 `npm run check`；记录实际结果；fixtures 不进入 public、应用 bundle 或发布 artifact |
| 4. 独立只读审查 | 审查最终 diff、来源证据、安全文案与步骤 3 日志；根代理核对结果 | 不放宽白名单，无隐私或旧结果泄漏；阻塞项逐项保留，不以测试夹具替代真实数据验收 |

步骤 1–3 由获授权的 workspace-write 实施者执行；步骤 4 保持 read-only。本规划不包含提交、推送、部署或 M0.3。

**复用现有测试设施，重点保护以下行为：**

- Vitest：精确匹配正例；缺项、未知、跨年边界、公司作用域、重复／冲突、未审核、状态与油种矛盾、缺来源证明、无效日期／URL、版本／哈希不一致等负例。
- Playwright：复用 `tests/e2e/offline.ts`；五语言、320/390px 和桌面；键盘打开、Tab、Escape、关闭恢复焦点；日文标签可见；加载延迟、失败重试和选择变化无残留 VERIFIED。
- 隔离回归：切换价格油种不改变车辆结果；操作 My Fuel 不改变地图偏好、地区、列表或收藏；不申请定位，不新增个人车辆 localStorage/sessionStorage/cookie/URL 持久化。
- Analytics：复用现有 `my_fuel_start/success/unknown`，属性仍仅 `locale`；增加车辆字段与坐标被剔除的断言，保留 no-op 默认实现。
- 正例只使用测试夹具及离线路由拦截，不加入生产绕过开关。保留首页未打开面板时不请求车辆数据的现有网络边界。

**当前阻塞决策：**没有生产可用的 VERIFIED 来源；官方资料公开可读不等于允许整理再发布。权利或精确车型覆盖不清时，仅停止该来源接入，继续完成本地空数据／UNKNOWN 功能。真实获批映射、五语言安全文案审核、独立审查及完整检查均通过前，报告应明确“本地功能可验证，M0.2 数据／生产验收未完成”。