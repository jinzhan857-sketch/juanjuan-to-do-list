# 卷卷

卷卷是带宠物陪伴与积分反馈的个人事务助手，帮助用户整理日程、待办，并通过 AI 聊天获得事务处理和规划建议。

当前以浏览器本地应用为主，界面标记为 V2.2。项目正在整理当前代工程，并规划 3.0 的独立后端、账户与跨设备同步。3.0 尚未交付。

## 从这里开始

看不懂文件名、编号或 GitHub 页面时，先读[GitHub 阅读指南](docs/guide/README.md)。只想知道下一步做什么，可以直接看[卷卷开发总计划](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1)。

| 你想了解什么 | 入口 |
| --- | --- |
| 产品怎么用，现有规则是什么 | [产品与使用说明](docs/product/README.md) |
| 做到哪里、有哪些问题、接着做要注意什么 | [当前状态与接手说明](docs/STATUS.md) |
| 第一次接手，应该按什么顺序阅读 | [文档导航](docs/README.md) |
| 代码、AI 和数据如何工作 | [当前架构](docs/architecture/README.md) |
| 本地怎么启动、检查与发布 | [开发说明](docs/development/README.md) |
| 开发顺序、勾选进度、下一步与前置条件 | [开发总计划](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/issues/1) |
| 3.0 的完整目标与范围 | [3.0 完整共识稿](docs/V3_CONSENSUS_DRAFT.md) |
| Agent 接手时必须遵守什么 | [AGENTS.md](AGENTS.md) |

## 文件夹分别放什么

这里是固定的用途说明。上方文件列表右侧显示最近一次修改的提交说明，会随提交变化。

| 目录或文件 | 中文用途 |
| --- | --- |
| `api/` | AI 服务接口，[打开说明](api/README.md) |
| `docs/` | 产品、架构、开发和验证资料，[打开导航](docs/README.md) |
| `scripts/` | 文档等开发辅助检查，[打开说明](scripts/README.md) |
| `dist/` | 准备发布的网页文件，[查看版本与发布依据](docs/development/RELEASE.md) |
| `diagrams/` | 历史设计图稿，[查看归档说明](diagrams/README.md) |
| `.github/` | 任务与改动说明模板，[打开说明](.github/TEMPLATES.md) |
| `.openai/` | 既有 Sites 发布配置，[查看发布说明](docs/development/RELEASE.md) |
| `index.html` | 当前网页源码，[查看系统如何工作](docs/architecture/README.md) |

## 当前能力

| 功能 | 当前情况 |
| --- | --- |
| 日程和待办 | 创建、编辑、状态反馈、日期与日历展示 |
| 卷卷助手 | 事务、规划、聊天三种处理模式；事务建议先确认再执行 |
| 记忆与规划 | 授权使用个人记忆，结合日程与待办给出建议 |
| 宠物与积分 | 完成反馈、积分结算、食物、成长与互动 |
| 备份与外观 | JSON 导入导出、主题与精力设置 |
| 登录与云端同步 | 当前未实现，已纳入 3.0 方向 |

能力存在不等于全部通过验收。单条与整组范围、组身份、地点优先级、导入失败保护等已有问题，详见[现状盘点](docs/CURRENT_STATE.md)。原本未提交的新增能力已由任务 #2 保存为源码基线，仍未发布，详见[基线交付报告](docs/audit/2026-11-14/issue2-baseline.md)。

## 本地预览

准备 Node.js 24.16.0 与 npm 11.13.0。运行和构建没有第三方依赖，存储测试通过 npm ci 安装固定开发依赖。版本固定在 `.node-version` 和 `package.json`。

```powershell
git clone git@github.com:jinzhan857-sketch/juanjuan-to-do-list.git
cd juanjuan-to-do-list
npm ci --ignore-scripts
npm run dev
```

打开 <http://127.0.0.1:4173/>，停止服务按 `Ctrl+C`。也可以在 GitHub 下载 ZIP 后从解压目录运行两条 npm 命令。

这只启动静态页面，不会启动 `api/ai.js`。生成产物执行 `npm run build`，预览产物执行 `npm run preview`，统一检查执行 `npm run check`。dist 是生成目录，不再入库。来源追踪与完整步骤见[开发说明](docs/development/README.md)。

## 检查与后续工作

```powershell
npm run check
```

统一检查包含构建、文档链接、26 项稳定断言、三项历史问题探测和工程与范围测试。#4 已修复单天误走整组，组身份已由 #5 修复，旧记忆城市问题仍保留。原始证据见[基线报告](docs/audit/2026-11-14/issue2-baseline.md)，范围和 CI 方法见[测试与验收](docs/development/TESTING.md)。

先完成当前代的资料、任务和工程整理，再按前置条件进入 3.0。GitHub 保存完整实施资料，飞书保留[3.0 全文副本](https://my.feishu.cn/wiki/XZEowYCowiqCGykqn9wcTNn7nfe)。任务进度以 Issue 为准。

当前仓库按展于 2026 年 11 月 15 日的最新确认公开，以免费恢复 GitHub Pages。公开代码不代表已经选择开源许可证。个人业务备份和密钥不属于工程资料；没有单独授权时，不复制到仓库或测试记录。项目尚未选择开源许可证。

## 网站访问

正式静态入口为 <https://jinzhan857-sketch.github.io/juanjuan-to-do-list/>，按[发布说明](docs/development/RELEASE.md)手动发布已通过检查的 main 版本。GitHub Pages 不运行 AI 服务端，页面可打开不等于托管 AI 或跨设备同步已接通。
