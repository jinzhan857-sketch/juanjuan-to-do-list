'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadAIEnvironment} = require('./ai-config.cjs');
const {createBudgetTransport} = require('./ai-live-check.cjs');
const {createModelCheck} = require('./ai-simulation.cjs');
const {createLocalServer} = require('./ai-local.cjs');
const {checkScheduleLifecycle} = require('./ai-action-check.cjs');
const root = path.join(__dirname, '..');
const limits = {calls: 10, budget_cny: 2};
const device_id = 'syntheticdevice0123456789abcd', client_date = '2026-11-15';
const agent = (role, message, context = {}) => ({mode: 'agent', agent_role: role, message, context, device_id, client_date});
const cases = [
  {id: 'closure-score', body: {title: '整理书桌并把纸质笔记归档。', device_id, client_date}, expected: '明确标题、日常生活分类、非模糊评分，基础分在0至10之间。',
    accepts: r => r.source === 'ai' && /整理书桌/.test(r.task) && r.category === '日常生活' && r.vague === false && Number.isFinite(r.base_score) && r.base_score >= 0 && r.base_score <= 10},
  {id: 'closure-schedule', body: agent('task', '创建一条明天下午三点到四点复习课程的日程。'), expected: '返回待确认的新建日程，2026年11月16日15:00至16:00；确认前不创建，确认后持久保存且能撤销。',
    accepts: r => r.type === 'proposal' && r.action?.kind === 'create_schedule' && /复习/.test(r.action.item?.title) && r.action.item?.exec_date === '2026-11-16' && r.action.item?.start_time === '15:00' && r.action.item?.end_time === '16:00'},
  {id: 'closure-clarify', body: agent('task', '帮我安排一次复习。'), expected: '询问缺少的执行日期或时间，不擅自创建事务。',
    accepts: r => r.type === 'clarify' && typeof r.reply === 'string' && r.reply.length > 0 && !r.action},
  {id: 'closure-chat-boundary', body: agent('chat', '帮我创建明天下午三点的日程。'), expected: '聊天模式提醒交给事务模式处理，无可执行动作。',
    accepts: r => ['chat', 'clarify'].includes(r.type) && /事务/.test(r.reply) && !r.action && !r.recommendations},
  {id: 'closure-planning', body: agent('planning', '请根据提供的线性代数课记录，建议明天课后用30分钟复习的步骤，只讨论，不创建日程。请标出你参考的记录。', {
    tasks: [{id: 'course-demo', title: '线性代数课', exec_date: '2026-11-16', time_type: 'exact', start_time: '10:00', end_time: '11:00', category: '学业事务'}],
    planning: {date_from: '2026-11-16', date_to: '2026-11-16', schedule_count: 1, schedule_examples: ['2026年11月16日10:00至11:00，线性代数课'], insights: {conflict_count: 0, unscheduled_count: 0}},
  }), expected: '提供课后30分钟复习建议，引用course-demo合成课程记录，无编造资料编号，不直接创建事务。',
    accepts: r => r.type === 'chat' && typeof r.reply === 'string' && r.reply.length > 0 && !r.action && Array.isArray(r.used_evidence) && r.used_evidence.some(e => e.kind === 'schedule' && e.id === 'course-demo') && r.used_evidence.every(e => (e.kind === 'schedule' && e.id === 'course-demo') || (e.kind === 'insight' && ['conflict_count', 'unscheduled_count'].includes(e.id)))},
];

function validateSession(state, {reviewedRetest = false} = {}) {
  if (state.session !== 'issue81-initial-three-calls' || !Array.isArray(state.attempts) || !Array.isArray(state.cases) || !Number.isFinite(state.reserved_cny) || state.reserved_cny < 0) throw Error('Invalid existing test ledger');
  if (reviewedRetest) {
    const failed = state.cases.at(-1), scenario = cases.find(item => item.id === failed?.id);
    if (!state.acceptance_approval || !scenario || failed.passed || state.attempts.length >= limits.calls || state.reserved_cny >= limits.budget_cny) throw Error('Reviewed retest has no failed case or available budget');
    return [scenario];
  }
  if (state.acceptance_approval || state.attempts.length + cases.length > limits.calls || state.reserved_cny >= limits.budget_cny) throw Error('Review the existing acceptance or exhausted budget before any more calls');
  return cases;
}

async function run(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--approved-closure', '--reviewed-retest'].includes(args[0])) throw Error('Closure testing requires the explicit approved invocation');
  const reviewedRetest = args[0] === '--reviewed-retest';
  loadAIEnvironment(); const key = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!key) throw Error('Model configuration missing');
  const ledger = path.join(root, '.reports/issue81-live-budget.json'), lock = ledger + '.lock';
  const transcriptFile = path.join(root, '.reports/issue81-acceptance-answers.json');
  const fd = fs.openSync(lock, 'wx');
  try {
    const state = JSON.parse(fs.readFileSync(ledger, 'utf8')), selected = validateSession(state, {reviewedRetest});
    const handlerHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'api/ai.js'))).digest('hex');
    const transcript = reviewedRetest ? JSON.parse(fs.readFileSync(transcriptFile, 'utf8')) : {handler_sha256: handlerHash, app_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'index.html'))).digest('hex'),
      limits, quota: 'simulation', model: 'deepseek-v4-flash', cases: []};
    const save = () => fs.writeFileSync(ledger, JSON.stringify(state, null, 2) + '\n');
    if (reviewedRetest) transcript.reviewed_retest = {handler_sha256: handlerHash, recorded_at: new Date().toISOString(), reason: 'Reviewed the stopped failure and strengthened the existing chat-role prompt within the approved cumulative budget'};
    else state.acceptance_approval = {recorded_at: new Date().toISOString(), limits, scope: 'cumulative including previous five attempts', reference: '展要求收尾复查、展示测试题及真实回答，累计最多10次，总消耗上限2元'};
    save();
    const bounded = createBudgetTransport({key, state, save, limits});
    let answer = null;
    const setup = createModelCheck({key, request: async (url, options) => {
      const response = await bounded(url, options);
      if (response.ok) {
        const output = await response.clone().json();
        const content = output.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          if (content.includes(key)) throw Error('Sensitive model response blocked');
          answer = content; // Explicitly requested final answers for these fixed synthetic cases only.
        }
      }
      return response;
    }});
    const server = createLocalServer({...setup, mode: 'live-model-test'});
    const runResults = [];
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const scenario of selected) {
        answer = null; const started = performance.now();
        const record = {id: scenario.id, handler_sha256: handlerHash, question: scenario.body.title || scenario.body.message, context: scenario.body.context || null, expected: scenario.expected};
        try {
          const response = await fetch(base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(scenario.body), signal: AbortSignal.timeout(30000)});
          const result = await response.json();
          if (JSON.stringify(result).includes(key)) throw Error('Sensitive result blocked');
          Object.assign(record, {status: response.status, passed: response.ok && scenario.accepts(result), model_answer: answer, result});
          if (record.passed && scenario.id === 'closure-schedule') record.business = await checkScheduleLifecycle(result, scenario.body.message);
        } catch {
          Object.assign(record, {passed: false, model_answer: answer, error: 'Acceptance request or isolated application check failed; no retry'});
        }
        record.elapsed_ms = Math.round(performance.now() - started); record.attempt_number = state.attempts.length;
        transcript.cases.push(record); runResults.push(record);
        state.cases.push({id: record.id, handler_sha256: handlerHash, attempt_number: record.attempt_number, status: record.status || null, passed: record.passed});
        save(); fs.writeFileSync(transcriptFile, JSON.stringify(transcript, null, 2) + '\n');
        console.log(JSON.stringify({id: record.id, passed: record.passed, real_model_calls: state.attempts.length}));
        if (!record.passed) break;
      }
    } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
    const summary = {completed: runResults.length, passed: runResults.filter(c => c.passed).length, real_model_calls: state.attempts.length,
      estimated_cny_at_peak: state.attempts.reduce((n, a) => n + (a.estimated_cny_at_peak || 0), 0), reserved_cny: state.reserved_cny, transcript: '.reports/issue81-acceptance-answers.json'};
    console.log(JSON.stringify(summary));
    if (summary.completed !== selected.length || summary.passed !== selected.length) process.exitCode = 1;
  } finally {fs.closeSync(fd); fs.unlinkSync(lock);}
}
if (require.main === module) run().catch(() => {console.error('Closure test did not complete; review the preserved ledger. No automatic retry or secret output.'); process.exitCode = 1;});
module.exports = {cases, limits, validateSession};
