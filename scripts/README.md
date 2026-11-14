# 开发辅助脚本

本目录保存帮助维护项目的命令，不是用户使用卷卷的功能页面。

| 文件 | 做什么 | 怎么运行 |
| --- | --- | --- |
| `check-docs.cjs` | 检查文档里的本地链接和标题跳转有没有失效 | 在仓库根目录执行 `node scripts/check-docs.cjs` |
| `serve.cjs` | 只提供允许的页面文件 | `npm run dev` 或 `npm run preview` |
| `build.cjs` | 生成页面和来源记录 | `npm run build` |
| `check-baseline.cjs` | 核对稳定断言与已知问题，保留历史脚本 | 由 `npm run check` 调用 |
| `toolchain.test.cjs` | 验证工程错误路径与 HTTP 边界 | `node --test scripts/toolchain.test.cjs` |
| `check-archive.cjs` | 验证当前提交的无 Git 归档副本 | `npm run check:archive`，先提交，检查的是 HEAD |

这项检查不调用 AI，不读取浏览器业务数据，也不证明应用功能全部正常。业务检查的适用版本和已知限制见[测试说明](../docs/development/TESTING.md)。
