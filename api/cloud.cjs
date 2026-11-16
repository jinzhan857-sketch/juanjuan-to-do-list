'use strict';
const publicOrigin = 'https://jinzhan857-sketch.github.io';
const maxBodyBytes = 1024 * 1024;

// Vercel owns the outer request boundary. Local adapters keep their own boundary.
function prepare(req, res, env = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
  const origins = (env.AI_ALLOWED_ORIGINS || publicOrigin).split(',');
  const origin = req.headers.origin;
  if (origin && !origins.includes(origin)) {
    res.status(403).json({error: '此页面未获准使用云端AI', code: 'origin_denied'});
    return true;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') {
    const method = req.headers['access-control-request-method'];
    const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (!['GET', 'POST'].includes(method) || headers.some(h => !['content-type', 'x-owner-token'].includes(h))) {
      res.status(403).json({error: '预检请求不支持'}); return true;
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Owner-Token');
    res.status(204).end(); return true;
  }
  if (req.method === 'GET' && req.query?.health === '1') {
    res.status(200).json({service: 'juanjuan-ai', version: require('../package.json').version,
      source_commit: /^[a-f0-9]{40}$/.test(env.AI_SOURCE_COMMIT || '') ? env.AI_SOURCE_COMMIT : null,
      enabled: env.AI_ENABLED === '1', capabilities: ['chat', 'score', 'search', 'link'], images: false});
    return true;
  }
  if (req.method === 'POST') {
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      res.status(415).json({error: '仅接受JSON请求'}); return true;
    }
    if (Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})) > maxBodyBytes) {
      res.status(413).json({error: '本次资料过多，请缩小范围后重试', code: 'payload_too_large'}); return true;
    }
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { res.status(400).json({error: 'JSON格式不合法'}); return true; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({error: '请求须为JSON对象'}); return true;
    }
    // Refunds remain available after shutdown; they never call a provider.
    if (body.mode !== 'cancel' && env.AI_ENABLED !== '1') {
      res.status(503).json({error: '云端AI暂时关闭，请稍后再试或使用自配接口', code: 'service_disabled'}); return true;
    }
  }
  return false;
}
module.exports = {prepare, maxBodyBytes};
