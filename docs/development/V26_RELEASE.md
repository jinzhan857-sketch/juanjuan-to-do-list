# V2.6 发布说明

本版支持用户自配 DeepSeek Key 的聊天、搜索、公开链接阅读和图片理解，沿用候选核对、确认、保存与撤销流程。编辑待办保留原周期，跨夜分开表达可发布，明确日期和时段的原记录范围定位已修复，整组追加备注保留每条原文，旧卡更正和撤销状态保护已补齐。

正式入口：<https://jinzhan857-sketch.github.io/juanjuan-to-do-list/>。进入“我的，大模型配置”选择自定义 API，配置官方 DeepSeek 地址、支持的模型与自己的 Key。当前官方资料能力使用 deepseek-flash。公网共享接口 #82 本版暂缓，默认托管选项不代表已有共享服务。

## 保存和备份

业务资料保存在当前浏览器 IndexedDB。Key 保存在该来源 localStorage，业务 JSON 备份不包含 Key；不要把 Key 填入聊天、备注或截图。换设备、浏览器或清理站点数据后需重新配置。不同设备不会自动同步。

升级前建议从“我的，数据出入与同步”导出 JSON。恢复是完整覆盖，先核对预览，取消不改资料。备份格式仍为2.2，产品版本为2.6.0，不执行数据迁移。

## 本轮范围与已知问题

快速上线自动验收报告见 [V2.6验收](../audit/2026-11-16/v26-release.md)。真实手机、软键盘、实际触控、全主题和多浏览器完整组合、复杂模糊多图矩阵保留待验，不关闭整个 #135、#55 或 #10。#110、#117继续按原决定暂缓。跨日已有记录的时间调整继续使用发布表单。

模型协议或资料服务失败会拒绝操作并保留草稿，请检查目标后主动重试，不将错误提示当作已保存。大网页可能超过资料或验收预算边界；本轮代表搜索、链接和图片通过不代表完整理解质量矩阵通过。

## 发布和回退

执行 [发布流程](RELEASE.md)，仅从已检查的 main 手动运行 Publish GitHub Pages。核对 build-info.json 的 sourceCommit、appVersion、dirty=false 与页面及三个模块哈希。部署记录、受检提交和最终结果在 [#10](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/10) 留证。

旧正式站来源为 fa76ae0d57ceebeb9101c86e8448efa205d05021，成功运行 [43664378792](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43664378792)，事件为 workflow_dispatch、分支为 main。若本次发布核心链路失败，可重跑此历史 main 发布运行：

```powershell
gh run rerun 43664378792 --repo jinzhan857-sketch/juanjuan-to-do-list
gh run view 43664378792 --repo jinzhan857-sketch/juanjuan-to-do-list
```

重跑沿用原运行提交并重新构建检查；确认成功后重新核对正式 build-info.json 的 sourceCommit 为 fa76ae0，页面 SHA256 为 4d0f46af445692a80570eb512ba52619b0946692d9f5143d745737575ca609ad。失败则停止并保留证据，不声称回退成功。该操作恢复页面版本，不恢复数据，不清空或导入用户数据库；旧页面可能不展示本版新增能力，恢复业务资料须另行核对备份。
