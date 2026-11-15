'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createLocalServer} = require('./ai-local.cjs');
const {createModelCheck} = require('./ai-simulation.cjs');
const root = path.join(__dirname, '..');
const endpoint = 'https://api.deepseek.com/chat/completions';
// Conservative peak prices, RMB per million tokens, verified 2026-11-15.
const prices = {input: 2, output: 8};
const limit = {calls: 3, budget_cny: 1};
const device_id = 'syntheticdevice0123456789abcd';
const cases = [
  {id: 'score', body: {title: '整理书桌并把纸质笔记归档', device_id, client_date: '2026-11-15'}, accepts: r => r.source === 'ai' && Number.isFinite(r.base_score) && r.base_score >= 0 && r.base_score <= 10},
  {id: 'task', body: {mode: 'agent', agent_role: 'task', message: '创建一条明天下午三点到四点复习课程的日程。', context: {}, device_id, client_date: '2026-11-15'}, accepts: r => r.type === 'proposal' && r.action?.kind === 'create_schedule' && r.action.item?.exec_date === '2026-11-16' && r.action.item?.start_time === '15:00' && r.action.item?.end_time === '16:00'},
  {id: 'chat', body: {mode: 'agent', agent_role: 'chat', message: '用一句简短的话向我问好，不要创建任何事务。', context: {}, device_id, client_date: '2026-11-15'}, accepts: r => r.type === 'chat' && typeof r.reply === 'string' && r.reply.length > 0 && !r.action},
];

function reservation(body) {
  if (!['deepseek-v4-flash', 'deepseek-flash'].includes(body.model) || ![300, 900].includes(body.max_tokens) || body.stream !== false || !Array.isArray(body.messages) || body.messages.length !== 2) throw Error('Unexpected model request');
  const bytes = Buffer.byteLength(JSON.stringify(body.messages));
  if (bytes > 40000) throw Error('Input budget exceeded');
  return ((bytes + 2048) * prices.input + body.max_tokens * prices.output) / 1e6;
}

function createBudgetTransport({key, state, save, transport = fetch, limits = limit}) {
  return async (url, options) => {
    if (String(url) !== endpoint || options.method !== 'POST' || options.headers?.Authorization !== `Bearer ${key}`) throw Error('Unexpected destination or authorization');
    const cost = reservation(JSON.parse(options.body));
    if (state.attempts.length >= limits.calls || state.reserved_cny + cost > limits.budget_cny) throw Error('Test budget exhausted');
    const entry = {number: state.attempts.length + 1, status: 'reserved', reserved_cny: cost, started_at: new Date().toISOString()};
    state.attempts.push(entry); state.reserved_cny += cost;
    // Persist before sending. Failures and unknown billing never refund the reservation.
    save();
    try {
      const response = await transport(endpoint, {...options, redirect: 'error'});
      entry.http_status = response.status;
      if (response.ok) {
        const payload = await response.clone().json(), usage = payload.usage;
        const choice = payload.choices?.[0], message = choice?.message;
        entry.response_shape = {
          finish_reason: ['stop', 'length', 'tool_calls', 'content_filter', 'insufficient_system_resource'].includes(choice?.finish_reason) ? choice.finish_reason : 'other',
          content_chars: typeof message?.content === 'string' ? message.content.length : 0,
          reasoning_chars: typeof message?.reasoning_content === 'string' ? message.reasoning_content.length : 0,
        };
        if (Number.isFinite(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isFinite(usage?.completion_tokens) && usage.completion_tokens >= 0) {
          entry.usage = {input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens};
          entry.estimated_cny_at_peak = (usage.prompt_tokens * prices.input + usage.completion_tokens * prices.output) / 1e6;
          if (entry.estimated_cny_at_peak > entry.reserved_cny) {
            state.reserved_cny += entry.estimated_cny_at_peak - entry.reserved_cny;
            entry.status = 'usage_exceeded_reservation'; save();
            throw Error('Reported usage exceeded reservation');
          }
        }
      }
      entry.status = 'response'; save(); return response;
    } catch {
      entry.status = 'failed_or_unknown'; save(); throw Error('Model request failed; no automatic retry');
    }
  };
}

async function run(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--check')) throw Error('Unsupported arguments');
  try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw Error('Cannot load local configuration'); }
  const key = String(process.env.DEEPSEEK_API_KEY || '').trim();
  const config = {key_configured: !!key, model: 'deepseek-v4-flash', quota: 'simulation', max_calls: limit.calls, budget_cny: limit.budget_cny};
  if (args.includes('--check')) { console.log(JSON.stringify(config)); return; }
  if (!key) throw Error('DEEPSEEK_API_KEY is missing');
  const dir = path.join(root, '.reports'); fs.mkdirSync(dir, {recursive: true});
  const ledger = path.join(dir, 'issue81-live-budget.json'), lock = ledger + '.lock';
  const fd = fs.openSync(lock, 'wx');
  try {
    const source = fs.readFileSync(path.join(root, 'api/ai.js'));
    const state = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, 'utf8')) : {
      session: 'issue81-initial-three-calls', handler_sha256: crypto.createHash('sha256').update(source).digest('hex'),
      model: config.model, quota: 'simulation', limits: limit, price_cny_per_million: prices,
      reserved_cny: 0, attempts: [], cases: [],
    };
    if (state.session !== 'issue81-initial-three-calls' || !Array.isArray(state.attempts) || !Array.isArray(state.cases) || !Number.isFinite(state.reserved_cny) || state.reserved_cny < 0) throw Error('Invalid budget record');
    if (state.attempts.length >= limit.calls || state.cases.length) throw Error('This test session has already started; review results before authorizing more calls');
    const save = () => { fs.writeFileSync(ledger, JSON.stringify(state, null, 2) + '\n'); };
    const setup = createModelCheck({key, request: createBudgetTransport({key, state, save})});
    const server = createLocalServer({...setup, mode: 'live-model-test'});
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const scenario of cases) {
        const started = performance.now();
        const response = await fetch(base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(scenario.body)});
        const result = await response.json();
        const passed = response.ok && scenario.accepts(result);
        state.cases.push({id: scenario.id, status: response.status, passed, elapsed_ms: Math.round(performance.now() - started),
          result: {type: result.type || null, kind: result.action?.kind || null, base_score: result.base_score ?? null,
            exec_date: result.action?.item?.exec_date || null, start_time: result.action?.item?.start_time || null, end_time: result.action?.item?.end_time || null}});
        save();
        if (!passed) break;
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    console.log(JSON.stringify({completed: state.cases.length, passed: state.cases.filter(c => c.passed).length,
      real_model_calls: state.attempts.length, quota: state.quota, reserved_cny: state.reserved_cny,
      report: '.reports/issue81-live-budget.json', note: '金额为公开高峰价估算与保守预留，不是供应商扣费硬封顶。'}));
    if (state.cases.length !== cases.length || state.cases.some(c => !c.passed)) process.exitCode = 1;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
if (require.main === module) run().catch(() => { console.error('真实测试未完成或尚未开始，请由Codex检查配置、预算记录或失败阶段；没有自动重试，未输出密钥。'); process.exitCode = 1; });
module.exports = {reservation, createBudgetTransport, limit, prices};
