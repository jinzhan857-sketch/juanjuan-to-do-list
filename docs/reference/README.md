# 来源与素材归档

## 正式说明与来源

| 材料 | 用途 |
| --- | --- |
| [当前代现状清单](../CURRENT_STATE.md)及[检查证据](../audit/2026-11-14/baseline-results.json) | 当前实现、版本与问题的盘点依据 |
| [原飞书 3.0 方案](https://my.feishu.cn/wiki/U3YLwNZY4iPnS5kZX3WcXvTInLr) | 历史设计来源，部分设想已被后续共识调整 |
| [GitHub 完整共识稿](../V3_CONSENSUS_DRAFT.md)与[飞书全文](https://my.feishu.cn/wiki/XZEowYCowiqCGykqn9wcTNn7nfe) | 3.0 当前完整目标、范围、未定项与外部依据 |
| [参考项目首页](https://github.com/qikhcysa/dase7508-agent-privacy-boundaries)、[文档](https://github.com/qikhcysa/dase7508-agent-privacy-boundaries/tree/main/docs)、[总任务 #27](https://github.com/qikhcysa/dase7508-agent-privacy-boundaries/issues/27) | 借鉴介绍、模块说明、任务依赖与验证串联的组织方式，不照搬课程项目分工 |

外部私有链接可能要求权限。继续开发所需的当前规则、实现说明和已确认方向已整理到本仓库，不要求接手者翻聊天或先取得所有来源的权限。

## 本地材料处理

| 原始材料 | 本轮处理 | 理由 |
| --- | --- | --- |
| `测试记录.md` | 保留本地原件，完整归档到 [history](../history/test-records-2026-09.md) | 保留旧失败和结论，另加历史口径说明 |
| `测试集/助手输入测试集.md` | 保留本地原件，归档到[输入样例](../history/agent-inputs-2026-09.md) | 作为后续结构化用例素材，不当作已通过断言 |
| `diagrams/` 的 111 个过程文件 | 保留本地并排除批量提交，保留[素材目录说明](../../diagrams/README.md) | 多轮版本与工作数据尚未逐张验证，不直接当正式架构 |
| 当前架构图 | 按当前源码关系整理在[架构说明](../architecture/README.md) | 读者能核对图与实现，不依赖过期过程图 |
| 个人备份 JSON | 只留本地，加入忽略规则 | 真实业务内容不进入工程样例 |

后续选用旧图时先确认版本、文字、隐私与当前方案一致，选取必要文件并写来源、日期和状态，不把整个过程目录一次上传。已有图稿数量和路径快照在首次盘点 JSON 中。

## 历史与当前的关系

历史文件保留原文，不覆盖失败。不同时期的产品规则和验证方式可能不同，冲突时先读当前产品说明、现状证据和设计决策。文档更新不能把历史“通过”自动提升为本轮通过。
