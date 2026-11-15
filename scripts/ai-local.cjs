'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const requiredNames = ['DEEPSEEK_API_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'RATE_LIMIT_SALT', 'OWNER_STATS_TOKEN'];
const root = path.join(__dirname, '..');
const maxBodyBytes = 128 * 1024;

function configuration(env) {
  const missing = requiredNames.filter(name => !String(env[name] || '').trim());
  const invalid = [];
  if (env.KV_REST_API_URL) {
    try { if (new URL(env.KV_REST_API_URL).protocol !== 'https:') invalid.push('KV_REST_API_URL'); }
    catch { invalid.push('KV_REST_API_URL'); }
  }
  return {ready: missing.length === 0 && invalid.length === 0, missing, invalid};
}

function createLocalServer({handler, mode, env = {}, onResult = () => {}}) {
  if (!['simulation', 'live', 'live-model-test'].includes(mode) || typeof handler !== 'function') throw Error('Invalid local server setup');
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'api/ai.js'))).digest('hex');
  const server = http.createServer(async (req, res) => {
    const started = performance.now(), requestId = crypto.randomUUID();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Juanjuan-AI-Mode', mode);
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    res.once('finish', () => onResult({request_id: requestId, mode, status: res.statusCode,
      duration_ms: Math.round(performance.now() - started), handler_sha256: sourceHash}));
    const authority = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== `http://${authority}`)) {
      send(403, {error: '仅接受本机同源请求'}); return;
    }
    let url;
    try { url = new URL(req.url, `http://${authority}`); }
    catch { send(400, {error: '请求地址不合法'}); return; }
    if (url.pathname === '/api/health' && req.method === 'GET') {
      send(200, {mode, ...configuration(env), handler_sha256: sourceHash,
        note: mode === 'simulation' ? '模型与额度均为合成模拟，不访问外网，不验证真实模型或Redis。' : mode === 'live-model-test' ? '真实模型测试，额度存储为合成模拟，不验证真实Redis。' : '仅检查配置是否填写，不证明远程服务可用。'}); return;
    }
    if (url.pathname !== '/api/ai') { send(404, {error: '入口不存在'}); return; }
    if (!['POST', 'GET'].includes(req.method) || (req.method === 'GET' && url.searchParams.get('stats') !== '1')) {
      res.setHeader('Allow', 'POST, GET'); send(405, {error: '请求方式不支持'}); return;
    }
    const config = configuration(env);
    if (!config.ready) { send(503, {error: '本地配置未完成', missing: config.missing, invalid: config.invalid}); return; }
    try {
      if (req.method === 'POST') {
        if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          send(415, {error: '仅接受JSON请求'}); return;
        }
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBodyBytes) { send(413, {error: '请求内容过大'}); req.resume(); return; }
          chunks.push(chunk);
        }
        try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { send(400, {error: 'JSON格式不合法'}); return; }
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) { send(400, {error: '请求须为JSON对象'}); return; }
      }
      req.query = Object.fromEntries(url.searchParams);
      // This server has no upstream proxy. Do not trust client-supplied proxy headers.
      delete req.headers['x-forwarded-for'];
      res.status = status => { res.statusCode = status; return res; };
      res.json = body => res.end(JSON.stringify(body));
      await handler(req, res);
      if (!res.writableEnded) send(500, {error: '本地接口未返回结果'});
    } catch {
      if (!res.writableEnded && !res.destroyed) send(500, {error: '本地请求处理失败'});
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  return server;
}

async function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--live')) throw Error('只支持默认模拟模式或显式 --live');
  const live = args.includes('--live');
  if (live) {
    try { process.loadEnvFile(path.join(root, '.env')); }
    catch (error) { if (error.code !== 'ENOENT') throw Error('.env读取失败，请在本机检查文件格式'); }
  }
  const setup = live ? {handler: require('../api/ai.js'), env: process.env}
    : require('./ai-simulation.cjs').createSimulation();
  const mode = live ? 'live' : 'simulation';
  const rawPort = process.env.AI_LOCAL_PORT || '4177';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) throw Error('AI_LOCAL_PORT须为0至65535的整数，0自动选择空闲端口');
  const server = createLocalServer({...setup, mode, onResult: event => console.log(JSON.stringify(event))});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(rawPort), '127.0.0.1', resolve); });
  console.log(`Local AI: http://127.0.0.1:${server.address().port}/api/health`);
  console.log(live ? '真实连接模式，POST可能产生模型费用；请先确认预算。' : '模拟模式：不读.env，不访问真实模型或Redis，不产生模型费用。');
  const stop = () => { server.close(); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return server;
}
if (require.main === module) main().catch(() => { console.error('Local AI启动失败，请检查端口、配置及启动参数；未输出配置值。'); process.exitCode = 1; });
module.exports = {createLocalServer, configuration, maxBodyBytes};
