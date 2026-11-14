# 任务 #40：恢复免费 GitHub Pages 访问

日期：2026 年 11 月 15 日。展最终确认公开仓库并恢复原 Pages，替代本轮早先的私有仓库偏好。未购买套餐、创建新托管账号或操作业务数据。实现与发布为 [PR #42](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/pull/42)。

## 根因与恢复

原网址返回 GitHub Pages 的 Site not found 404。已登录的仓库 Pages 设置明确显示 Upgrade or make this repository public to enable Pages；展在获知公开影响后再次确认，现已公开仓库，启用 GitHub Actions 来源。

新增手动 main 发布工作流，执行现有检查后只上传 dist。普通推送不发布，不上传 api 源文件、私人备份或密钥，不修改应用业务。发布方式以[发布说明](../../development/RELEASE.md)为准。项目尚未选择开源许可证。

## 实际验证

- npm ci --ignore-scripts、npm run check 通过：26 项稳定断言、49 项 Node 测试，0 跳过；文档链接与 git diff --check 通过。
- [PR CI 43625023704](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43625023704) 成功。
- [Pages 发布 43625176652](https://github.com/jinzhan857-sketch/juanjuan-to-do-list/actions/runs/43625176652) 的 build、deploy 均成功，发布提交为 5552bacad644928089b0ce47381a93a2d8abe9d8。
- 原网址在桌面和手机 User-Agent 请求均为 HTTP 200，标题为卷卷，页面 344388 字节，SHA256 为 2b11c3a877f30ecefb2fdf5925cc34d63520dcfe06aa1bc45e024fef9a611e99，与本轮构建产物一致。
- build-info.json 返回 200，记录上述发布提交、dirty=false 和相同产物哈希。
- Chrome 实际加载首页、切换计划页成功。没有创建、导入、清空或重置数据，也没有调用模型。
- 展通过手机系统浏览器打开原网址，明确反馈“能正常打开”。User-Agent 探测与真实手机反馈分开记录。

公开前对 122 个历史文本对象检查常见凭据格式和私人备份路径，无匹配。这是有限检查，不构成对所有潜在敏感内容的绝对保证。

## 版本和边界

正式入口：<https://jinzhan857-sketch.github.io/juanjuan-to-do-list/>。同一网址恢复，不迁移浏览器资料。代码合入不自动上线；后续发布需手动触发和验证。GitHub Pages 不执行 api/ai.js，本次不等于托管 AI 或云端同步已接通。天气、其他数据与界面缺陷继续由原 Issue 跟踪。

历史 Sites 版本 8 来自 b35936b，桌面可加载但手机访问未通过，不作为本次恢复入口。
