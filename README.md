# 卷卷

卷卷是带宠物陪伴与积分反馈的个人事务助手，帮助用户整理日程、待办，并通过 AI 聊天获得事务处理和规划建议。

当前以浏览器本地应用为主，界面标记为 V2.2。项目正在整理当前代工程，并规划 3.0 的独立后端、账户与跨设备同步。3.0 尚未交付。

## 从这里开始

| 你想了解什么 | 入口 |
| --- | --- |
| 产品怎么用，现有规则是什么 | [产品与使用说明](docs/product/README.md) |
| 当前做到了哪里，哪些有问题 | [当前状态与版本关系](docs/STATUS.md) |
| 第一次接手，应该按什么顺序阅读 | [文档导航](docs/README.md) |
| 代码、AI 和数据如何工作 | [当前架构](docs/architecture/README.md) |
| 本地怎么启动、检查与发布 | [开发说明](docs/development/README.md) |
| 下一步做什么，有哪些前置条件 | [路线图入口](docs/ROADMAP.md) |
| 3.0 的完整目标与范围 | [3.0 完整共识稿](docs/V3_CONSENSUS_DRAFT.md) |
| Agent 接手时必须遵守什么 | [AGENTS.md](AGENTS.md) |

## 当前能力

| 功能 | 当前情况 |
| --- | --- |
| 日程和待办 | 创建、编辑、状态反馈、日期与日历展示 |
| 卷卷助手 | 事务、规划、聊天三种处理模式；事务建议先确认再执行 |
| 记忆与规划 | 授权使用个人记忆，结合日程与待办给出建议 |
| 宠物与积分 | 完成反馈、积分结算、食物、成长与互动 |
| 备份与外观 | JSON 导入导出、主题与精力设置 |
| 登录与云端同步 | 当前未实现，已纳入 3.0 方向 |

能力存在不等于全部通过验收。单条与整组范围、组身份、地点优先级、导入失败保护等已有问题，详见[现状盘点](docs/CURRENT_STATE.md)。本地还有未发布的功能改动，不能把本地画面全部当作 GitHub 当前成果。

## 本地预览

准备 Git 与 Node.js。本轮文档验证使用 Node.js 24；其他版本未逐一验证。第一次执行 `npx` 会下载静态服务器，需要网络。

```powershell
git clone git@github.com:jinzhan857-sketch/juanjuan-to-do-list.git
cd juanjuan-to-do-list
npx --yes http-server . -a 127.0.0.1 -p 4173 -c-1
```

打开 <http://127.0.0.1:4173/>，停止服务按 `Ctrl+C`。私有仓库需要访问权限和已配置的 GitHub SSH 登录，也可以在 GitHub 下载 ZIP 后从解压目录运行最后一条命令。

这只启动静态页面，不会启动 `api/ai.js`。模型配置、浏览器数据隔离及完整步骤见[开发说明](docs/development/README.md)。当前还没有统一构建命令，不要假设 `dist` 会随源码自动更新。

## 检查与后续工作

```powershell
node scripts/check-docs.cjs
```

这是文档本地链接与标题锚点检查。业务盘点脚本使用合成数据，但依赖尚未提交的本地函数；本轮确认直接对已提交应用运行会因缺少 `weatherLocation` 而中断。先完成[基线保存任务 #2](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/2)，再建立可供干净下载运行的业务检查。范围和现有本地执行方法见[测试与验收](docs/development/TESTING.md)。

先完成当前代的资料、任务和工程整理，再按前置条件进入 3.0。GitHub 保存完整实施资料，飞书保留[3.0 全文副本](https://my.feishu.cn/wiki/XZEowYCowiqCGykqn9wcTNn7nfe)。任务进度以 Issue 为准。

当前仓库为私有。个人业务备份和密钥不属于工程资料；没有单独授权时，不复制到仓库或测试记录。项目尚未选择开源许可证。
