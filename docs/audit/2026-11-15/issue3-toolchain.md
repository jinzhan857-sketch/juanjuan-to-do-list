# 任务 #3 工具链交付记录

日期：2026 年 11 月 15 日。范围仅为统一启动、构建和自动检查，不修复 #4、#5、#7，不部署或调用真实模型。

## 现场与实现

接手时工作区干净，HEAD 与远端 main 均为 `9b9ac1375d6cdb79bf8f4802def17f7b8e55fbea`，#2、PR #25 已合入。先完成后台内置浏览器的 4173 页面加载确认，没有导入、清空或测试业务数据。

固定 Node.js 24.16.0、npm 11.13.0，零第三方依赖。Node 脚本提供开发预览、构建、产物预览、统一检查。dist 改为被忽略的生成目录，旧版本在 Git 历史保留。生成 HTML 与根源码逐字节一致，另附提交、输入及输出哈希。ZIP 通过归档提交标记追踪来源，无法判断修改时明确记录 null。

## 本地验证

`npm ci --ignore-scripts` 成功，26 项稳定断言通过，三项已知问题探测与 #2 一致。7 项工程测试通过，覆盖逐字节生成、可重复构建、来源缺失、语法失败非零、输入缺失、未知文件保护和两种预览边界。缺失输入不生成目录，语法失败保留上次产物；写入失败后仍须重新构建，不发布残留。

初次工程测试发现临时目录清理早于预览进程结束，在 Windows 上触发 EPERM，导致两项失败。已调整为先停止进程再清理，重新执行 7 项全通过，未跳过或弱化断言。

首次 CI 运行 [43620626082](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43620626082) 中，Windows 归档步骤因 Bash 与原生路径格式混用失败，Ubuntu 通过。已用 Node 归档检查脚本替代，不排除 Windows。另固定构建输入的 LF 换行，消除干净克隆与 ZIP 因检出换行产生的哈希差异；工作区原始文件未重写。

应用 `index.html`、`api/ai.js` 和历史检查脚本未改。检查只使用合成状态和临时副本；CI 无业务凭据、私人备份或真实模型请求。上传文件限定为两个生成文件和合成报告。静态服务不执行 AI 接口。

## 交付与边界

交付：[PR #26](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/26)。实现提交 `33d96b3`，归档与换行修正提交 `6cff306b2accd2bc8af7b0268284cee37db9a78d`。文档验收记录随后补充，不改变已验证的工具链与应用文件。

- [x] 从授权远端新克隆及直接下载 GitHub ZIP，分别执行 `npm ci --ignore-scripts` 和 `npm run check`，均为 26 项稳定断言、7 项工程测试通过，三项问题继续复现。
- [x] 干净克隆实际执行 `npm run dev`，4173 返回 HTTP 200；两种副本的工程测试均实际启动源码和产物预览、验证页面字节与文件访问边界。
- [x] 两种副本的 build-info 源提交均为 `6cff306b2accd2bc8af7b0268284cee37db9a78d`，克隆 dirty 为 false，ZIP 为 null。页面输出 SHA256 均为 `fd394d5232234e3e17cb034e2cf9c833059bb24f91ac1bc75755fb05e645ad33`。
- [x] [分支 CI 43620814530](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43620814530) 与 [PR CI 43620819416](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43620819416) 成功，Windows 和 Ubuntu 均完成源码与无 Git 归档的完整检查。构建失败路径返回非零，未跳过关键检查。
- [x] 实际下载两平台 CI 上传包，各仅含 `dist/index.html`、`dist/build-info.json`、`.reports/baseline.json`。两平台来源文件、源码提交和输出哈希一致，dirty 均为 false；不包含密钥、私人资料或备份。
- [x] 原始两份应用源码及历史检查脚本相对基点无 Git 差异，个人备份仍被忽略。

原始下载与运行日志留在被忽略的 `private/issue3-validation/`，不作为日常命令的依赖。GitHub 运行及任务保留最终成果链接，不覆盖首次失败记录。三项业务问题继续分别留给 #4、#5、#7；完整发布与恢复仍在后续任务。
