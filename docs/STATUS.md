# 当前状态与接手说明

更新日期：2026 年 11 月 15 日。本文供人和 Agent 共用。先看进度与接手结论，需要执行时再看下面的版本、检查与本地现场。详细历史证据见[首次现状清单](CURRENT_STATE.md)。

## 当前接手结论：任务 #40

2026 年 11 月 15 日，已查明 GitHub Pages 的 404 原因：当前账号下私有仓库的 Pages 不可用，设置页要求升级或公开。展确认公开仓库并免费恢复原 Pages，替代本次早先保持私有的偏好。已启用 Actions 来源，新增手动发布工作流；部署和实机验收见 [#40](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/40)。本任务不改应用行为、不调用模型、不迁移资料。发布方式以[发布说明](development/RELEASE.md)为准，下方的私有仓库和旧站点描述保留作历史。

## 当前接手结论：任务 #5

基于已合入 #3、#4 的 main 提交 5e009c4，仅修复重复组身份传递和校验。本轮开始工作区干净，没有覆盖此前成果。合法组编号原样传递，非法、编造或漏掉已有组编号的操作被拦截。同名多组、确认后组成员变化继续追问或停止。合成测试与交付范围见[#5 报告](audit/2026-11-15/issue5-series.md)，PR 与 CI 链接以 [Issue #5](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/5) 为准。未部署、迁移真实数据或调用真实模型，#7 等其他任务保持原范围。下方保留历史结论。

## 历史接手结论：任务 #4

#4 修复指定单天误走整组及同名首条误选，确认卡与执行入口绑定目标快照。新增合成数据范围测试，原始历史脚本和失败证据保留。#5、#7 仍未修复，未部署或调用真实模型；最终验收见[#4 报告](audit/2026-11-15/issue4-scope.md)与 [Issue #4](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/4)。下方为 #3 及此前交付历史。

## 当前接手结论：任务 #3

#2 和 PR #25 已合入 main。#3 基于 `9b9ac1375d6cdb79bf8f4802def17f7b8e55fbea` 建立 Node.js 最小工具链，统一开发、构建、产物预览与检查。应用源码和 AI 接口不改动，三项已知问题保留，dist 改为生成目录。命令与来源规则以[开发说明](development/README.md)为准，证据见[#3 报告](audit/2026-11-15/issue3-toolchain.md)。合入与任务状态以 [#3](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/3) 为准。

当前仅推进 #3。下方保留此前任务的现场和历史结论，其中“下一项 #2”“源码未提交”“无构建”等表述不是当前状态。

- [x] 2026 年 11 月 15 日：#3 工具链验收通过，干净克隆、GitHub ZIP、Windows 与 Ubuntu CI 均实际验证。成果为 [PR #26](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/26)，未部署，三项已知业务问题未修复。

## 当前后端实现方向

独立后端优先采用 JavaScript，具体框架与托管组合在 #12 验证，不缩减后端职责和稳定性验收。当前依据为[决策 0002](decisions/0002-backend-language.md)，替代 D0.1 的 Python 优先偏好。旧共识与飞书 D0.1 保留作历史，本次未同步改写全文。应用代码未变，后端建设与 #3 均未在本次实施。

## 本次基线交付

任务 #2 已保存原始新增代码，交付为 [PR #24](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/24)，应用源码提交为 `1236ef9109db88acfcb2a8b2261ff45722b3ffb4`。两份本地源码与接手时原文件逐字节一致，提交仅规范换行，原始副本留在被忽略的 `private/issue2-original/`，个人备份未提交。完整功能分类、验收和报告见[基线交付报告](audit/2026-11-14/issue2-baseline.md)。

- [x] 保存原始成果并建立对应源码基线。
- [x] 26 项局部断言通过，保留三项已知问题的实际输出。
- [x] 干净克隆及无 Git 的 ZIP 副本实际运行检查。
- [ ] #3 统一启动、打包和 CI：本轮未实施。

`dist/index.html` 仍是旧发布文件，源码保存不等于部署。GitHub 合入及任务状态以 [#2](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/2) 交付记录为准。下文保留此前接手现场与失败证据，关于未提交文件的表述均为本任务开始前的历史状态。

## 工作记录与当前结论

完成后勾选并保留条目、日期和证据；后续追加工作，不删除已完成成果。开发任务的详细进度只在[总计划](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)维护。

- [x] 2026 年 11 月 14 日：盘点功能、代码差异与已知问题，保留[首次现状清单](CURRENT_STATE.md)。
- [x] 2026 年 11 月 14 日：GitHub 和飞书保存 D0.1 的 [3.0 全文](V3_CONSENSUS_DRAFT.md)，展已阅读并表示基本无问题，待定项仍由设计任务确认。
- [x] 2026 年 11 月 14 日：仓库按授权改为私有，未改变原有站点发布方式。
- [x] 2026 年 11 月 14 日：建立首页、文档体系及总计划与 19 个子任务，保留[首次组织交付报告](audit/2026-11-14/docs-roadmap-review.md)。
- [x] 2026 年 11 月 14 日：整理任务名、标签、目录解释与阶段清单，将接手内容并入本文。原[交接文档快照](history/2026-11-14-handoff-before-consolidation.md)保留作历史，当前接手以本文为准。
- [ ] 当前版本的代码保存、启动打包、问题修复与工程验收：尚未完成，按总计划推进。
- [ ] 3.0 功能：尚未实施，方案存在不代表功能可用。

## 接手先看这几件事

本轮仅整理名称、说明、导航和开发总计划，没有执行 #2、#3，没有改应用功能、部署或迁移真实资料。文件合并与页面核对见[本轮整理报告](audit/2026-11-14/readable-navigation-review.md)。

下一项开发工作是 [#2：保存电脑上的最新代码，让 GitHub 下载后也能检查](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/2)，完成验收后才进入 [#3：统一启动、打包和自动检查的方法](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/3)。这两项未因文档整理而提前完成。后续检查依赖，不能只按编号实施。

项目目标、评分两按钮、云端同步、AI 额度等以完整 3.0 方案为依据；这里不另抄一份。界面与功能工作遵守根目录 AGENTS.md 的预览和数据保护规则。

## 三份代码必须分清

| 对象 | 依据 | 意义 |
| --- | --- | --- |
| 最近已核对的应用提交 | `b35936b0c760b57263b068c3a1f204f28bfeb24d` | 首次盘点时 GitHub 的应用代码，根页面与 `dist/index.html` 相同 |
| 此后的文档提交 | `0481f24`、`b8c36bd` 及本轮文档交付 | 增加盘点与方案等资料，没有发布新应用 |
| 本地工作区 | `index.html`、`api/ai.js` 仍有未提交修改 | 包含额外功能，未整体发布或验收，不属于干净下载仓库就能获得的成果 |

本轮开始时本地源码哈希仍与首次盘点一致。没有为了整理文档把这些源码改动合入主分支，也没有覆盖发布目录。本轮之后接手时仍需运行 `git status` 核对实际状态。

Sites 最近核对到第 8 版保存记录，来源 `b35936b…`，平台显示部署成功。[站点地址](https://juanjuan-ai-todo-2.jinzhan857.chatgpt.site)保留作历史发布入口，普通用户访问和 `/api/ai` 链路尚未完成本轮完整验证。部署记录不等于业务验收。

## 验证结论

首次盘点执行 21 项局部检查，通过；同时复现三个已知问题：指定单天可能走整组修改、托管上下文丢失 `series_id`、旧记忆地点覆盖当前明确城市。其他代码检查发现的问题和未验证项见[问题清单](CURRENT_STATE.md#9已知问题与下一步优先级)。

当前运行检查脚本时，工作区和干净下载的应用代码版本可能不同，应把代码版本、文件哈希与结果一起记录。历史结果不能冒充另一份代码的通过结果。

本轮额外提取 `b8c36bd` 中的已提交应用文件执行盘点脚本，确认会因 `AIService.weatherLocation is not a function` 中断。该函数在本地额外改动中存在，说明目前还没有可供干净下载直接完成的业务基线检查。这是任务 #2 的明确交付缺口，原始盘点脚本和报告不为掩盖失败而修改。

## 本地现场与继续执行

本轮结束时仍需保护此前未提交的 `index.html` 和 `api/ai.js`。`dist/index.html` 的版本对应关系留给 #2、#3 核对。个人 JSON 备份、真实资料和密钥不提交。以下哈希记录本轮未修改应用文件，后续代码任务完成后可以追加新记录，不覆盖这份历史证据。

| 文件 | 本轮结束时 SHA256 |
| --- | --- |
| index.html | 173a4bb278f76d0e175e3254f4471803edfab2bc512e22e1b0ffeb9f8457ca68 |
| api/ai.js | 986b4252bbb4ac6ec16dce13f0bb063ffe0decdfdc3dcb27cdb08ca2a6c8e95b |
| dist/index.html | c8073542566ddc10bbe9af286297d9c7baa0e2be5339a270d3224a73307052f1 |

接手时先实际运行：

```powershell
git status --short
node scripts/check-docs.cjs
git diff --check
Get-FileHash index.html, api/ai.js, dist/index.html -Algorithm SHA256
```

文档检查只检查本地链接与标题锚点，不证明应用或远端页面正常。应用基线的失败与版本差异见上文，运行方法见[测试说明](development/TESTING.md)，不要通过删检查掩盖问题。

仓库为私有。此前 GitHub 连接器无法访问，已登录 Chrome 可编辑任务，Git SSH 可用；接手时核对现状，不扩大权限或索要密钥。提交仅包含本次范围，保留原始改动。启动、发布与恢复方法统一见[开发文档](development/README.md)。

新聊天可以直接说：

> 请先读 AGENTS.md、README.md 和 docs/STATUS.md，核对实际状态，按总计划先执行 #2，验收后进入 #3。后续依任务前置条件推进，保护本地未提交代码与用户数据，完成的任务勾选并保留记录。
