# 开发辅助脚本

本目录保存帮助维护项目的命令，不是用户使用卷卷的功能页面。

| 文件 | 做什么 | 怎么运行 |
| --- | --- | --- |
| `check-docs.cjs` | 检查文档里的本地链接和标题跳转有没有失效 | 在仓库根目录执行 `node scripts/check-docs.cjs` |
| `serve.cjs` | 只提供允许的页面文件 | `npm run dev` 或 `npm run preview` |
| `ai-local.cjs` | 独立本机AI入口，默认模拟，真实连接须先确认 | `npm run ai:dev`，详见[人工交接](../docs/development/LOCAL_AI.md) |
| `ai-config.cjs` | 显式真实入口读取工作区配置及用户目录共享模型Key | 由真实入口调用，只共享模型Key；免费模拟不读私有配置 |
| `ai-config.test.cjs` | 用合成Key检查共享配置、优先级及两个新工作区进程 | 由ai:test和check调用，不读取个人Key，不访问模型 |
| `ai-simulation.cjs` | 加载原AI处理函数，隔离模拟模型与额度，不访问外网 | 由本机模拟和专项测试加载 |
| `ai-local.test.cjs` | 验证本机AI请求、配置、服务错误和密钥保护 | `npm run ai:test`，已并入统一检查 |
| `ai-live-check.cjs` | 经授权的真实模型测试，初始3次1元，最新批准的续测累计10次2元，额度为合成模拟 | `npm run ai:live-check`仅检查，`npm run ai:live-test`可能产生费用；续测须显式参数并复用原账本，先看[人工清单](../docs/development/LOCAL_AI.md) |
| `ai-acceptance.cjs` | 明确授权的固定合成题收尾，按要求保留DeepSeek最终回答，复用原账本 | `npm run ai:acceptance -- --approved-closure`，本轮10次已用满，不能再运行真实测试 |
| `ai-action-check.cjs` | 在独立fake-indexeddb与原应用函数中验证日程确认、重复保护、持久化及撤销 | 收尾执行器及离线回归调用，不接触浏览器真实数据库 |
| `ai-acceptance.test.cjs` | 离线核对收尾预算、人工复查后的单题选择与真实事务写入函数 | ai:test与check调用，全部为合成数据 |
| `ai-live-check.test.cjs` | 离线核对真实测试的次数、预算预留和失败停止保护 | 由ai:test与统一检查调用，不发外部请求 |
| `build.cjs` | 生成页面和来源记录 | `npm run build` |
| `check-baseline.cjs` | 核对稳定断言与已知问题，保留历史脚本 | 由 `npm run check` 调用 |
| `toolchain.test.cjs` | 验证工程错误路径与 HTTP 边界 | `node --test scripts/toolchain.test.cjs` |
| `atomic-data.test.cjs` | 合成 IndexedDB 的写入、导入与故障恢复测试 | `node --test scripts/atomic-data.test.cjs` |
| `weather.test.cjs` | 离线验证天气地点优先级、续答、错误与取消 | `node --test scripts/weather.test.cjs` |
| `weather-browser.cjs` | 原生浏览器的隔离天气消息流程检查 | `node scripts/weather-browser.cjs`，打开 4175 测试页 |
| `storage-browser.cjs` | 原生浏览器的隔离数据库故障检查 | `node scripts/storage-browser.cjs`，打开 4174 测试页 |
| `storage-samples.cjs` | 生成不含私人内容的备份样本 | `node scripts/storage-samples.cjs` |
| `storage-ui-browser.cjs` | 用真正界面验证文件选择、导入取消和恢复，只操作独立合成库 | `node scripts/storage-ui-browser.cjs`，打开输出的随机本机地址 |
| `storage-ui-browser.test.cjs` | 核对真实界面测试入口的数据库、网络和文件访问隔离 | 由 `npm run check` 调用 |
| `notice.test.cjs` | 提醒正文结构、截止及扣分边界回归 | 由 `npm run check` 调用 |
| `notice-browser.cjs` | 首页提醒的内存合成排版验收，不启动数据库与网络 | `node scripts/notice-browser.cjs`，打开4184测试页 |
| `helpers/` | 共用合成状态与浏览器检查逻辑 | 由测试入口加载 |
| `check-archive.cjs` | 验证当前提交的无 Git 归档副本 | `npm run check:archive`，先提交，检查的是 HEAD |

这项检查不调用 AI，不读取浏览器业务数据，也不证明应用功能全部正常。业务检查的适用版本和已知限制见[测试说明](../docs/development/TESTING.md)。
