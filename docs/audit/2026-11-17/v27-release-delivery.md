来源：[独立发布者正式交付评论](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/146#issuecomment-6927431900)。原评论创建于2026年11月17日03:53北京时间。下方逐字保留发布者交付，后续用量不覆盖此时间点。

## 2026年11月17日：V2.7独立验收及正式发布完成

展明确授权独立验收通过后合并、发布和线上核对，无需再次询问；本轮未增加功能、未修改总计划。

- [x] 发布前独立复核通过，原始证据与复用边界见[验收报告](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/blob/582aac4e605043e6fe0f351f3bb0be5c4ed4ec3f/docs/audit/2026-11-17/v27-independent-release.md)。1638项、26项稳定断言、归档和13项真实Upstash专项通过。原B07实际快照核对编号、范围、无关资料、宠物积分和撤销通过；原A8/B8未完整重跑，历史失败继续保留。
- [x] PR #146已合入，正式完整来源为582aac4e605043e6fe0f351f3bb0be5c4ed4ec3f。[同来源Windows、Ubuntu及原生Redis CI](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43942038537)通过，本机合入来源统一检查及归档亦通过。
- [x] Vercel最终部署dpl_Et6DaC1iLk5cfB3wfghv3AoSQ5x4，严格15文件包，无环境文件。health的版本2.7.0、source_commit与上述正式来源一致，enabled=true，原Pages来源CORS预检204。
- [x] 手动[Publish GitHub Pages](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43942347530)的build与deploy成功。[正式网址](https://jinzhan857-sketch.github.io/juanjuan-to-do-list/)已为2.7.0，dirty=false。Pages、Vercel及正式构建的build-info逐项相同，页面与三个模块逐字节相同。最初本机Windows换行符导致三个模块哈希不同，已定位并按正式提交原始字节重建云端包，未改功能或降低断言。
- [x] 原生Chrome全新无痕窗口，普通公共额度，真实云端原A02输入返回一条2026年12月29日全天参加读书会及一条无固定日期整理书单待办。先逐项确认，刷新后导出实际库验证：2日程3待办变3日程4待办，恰好两个已执行操作；宠物成长0、饱度2、积分流水未变。没有在日常浏览器资料上测试写入、没有操作或重绑三张正式卡。

| 文件 | 正式SHA256 |
| --- | --- |
| index.html | d3eeb07d5c91d2a16e92848724c34816e9528f6d51c460511369e5b9cadb8bd2 |
| quick-score.mjs | 70ffc35f6a79c577d306b6276d3015d3ed69a6cd59c85ffadea1740909db5109 |
| assistant-workflow.js | dcbf8cd22f87ea44ddf678dddf286582a22ce6b90e1c74e443845108729d8664 |
| assistant-materials.js | 2a0354f3f0a97a1e1790ba6f4ff7fe90d446444d0f746bc6006e4dd5a6b46c31 |

专项沿用原账本。展在57次、估算0.536558元时明确将累计上限增至200次、2元。最终已有计费回执63次，估算0.584184元；正式原生浏览器1轮真实请求没有逐项计费回执，保留最多5次、0.518272元未知预留，不凭界面成功将其记为零费用。账本累计保守上界68次、1.102456元，未超限，不是供应商实扣账单。

本机证据位于任务工作区忽略目录.reports/v27/，包含formal-final-verification.json、formal-browser-verified.json、formal-synthetic-backup.json、formal-browser-saved.png及final-budget-summary.json。原始失败与预算拦截记录保留。正式站与试用站仍是不同浏览器来源，卡不自动迁移。

本轮公网云端交付完成。真实手机、国内无代理连接等仍按#55、#83及原独立任务验收，#110、#117等保持原状；偶发模型格式错误未在本轮复现，不能保证永不发生。恢复依据继续使用V2.6来源5ffbce401f033ce5fd4562635ae518f1badb47ab及既有发布恢复文档，不回滚或清空用户资料。

