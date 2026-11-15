'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {checkScheduleLifecycle} = require('./ai-action-check.cjs');
const {validateSession, limits, replayResults} = require('./ai-acceptance.cjs');
const proposal = {type: 'proposal', reply: '请确认复习安排。', action: {kind: 'create_schedule', target_id: null,
  item: {title: '复习课程', note: '', exec_date: '2026-11-16', time_type: 'exact', start_time: '15:00', end_time: '16:00', category: '学业事务', base_score: 7}}};
const previous = () => ({session: 'issue81-initial-three-calls', attempts: Array.from({length: 5}, (_, i) => ({number: i + 1})), cases: [{id: 'score', passed: false}], reserved_cny: 0.077724});

test('real confirmation and undo functions persist one isolated schedule and preserve prior state', async () => {
  const report = await checkScheduleLifecycle(proposal, '创建一条明天下午三点到四点复习课程的日程。');
  assert.equal(report.before_confirmation_tasks, 3); assert.equal(report.after_confirmation_tasks, 4); assert.equal(report.after_undo_tasks, 3);
  assert.equal(report.duplicate_confirmation_blocked, true); assert.equal(report.persisted_after_reopen, true); assert.equal(report.pet_and_points_unchanged, true);
});
test('invalid generated schedule never passes the application request validator', async () => {
  const bad = structuredClone(proposal); bad.action.item.end_time = '14:00';
  await assert.rejects(checkScheduleLifecycle(bad, '创建一条明天下午三点到四点复习课程的日程。'));
});
test('closure uses five existing attempts and five remaining attempts without resetting the ledger', () => {
  const state = previous(), copy = structuredClone(state); validateSession(state);
  assert.deepEqual(state, copy); assert.deepEqual(limits, {calls: 10, budget_cny: 2});
});
test('closure cannot restart an already recorded acceptance session', () => {
  const state = previous(); state.acceptance_approval = {limits}; assert.throws(() => validateSession(state), /Review/);
});
test('insufficient remaining attempt count prevents starting the closure catalog', () => {
  const state = previous(); state.attempts.push({number: 6}); assert.throws(() => validateSession(state), /budget/);
});
test('two-yuan cumulative reservation ceiling prevents starting the closure catalog', () => {
  const state = previous(); state.reserved_cny = 2; assert.throws(() => validateSession(state), /budget/);
});

test('explicit reviewed retest selects only the stopped failed case and keeps the cumulative ceiling', () => {
  const state = previous(); state.attempts = Array.from({length: 9}, (_, i) => ({number: i + 1}));
  state.acceptance_approval = {limits}; state.cases.push({id: 'closure-chat-boundary', passed: false});
  assert.deepEqual(validateSession(state, {reviewedRetest: true}).map(item => item.id), ['closure-chat-boundary']);
  state.attempts.push({number: 10}); assert.throws(() => validateSession(state, {reviewedRetest: true}), /budget/);
});

test('reviewed retest cannot repeat a passed case or start without recorded approval', () => {
  const state = previous(); state.cases.push({id: 'closure-chat-boundary', passed: false});
  assert.throws(() => validateSession(state, {reviewedRetest: true}));
  state.acceptance_approval = {limits}; state.cases.at(-1).passed = true;
  assert.throws(() => validateSession(state, {reviewedRetest: true}));
});

test('recorded replies replay through the current request contract and original persistence without a model call', async () => {
  const report = await replayResults({cases: [
    {id: 'closure-schedule', passed: true, model_answer: JSON.stringify(proposal)},
    {id: 'closure-chat-boundary', passed: true, model_answer: JSON.stringify({type: 'chat', reply: '请切换到卷卷事务。'})},
  ]});
  assert.equal(report.real_model_calls_added, 0); assert.equal(report.results.length, 2);
  assert.equal(report.results[0].business.after_undo_tasks, 3); assert.ok(report.results.every(record => record.passed));
  assert.ok(report.unrecorded_cases.includes('closure-planning'));
});
