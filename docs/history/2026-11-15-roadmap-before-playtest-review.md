# 总计划本次重排前的正文快照

保存日期：2026年11月15日。本页只用于历史追溯，原文按读取时状态保留；最新唯一执行队列在[总计划#1](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)，不要按下方旧顺序实施。

# 卷卷开发总计划

下面按任务先后顺序排列，已完成的保留在流程中的位置并勾选，未完成的顺着往下做。

当前交付：[#62 提醒正文排版](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/62)已交付[PR #70](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/70)，复审后347项测试、26项稳定断言、24组电脑隔离排版及最终云端检查通过，已合入main并关闭#62；真实手机验收转交[#55](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/55)，未来信息栏正文检查转交[#61](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/61)，两项仍待执行，成果及记录保留。本轮按展要求不发布，也不做#66，原队列保留。#65已解决与最新main的冲突并联合复审通过，[PR #69](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/69)已合入main，Issue已关闭并在原位置勾选；联合373项测试、26项稳定断言及最终CI通过，#62成果完整保留。#64已复审通过并合入[PR #68](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/68)，336项测试、26项稳定断言及当前源码界面复验通过，未发布。本轮新增功能任务是#57至#66，共10项；[PR #67](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/67)是已合入的资料，不是第11个功能任务。

## 当前版本，按先后顺序

- [x] 01．[#2：保存电脑上的最新代码，让 GitHub 下载后也能检查](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/2)
- [x] 02．[#3：统一启动、打包和自动检查的方法](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/3)
- [x] 03．[#4：修复“只改一天，却改到整组”的问题](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/4)
- [x] 04．[#5：让 AI 正确识别同一组重复日程](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/5)
- [x] 05．[#6：防止导入或批量修改中途失败造成数据丢失](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/6)
- [x] 06．[#37：专项验证导入格式、重复记录与事务失败后的数据恢复](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/37)
- [x] 07．[#64：导入校验失败时指出具体记录与错误字段，帮助定位无法恢复的备份](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/64)。已交付[PR #68](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/68)，复审及最终CI通过，已合入，未发布。
- [x] 08．[#40：排查并恢复卷卷 GitHub Pages 地址在电脑和手机均返回 404](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/40)
- [x] 09．[#65：修复近期待办与长期待办的数量未随当前范围变化](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/65)。已交付[PR #69](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/69)，解决冲突并联合复审通过，373项测试、26项稳定断言及最终CI通过，已合入main，未发布。
- [x] 10．[#62：修复首页待确认任务提醒被数字和文字拆散的排版](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/62)。已交付[PR #70](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/70)，复审与最终CI通过，已合入main；当前修复已完成并关闭；真实手机待验转交#55，未来信息栏正文检查转交#61，原成果与验收记录保留。
- [ ] 11．[#66：修复季度待办的最后三分之一提醒过早触发](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/66)
- [x] 12．[#47：发布日程与待办改为左侧 AI 识别、右侧快速发布，优先实施](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/47)
- [x] 13．[#43：修复 AI 识别后已选执行日期失效，必须再次选日期才能发布](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/43)
- [x] 14．[#44：发布日程的执行日期默认显示整月，移除展开和收起](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/44)
- [ ] 15．[#57：精简任务详情的信息顺序、积分文案、操作按钮与编辑规则说明](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/57)
- [ ] 16．[#60：发布表单保留用户原文，优先按换行整理任务定义与备注](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/60)
- [ ] 17．[#58：独立发布表单日期识别，支持口语日期并保护手选日期](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/58)
- [x] 18．[#7：查询天气时优先使用用户这次说的城市](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/7)
- [ ] 19．[#8：修复完成数量和统计报告对不上的问题](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/8)
- [ ] 20．[#28：统一助手与表单编辑日程的积分重算和改时规则](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/28)
- [ ] 21．[#59：独立时间识别，完善全部时段、单端补足一小时与跨日执行](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/59)
- [ ] 22．[#38：统一验证并修复请求超时、取消后返回、重试与额度计数](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/38)
- [ ] 23．[#63：统一全部主题的简约控件规范，新增灰白配色与默认关闭的界面阴影](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/63)
- [ ] 24．[#61：首页增加未读信息入口，收纳状态提醒并精简空态文案](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/61)。承接#62未来信息栏复用提醒正文后的排版检查，仍待实施及验收。
- [ ] 25．[#27：修复助手将日程转成待办时丢失图片和链接](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/27)
- [ ] 26．[#30：补齐批量修改遗漏的标题分数和时间字段校验](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/30)
- [ ] 27．[#31：修复事务上下文只取最早 100 条导致近期日程遗漏](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/31)
- [ ] 28．[#29：修复公共 AI 额度使用客户端日期导致计数可绕过](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/29)
- [ ] 29．[#32：修复底部导航切换时滚动条闪现引起页面横向跳动](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/32)
- [ ] 30．[#33：修复助手输入聚焦误判键盘弹出导致底部导航消失](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/33)
- [ ] 31．[#39：定位并修复课程教授备注重复的问题](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/39)
- [ ] 32．[#9：拆清页面、数据、积分和 AI 代码](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/9)
- [ ] 33．[#55：真实手机验收发布表单、日期保持与整月日历，承接 #47、#43、#44 待验项](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/55)。另承接#62提醒正文的真实手机验收，仍待执行。
- [ ] 34．[#10：验证下载、运行、发布和恢复的完整流程](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/10)

已完成项保留在对应流程位置并勾选，未完成项继续按从上往下的顺序推进。这里的排期不是新增的逐项关闭前置；跨日的数据表示属于#59内部实施步骤，实际开发仍需核对相关规则和验收。手机证据可在前面各项实施时持续收集，到#55统一收尾。

## 当前版本完成后，进入3.0

以下同样按主要实施顺序排列。方案讨论可以提前；各Issue明确的数据保护和必要依赖仍需核对。

- [ ] 01．[#11：确定 3.0 的发布规则、数据格式和验收标准](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/11)
- [ ] 02．[#12：验证免费服务能否支撑香港和大陆使用](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/12)
- [ ] 03．[#13：确定登录、跨设备同步和旧数据保留规则](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/13)
- [ ] 04．[#14：搭建后端，跑通一条完整事务流程](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/14)
- [ ] 05．[#15：实现邮箱登录、跨设备同步和数据恢复](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/15)
- [ ] 06．[#16：接通三种 AI 模式，管理工具权限和体验额度](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/16)
- [ ] 07．[#17：让提示词和工作流可调整，错误可追查](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/17)
- [ ] 08．[#18：试验自动整理记忆，验证能否纠错和追溯来源](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/18)
- [ ] 09．[#19：实现少量网页通知和每周两次数据库检查](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/19)
- [ ] 10．[#34：完善电脑与手机自适应布局，提供布局切换方案](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/34)
- [ ] 11．[#41：在 3.0 完成卷卷小猫新美术与基础动作改版](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/41)
- [ ] 12．[#20：完成 3.0 实机验收、演示和发布](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/20)

后端优先JavaScript，依据[决策0002](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/decisions/0002-backend-language.md)。#34整体双端布局、#41宠物美术保留原范围，不阻塞当前版本的独立小项。

## 可选研究，按需要推进

这些不是当前版本发布的前置，不因为列在这里就自动安装工具或运行模型。

- [ ] 01．[#53：评估并选择卷卷可复用的开源工具与产品方案，先小试再接入](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/53)
- [ ] 02．[#51：后续评测：参考 AgentBench 验证卷卷能否正确完成个人事务](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/51)
- [ ] 03．[#52：后续试验：参考 EdgeBench 评测卷卷的多轮任务与错误恢复](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/52)

## 规则、测试与图片入口

源码与工程基础见PR #24、#26；范围与组身份见PR #35、#36；存储保护见PR #46，独立恢复验收见PR #54；天气见PR #48；发布表单、日期保持与整月日历见PR #50；免费Pages恢复见PR #42、#45；V2.5版本展示见PR #56。资料与规则复审见[PR #67](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/67)。已完成代码不等于所有真实手机场景通过，手机证据仍由#55跟踪。

- [最后确认的规则](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/reference/2026-11-15-confirmed-feedback-rules.md)。
- [114条完整字段测试预期](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/reference/2026-11-15-confirmed-feedback-tests.md)。这是待实施预期，不是功能通过报告。
- [三张授权界面截图](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/audit/2026-11-15/feedback-images/README.md)。
- [PR #67复审记录](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/audit/2026-11-15/pr67-review.md)。
- [接手状态](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/STATUS.md)、[产品](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/product/README.md)、[架构](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/architecture/README.md)、[开发](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/main/docs/development/README.md)。

正文只维护这一份执行清单；详细规则和证据在各Issue及对应文档，不另列一套按分类排列的活动任务。

## 发布、保护与历史

正式网站：[卷卷V2.5](https://jinzhan857-sketch.github.io/juanjuan-to-do-list/?v=2.5)。仓库按展确认公开，继续免费GitHub Pages；公开不等于已选择开源许可证。Pages只运行静态文件，不执行api/ai.js。实现、验收、资料合入、网站发布分别记录，不自动上线。

私人备份、真实明细和密钥不入库。公开测试用合成数据；本机私有参考副本仅按授权用于独立来源体验，不发给模型。禁止擅自新增兼容、批量清洗原始资料或迁移真实数据。越范围写入、内容丢失、重复计分、关键检查退步或无法恢复时停止相应执行并保留证据。

重排前的完整正文已保存在本Issue的“执行清单重排前的完整正文归档”评论中，包含旧分类、依赖图、未定项、成果和历史，不删除原记录。

页面顶部的“6 / 19”仅统计最早19个原生子任务，不包括后来通过链接登记的全部任务，不能当作本页完整进度。


