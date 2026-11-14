# 新聊天接手说明

更新日期：2026 年 11 月 14 日。先核对本地和 GitHub 的实际状态，本文不是自动更新的任务看板。

## 当前只做什么

展授权的本轮范围是：把难懂的任务名和标签改清楚，补充任务、文件与目录说明，增加这份交接文档。没有授权在本轮执行 Issue #2、#3 或其他开发任务，也没有开始开发 3.0。

先读根目录 [AGENTS.md](../AGENTS.md)，再读本文、[当前状态](STATUS.md)和[路线图](ROADMAP.md)。涉及产品目标时读 [3.0 完整共识稿](V3_CONSENSUS_DRAFT.md)，不用依赖旧聊天推测需求。

## 已经保存的工作

此前已建立首页、产品与架构说明、开发测试发布说明、总任务与 19 个子任务。它们属于文档与规划成果，不代表任务中的功能已实现。

本轮 GitHub Issue #2 至 #13 已修改标题，并增加“这项任务是做什么的”“做完会得到什么”等通俗说明。它们仍是未完成的开发任务，未勾选验收项。仓库网址保持不变。

本轮新增 GitHub 阅读指南，以及 api、scripts、.github 目录说明；首页、文档导航与文档链接检查入口也已调整。这批文件在 `codex/readable-project-navigation` 分支，接手时核对是否已合入 main，不要假定主分支已有全部内容。

## 本轮尚未收尾

1. 继续整理 Issue #14 至 #20 的标题与正文，保留原有依赖、验收和停止条件，只改表达。
2. 整理总 Issue #1 的标题和任务导航，使其与子任务新名字一致。
3. 将标签改成容易理解的中文，并补用途说明。当前仍有 `phase:current`、`phase:v3`、`kind:design`、`kind:tracking`、`ready`、`bug`、`enhancement` 等名称。建议依次改为“当前版本”“3.0版本”“方案设计”“总计划”“可以开始”“问题修复”“功能与工程改进”。重命名现有标签，保留任务关联。
4. 同步 [路线图入口](ROADMAP.md)的标签和任务链接文字，核对阅读指南及导航链接。
5. 验证这批说明，只提交本轮文件，按仓库流程将其合入 main，并更新本文的剩余事项。不要为清理文字而改应用代码。

后续任务建议名称：

| Issue | 建议标题 |
| --- | --- |
| #14 | 搭建后端，跑通一条完整事务流程 |
| #15 | 实现邮箱登录、跨设备同步和数据恢复 |
| #16 | 接通三种 AI 模式，管理工具权限和体验额度 |
| #17 | 让提示词和工作流可调整，错误可追查 |
| #18 | 试验自动整理记忆，验证能否纠错和追溯来源 |
| #19 | 实现少量网页通知和每周两次数据库检查 |
| #20 | 完成 3.0 实机验收、演示和发布 |

本地 `.git/drafts/readable-task-names.json` 保存了 19 项目标标题和开头说明，`.git/drafts/readability-edits.json` 保存了已经操作的核对记录。这些是本机辅助资料，不在 GitHub；即使缺失，也可以按本文和真实 Issue 继续，不要依赖浏览器旧元素编号。GitHub 连接器此前无法访问该私有仓库，已登录 Chrome 可编辑任务，Git SSH 可用。不要为此索要或输出密码、Key、验证码。

## 必须保留的本地成果

`index.html`、`api/ai.js` 有此前留下的未提交功能改动，必须保留，不混进文字整理提交。`dist/index.html` 与源码的对应关系也要在后续 #2、#3 核对，不能直接覆盖。个人 JSON 备份、真实数据、密钥不得提交。

本轮接手时记录的应用文件 SHA256，可用来确认文字整理没有改动它们：

```text
index.html       173a4bb278f76d0e175e3254f4471803edfab2bc512e22e1b0ffeb9f8457ca68
api/ai.js        986b4252bbb4ac6ec16dce13f0bb063ffe0decdfdc3dcb27cdb08ca2a6c8e95b
dist/index.html  c8073542566ddc10bbe9af286297d9c7baa0e2be5339a270d3224a73307052f1
```

## 怎么检查

```powershell
git status --short
node scripts/check-docs.cjs
git diff --check
Get-FileHash index.html, api/ai.js, dist/index.html -Algorithm SHA256
```

文档检查只核对本地 Markdown 链接，不证明 GitHub 页面已修改，也不证明应用正常。GitHub 的任务标题、正文、标签需实际打开核对。

此前本地应用盘点记录了 21 项通过和 3 项已知问题；将相同盘点脚本直接用于已提交的旧应用代码，会报 `AIService.weatherLocation is not a function`。这正是 #2 要解决的代码与检查版本不一致，不能通过删检查或改报告掩盖。历史证据见 [盘点资料](audit/2026-11-14/baseline-results.json)与[测试说明](development/TESTING.md)。本轮不修复这些问题。

## 本轮完成后怎么开发

展之后明确启动开发时，先执行 [#2：保存并验证最新代码](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/2)，验收后执行 [#3：统一启动、打包与检查](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/3)。后续按[总计划](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)和各任务的依赖推进，不能仅按编号机械连续执行。产品取舍向展确认，常规已授权操作自行完成。

新聊天可以这样开始：

> 请先阅读根目录 AGENTS.md 和 docs/HANDOFF.md，核对实际保存状态，先完成交接文档中尚未完成的命名、说明和导航整理，验证后告诉我；暂时不要执行 #2、#3 的开发工作。
