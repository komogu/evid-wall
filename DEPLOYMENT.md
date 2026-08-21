# 上线架构与配置清单

## 推荐方案

**Cloudflare 全家桶 + GitHub Discussions：**

- 页面：Cloudflare Pages（或 Workers Static Assets）
- 登录：GitHub OAuth / GitHub App
- 评论：giscus → GitHub Discussions
- 证据元数据：Cloudflare D1
- 附件：Cloudflare R2
- 上传入口：Cloudflare Worker 认证后签发短期、单对象的 R2 PUT 预签名 URL
- 防灌水：GitHub 登录 + Cloudflare Turnstile + Worker 限流 + 每账号配额 + 管理员审核

这样最短、便宜，也不会把用户二进制文件塞进 Git 历史。

## giscus 配置

1. 新建一个**公开** GitHub 仓库。
2. 在仓库 Settings → General 开启 Discussions。
3. 安装 giscus App：<https://github.com/apps/giscus>。
4. 建一个 **Announcements** 类型分类，例如 `证据墙评论`。giscus 官方推荐此类型，避免普通用户任意新建讨论。
5. 打开 <https://giscus.app/zh-CN>，填写仓库和分类。
6. 推荐参数：
   - 映射：`pathname`
   - 严格匹配：开启
   - 输入框：底部
   - 语言：中文
7. 将生成的脚本替换 `discussion.html` 里“giscus 配置位”。
8. 在仓库根目录添加 `giscus.json`，限制允许嵌入的域名：

```json
{
  "origins": ["https://你的域名"]
}
```

giscus 评论者必须授权 GitHub；内容存在 GitHub Discussions，可在 GitHub 删除、锁定和管理。仓库遭灌水时，在 Settings → Moderation options → Interaction limits 临时限制新账户、非贡献者或非协作者。

## R2 上传流程

不要把 R2 密钥放进网页，也不要让浏览器直接拥有长期凭证。

1. 前端先登录 GitHub。
2. 前端向 Worker 请求上传意图：文件名、大小、MIME、摘要哈希。
3. Worker 验证登录、Turnstile、账号频率和文件限制。
4. Worker 生成随机对象 key，例如：

```text
pending/{github_user_id}/{evidence_id}/{uuid}-{safe_filename}
```

5. Worker 签发短时效、仅限该对象和 PUT 操作的 R2 预签名 URL。
6. 浏览器直接 PUT 到 R2，不让大文件经过 Worker。
7. 前端提交 ETag、大小和对象 key；Worker 写入 D1，状态先为 `pending`。
8. 审核或扫描通过后改为 `published`，再提供下载 URL。

R2 CORS 只允许正式站域名；允许 `PUT/GET/HEAD` 和必要请求头。生产下载建议用 R2 自定义域名，不用 `r2.dev`。

## 必做安全限制

“支持任意类型”只能表示前端不做扩展名白名单，后端仍必须限制风险：

- 每个文件建议先限制 50 MB；每条证据最多 4 个文件。
- 每账号每天总量、提交次数、并发上传数均限流。
- 文件名仅作展示；对象 key 使用服务端随机 UUID。
- 校验客户端声明的大小、实际上传大小、MIME 与 magic bytes。
- 默认下载响应使用 `Content-Disposition: attachment`。
- HTML、SVG、JS、可执行文件等不要在站点同源内联预览。
- 对象先进入隔离前缀，审核后再发布。
- 记录 SHA-256，阻止完全重复文件和已封禁哈希。
- 上传意图接口加 Turnstile；下载不必强制登录，除非证据需要保密。
- 管理端支持隐藏证据、删除对象、封禁 GitHub 用户和审计日志。

Cloudflare 有恶意上传检测，但是否可用取决于账户与产品能力；不要把它当成免费方案的必然能力。最低成本阶段可采取“GitHub 登录 + 限额 + 隔离 + 人工审核 + 强制下载”。

## D1 最小数据表

```sql
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  github_user_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('pro', 'con')),
  title TEXT NOT NULL,
  claim TEXT NOT NULL,
  context TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE evidence_file (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);
```

评论不重复建表，交给 giscus / GitHub Discussions。

## GitHub 能不能托管用户文件

技术上能，但**不适合这个用途**：

- 普通 Git 仓库会永久保留二进制历史；GitHub 建议把生成文件放在对象存储。
- 普通 Git 单文件 100 MB 硬限制，超过 50 MiB 会警告。
- Git LFS 有存储和下载带宽配额，而且不能用于 GitHub Pages 站点资源。
- Releases 单文件可到 2 GiB，但只有仓库写权限用户能管理，不适合让普通访客直接上传。
- Discussions/Issues 的附件属于 GitHub 内容系统，适合评论里手工附少量截图，不适合做你的受控证据文件数据库。

所以：**GitHub 托管代码和评论；R2 托管证据文件。**

## Cloudflare Pages 还是 Vercel

推荐 Cloudflare Pages：

- 当前站点是普通 HTML/CSS/JS，Pages 足够。
- R2、D1、Workers、Turnstile 同一平台，绑定和权限最简单。
- 静态请求免费；动态 API 走 Workers 配额。
- 大附件不进 Pages，全部进 R2。
- 部署含 Functions 时用 Git 集成或 Wrangler，不要用 Dashboard 拖拽，因为 Dashboard Direct Upload 不会编译 `functions` 目录。

Vercel 也能托管页面，但上传仍建议直传对象存储。Vercel Function 请求/响应体有 4.5 MB 限制，因此大文件不能经过 Function；若用 Vercel，仍要让浏览器直传 R2或改用 Vercel Blob。跨两个平台只会增加配置。

## 推荐上线顺序

1. 把 `evidence-wall` 放进公开或私有 GitHub 代码仓库。
2. 建 Cloudflare Pages 项目，先通过 Git 部署静态站。
3. 建独立公开 GitHub Discussions 仓库并配置 giscus。
4. 建 R2 私有 bucket 和 D1 数据库。
5. 写 Worker API：GitHub OAuth、上传意图、预签名 URL、证据创建、证据列表、审核。
6. 配 R2 CORS 和自定义下载域名。
7. 加 Turnstile、账号/IPv4 或 IPv6 前缀限流、日配额。
8. 管理员先人工审核附件，再开放公共列表。
9. 最后才关闭本地 IndexedDB 原型，切换到线上 API。

## 官方资料

- giscus：<https://giscus.app/zh-CN>
- giscus 高级配置：<https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md>
- GitHub Interaction limits：<https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository>
- GitHub OAuth web flow：<https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>
- R2 用户生成内容架构：<https://developers.cloudflare.com/reference-architecture/diagrams/storage/storing-user-generated-content/>
- R2 预签名 URL：<https://developers.cloudflare.com/r2/api/s3/presigned-urls/>
- R2 CORS：<https://developers.cloudflare.com/r2/buckets/cors/>
- R2 公共桶与自定义域名：<https://developers.cloudflare.com/r2/buckets/public-buckets/>
- R2 定价：<https://developers.cloudflare.com/r2/pricing/>
- Pages + R2：<https://developers.cloudflare.com/pages/tutorials/use-r2-as-static-asset-storage-for-pages/>
- Pages Direct Upload：<https://developers.cloudflare.com/pages/get-started/direct-upload/>
- D1 限制：<https://developers.cloudflare.com/d1/platform/limits/>
- GitHub 仓库限制：<https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits>
- GitHub 大文件：<https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github>
- GitHub Releases：<https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases>
- Vercel Function 限制：<https://vercel.com/docs/functions/limitations>
