'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {createLocalServer, configuration, maxBodyBytes} = require('./ai-local.cjs');
const {createSimulation} = require('./ai-simulation.cjs');
const root = path.join(__dirname, '..');
const device = 'syntheticdevice0123456789abcd';
const scoreBody = {title: '合成测试：整理书桌', device_id: device, client_date: '2026-11-15'};

async function fixture(t, options = {}) {
  const simulation = createSimulation(options), events = [];
  const server = createLocalServer({...simulation, mode: 'simulation', onResult: event => events.push(event)});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, extra = {}) => fetch(base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json', ...extra}, body: JSON.stringify(body)});
  return {server, simulation, events, base, post};
}

test('health reports simulation and source without calling either dependency', async t => {
  const a = await fixture(t), response = await fetch(a.base + '/api/health'), body = await response.json();
  assert.equal(body.mode, 'simulation'); assert.equal(body.ready, true);
  assert.match(body.handler_sha256, /^[a-f0-9]{64}$/);
  assert.equal(response.headers.get('x-juanjuan-ai-mode'), 'simulation');
  assert.deepEqual(a.simulation.inspect(), {modelCalls: 0, quotaCalls: 0});
  assert.equal(a.server.address().address, '127.0.0.1');
});
test('HTTP scoring invokes unchanged production parsing and synthetic quota storage', async t => {
  const a = await fixture(t), response = await a.post(scoreBody), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.base_score, 6); assert.equal(body.source, 'ai');
  assert.equal(a.simulation.inspect().modelCalls, 1); assert.ok(a.simulation.inspect().quotaCalls > 0);
  assert.match(body.note, /模拟/);
  assert.equal(a.events.length, 1); assert.equal(a.events[0].status, 200);
  assert.equal('input' in a.events[0], false); assert.equal('key' in a.events[0], false);
});
for (const role of ['task', 'planning', 'chat']) test('HTTP assistant request uses the handler: ' + role, async t => {
  const a = await fixture(t), response = await a.post({mode: 'agent', agent_role: role, message: '合成问候', context: {}, device_id: device});
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.type, 'chat'); assert.match(body.reply, /模拟回复/);
});
for (const body of [{...scoreBody, title: ''}, {...scoreBody, device_id: 'invalid'}]) test('invalid business input never reaches the model: ' + JSON.stringify(body), async t => {
  const a = await fixture(t), response = await a.post(body);
  assert.equal(response.status, 400); assert.equal(a.simulation.inspect().modelCalls, 0);
});
test('existing daily device quota blocks request 21 and keeps owner stats protected', async t => {
  const a = await fixture(t);
  for (let i = 0; i < 20; i++) { const response = await a.post(scoreBody); assert.equal(response.status, 200); await response.text(); }
  assert.equal((await a.post(scoreBody)).status, 429);
  assert.equal(a.simulation.inspect().modelCalls, 20);
  assert.equal((await fetch(a.base + '/api/ai?stats=1')).status, 401);
  const response = await fetch(a.base + '/api/ai?stats=1&date=2026-11-15', {headers: {'x-owner-token': a.simulation.env.OWNER_STATS_TOKEN}});
  const body = await response.json(); assert.equal(response.status, 200);
  assert.equal(body.calls, 20); assert.equal(body.blocked, 1); assert.equal(body.active_devices, 1);
});
for (const failure of ['modelFailure', 'quotaFailure']) test('dependency failure returns service error: ' + failure, async t => {
  const a = await fixture(t, {[failure]: true}), response = await a.post(scoreBody);
  assert.equal(response.status, 503); assert.match((await response.json()).error, /不可用/);
  assert.equal(a.simulation.inspect().modelCalls, failure === 'modelFailure' ? 1 : 0);
});
for (const route of ['/.env', '/.env.example', '/api/ai.js', '/index.html', '/private/example.json', '/../.env', '/%2e%2e/.env']) test('server exposes no project file: ' + route, async t => {
  const a = await fixture(t), response = await fetch(a.base + route);
  assert.equal(response.status, 404); assert.equal(a.simulation.inspect().modelCalls, 0);
});
test('foreign Origin, preflight and non-JSON requests cannot initiate a model call', async t => {
  const a = await fixture(t);
  assert.equal((await a.post(scoreBody, {Origin: 'https://foreign.invalid'})).status, 403);
  assert.equal((await fetch(a.base + '/api/ai', {method: 'OPTIONS'})).status, 405);
  assert.equal((await fetch(a.base + '/api/ai', {method: 'POST', body: JSON.stringify(scoreBody)})).status, 415);
  assert.equal(a.simulation.inspect().modelCalls, 0);
});
test('foreign Host is rejected even without Origin', async t => {
  const a = await fixture(t);
  const status = await new Promise((resolve, reject) => {
    const req = http.request(a.base + '/api/health', {headers: {Host: 'foreign.invalid'}}, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});
for (const body of ['broken JSON', '[]', 'null', '"text"']) test('invalid JSON request is rejected without echoing content: ' + body, async t => {
  const a = await fixture(t), response = await fetch(a.base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
  assert.equal(response.status, 400); assert.equal(a.simulation.inspect().modelCalls, 0);
  assert.doesNotMatch(await response.text(), /broken JSON/);
});
test('oversized request is rejected before reaching dependencies', async t => {
  const a = await fixture(t), response = await a.post({...scoreBody, context: 'x'.repeat(maxBodyBytes)});
  assert.equal(response.status, 413); assert.deepEqual(a.simulation.inspect(), {modelCalls: 0, quotaCalls: 0});
});
test('live missing configuration blocks requests without invoking handler', async t => {
  let calls = 0;
  const server = createLocalServer({mode: 'live', handler: () => { calls++; }, env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.ready, false);
  const response = await fetch(base + '/api/ai', {method: 'POST'});
  assert.equal(response.status, 503); assert.equal(calls, 0);
  assert.ok((await response.json()).missing.includes('DEEPSEEK_API_KEY'));
});
test('configuration checks only names and never return secret values', () => {
  const env = {...createSimulation().env, KV_REST_API_URL: 'http://secret-value.invalid'};
  assert.deepEqual(configuration(env), {ready: false, missing: [], invalid: ['KV_REST_API_URL']});
  assert.doesNotMatch(JSON.stringify(configuration(env)), /secret-value/);
});
test('unexpected handler exceptions never echo secrets and the server remains usable', async t => {
  const env = createSimulation().env;
  const server = createLocalServer({mode: 'live', env, handler: () => { throw Error('secret-from-provider'); }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
  assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /secret-from-provider/);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});
test('simulation instances have separate counters and never fall through to real fetch', async t => {
  const before = globalThis.fetch;
  const a = await fixture(t), b = await fixture(t);
  await a.post(scoreBody);
  assert.equal(a.simulation.inspect().modelCalls, 1); assert.equal(b.simulation.inspect().modelCalls, 0);
  assert.equal(globalThis.fetch, before);
});

async function cli(t, live) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'juanjuan-ai81-'));
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(dir, 'api'));
  for (const name of ['ai-local.cjs', 'ai-simulation.cjs', 'ai-config.cjs']) fs.copyFileSync(path.join(__dirname, name), path.join(dir, 'scripts', name));
  if (!live) fs.writeFileSync(path.join(dir, 'scripts/ai-config.cjs'), "module.exports={loadAIEnvironment(){throw Error('Simulation attempted private configuration')}};");
  const secret = 'synthetic-env-value-never-print';
  if (live) fs.writeFileSync(path.join(dir, 'api/ai.js'), `module.exports=(req,res)=>res.status(200).json({loaded:process.env.DEEPSEEK_API_KEY===${JSON.stringify(secret)}});`);
  else fs.copyFileSync(path.join(root, 'api/ai.js'), path.join(dir, 'api/ai.js'));
  fs.writeFileSync(path.join(dir, '.env'), Object.entries({...createSimulation().env, DEEPSEEK_API_KEY: secret}).map(([k,v]) => `${k}=${v}`).join('\n'));
  const env = {...process.env, AI_LOCAL_PORT: '0'};
  for (const key of ['DEEPSEEK_API_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'RATE_LIMIT_SALT', 'OWNER_STATS_TOKEN']) delete env[key];
  const child = spawn(process.execPath, ['scripts/ai-local.cjs', ...(live ? ['--live'] : [])], {cwd: dir, env, windowsHide: true});
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    assert.ok(dir.startsWith(path.join(os.tmpdir(), 'juanjuan-ai81-')));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('CLI startup timeout')), 5000);
    const onData = () => { const m = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timeout); child.stdout.off('data', onData); resolve(m[0]); } };
    child.stdout.on('data', onData); onData();
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(Error('CLI exited: ' + code)); });
  });
  return {base, output: () => output + errors, secret};
}
test('standalone simulation works with a private .env present and does not load it', async t => {
  const a = await cli(t, false), response = await fetch(a.base + '/api/health');
  assert.equal((await response.json()).mode, 'simulation');
  assert.doesNotMatch(a.output(), new RegExp(a.secret));
});
test('explicit live entry loads .env into a synthetic handler without external calls', async t => {
  const a = await cli(t, true), health = await (await fetch(a.base + '/api/health')).json();
  assert.equal(health.ready, true); assert.equal(health.mode, 'live');
  const response = await fetch(a.base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(scoreBody)});
  assert.equal((await response.json()).loaded, true);
  assert.doesNotMatch(a.output(), new RegExp(a.secret));
});
