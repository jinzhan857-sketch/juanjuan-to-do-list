# 路线图入口

[打开总路线图 Issue #1](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)。它按依赖串起当前代 9 项整理任务与 3.0 的 10 项设计和建设任务，原生子任务显示完成情况。

## 现在从哪里开始

优先执行 [C01，#2](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/2)，保存和验证本地未提交成果。[V01，#11](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/11) 可以先开展产品规则与验收设计，待定细节与展确认。

其他任务从总路线图进入，满足前置条件并核对相关交付后再实施，不另在本文维护任务完成状态。

## 工作顺序

当前代：保存基线，统一运行构建与检查，修复具体问题，必要模块拆分，发布恢复与独立接手验收。

3.0：规则和合同，托管与同步设计，最小后端，账户与跨端，AI 与配置治理，记忆试验和普通通知，完整发布验收。

## 任务分类与交付

| 标签 | 用途 |
| --- | --- |
| phase:current | 当前代工程整理 |
| phase:v3 | 3.0 后续演进 |
| kind:design | 先明确规则或验证方案 |
| kind:tracking | 总路线图 |
| bug、enhancement | 缺陷修复或工程建设 |
| ready | 前置已满足，当前可开始；需随依赖维护 |

每个任务写明目的、范围、依赖、涉及文件、验收、停止条件与交付记录要求。使用 [任务模板](../.github/ISSUE_TEMPLATE/task.md) 和 [PR 模板](../.github/pull_request_template.md)，任务分支采用 codex/ 前缀。

实际状态以 Issue 为准，PR 关联代码与验证；未来发布记录再关联版本和平台证据。任务依赖变更应同时更新总路线图及子任务正文，避免两处条件不一致。

背景：[当前状态](STATUS.md)、[文档导航](README.md)、[完整共识稿](V3_CONSENSUS_DRAFT.md)、[设计决策](decisions/README.md)。
