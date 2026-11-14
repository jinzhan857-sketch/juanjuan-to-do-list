'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(){
  const file=process.env.ISSUE4_SOURCE||path.join(__dirname,'../index.html');
  const code=[...fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
  assert.equal((code.match(/^App\.init\(\);$/gm)||[]).length,1);
  class FixedDate extends Date {
    constructor(...args){super(...(args.length?args:[2026,10,15,12,0,0]));}
    static now(){return new FixedDate().getTime();}
  }
  const context=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone,Date:FixedDate});
  vm.runInContext(code.replace(/^App\.init\(\);$/m,''),context);
  const run=code=>vm.runInContext(code,context,{timeout:2000});
  run(`S.tasks=[{id:'a',title:'IDAT7215',execDate:'2026-11-09',seriesId:'s',timeType:'exact',startTime:'19:00',endTime:'21:30',note:'old',baseScore:7},{id:'b',title:'IDAT7215',execDate:'2026-11-16',seriesId:'s',timeType:'exact',startTime:'19:00',endTime:'21:30',note:'old',baseScore:7}]; S.todos=[]; S.pet={synthetic:true}; S.operations=[]; DB.saved=[]; DB.put=async(store,value)=>{DB.saved.push({store,value:JSON.parse(JSON.stringify(value))});}; DB.del=async()=>{}; UI.renderAgent=()=>{}; UI.agentChatId='test';`);
  run("DB.batch=async(changes)=>{for(const c of changes){if(c.type==='delete')await DB.del(c.store,c.key);else await DB.put(c.store,c.value,c.key);}};");
  run('DB.deleted=[]; DB.del=async(store,id)=>{DB.deleted.push({store,id});};');
  const json=expr=>JSON.parse(run(`JSON.stringify(${expr})`));
  const propose=text=>{context.request=text;return run(`AIService._localAgent(request,{tasks:S.tasks.map(t=>({id:t.id,title:t.title,exec_date:t.execDate,series_id:t.seriesId,start_time:t.startTime,end_time:t.endTime})),todos:[]},'task')`);};
  return {run,json,propose,context};
}
for(const [label,text,kind,ids] of [
  ['explicit day update','只把11月9日的IDAT7215备注改成带电脑','update_schedule',['a']],
  ['later day update','只把11月16日的IDAT7215备注改成带电脑','update_schedule',['b']],
  ['explicit day deletion','删除11月16日的IDAT7215','delete_schedule',['b']],
  ['explicit whole group','全部IDAT7215备注改成带电脑','update_schedule_batch',['a','b']],
  ['weekly whole group','每周一IDAT7215备注改成带电脑','update_schedule_batch',['a','b']],
  ['whole group deletion','删除全部IDAT7215','delete_schedule_batch',['a','b']]
]) test(label+' verifies persisted records and unaffected data',async()=>{
  const a=load(), before=a.json('S.tasks'), pet=a.json('S.pet');
  const proposal=a.propose(text); assert.equal(proposal.action?.kind,kind);
  a.context.action=proposal.action;
  assert.equal(a.run('UI.validateAgentRequest(action,request).ok'),true);
  a.run('UI.captureAgentScope(action)');
  const op=await a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})");
  const changed=Array.isArray(op.before)?op.before.map(t=>t.id):[op.before.id];
  assert.deepEqual([...changed].sort(),ids);
  const after=a.json('S.tasks');
  for(const task of before){
    const saved=after.find(t=>t.id===task.id);
    if(!ids.includes(task.id)) assert.deepEqual(saved,task);
    else if(kind.startsWith('delete')) assert.equal(saved,undefined);
    else {assert.equal(saved.note,'带电脑');assert.equal(saved.baseScore,task.baseScore);assert.equal(saved.seriesId,task.seriesId);}
  }
  assert.deepEqual(a.json('S.pet'),pet);
  assert.deepEqual(a.json("DB.saved.filter(x=>x.store==='tasks').map(x=>x.value.id).sort()"),kind.startsWith('delete')?[]:ids);
  assert.equal(a.json("DB.saved.filter(x=>x.store==='operations').length"),1);
  assert.deepEqual(a.json("DB.deleted.filter(x=>x.store==='tasks').map(x=>x.id).sort()"),kind.startsWith('delete')?ids:[]);
});
for(const text of ['IDAT7215备注改成带电脑','只把11月10日的IDAT7215备注改成带电脑','全部11月9日IDAT7215备注改成带电脑']) test('ambiguous or absent target: '+text,()=>{
  const a=load();assert.equal(a.propose(text).type,'clarify');assert.deepEqual(a.json('DB.saved'),[]);
});
test('same title across groups cannot be selected implicitly',()=>{
  const a=load();a.run("S.tasks.push({...S.tasks[0],id:'other',seriesId:'other'})");
  assert.equal(a.propose('11月9日IDAT7215备注改成带电脑').type,'clarify');
  assert.equal(a.propose('全部IDAT7215备注改成带电脑').type,'clarify');
});
test('model proposal cannot widen a single day request',()=>{
  const a=load();const group=a.propose('全部IDAT7215备注改成带电脑');a.context.action=group.action;
  assert.equal(a.run("UI.validateAgentRequest(action,'只改11月9日IDAT7215备注').ok"),false);
});
for(const change of ["S.tasks[0].note='changed'","S.tasks.push({...S.tasks[0],id:'new'})","S.tasks.shift()"])
test('changed confirmation scope blocks writes: '+change,async()=>{
  const a=load();a.context.action=a.propose('全部IDAT7215备注改成带电脑').action;
  a.run('UI.captureAgentScope(action)');a.run(change);const before=a.json('S.tasks');
  await assert.rejects(a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})"),/范围已变化/);
  assert.deepEqual(a.json('DB.saved'),[]);assert.deepEqual(a.json('S.tasks'),before);
});
test('confirmation without a scope snapshot cannot write',async()=>{
  const a=load();a.context.action=a.propose('11月9日IDAT7215备注改成带电脑').action;
  await assert.rejects(a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})"),/范围已变化/);
  assert.deepEqual(a.json('DB.saved'),[]);
});
test('confirmation click rechecks the snapshot and never persists changed tasks',async()=>{
  const a=load();a.context.action=a.propose('11月9日IDAT7215备注改成带电脑').action;
  a.run("UI.captureAgentScope(action); S.messages=[{id:'m',chatId:'test',meta:{action,status:'pending'}}]; S.tasks[0].execDate='2026-11-10'; toast=()=>{};");
  const before=a.json('S.tasks');
  await a.run("UI.confirmAgentAction('m')");
  assert.deepEqual(a.json('S.tasks'),before);
  assert.equal(a.json("S.messages[0].meta.status"),'pending');
  assert.deepEqual(a.json("DB.saved.filter(x=>x.store!=='messages')"),[]);
});
test('creating a recurring course with a note does not become an update',()=>{
  const a=load();a.run('S.tasks=[]');
  assert.equal(a.propose('创建11到12月每周一19点到21点IDAT7215，备注带电脑').action?.kind,'create_schedule_batch');
});

const conflictingDates=[
 '11月9日不要改，只改11月16日IDAT7215备注改成带电脑',
 '11月9日保持不变，只改11月16日IDAT7215备注改成带电脑',
 '只改11月16日，11月9日不改，IDAT7215备注改成带电脑',
 '2026-11-09不改，只改2026/11/16的IDAT7215备注',
 '2026年11月9日保留，删除2026年11月16日的IDAT7215',
 '删除11月9日和11月16日的IDAT7215',
 '今天不改，明天IDAT7215备注改成带电脑',
 '今晚保留，明晚IDAT7215备注改成带电脑',
 '后天不改，大后天IDAT7215备注改成带电脑',
 '周一不改，下周二IDAT7215备注改成带电脑',
 '11月9日还是11月16日IDAT7215备注改成带电脑'
];
for(const request of conflictingDates)test('multiple date constraints clarify locally and reject model targets: '+request,()=>{
 const a=load(),before=a.json('S.tasks');
 assert.equal(a.propose(request).type,'clarify');
 for(const kind of ['update_schedule','delete_schedule'])for(const target_id of ['a','b']){
  a.context.action={kind,target_id,item:kind==='update_schedule'?{note:'new'}:{}};
  assert.equal(a.run('UI.validateAgentRequest(action,request).ok'),false);
 }
 assert.deepEqual(a.json('DB.saved'),[]);assert.deepEqual(a.json('DB.deleted'),[]);assert.deepEqual(a.json('S.tasks'),before);
});
for(const request of [
 '11月16日IDAT7215备注改成带电脑',
 '2026-11-16的IDAT7215备注改成带电脑',
 '2026/11/16的IDAT7215备注改成带电脑',
 '2026年11月16日的IDAT7215备注改成带电脑',
 '明天IDAT7215备注改成带电脑',
 '明晚IDAT7215备注改成带电脑',
 '下周一IDAT7215备注改成带电脑',
 '11月16日，也就是2026-11-16的IDAT7215备注改成带电脑',
 '11月16日IDAT7215备注改成11月9日带电脑'
])test('single resolved date still persists exactly one target: '+request,async()=>{
 const a=load(),before=a.json('S.tasks');a.context.action=a.propose(request).action;
 assert.equal(a.run('UI.validateAgentRequest(action,request).ok'),true);
 a.run('UI.captureAgentScope(action)');await a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})");
 assert.deepEqual(a.json('S.tasks[0]'),before[0]);
 assert.deepEqual(a.json("DB.saved.filter(x=>x.store==='tasks').map(x=>x.value.id)"),['b']);
});
