const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const limiter = request.method === "GET" ? env.READ_LIMITER : env.WRITE_LIMITER;
      if (!(await limiter.limit({ key: ip })).success) return json({ error: "请求过于频繁，请稍后再试。" }, 429);

      if (request.method === "GET" && url.pathname === "/api/evidence") return listEvidence(env, url);
      if (request.method === "POST" && url.pathname === "/api/evidence") return createEvidence(request, env, ip);
      if (request.method === "GET" && url.pathname.startsWith("/api/rebuttals/")) return listRebuttals(env, url.pathname.slice(15));
      if (request.method === "POST" && url.pathname.startsWith("/api/rebuttals/")) return createRebuttal(request, env, ip, url.pathname.slice(15));
      if (request.method === "GET" && url.pathname.startsWith("/api/files/")) return getFile(env, url.pathname.slice(11));
      return json({ error: "接口不存在。" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "服务器暂时无法处理请求。" }, 500);
    }
  },
};

async function listEvidence(env, url) {
  const side = url.searchParams.get("side");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 50);
  const where = side === "pro" || side === "con" ? "AND e.side = ?" : "";
  const subqueryWhere = side === "pro" || side === "con" ? "AND side = ?" : "";
  const query = `
    SELECT e.id, e.side, e.title, e.claim, e.author, e.context, e.description, e.created_at,
           f.id file_id, f.original_name, f.content_type, f.size
    FROM evidence e
    LEFT JOIN evidence_file f ON f.evidence_id = e.id
    WHERE e.status = 'published' ${where}
      AND e.id IN (
        SELECT id FROM evidence
        WHERE status = 'published' ${subqueryWhere}
        ORDER BY created_at DESC
        LIMIT ?
      )
    ORDER BY e.created_at DESC, f.created_at ASC`;
  const subqueryParams = side === "pro" || side === "con" ? [side, side, limit] : [limit];
  const { results } = await env.DB.prepare(query).bind(...subqueryParams).all();
  const entries = [];
  const byId = new Map();
  for (const row of results) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = { id: row.id, side: row.side, title: row.title, claim: row.claim, author: row.author, context: row.context, description: row.description, createdAt: row.created_at, files: [] };
      byId.set(row.id, entry);
      entries.push(entry);
    }
    if (row.file_id) entry.files.push({ id: row.file_id, name: row.original_name, type: row.content_type, size: row.size, url: `/api/files/${row.file_id}` });
  }
  return json({ entries });
}

async function createEvidence(request, env, ip) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) return json({ error: "必须使用 multipart/form-data。" }, 415);
  const declared = Number(request.headers.get("content-length"));
  const maxFileBytes = Number(env.MAX_FILE_BYTES);
  const maxFiles = Number(env.MAX_FILES_PER_ENTRY);
  if (declared && declared > maxFileBytes * maxFiles + 256 * 1024) return json({ error: "提交内容过大。" }, 413);

  const form = await request.formData();
  const side = clean(form.get("side"), 3);
  const title = clean(form.get("title"), 90);
  const claim = clean(form.get("claim"), 120);
  const author = clean(form.get("author"), 40);
  const context = clean(form.get("context"), 180);
  const description = clean(form.get("description"), 3000);
  if (!['pro', 'con'].includes(side) || !title || !claim || !author || !context || !description) return json({ error: "请完整填写证据信息。" }, 400);

  const files = form.getAll("files").filter(value => value instanceof File && value.size > 0);
  if (!files.length || files.length > maxFiles) return json({ error: `必须上传 1 至 ${maxFiles} 个文件。` }, 400);
  let totalBytes = 0;
  for (const file of files) {
    if (file.size > maxFileBytes) return json({ error: `${file.name} 超过 20 MB。` }, 413);
    if (file.name.length > 180) return json({ error: "文件名过长。" }, 400);
    totalBytes += file.size;
  }

  const ipHash = await hash(`${env.IP_SALT}:${ip}`);
  const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
  const quota = await env.DB.prepare(`
    SELECT COUNT(DISTINCT e.id) submissions, COALESCE(SUM(f.size), 0) bytes
    FROM evidence e LEFT JOIN evidence_file f ON f.evidence_id = e.id
    WHERE e.ip_hash = ? AND e.created_at >= ?`).bind(ipHash, dayStart).first();
  if ((quota?.submissions || 0) >= Number(env.MAX_DAILY_SUBMISSIONS)) return json({ error: "今日提交次数已达上限。" }, 429);
  if ((quota?.bytes || 0) + totalBytes > Number(env.MAX_DAILY_BYTES)) return json({ error: "今日上传容量已达上限。" }, 429);

  const now = Date.now();
  const evidenceId = crypto.randomUUID();
  const saved = [];
  try {
    await env.DB.prepare(`INSERT INTO evidence (id, side, title, claim, author, context, description, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(evidenceId, side, title, claim, author, context, description, ipHash, now).run();
    for (const file of files) {
      const fileId = crypto.randomUUID();
      const objectKey = `evidence/${evidenceId}/${fileId}`;
      const type = clean(file.type || "application/octet-stream", 120) || "application/octet-stream";
      await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: type }, customMetadata: { originalName: encodeURIComponent(file.name), evidenceId } });
      saved.push(objectKey);
      await env.DB.prepare(`INSERT INTO evidence_file (id, evidence_id, object_key, original_name, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(fileId, evidenceId, objectKey, file.name, type, file.size, now).run();
    }
    return json({ id: evidenceId }, 201);
  } catch (error) {
    await Promise.all(saved.map(key => env.FILES.delete(key)));
    await env.DB.prepare("DELETE FROM evidence WHERE id = ?").bind(evidenceId).run();
    throw error;
  }
}

async function getFile(env, fileId) {
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return json({ error: "文件不存在。" }, 404);
  const file = await env.DB.prepare(`
    SELECT f.object_key, f.original_name, f.content_type, e.status
    FROM evidence_file f JOIN evidence e ON e.id = f.evidence_id
    WHERE f.id = ?`).bind(fileId).first();
  if (!file || file.status !== "published") return json({ error: "文件不存在。" }, 404);
  const object = await env.FILES.get(file.object_key);
  if (!object) return json({ error: "文件不存在。" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", file.content_type || "application/octet-stream");
  headers.set("content-disposition", `${safeInlineType(file.content_type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("cache-control", "public, max-age=3600");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

function safeInlineType(type) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type);
}

async function listRebuttals(env, evidenceId) {
  if (!/^[0-9a-f-]{36}$/.test(evidenceId)) return json({ error: "证据不存在。" }, 404);
  const { results } = await env.DB.prepare(`
    SELECT id, side, author, content, created_at
    FROM rebuttal
    WHERE evidence_id = ? AND status = 'published'
    ORDER BY created_at ASC`).bind(evidenceId).all();
  return json({ rebuttals: results.map(r => ({ id: r.id, side: r.side, author: r.author, content: r.content, createdAt: r.created_at })) });
}

async function createRebuttal(request, env, ip, evidenceId) {
  if (!/^[0-9a-f-]{36}$/.test(evidenceId)) return json({ error: "证据不存在。" }, 404);
  const evidence = await env.DB.prepare(`SELECT id, status FROM evidence WHERE id = ?`).bind(evidenceId).first();
  if (!evidence || evidence.status !== "published") return json({ error: "证据不存在。" }, 404);
  const body = await request.json();
  const side = clean(body.side, 3);
  const author = clean(body.author, 40);
  const content = clean(body.content, 2000);
  if (!['pro', 'con'].includes(side) || !author || !content) return json({ error: "请完整填写反驳信息。" }, 400);
  const ipHash = await hash(`${env.IP_SALT}:${ip}`);
  const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
  const quota = await env.DB.prepare(`
    SELECT COUNT(*) cnt FROM rebuttal
    WHERE ip_hash = ? AND created_at >= ?`).bind(ipHash, dayStart).first();
  if ((quota?.cnt || 0) >= Number(env.MAX_DAILY_SUBMISSIONS)) return json({ error: "今日反驳次数已达上限。" }, 429);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO rebuttal (id, evidence_id, side, author, content, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, evidenceId, side, author, content, ipHash, Date.now()).run();
  return json({ id }, 201);
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}
