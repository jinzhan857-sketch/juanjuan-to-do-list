# nanoMuse 研究与卷卷采用建议

更新日期：2026 年 11 月 15 日。研究结论是优先吸收明确的小机制和验收思路，按现有任务逐项验证；不整套搬入，不把 Python 全部翻成 JavaScript，也不为研究新增在线服务。

本次只保存研究与安排。未安装或运行 nanoMuse，未调用真实模型，未复制代码和素材，未新增依赖，未验证接入后的效果。推荐程度属于针对卷卷的判断，不是对 nanoMuse 全部功能的质量排名。

## 1．研究依据与范围

- 项目：[nano-muse/nanoMuse](https://github.com/nano-muse/nanoMuse)。
- 本次核对提交：[067384b7e5b3c47a7eeca217895be71493396518](https://github.com/nano-muse/nanoMuse/tree/067384b7e5b3c47a7eeca217895be71493396518)，与本次读取时的 main 一致。
- 核对运行时配置、记忆、授权、任务预算、上下文、目标评测、调度、技能、通知和界面状态的重点源码，以及相关测试和路线图。不是全仓安全审计，也不是实机成功率评测。
- 版本定位先见[1.0 到 4.0](../product/VERSION_POSITIONING.md)，语言与服务边界见[决策 0003](../decisions/0003-javascript-python-boundary.md)。执行顺序只在[总计划](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)维护。

## 2．按推荐程度排列

| 编号与优先级 | 能力、用途与判断 | 源码入口 | 采用方式及必须补的部分 | 承接任务与版本 |
| --- | --- | --- | --- | --- |
| N01，优先 | 授权范围、执行前检查和记录。完善卷卷已有确认与撤销，防止权限被复用到错误目标 | `nanomuse/sentinel/gate.py`、`grants.py`、`audit.py` | 参考机制，在卷卷业务层实现。绑定账户、动作、真实目标、影响范围和数据版本；保留确认后重新检查与整批保护，不照搬通用自动放行模式 | #16、#17，业务执行与 #14 协调；3.0参考 |
| N02，优先 | 单任务预算与上下文控制。避免复杂请求耗时、用量和工具步骤失控 | `nanomuse/llm/budget.py`、`agent/context.py`、`config.py` | 优先按需要用 JavaScript 独立实现；保护当前要求、目标身份和完整工具交换，不为了压缩丢失执行条件；价格、计数及停止规则按卷卷确认 | #16、#17；额度与 #29、#38 原分工协调；3.0参考 |
| N03，优先 | 记忆来源、变更、纠错、撤销及相关检索。减少旧事实覆盖新要求 | `nanomuse/memory/store.py`、`consolidate.py`、`embeddings.py`、`tools/memory_tools.py` | 不替换卷卷现有存储。补来源消息或资料编号、确认状态、更新时间、派生关系与账户隔离；先预览变更再确认，向量检索有实际需求再评估 | #18、#17；3.0受控试验，扩大到3.x须另验 |
| N04，优先研究 | 根据最终状态判断任务结果，区分执行完成与目标达成 | `nanomuse/goals/evaluation.py`、`tests/test_goal_evaluation.py`、`tests/fixtures/goal_eval/` | 复用评测设计，替换为卷卷合成场景和可信结果采集；可独立用 Python，不把评测引擎塞入在线业务，不自动据此奖惩用户 | #51、#52；可选研究，不增加发布硬前置 |
| N05，推荐小试 | 周复盘、会议准备等明确流程，让现有资料转化为下一步建议 | `nanomuse/skills/builtin/weekly-review/SKILL.md`、`meeting-prep/SKILL.md`、`skills/library.py` | 参考流程结构，改用卷卷授权的日程、待办与记忆；先用户主动发起，输出可查看的复盘和建议，采用建议仍走确认流程。不默认读取邮件或执行脚本 | #17；3.x增强候选，不扩为技能市场 |
| N06，分阶段 | 通知、防重复发送、例程与持续目标检查 | `nanomuse/server/service.py`、`outbox.py`、`push.py`、`goals/store.py`、`triggers/store.py` | 普通通知按 #19 原范围建设。更强主动能力需独立调度、账户时区、免打扰、频率和费用控制；按账户、任务和发生时点去重，处理失败与重启，不把进程内定时器直接当云端调度 | #19承接原通知研究；增强另定，3.x至3.5候选 |
| N07，推荐结合原改版 | 执行中、待确认、完成、出错等状态与宠物形象联动 | `web/src/mood.ts` | 参考状态映射，接入自己的猫美术和现有页面。原 React hook不能直接放进当前原生页面；不复制小龙素材，不改积分、饱度和成长规则 | #41，与 #34协调；按3.0原美术范围考虑，额外状态另定 |
| N08，后续候选 | 外部日历只读接入，减少重复录入课程或活动 | `nanomuse/calendar/ics.py`、`feeds.py` | 先只读列表，再评估转为事务；需设计外部来源编号、时区、全天、重复例外、更新和取消传播，不把其支持范围当完整日历协议实现 | #53记录；3.5候选，不塞入账户同步任务 |
| N09，后续候选 | 少量外部工具及其他助手调用卷卷 | `nanomuse/tools/mcp_tools.py`、`bridge/mcp_server.py` | 先定义卷卷自己的业务接口，再选择一个需求明确的只读工具；写入仍经身份、确认和执行校验。MCP不能替代业务权限，也不要求先支持任意工具安装 | #53记录；3.5小试、4.0扩大均待讨论 |
| N10，远期候选 | 跨设备交接、跨应用和屏幕操作、人工接管 | `nanomuse/hub/`、`computer/`、`phone/`、相关客户端 | 先明确具体场景和平台能力，验证目标定位、误操作、接管、执行证据与费用；需额外运行环境，不把全平台能聊天理解为全平台能操作所有App | #53记录；4.0概念候选，不纳入3.0首发 |

编号用于研究映射，不是新的施工顺序。原任务必要前置、已完成修复和当前队列保持不变。原任务可以记录“暂不采用”，不要求把参考代码都接上才关闭。

## 3．重点源码与测试证据

以下链接固定到本次核对提交；后续采用前重新核对目标版本。

| 主题 | 直接证据 | 结论与局限 |
| --- | --- | --- |
| 授权 | [grants.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/sentinel/grants.py)、[gate.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/sentinel/gate.py)、[授权复用测试](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/tests/test_approval_reuse.py) | 有工具与目标绑定、会话或持久授权、撤权和并发复查。卷卷仍需自己的账户、事务编号、组身份和确认快照约束 |
| 预算与上下文 | [budget.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/llm/budget.py)、[context.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/agent/context.py)、[config.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/config.py) | 有总用量、费用、时间与上下文控制；多项限制默认0表示关闭。需主动配置，不能复制默认值便宣称已受控；估算费用也不是账单承诺 |
| 记忆 | [store.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/memory/store.py)、[consolidate.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/memory/consolidate.py)、[整理测试](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/tests/test_memory_tidy.py) | 存储有来源字段、变更日志、恢复、检索和整理预览。整理约束包含用词和单次影响量检查；据此推断，它不能单独证明语义与事实正确 |
| 同步边界 | [路线图](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/docs/roadmap.md) | 同一份记忆跨设备同步及每条记忆更完整的来源信息仍列为后续方向。对话同步不等于卷卷的业务同步，不能替代 #13、#15 |
| 目标评测 | [evaluation.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/goals/evaluation.py)、[评测说明](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/docs/goal-eval.md) | 模块通过显式调用使用，不自动修改GoalStore或进入Agent主循环。固定场景回放与真实模型运行分别记录；不能把开发测试当通用成功率 |
| 定时与重启 | [outbox.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/server/outbox.py)、[service.py](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/server/service.py) | 待发送记录、唯一发生键和恢复流程可作参考；原SQLite与进程模型不能直接承担卷卷的多账户云端调度，也不保证通知必达 |
| 周复盘与状态 | [weekly-review](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/nanomuse/skills/builtin/weekly-review/SKILL.md)、[mood.ts](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/web/src/mood.ts) | 周复盘流程与状态表达有直接产品价值；需替换数据入口、输出页面和组件，保留卷卷自己的角色与规则 |

不能通过“建了学习计划”证明“学会了课程”，也不能仅凭模型回复“已完成”就结算真实任务。卷卷的执行验收应检查最终数据、无关记录、附件、积分和宠物是否正确。

## 4．代码怎么用，怎样选择语言

采用顺序是：参考公开设计并按卷卷需求独立实现；确有收益时复用独立工具或模块；最后才考虑运行一套额外服务。不能把原Python模块、SQLite数据层或React组件直接塞进当前页面。

在线业务按[决策0002](../decisions/0002-backend-language.md)继续优先JavaScript；评测、分析和训练按[决策0003](../decisions/0003-javascript-python-boundary.md)可独立使用Python。调用大模型、生成周报、记忆检索和普通统计本身不构成新增Python服务的理由。

“独立实现相同需求”与“复制、修改或翻译已有代码”分别记录。若选择直接移植，先明确具体文件和许可证，不以“改成JavaScript”代替许可核对。

## 5．许可与来源记录

项目自有代码主要声明为GPL-3.0-or-later，第三方代码和素材有各自条款。依据为[pyproject.toml](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/pyproject.toml)、[LICENSE](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/LICENSE)及[第三方声明](https://github.com/nano-muse/nanoMuse/blob/067384b7e5b3c47a7eeca217895be71493396518/THIRD_PARTY_NOTICES.md)。卷卷仓库公开不代表已选开源许可证。

[GNU关于代码翻译的说明](https://www.gnu.org/licenses/gpl-faq.html#TranslateCode)指出，换编程语言仍属于修改。直接复用前应记录文件、提交、原许可、第三方声明、修改及分发方式，明确卷卷采用许可；不承诺拆服务或换语言就自动免除义务。本轮未作许可选择。

## 6．实施时的小试与采用门槛

每个候选进入原任务时，仅选一个可验证场景，记录：问题、当前表现、候选机制、独立实现或实际复用方式、代码版本、合成数据、结果、费用与维护成本，最后给出采用、暂缓或不采用的结论。

- 授权：错误目标、确认后变化、重复确认及撤权后执行均不得越范围写入。
- 预算：超限、取消和重试有可核对的停止结果，不能出现迟到写入或重复扣减；具体计数规则由原任务确认。
- 记忆：当前明确信息优先，错误归纳可纠正，来源删除或修改会让相关派生结果失效。
- 主动任务：在隔离场景下验证关闭页面、重启、时区、免打扰和重复触发；模拟与真实到达分开记录。
- 评测：固定输入、期望和最终状态；模拟回放与真实模型、单任务执行与目标达成分开报告。

没有明确收益、增加重复逻辑、破坏原保护或维护成本明显不合算时，不扩大接入。出现越范围写入、原始内容丢失、重复奖励或关键检查退步时停止该试验，保留证据；不得在真实资料上试迁移或清空。
