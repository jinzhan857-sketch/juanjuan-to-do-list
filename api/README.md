# AI 服务代码

这里的 `ai.js` 负责请求模型、整理返回结果，以及公共调用次数和运营统计。V2.7网页通过固定Vercel云端地址请求它，见[V2.7说明](../docs/development/V27_RELEASE.md)。`quota.cjs` 提供同一请求在设备与全站额度中的原子预占和去重退回，由 `ai.js` 注入现有Redis传输，不单独提供服务。

它目前需要部署平台提供运行环境，单独用静态服务器打开网页不会启动它，也不能执行 `node api/ai.js` 就当作完整后端已经运行。

想了解请求格式、配置名称和已知问题，阅读 [AI 接入说明](../docs/architecture/AI.md)；想了解整个系统，阅读[当前系统架构](../docs/architecture/README.md)。服务配置只记录名称，Key 和口令不存进仓库。

设备每日300次、每周300次，全站公共周池1000次。`experience.cjs`负责累计体验卡的首次浏览器绑定和校验，余额由同一原子额度引擎处理。没有公开发码接口，维护工具与退次边界见[体验卡说明](../docs/development/V27_EXPERIENCE.md)。
