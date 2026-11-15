# 本地开发与接手

先读[当前状态](../STATUS.md)和根目录 [AGENTS.md](../../AGENTS.md)。运行与构建使用 Node.js 自带能力，测试增加锁定版本的 fake-indexeddb 开发依赖，不换前端框架，不建设未来独立后端。

## 准备与命令

本次已确认规则的接手步骤、试玩证据层次、相关任务分工与停止条件见[实施接手](HANDOFF_CONFIRMED_RULES.md)。排期只在总计划#1维护，原文中的单轮#3范围说明保留为当时背景。

固定 Node.js 24.16.0、npm 11.13.0，依据 `.node-version`、`package.json` 和锁文件。版本不符时 npm 会明确失败，先安装指定版本再继续。`npm ci` 按锁文件安装而不改锁文件，依据 [npm 官方说明](https://docs.npmjs.com/cli/v11/commands/npm-ci/)。

```powershell
git clone git@github.com:jinzhan857-sketch/juanjuan-to-do-list.git
cd juanjuan-to-do-list
npm ci --ignore-scripts
npm run dev
```

私有仓库需要访问权限。也可以下载 GitHub ZIP，解压后从含 package.json 的目录执行两条 npm 命令。保留隐藏文件 `.source-revision`，它通过 Git 归档的提交替换记录来源，依据 [Git 官方说明](https://git-scm.com/docs/gitattributes)。已有目录先核对 git status，不覆盖或清理原成果。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` 或 `npm start` | 预览根目录源码 |
| `npm run build` | 校验语法，生成 dist 页面与来源记录 |
| `npm run preview` | 预览已生成的 dist，先执行 build |
| `npm run check` | 构建、文档链接、稳定断言、已知问题探测与工程测试 |

预览地址为 <http://127.0.0.1:4173/>，只绑定本机，停止按 `Ctrl+C`。两种预览不能同时占用该端口；占用会报错并非零退出，不盲目结束其他进程。工程测试用 `PORT` 环境变量指定随机隔离端口。

预览仅开放 `/` 和 `/index.html`，产物模式额外开放 `/build-info.json`。额外精确开放 /quick-score.mjs，来源为 src/rules/quick-score.mjs，构建后为 dist/quick-score.mjs。不提供目录列表、仓库资料、密钥、私人备份或接口源码；不提供 `/dist/`，通过启动命令选择预览对象。不要使用 file 协议作为标准验证。

界面或功能工作先在内置浏览器确认 4173 加载。数据测试须用隔离浏览器资料和合成数据；应用启动可能规范化资料和结算宠物，不在日常浏览器试验导入、清空、批量修改或迁移。工程测试只发 HTTP 请求，不启动页面应用、不接触浏览器数据。

## 构建与来源

根目录 `index.html` 是唯一页面源码。构建逐字节写入 `dist/index.html`，不压缩、不注入脚本、不改业务。dist 被忽略，不再提交或手工维护旧发布文件。干净下载先构建再预览或准备发布。

`dist/build-info.json` 记录源码提交、来源类型、Node 版本、关键输入与产物 SHA256。工作区有改动时 dirty 为 true，不能当作干净发布。ZIP 的 dirty 为 null，表示不能判断解压后的修改，须对照对应提交的输入哈希，不表示已确认干净。提交信息缺失会失败，不猜来源。已审查提交的干净 CI 产物是发布审查的主要依据。

构建在语法、输入及来源校验后写入页面、评分模块和来源记录三个固定文件。dist 内有未知文件或链接会拒绝覆盖，先保留并核对。语法、来源、输入和写入错误均返回非零；写入失败可能留下不完整产物，必须重新成功构建与检查，不能发布残留文件。

## AI 与后端

#81已新增独立本机AI入口：npm run ai:dev运行免费模拟，npm run ai:test执行模拟专项；真实连接需要另行配置和确认，按[本机AI与人工交接](LOCAL_AI.md)分段推进。原npm run dev仍只运行静态预览，本项不改公网服务。

静态预览不执行 `api/ai.js`，`/api/ai` 返回 404。接口仍需宿主路由、模型 Key 与 Redis 配置；`node api/ai.js` 不会启动服务。自定义模型由浏览器直连，也不因预览命令获得真实调用授权。详见[AI 说明](../architecture/AI.md)。

#3 不部署网站、不迁移资料、不调用真实模型。修改后验证并自动保存到独立 codex 分支，通过 PR 交付，见[测试说明](TESTING.md)与[发布说明](RELEASE.md)。
