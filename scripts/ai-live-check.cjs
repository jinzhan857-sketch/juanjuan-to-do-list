'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createLocalServer} = require('./ai-local.cjs');
const {createModelCheck} = require('./ai-simulation.cjs');
const {loadAIEnvironment} = require('./ai-config.cjs');
const root = path.join(__dirname, '..');
const endpoint = 'https://api.deepseek.com/chat/completions';
// Conservative peak prices, RMB per million tokens, verified 2026-11-15.
const prices = {input: 2, output: 8};
const limit = {calls: 3, budget_cny: 1};
const followupLimit = {calls: 10, budget_cny: 2};
const device_id = 'syntheticdevice0123456789abcd';
const cases = [
  {id: 'score', body: {title: '整理书桌并把纸质笔记归档', device_id, client_date: '2026-11-15'}, accepts: r => r.source === 'ai' && Number.isFinite(r.base_score) && r.base_score >= 0 && r.base_score <= 10},
  {id: 'task', body: {mode: 'agent', agent_role: 'task', message: '创建一条明天下午三点到四点复习课程的日程。', context: {}, device_id, client_date: '2026-11-15'}, accepts: r => r.type === 'proposal' && r.action?.kind === 'create_schedule' && r.action.item?.exec_date === '2026-11-16' && r.action.item?.start_time === '15:00' && r.action.item?.end_time === '16:00'},
  {id: 'chat', body: {mode: 'agent', agent_role: 'chat', message: '用一句简短的话向我问好，不要创建任何事务。', context: {}, device_id, client_date: '2026-11-15'}, accepts: r => r.type === 'chat' && typeof r.reply === 'string' && r.reply.length > 0 && !r.action},
];
const followupCases = [...cases,
  {id: 'planning', body: {mode: 'agent', agent_role: 'planning', message: '我今天只有30分钟，想整理课程笔记。请给一个简短步骤建议，不要创建事务。', context: {}, device_id, client_date: '2026-11-15'}, accepts: r => r.type === 'chat' && typeof r.reply === 'string' && r.reply.length > 0 && !r.action && Array.isArray(r.used_evidence) && r.used_evidence.length === 0},
];

function planRun(state, {followup = false, handlerHash}) {
  if (state.session !== 'issue81-initial-three-calls' || !Array.isArray(state.attempts) || !Array.isArray(state.cases) || !Number.isFinite(state.reserved_cny) || state.reserved_cny < 0) throw Error('Invalid budget record');
  if (!followup && (state.attempts.length || state.cases.length)) throw Error('This test session has already started; explicit approved followup is required');
  const limits = followup ? followupLimit : limit;
  const pending = (followup ? followupCases : cases).filter(scenario => !state.cases.some(result => result.id === scenario.id && result.passed && result.handler_sha256 === handlerHash));
  if (pending.length && (state.attempts.length >= limits.calls || state.reserved_cny >= limits.budget_cny)) throw Error('Test budget exhausted');
  return {limits, pending};
}

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
  if (args.some(arg => !['--check', '--approved-followup'].includes(arg))) throw Error('Unsupported arguments');
  const followup = args.includes('--approved-followup'), activeLimit = followup ? followupLimit : limit;
  const configuration = loadAIEnvironment();
  const key = String(process.env.DEEPSEEK_API_KEY || '').trim();
  const config = {...configuration, model: 'deepseek-v4-flash', quota: 'simulation', max_calls: activeLimit.calls, budget_cny: activeLimit.budget_cny};
  if (args.includes('--check')) { console.log(JSON.stringify(config)); return; }
  if (!key) throw Error('DEEPSEEK_API_KEY is missing');
  const dir = path.join(root, '.reports'); fs.mkdirSync(dir, {recursive: true});
  const ledger = path.join(dir, 'issue81-live-budget.json'), lock = ledger + '.lock';
  const fd = fs.openSync(lock, 'wx');
  try {
    const source = fs.readFileSync(path.join(root, 'api/ai.js'));
    const handlerHash = crypto.createHash('sha256').update(source).digest('hex');
    if (followup && !fs.existsSync(ledger)) throw Error('Approved followup requires the existing ledger');
    const state = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, 'utf8')) : {
      session: 'issue81-initial-three-calls', handler_sha256: handlerHash,
      model: config.model, quota: 'simulation', limits: limit, price_cny_per_million: prices,
      reserved_cny: 0, attempts: [], cases: [],
    };
    const {limits, pending} = planRun(state, {followup, handlerHash});
    const save = () => { fs.writeFileSync(ledger, JSON.stringify(state, null, 2) + '\n'); };
    if (followup) {
      state.followup_approval = {recorded_at: new Date().toISOString(), limits, scope: 'cumulative including the first failed attempt', reference: '展最新收尾授权，累计最多10次，总消耗上限2元'};
      save();
    }
    const setup = createModelCheck({key, request: createBudgetTransport({key, state, save, limits})});
    const server = createLocalServer({...setup, mode: 'live-model-test'});
    const runResults = [];
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const scenario of pending) {
        if (state.attempts.length >= limits.calls) break;
        const started = performance.now();
        const response = await fetch(base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...scenario.body, request_id: crypto.randomBytes(16).toString('hex')})});
        const result = await response.json();
        const passed = response.ok && scenario.accepts(result);
        const record = {id: scenario.id, handler_sha256: handlerHash, attempt_number: state.attempts.length, status: response.status, passed, elapsed_ms: Math.round(performance.now() - started),
          result: {type: result.type || null, kind: result.action?.kind || null, base_score: result.base_score ?? null,
            exec_date: result.action?.item?.exec_date || null, start_time: result.action?.item?.start_time || null, end_time: result.action?.item?.end_time || null}};
        state.cases.push(record); runResults.push(record);
        save();
        if (!passed) break;
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    console.log(JSON.stringify({completed: runResults.length, passed: runResults.filter(c => c.passed).length,
      real_model_calls: state.attempts.length, quota: state.quota, reserved_cny: state.reserved_cny,
      estimated_cny_at_peak: state.attempts.reduce((total, attempt) => total + (attempt.estimated_cny_at_peak || 0), 0),
      unverified: pending.filter(scenario => !runResults.some(result => result.id === scenario.id && result.passed)).map(scenario => scenario.id),
      report: '.reports/issue81-live-budget.json', note: '金额为公开高峰价估算与保守预留，不是供应商扣费硬封顶。'}));
    if (runResults.length !== pending.length || runResults.some(c => !c.passed)) process.exitCode = 1;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
if (require.main === module) run().catch(() => { console.error('真实测试未完成或尚未开始，请由Codex检查配置、预算记录或失败阶段；没有自动重试，未输出密钥。'); process.exitCode = 1; });
module.exports = {reservation, createBudgetTransport, planRun, limit, followupLimit, prices};
