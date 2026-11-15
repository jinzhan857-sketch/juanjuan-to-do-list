'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createBudgetTransport, reservation, planRun, limit, followupLimit} = require('./ai-live-check.cjs');
const {createModelCheck, createSimulation} = require('./ai-simulation.cjs');
const {createLocalServer} = require('./ai-local.cjs');
const endpoint = 'https://api.deepseek.com/chat/completions', key = 'synthetic-only-key';
const payload = {model: 'deepseek-v4-flash', max_tokens: 300, stream: false, messages: [{role: 'system', content: '合成测试'}, {role: 'user', content: '问好'}]};
const options = () => ({method: 'POST', headers: {Authorization: `Bearer ${key}`}, body: JSON.stringify(payload)});
function budget(transport, limits = limit) {
  const state = {attempts: [], reserved_cny: 0};
  let saved = 0;
  const request = createBudgetTransport({key, state, save: () => { saved++; }, transport, limits});
  return {request, state, saves: () => saved};
}
test('reservation uses input byte bound and capped output at conservative peak prices', () => {
  assert.equal(reservation(payload), ((Buffer.byteLength(JSON.stringify(payload.messages)) + 2048) * 2 + 300 * 8) / 1e6);
});
test('three model attempts are reserved before transport; fourth is blocked', async () => {
  let calls = 0;
  const a = budget(async (url, opts) => { calls++; assert.equal(a.state.attempts.length, calls); assert.ok(a.saves() >= calls); assert.equal(opts.redirect, 'error'); return new Response('{}'); });
  for (let i = 0; i < 3; i++) await a.request(endpoint, options());
  await assert.rejects(a.request(endpoint, options()), /budget/);
  assert.equal(calls, 3); assert.equal(a.state.attempts.length, 3);
});
test('simultaneous attempts share one counter and cannot race past the limit', async () => {
  let calls = 0;
  const a = budget(async () => { calls++; await new Promise(setImmediate); return new Response('{}'); });
  const results = await Promise.allSettled(Array.from({length: 6}, () => a.request(endpoint, options())));
  assert.equal(calls, 3); assert.equal(results.filter(r => r.status === 'rejected').length, 3);
});
test('insufficient money reservation blocks the request before transport', async () => {
  let calls = 0;
  const a = budget(async () => { calls++; }, {calls: 3, budget_cny: 0.00001});
  await assert.rejects(a.request(endpoint, options())); assert.equal(calls, 0); assert.equal(a.state.attempts.length, 0);
});
test('transport failure is counted and never automatically retried or refunded', async () => {
  let calls = 0;
  const a = budget(async () => { calls++; throw Error('contains-secret-from-transport'); });
  await assert.rejects(a.request(endpoint, options()), /no automatic retry/);
  assert.equal(calls, 1); assert.equal(a.state.attempts[0].status, 'failed_or_unknown'); assert.ok(a.state.reserved_cny > 0);
  assert.doesNotMatch(JSON.stringify(a.state), /contains-secret/);
});
test('failed durable reservation prevents any outgoing request', async () => {
  let calls = 0;
  const request = createBudgetTransport({key, state: {attempts: [], reserved_cny: 0}, save: () => { throw Error('disk failure'); }, transport: async () => { calls++; }});
  await assert.rejects(request(endpoint, options())); assert.equal(calls, 0);
});
test('actual token counts are recorded without storing model text or credentials', async () => {
  const a = budget(async () => new Response(JSON.stringify({usage: {prompt_tokens: 100, completion_tokens: 20}, choices: [{message: {content: key}}]})));
  await a.request(endpoint, options());
  assert.deepEqual(a.state.attempts[0].usage, {input_tokens: 100, output_tokens: 20});
  assert.equal(a.state.attempts[0].estimated_cny_at_peak, 0.00036);
  assert.doesNotMatch(JSON.stringify(a.state), new RegExp(key));
});

test('truncated thinking output records only its shape and not sensitive text', async () => {
  const a = budget(async () => new Response(JSON.stringify({choices: [{finish_reason: 'length', message: {content: '', reasoning_content: key}}]})));
  await a.request(endpoint, options());
  assert.deepEqual(a.state.attempts[0].response_shape, {finish_reason: 'length', content_chars: 0, reasoning_chars: key.length});
  assert.doesNotMatch(JSON.stringify(a.state), new RegExp(key));
});

test('unknown response metadata cannot write arbitrary provider text to the ledger', async () => {
  const a = budget(async () => new Response(JSON.stringify({choices: [{finish_reason: key, message: {content: key}}]})));
  await a.request(endpoint, options());
  assert.deepEqual(a.state.attempts[0].response_shape, {finish_reason: 'other', content_chars: key.length, reasoning_chars: 0});
  assert.doesNotMatch(JSON.stringify(a.state), new RegExp(key));
});
test('HTTP errors reserve the attempt even when no usage is returned', async () => {
  const a = budget(async () => new Response('secret-error-body', {status: 401}));
  const response = await a.request(endpoint, options()); assert.equal(response.status, 401);
  assert.equal(a.state.attempts.length, 1); assert.ok(a.state.reserved_cny > 0); assert.equal(a.state.attempts[0].http_status, 401);
  assert.doesNotMatch(JSON.stringify(a.state), /secret-error/);
});
test('unexpected reported usage stops the run and preserves its higher estimate', async () => {
  const a = budget(async () => new Response(JSON.stringify({usage: {prompt_tokens: 1000000, completion_tokens: 1000000}})));
  await assert.rejects(a.request(endpoint, options()));
  assert.equal(a.state.reserved_cny, 10); assert.equal(a.state.attempts[0].estimated_cny_at_peak, 10);
  await assert.rejects(a.request(endpoint, options()), /budget/);
  assert.equal(a.state.attempts.length, 1);
});
for (const bad of [{...payload, model: 'other'}, {...payload, max_tokens: 100000}, {...payload, stream: true}, {...payload, messages: [{content: 'x'.repeat(50000)}, {}]}]) test('unexpected request cannot consume the model budget: ' + (bad.model + '/' + bad.max_tokens + '/' + bad.stream + '/' + bad.messages[0].content.length), async () => {
  let calls = 0; const a = budget(async () => { calls++; });
  await assert.rejects(a.request(endpoint, {...options(), body: JSON.stringify(bad)})); assert.equal(calls, 0); assert.equal(a.state.attempts.length, 0);
});
test('unexpected destination or authorization cannot trigger transport', async () => {
  let calls = 0; const a = budget(async () => { calls++; });
  await assert.rejects(a.request('https://foreign.invalid', options()));
  await assert.rejects(a.request(endpoint, {...options(), headers: {Authorization: 'wrong'}})); assert.equal(calls, 0);
});
test('explicit model check crosses local HTTP and handler while quota stays synthetic', async t => {
  let calls = 0;
  const a = budget(async () => { calls++; return new Response(JSON.stringify({usage: {prompt_tokens: 10, completion_tokens: 20}, choices: [{message: {content: JSON.stringify({task: '合成测试', base_score: 6, vague: false})}}]})); });
  const setup = createModelCheck({key, request: a.request}), server = createLocalServer({...setup, mode: 'live-model-test'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.mode, 'live-model-test'); assert.match(health.note, /合成模拟/);
  const response = await fetch(base + '/api/ai', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: '合成输入', device_id: 'syntheticdevice0123456789abcd', request_id: '0'.repeat(32)})});
  assert.equal(response.status, 200); assert.equal((await response.json()).base_score, 6); assert.equal(calls, 1); assert.ok(setup.inspect().quotaCalls > 0);
});
test('default simulation ignores attempts to enable a live transport', async () => {
  let calls = 0;
  const setup = createSimulation({liveModel: {key, request: () => { calls++; }}});
  const req = {method: 'POST', headers: {}, body: {title: '合成输入', device_id: 'syntheticdevice0123456789abcd', request_id: '0'.repeat(32)}};
  let status; await setup.handler(req, {status(v) { status = v; return this; }, json() {}});
  assert.equal(status, 200); assert.equal(calls, 0);
});

for (const role of ['score', 'task', 'planning', 'chat']) test('short JSON request gets a final answer when provider defaults to thinking: ' + role, async () => {
  let calls = 0;
  const setup = createModelCheck({key, request: async (url, opts) => {
    calls++;
    const body = JSON.parse(opts.body);
    // Reproduce a provider spending the entire short output limit on reasoning.
    const message = body.thinking?.type === 'disabled'
      ? {content: JSON.stringify(role === 'score' ? {task: '合成测试', base_score: 3, vague: false} : {type: 'chat', reply: '合成回复'})}
      : {content: '', reasoning_content: 'synthetic reasoning filling the output allowance'};
    return new Response(JSON.stringify({choices: [{message}]}));
  }});
  const body = {device_id: 'syntheticdevice0123456789abcd', request_id: '0'.repeat(32), client_date: '2026-11-15',
    ...(role === 'score' ? {title: '整理书桌'} : {mode: 'agent', agent_role: role, message: '合成测试', context: {}})};
  let status, result;
  await setup.handler({method: 'POST', headers: {}, body}, {status(v) { status = v; return this; }, json(v) { result = v; }});
  assert.equal(status, 200); assert.equal(calls, 1);
  assert.equal(role === 'score' ? result.base_score : result.type, role === 'score' ? 3 : 'chat');
});

function firstFailure() {
  return {session: 'issue81-initial-three-calls', attempts: [{number: 1}], reserved_cny: 0.012412,
    cases: [{id: 'score', passed: false, status: 503}]};
}
test('normal invocation cannot restart a previously failed real test', () => {
  assert.throws(() => planRun(firstFailure(), {handlerHash: 'new'}), /approved followup/);
});
test('approved followup preserves the first attempt and uses cumulative ten-call two-yuan limits', () => {
  const state = firstFailure(), original = structuredClone(state);
  const plan = planRun(state, {followup: true, handlerHash: 'new'});
  assert.deepEqual(state, original); assert.deepEqual(plan.limits, {calls: 10, budget_cny: 2});
  assert.deepEqual(plan.pending.map(s => s.id), ['score', 'task', 'chat', 'planning']);
});
test('followup skips successful cases for the same handler and retains failed cases for review', () => {
  const state = firstFailure(); state.cases.push({id: 'score', passed: true, handler_sha256: 'new'});
  assert.deepEqual(planRun(state, {followup: true, handlerHash: 'new'}).pending.map(s => s.id), ['task', 'chat', 'planning']);
  assert.equal(state.cases.length, 2);
  assert.equal(planRun(state, {followup: true, handlerHash: 'changed'}).pending.length, 4);
});
test('ten cumulative attempts or exhausted reservations prevent followup', () => {
  const state = firstFailure(); state.attempts = Array.from({length: 10}, (_, i) => ({number: i + 1}));
  assert.throws(() => planRun(state, {followup: true, handlerHash: 'new'}), /budget/);
  state.attempts.length = 1; state.reserved_cny = 2;
  assert.throws(() => planRun(state, {followup: true, handlerHash: 'new'}), /budget/);
});
test('followup transport counts the nine existing attempts before permitting only the tenth', async () => {
  const state = {attempts: Array.from({length: 9}, (_, i) => ({number: i + 1})), reserved_cny: 0.1};
  let calls = 0;
  const request = createBudgetTransport({key, state, save() {}, limits: followupLimit, transport: async () => { calls++; return new Response('{}'); }});
  await request(endpoint, options());
  await assert.rejects(request(endpoint, options()), /budget/);
  assert.equal(calls, 1); assert.equal(state.attempts.length, 10); assert.ok(state.reserved_cny > 0.1);
});
test('fresh unapproved session keeps the original three-call one-yuan plan', () => {
  const state = {session: 'issue81-initial-three-calls', attempts: [], cases: [], reserved_cny: 0};
  const plan = planRun(state, {handlerHash: 'new'});
  assert.deepEqual(plan.limits, {calls: 3, budget_cny: 1}); assert.equal(plan.pending.length, 3);
});
