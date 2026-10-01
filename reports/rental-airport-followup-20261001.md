# 剩余机场门店补核完成报告

核对日期：2026-10-01。本轮按用户选择“补核剩余机场门店资料”继续处理上一批保留的6家。结论为：**6家均已复查，3家可纳入有限官方事实，3家继续保留疑点**。已核对门店合计从15家增至18家；当前为本地实现与验收版本，尚未提交、推送或部署。

## 本次纳入的三家

| 门店 | 匹配依据及本地结果 | 官方还车说明 |
| --- | --- | --- |
| Toyota 成田机场，`toyota-narita-airport` | OSM `n4457845665` 与 Overture `0a8f2512-0716-483d-8534-247665ccc295` 相距约6米。后者的取香530-13地址及0476-32-1020电话对应官方63601/035；OSM所记Hertz经营者也有同地址同电话的官方旁证。合并两个候选，保留原ID为别名。 | [门店页](https://rent.toyota.co.jp/shop/detail.aspx?rCode=63601&eCode=035)及[还车说明](https://rent.toyota.co.jp/shop/route/1_0020.html)：先还到门店，再按安排接驳；不能直接在航站楼还车。第三航站楼需从第二航站楼转机场巴士或连通步道。身份旁证：[Hertz NRTT50](https://www.hertz.com/us/en/location/japan/chiba/nrtt50)。 |
| Toyota 中部国际机场，`toyota-chubu-centrair-airport` | 在完整候选库找到OSM `n11197679909`，电话+81-569-38-0100对应官方0569-38-0100，位置距经营公司网页的设施参考点约2.4米。采用此点，未吸收约748米外的同名Overture记录。 | [中央门店页](https://rent.toyota.co.jp/shop/detail.aspx?rCode=64701&eCode=053)、[经营公司说明](https://trl-aichi.co.jp/rent/shops/detail/6c17253b533318bf01beb68da475153f8f5d312e.html)与[返还图PDF](https://trl-aichi.co.jp/rent/5883328c02c9cd16e4ae865e91c405184d76eb4d.pdf)：返还停车区在Access Plaza一楼门店旁，使用租车专用入口；区别于国际线出发柜台与TOYOTA SHARE停车位。[机场返还指引](https://www.centrair.jp/access/rental-car/return-route.html)作为补充。 |
| Toyota 福冈INTERNATIONAL，`toyota-fukuoka-airport-international` | OSM `n13357237818` 与已合并的Overture `619e2992-fa38-4d6c-a0f8-31cf9f93e4b9` 相距约4米。两者的官方68101/068编号、电话及分店信息相符，后者有東那珂2-22-3地址。保留该既有组。 | [官方门店页](https://rent.toyota.co.jp/shop/detail.aspx?rCode=68101&eCode=068)列明门店可办理还车及国际线免费接驳；航站楼一楼共同柜台用于接驳接待。还车仍需核对预约门店和当天指引。 |

三家都沿用对应OSM参考点，没有用网页图片或测地系换算值替换生产候选坐标。中部标为 `FACILITY_REFERENCE`，成田与福冈标为 `SHOP_REFERENCE`；车辆入口统一仍为 `NOT_VERIFIED`。名称、地址、电话和归还安排已核对，不代表营业时间、现场入口或完整合同政策均已核实。Toyota的 `returnRule` 仍为空，不套用Times的满油／收据条款。

本地预览：[成田](http://127.0.0.1:4174/zh-Hans/return-car/toyota-narita-airport/)、[中部](http://127.0.0.1:4174/zh-Hans/return-car/toyota-chubu-centrair-airport/)、[福冈](http://127.0.0.1:4174/zh-Hans/return-car/toyota-fukuoka-airport-international/)。

## 仍然保留的三家

| 门店 | 本轮新增证据与保留原因 | 后续所需证据 |
| --- | --- | --- |
| Toyota 关西机场 | [经营公司门店页](https://www.r-shinosaka.jp/shop/kansaikukou/)和[中央系统65302/400](https://rent.toyota.co.jp/shop/detail.aspx?rCode=65302&eCode=400)确认Aeroplaza一楼地址。Overture `d77b2f74…` 与官方换算参考点仍相距约544米；`c7c0183d…` 落在和歌山。新找到的OSM `n13022441226` 虽距参考点约22米，却只有泛Toyota标识，缺少分店名称、电话和门店编号，不能单凭距离认定。官网图片实际是从航站楼步行至门店的示意，并非车辆驶入图。 | 可直接匹配该候选的分店专属身份资料，并区分接待柜台、门店及实际车辆返还区。 |
| Nippon 福冈机场国际线 | [官方011185](https://store.nipponrentacar.co.jp/b/nrs/info/011185/)确认半道橋2-7-42、050-1712-2406及还车后接驳至国际线；不提供国内航站楼接驳。附近候选是Enterprise／Alamo，未记录Nippon专属网址或电话，不能依联盟关系猜测身份；其坐标还与官网现代测地系参考点相差约424米。 | 官方确认候选与Nippon门店的实际对应关系及参考位置，或另行批准独立门店输入方式。 |
| Toyota 那霸机场Seaside | [中央门店017](https://rent.toyota.co.jp/shop/detail.aspx?rCode=69101&eCode=017)写与根50-132；[经营公司招聘站](https://trl-okinawa-recruit.jp/-/top/index.html)与现有Overture `70194bc0…` 写50-112，属真实来源冲突。[冲绳县2024年清单第5页](https://www.pref.okinawa.lg.jp/_res/projects/default_project/_page_/001/004/763/r06nanbu.pdf)也有50-112，但仅能证明当时记录。官网普通MAPCODE与还车专用MAPCODE不同；约50米的参考点距离不能消除地址和入口疑点。 | 公司对当前预约还车地址、入口及两处MAPCODE用途的明确说明；不把旧地址简单视为笔误。 |

这三家保留原候选和 `NOT_VERIFIED`，没有新设“已核对”门店，也没有按同名强行合并。候选库中的已有坐标冲突仍然存在；本轮没有进行全国坐标更正或排除迁移。

## 坐标偏差的解释与边界

Toyota的[地图显示代码](https://rent.toyota.co.jp/js/mapMaster/mapDisplay.js)明确使用Tokyo Datum；[坐标读取代码](https://rent.toyota.co.jp/js/mapMaster/mapCommon.js)将整数角度除以3,600,000。该数值不能直接作为通常地图中的现代经纬度。国土地理院的[日本测地系／世界测地系说明](https://www.gsi.go.jp/LAW/G2000-g2000faq-2.htm)也解释了约数百米的地域性差异。

本轮低频调用国土地理院[TKY2JGD测量计算服务](https://vldb.gsi.go.jp/sokuchi/surveycalc/main.html)，把所列Tokyo Datum值换算为JGD2000（GRS80），仅作交叉核对：

- 成田换算点距保留OSM点约7.47米，福冈Toyota约19.31米。
- 福冈Nippon换算点与其官网结构化坐标接近，但没有解决候选身份问题。
- 关西和那霸的差异见上表，不能因接近就认定车辆入口。
- 中部请求返回海域错误 `ErrMsg 010`，未算成功；采用经营公司页面参考点、同一电话号码及返还图的独立证据。

当前[AllThePlaces Toyota提取器](https://github.com/alltheplaces/alltheplaces/blob/master/locations/spiders/toyota_rent_a_car_jp.py)文件内可见直接除以3,600,000的处理；本轮所查Overture ATP记录有与官网Tokyo数值完全相同的例子。这支持这些具体偏差可能来自测地系处理的解释，但**没有审查完整上游框架及当时历史提交，不据此断言所有上游数据都有同一问题**。对应文件内容指纹和Git blob `0e9b711864285abad5fce637d98040e663ea317f`用于追溯。

国土地理院输出与自行计算的近似直线差距见[原始换算响应](evidence/airport-followup-20261001/datum-responses.json)和[完整性审计](evidence/airport-followup-20261001/integrity.json)。使用资料来源为国土地理院，距离为本项目据参考点计算的衍生结果，不是其对本项目门店或入口的背书。

## 数据与界面更新

新本地数据版本 `rental-v1-2769bcab1437116e`：7,383条，包括7,333候选、32柜台和18家官方有限事实；默认隐藏柜台后为7,351条。相比已发布版本减少1条，来自成田两个候选的明确合并，并非丢弃来源。

- 18家分布于7个机场：Times 7家、Nippon 6家、Toyota 5家。
- 上一批15家记录逐字段不变，原日期未刷新。7,434份OSM／Overture原始来源成员逐项不变；全部7,400个上一批ID／别名均能解析。
- 48分区及59下载项的字节数、SHA-256全部匹配；独立目录中重复生成的61个文件与工作区对应文件完全一致。两个历史快照保留原字节。
- 既有来源日期保持OSM 2026-09-29、Overture release 2026-09-23.1。本次更新官方有限事实，未重新下载全国快照。
- 三家归还说明补齐五语言，并保留日文现场名称。中部新增的门店资料、公司返还图及机场返还指引使用各自明确的链接名称；成田使用公司还车指引名称，不再统一误标为机场资料。
- 不放宽去重距离或改变公司匹配规则，首页不预取全国租车库。noindex、分析no-op、定位权限、加油站点及现有价格资料保持原范围。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 通过：lint、typecheck、22文件／362单元测试、Vite构建及预渲染、323项Chromium测试。 |
| `npm run test:data` | 63项通过，包括旧门店逐字段不变、全部历史链接兼容、输入锁、来源成员和生成下载完整性。 |
| WebKit定向检查 | 39项通过：18家官方详情直达／刷新、五语言320／390／1280目录、三家新增门店五语言窄屏文案与链接，以及18家完整还车流程。无跳过、失败或重试。 |
| 本地页面视觉复核 | 三家中文桌面页和中部320px窄屏无横向溢出或页面错误；已查看中部桌面、窄屏截图，补充资料名称清晰。 |
| 本地数据完整性 | 59项下载校验通过、61文件重复生成一致、旧快照来源与门店记录保持。 |

首次完整检查出现1项失败：中部三种链接共用“机场返还指引”名称，而且原断言假定所有中部门店都只有同一个英文机场链接。定位后修正按文档类型显示名称，更新正确链接断言，并增加5项多语言回归，再次完整检查全部通过。首次失败保存在[修复前日志](evidence/airport-followup-20261001/check-before-link-fix.txt)，不冒充一遍即通过。

最终证据：[完整检查](evidence/airport-followup-20261001/check.txt)、[数据检查](evidence/airport-followup-20261001/data.txt)、[WebKit](evidence/airport-followup-20261001/webkit.txt)、[验收记录](evidence/airport-followup-20261001/verification.json)、[本地页面复核](evidence/airport-followup-20261001/visual-check.json)。原始公开来源的获取时间、字节数及SHA-256见[来源指纹](evidence/airport-followup-20261001/source-fingerprints.json)。

## 交付与限制

本轮在既有fuel-find工作区完成，没有修改主项目目录的用户改动、冻结00–10规格或历史报告。自动化测试覆盖的59份旧截图已恢复原字节；本轮需要的截图另存当前证据目录。浏览器使用离线灰色瓦片，只证明本地页面及交互，不证明实时底图可用；实体手机、母语真人和现场车辆入口均未验收。

官网、PDF和地图图片仅用于人工核对，仓库不保存这些完整内容；页面使用有限事实、自编摘要及来源链接，不声称取得商业整库授权。gogo.gs未接入，本轮未重新测试官方价服务或发送对外询问信。**未commit、push或部署，正式站点仍为上一批已发布版本。**
