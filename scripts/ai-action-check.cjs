'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {IDBFactory} = require('fake-indexeddb');

async function checkScheduleLifecycle(result, request) {
  const now = Date.parse('2026-11-15T04:00:00Z');
  class SyntheticDate extends Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  const ctx = vm.createContext({console, URL, Date: SyntheticDate, AbortController, setTimeout, clearTimeout, structuredClone, indexedDB: new IDBFactory(),
    fetch() { throw Error('Network is disabled in the isolated application check'); }});
  const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const run = code => vm.runInContext(code, ctx, {timeout: 3000});
  const json = expr => JSON.parse(run('JSON.stringify(' + expr + ')'));
  const inline = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
  assert.equal((inline.match(/^App\.init\(\);$/gm) || []).length, 1);
  run(inline.replace(/^App\.init\(\);$/m, ''));
  await run('DB.open()');
  try {
    run(require('./helpers/storage-fixture.cjs'));
    ctx.localStorage = {setItem() {}, removeItem() {}};
    ctx.result = structuredClone(result); ctx.request = request;
    assert.equal(run('UI.validateAgentRequest(result.action,request).ok'), true);
    run("action=result.action;UI.captureAgentScope(action);S.messages=[{id:'ai81-confirm',chatId:'chat',role:'assistant',content:result.reply,type:'proposal',meta:{status:'pending',action}}]");
    await run("DB.batch([...DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))])");
    const snapshot = async () => JSON.parse(JSON.stringify(await run("DB.snapshot(['tasks','todos','chats','messages','memories','operations','kv'])")));
    const before = await snapshot(), pet = json('S.pet'), stats = json('S.dayStats');
    assert.equal(before.operations.length, 0);
    // The real confirmation callback owns validation, duplicate prevention and the write.
    await run("Promise.all([UI.confirmAgentAction('ai81-confirm'),UI.confirmAgentAction('ai81-confirm')])");
    const saved = await snapshot();
    assert.equal(saved.tasks.length, before.tasks.length + 1); assert.equal(saved.operations.length, 1);
    const created = saved.tasks.find(task => !before.tasks.some(old => old.id === task.id));
    assert.equal(created.title, result.action.item.title);
    assert.equal(created.execDate, '2026-11-16'); assert.equal(created.startTime, '15:00'); assert.equal(created.endTime, '16:00');
    assert.deepEqual(saved.tasks.filter(task => task.id !== created.id), before.tasks);
    assert.deepEqual(saved.todos, before.todos); assert.equal(saved.messages[0].type, 'action_result');
    run('DB._db.close()'); await run('DB.open()');
    assert.deepEqual(await snapshot(), saved);
    await run("UI.confirmAgentAction('ai81-confirm')"); assert.equal((await snapshot()).operations.length, 1);
    await run("UI.undoAgentOperation('ai81-confirm')");
    const undone = await snapshot();
    assert.deepEqual(undone.tasks, before.tasks); assert.deepEqual(undone.todos, before.todos);
    assert.equal(undone.operations[0].status, 'undone'); assert.equal(undone.messages[0].meta.status, 'undone');
    assert.deepEqual(json('S.pet'), pet); assert.deepEqual(json('S.dayStats'), stats);
    run('DB._db.close()'); await run('DB.open()'); assert.deepEqual(await snapshot(), undone);
    return {database: 'isolated fake-indexeddb', before_confirmation_tasks: before.tasks.length, after_confirmation_tasks: saved.tasks.length,
      after_undo_tasks: undone.tasks.length, persisted_after_reopen: true, duplicate_confirmation_blocked: true,
      previous_records_preserved: true, pet_and_points_unchanged: true};
  } finally { run('DB._db.close()'); }
}

module.exports = {checkScheduleLifecycle};
