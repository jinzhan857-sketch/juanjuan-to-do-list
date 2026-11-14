# 任务 #7 接手入口

最新状态：#7 已通过 PR #48 实现，展已授权复审通过后合入 main，不发布；复审补齐表达解析和普通聊天边界。最终提交、CI、合入与关闭状态以 [Issue #7](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/7) 为准，证据见[交付及复审报告](../audit/2026-11-15/issue7-weather.md)。下方是本次实施前的接手记录，其中“未修复”和 113 项测试属于历史，不据此重做。#37 继续独立验收。

供新聊天接手卷卷，只处理“查询天气时优先使用用户这次说的城市”。先核对当前文件和 GitHub 状态，再实施，不以本页的历史检查代替现场验证。

## 项目与已完成成果

目录：E:\Desktop\卷卷。仓库：[juanjuan-to-do-list](https://github.com/jinzhan857-sketch/juanjuan-to-do-list)。进度以[总计划 #1](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)为准。

#2 至 #5 已合入，分别保留源码基线、工具链、单条与整组范围保护、重复组身份合同。#3 为 [PR #26](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/26)，#4 为 [PR #35](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/35)，#5 为 [PR #36](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/36)，不要重做。

#6 交付为 [PR #46](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/46)，本轮按展授权复审后合入并关闭任务，最终状态与提交核对 [Issue #6](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/6)。复审补齐损坏撤销快照的导入及执行保护，64 项存储测试、113 项 Node 测试通过，原生浏览器 7 项验证记录保留在[报告](../audit/2026-11-15/issue6-atomicity.md)。不要撤销整体事务、提交后更新内存、重复确认、前置快照或撤销保护。

[#37](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/37) 保留独立验收。关键故障证据已取得，实际文件选择、预览取消及设备提示体验尚未由展人工复验，不能随 #6 自动关闭。见[独立矩阵](../audit/2026-11-15/issue37-storage-matrix.md)。

#40 已恢复 GitHub Pages，仓库按展确认公开。正式入口与手动发布方式见[发布说明](RELEASE.md)，#7 的代码任务不授权部署。保留另一个聊天提交的文档、图片和发布配置。

## 本轮 #7 范围与根因入口

先读 [Issue #7](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/7)，前置 #2 已满足。仅做地点优先顺序、续答上下文和相关天气错误、取消反馈，不顺带改其他任务。

当前 index.html 的 AIService.weatherLocation 把本次输入与记忆合成一个字符串，先命中香港关键词就返回香港坐标，之后才解析本次明确地点。这是“本次新加坡被旧记忆香港覆盖”的已确认入口，应从信息来源和优先级解决，不能按城市增加特例。相关函数：

- AIService.isWeatherRequest、isWeatherFollowup、weatherLocation、weatherReply。
- AIService.agent、cancelAgentRequest，核对天气请求的取消和过期结果。
- UI.agentContext，核对实际可用记忆和 history，不凭空扩展资料范围。
- scripts/check-baseline.cjs 与 docs/audit/2026-11-14/check-baseline.cjs。

当前历史探测 rememberedLocationOverridesExplicitCity 仍返回“香港”，确属 #7 未修复。修改后保留原始历史脚本与失败证据，审查后更新包装脚本的预期，不能删探测掩盖失败。

验收按 Issue：当前明确地点优先，旧记忆不覆盖；无依据时追问；网络失败与地点不明分别说明。离线测试需覆盖记忆冲突、无地点、不同城市续答与取消。天气服务连通性验证另行记录，不能把模拟响应冒充真实天气；不自动获得真实模型调用授权。

## 现场顺序与保护

1. 按根目录 AGENTS.md，功能工作第一步尝试 npm run dev，并在后台内置浏览器打开 http://127.0.0.1:4173/。如端口已有服务，核对后复用，不盲目结束进程。
2. 阅读 README.md、docs/STATUS.md，再依 AGENTS.md 阅读产品、架构、数据、AI、开发、测试、发布和总计划。
3. 先 git status 与 fetch，确认最新 main 和未提交成果。沿用适合的 checkout，新建 codex/ 任务分支，不强制重置、清理或覆盖。
4. 展可能在其他聊天修改同一仓库。将这些成果视为展的工作，完整保留；有实质冲突或影响时用问题框说明。不要把无关改动混进 #7 提交。
5. 合成资料和隔离数据库测试，不导入、清空、修改正式数据，不读个人备份或输出密钥。静态预览不运行 api/ai.js。
6. 先说明简要方案，再自行完成常规修改。产品取舍、重大架构或额外授权用问题框询问。不要新增兼容处理。

## 验证与交付

固定 Node.js 24.16.0、npm 11.13.0。先 npm ci --ignore-scripts，再 npm run check。当前统一检查为构建、文档、26 项稳定断言、113 项 Node 测试；这只是本次接手的已验证基线，新增测试后数量会变。

新写离线天气测试，核对结果和无效网络响应、取消后的行为，不调用真实模型。运行 git diff --check，提交后运行 npm run check:archive，再核对 Windows 与 Ubuntu PR CI。未经新修改或失败原因，不重复扩大无关测试。

通过 PR 交付，关联 #7、报告、源码与验证结果，更新 #7 和总计划。展不操作 Git，验证后自动提交英文说明，只推本仓库已授权任务分支，不直接推 main。未明确要求合入时保留待审查状态。不得自动关闭 #37 或部署网站。
