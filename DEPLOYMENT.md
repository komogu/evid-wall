# Cloudflare 部署

线上站点：<https://evid-wall.mitu233333.workers.dev>

## 架构

- Workers Static Assets：`index.html`、`discussion.html` 和证据墙图片
- Worker：`/api/*`
- D1：证据元数据
- R2：用户上传附件
- Workers Rate Limiting：读写接口限流
- GitHub Discussions + giscus：公共评论

## 免费额度保护

应用限制低于 Cloudflare 免费额度：

- 单文件 20 MB，每条最多 4 个文件
- 同一网络每天最多 5 条证据、50 MB 附件
- 写接口每个网络每分钟最多 6 次
- 读接口每个网络每分钟最多 120 次
- R2 对象 30 天自动删除
- 列表最多返回 50 条证据
- 非 PNG/JPEG/WEBP/GIF 文件强制下载，不在站点同源执行

Cloudflare 平台免费额度仍是最终硬边界：Workers 免费计划每日 100,000 个动态请求，D1 每日 500 万行读取、10 万行写入，R2 每月 10 GB-month、100 万 Class A、1000 万 Class B。超过 Workers/D1 免费额度时服务会拒绝请求；R2 是按量产品，因此应用主动限额和 30 天生命周期是主要费用保护。

## 本地部署

```bash
mkdir -p public/assets
cp index.html discussion.html public/
cp -r assets/. public/assets/
npx wrangler deploy
```

首次创建资源：

```bash
npx wrangler d1 create evid-wall-db
npx wrangler r2 bucket create evid-wall-files
npx wrangler d1 execute evid-wall-db --remote --file schema.sql
npx wrangler secret put IP_SALT
```

R2 生命周期：

```bash
npx wrangler r2 bucket lifecycle add evid-wall-files expire-after-30-days "" --expire-days 30 --force
```

## GitHub Actions

`.github/workflows/deploy.yml` 已准备好。要启用自动部署，在 GitHub 仓库 Secrets 添加：

- `CLOUDFLARE_API_TOKEN`：只授予该账户的 Workers Scripts、D1、R2 编辑权限
- `CLOUDFLARE_ACCOUNT_ID`：`ecbd74402cf1523588051935015b4a63`

本机 OAuth 凭证不会提交到仓库。

## giscus

仓库已开启 Discussions，giscus App 已安装，`discussion.html` 已接入：

- 仓库：`komogu/evid-wall`
- 分类：`Announcements`
- 映射：`pathname`
- 严格匹配：开启
- 评论者必须登录 GitHub

`giscus.json` 当前只允许 Workers 域名；以后绑定自定义域名时同步加入。

## 管理

当前公开提交会立即显示。需要隐藏违规内容时：

```sql
UPDATE evidence SET status = 'hidden' WHERE id = '证据ID';
```

执行：

```bash
npx wrangler d1 execute evid-wall-db --remote --command "UPDATE evidence SET status='hidden' WHERE id='...';"
```

R2 附件需要按对象 key 删除。对象 key 可从 D1 的 `evidence_file` 表查询。

## 官方资料

- Workers 限额：<https://developers.cloudflare.com/workers/platform/limits/>
- D1 定价：<https://developers.cloudflare.com/d1/platform/pricing/>
- R2 定价：<https://developers.cloudflare.com/r2/pricing/>
- Workers Rate Limiting：<https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- giscus：<https://giscus.app/zh-CN>
