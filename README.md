# Evidence Wall

灰测路由证据链墙与公开证据提交页。

- 线上站点：<https://evid-wall.mitu233333.workers.dev>
- `index.html`：完整证据链墙
- `discussion.html`：正反双方提交证据、附件下载与图片放大
- `src/worker.js`：Cloudflare Worker API
- `schema.sql`：D1 数据结构
- `wrangler.toml`：Workers Static Assets、D1、R2 与限流配置
- `DEPLOYMENT.md`：部署与安全说明

## 当前云端资源

- Worker：`evid-wall`
- D1：`evid-wall-db`
- R2：`evid-wall-files`
- 附件保留：30 天
- 单文件：20 MB
- 每条证据：最多 4 个文件
- 同一网络：每天最多 5 条、50 MB

公共评论已接入 giscus，评论者需要登录 GitHub。
