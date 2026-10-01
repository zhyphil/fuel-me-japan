# ads.txt复核与实际用户验证准备

日期：2026-10-01。用户要求确认截图的ads.txt并继续建议的下一阶段。本轮完成公开文件核对、10位游客试用材料、三地区数据缺口工具与基线、现有官方资料复查和维护说明。**未执行真实游客招募／测试，未完成500人需求实验。**

## ads.txt已经正确上线

源文件 `public/ads.txt` 与 [正式地址](https://fuel-me-japan.com/ads.txt)逐字一致：

```text
google.com, pub-8063428584007009, DIRECT, f08c47fec0942fa0
```

18:41:58 UTC正式HTTP检查：普通Mozilla、Googlebot与Mediapartners-Google标识均200，纯文本UTF-8、59字节、无BOM；HTTP正常跳转HTTPS。SHA-256为`167521f9f95b76e7071d6e244f4db5e56f41539a20ae6a38dc16e1e7041f5e9b`，robots200并允许ads.txt。文件正确，因此本轮没有重复添加或改写。

18:43 UTC实际AdSense后台仍显示审核中和ads.txt未识别，后台显示更新时间2026-10-01 16:16 CEST；所有权验证、审核提交已完成，当前没有重新检查按钮。模拟爬虫标识不能证明真实Google已读取。官方说明识别可能需数天，低请求量站点可能更久；本轮没有证据证明具体原因是缓存、审核或广告暂停，也不承诺完成时间。[Google说明](https://support.google.com/adsense/answer/12171244?hl=en)

未重复提交审核、改账户配置或解除广告暂停。真实同意窗口的完整操作与审核批准仍待完成。

## 下一阶段可执行材料

- [中文试用操作计划](../docs/user-validation.md)：首批计划10位真实外国游客、三地区、尽量覆盖五语言，四个任务与独立完成／提示后完成／失败／未测标准。自己的手机反馈不计入游客样本。
- [英文参与者材料](../docs/user-validation-participant.en.md)：未发送的招募稿与任务单；不要求个人位置、真实驾驶、支付、合同或账号。没有代发招募消息、捏造参与者或已完成结果。
- [CSV表头模板](../docs/user-validation-results.csv)：只有字段，实际结果保存在私人目录，公开只写匿名汇总。
- [维护手册](../docs/data-maintenance.md)：候选审核、14天诊断保留期、失败保旧、资料核对与正常发布顺序。没有新建后台、监测或定时提醒。

现有分析仍no-op，不能报告实际用户量、留存或转化。原始500人及25%／15%实验规则保留；10人主持人陪同试用只能帮助发现使用障碍。

## 数据基线及实际来源复查

新增 `npm run data:quality`，离线读取110份现有资料，验证字节数、SHA-256及现有严格解析契约；拒绝写入生产目录。相同输入和统计日期两次输出逐字相同。另用独立读取原始分区的计数核对三地区记录、地址、时间及普通汽油未知数，结果一致。

| 地区 | 当前加油站记录 | 地址已录 | 营业时间已录 | 普通汽油未知 |
| --- | ---: | ---: | ---: | ---: |
| 北海道 | 1,148 | 373 | 313 | 1,148 |
| 冲绳 | 295 | 123 | 15 | 295 |
| 九州七县 | 1,387 | 95 | 45 | 1,387 |

这些是快照字段计数，不是实际供应率、实时营业或全国覆盖率。全国16,454站、7,383租车记录、19家官方有限事实、0条单站报价保持不变；141条都道府县参考价仍保留调查2026-09-28和公布2026-09-30。

复查新千岁、那霸、福冈8家现有官方设施，已录地址与所查官方资料相符；记录提前返店要求、季节时段、休业例外及专用MAPCODE的整合待办。[官方复查表](airport-facts-recheck-20261001.md)不直接写入生产字段、不更新原核对日期，车辆入口继续未核实。

每家取最近3个普通汽油候选，去重17个样本；这是复核抽样，UNKNOWN仍保留，NO排除，10公里是直线距离。详见[缺口说明](../docs/data-quality.md)与[完整JSON](evidence/validation-foundation-20261001/data-quality.json)。

本轮读取真实远端运行36864186412诊断：官方参考价索引在DISCOVERY阶段返回403，旧manifest和registry前后哈希相同、指针保留。没有触发新下载或宣称自动更新成功；最近成功OSM运行仍为上轮36762528314。

README、租车数据契约和核心数据流程已更新当前状态，纠正仍写三家Times／18家设施／等待gogo答复／尚未运行的旧说明；原始00–10和历史报告未改。

## 本轮检查与限制

- lint、typecheck、23个测试文件的369单元、静态构建／五语言预渲染及397 Chromium全部通过。新增6项离线工具测试保护UNKNOWN统计、区域边界、候选筛选、未审核设施排除、校验和与目录边界。
- 根代理复核最终差异、确定性输出、当前资料版本、链接、CSV表头、未改变生产数据和运行资源。未新增测试依赖或分析传输。
- 编排按COMPLEX、每阶段最多4个专家步骤处理。AO的validate与plan通过，尝试的只读UX工作者因Codex CLI退出1未产出结果；实际完成0个专家步骤。没有变更模型、修改权限或伪称独立专家审查通过。本轮有效验收来自实际工具检查与根代理复核。
- 未完成真实游客、母语安全审查、其余真机操作、车辆入口实测、Google同意窗口、AdSense最终识别／批准及实际收录统计。gogo付费方向继续暂缓。

本轮完整检查的运行资源与正式域名11项主页面、脚本／样式、数据入口及抓取文件逐字一致、全部HTTP200；运行代码、生产数据、冻结规格、广告暂停、定位权限与收录范围均无差异。完整检查自动重写的60张历史截图已逐项恢复到干净起点，历史证据未改。CLI另有4项错误输入检查通过；50个本地文档链接存在，CSV只有表头。

本轮按持续约定提交并推送离线工具、材料与证据；线上应用仍为77c7e19／生产7669b265，不重复部署相同运行资源。首次提交后另在TASKS记录实际推送哈希，不用文档提交冒充新的应用部署。

## 证据

- [公开HTTP结果](evidence/validation-foundation-20261001/ads-http.json)
- [AdSense脱敏状态](evidence/validation-foundation-20261001/ads-status.json)与[本站行截图](evidence/validation-foundation-20261001/ads-status.jpg)
- [现有远端诊断](evidence/validation-foundation-20261001/refresh-diagnostic.json)
- [完整检查日志](evidence/validation-foundation-20261001/check.txt)
- [离线数据基线](evidence/validation-foundation-20261001/data-quality.json)
- [正式域名运行资源比对](evidence/validation-foundation-20261001/production-check.json)
- [最终范围与检查数量](evidence/validation-foundation-20261001/scope-check.json)、[文档检查](evidence/validation-foundation-20261001/doc-check.json)及[CLI错误输入](evidence/validation-foundation-20261001/cli-check.json)
