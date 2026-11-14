'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const stores=['tasks','todos','chats','messages','memories','operations','kv'];
async function fixture(t){
  const ctx=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone,indexedDB:new IDBFactory()});
  const source=fs.readFileSync(process.env.ISSUE6_SOURCE||path.join(__dirname,'../index.html'),'utf8');
  vm.runInContext([...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
  const run=code=>vm.runInContext(code,ctx,{timeout:3000});
  const json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
  await run('DB.open()');t.after(()=>run('DB._db.close()'));
  run(require('./helpers/storage-fixture.cjs'));
  await run("DB.batch([...DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))])");
  ctx.localStorage={setItem(){},removeItem(){}};
  const snapshot=async()=>JSON.parse(JSON.stringify(await run("DB.snapshot(['tasks','todos','chats','messages','memories','operations','kv'])")));
  const backup=()=>json("({app:'卷卷AI Todo',version:'2.2',...Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,S[key]])),appearance:{followSystem:true,lightTheme:'warm',darkTheme:'soft',fixedTheme:'warm'}})");
  const memory=()=>json("Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,S[key]]))");
  const fail=(store,n=1,method='put',mode='abort')=>{
    ctx.failureStore=store;ctx.failureN=n;ctx.failureMethod=method;ctx.failureMode=mode;
    run("originalTransaction=DB._db.transaction.bind(DB._db);DB._db.transaction=(...args)=>{const tx=originalTransaction(...args);if(args[1]!=='readwrite')return tx;const originalStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const object=originalStore(name);if(name===failureStore){const original=object[failureMethod].bind(object);object[failureMethod]=(...values)=>{if(--failureN===0){if(failureMode==='quota')throw new DOMException('synthetic capacity','QuotaExceededError');const req=original(...values);req.addEventListener('success',()=>tx.abort());return req;}return original(...values);};}return object;};return tx;};");
  };
  ctx.DOMException=DOMException;
  return {ctx,run,json,snapshot,backup,memory,fail};
}
test('DB promise waits for transaction completion and rejects abort after request success',async t=>{
  const a=await fixture(t),before=await a.snapshot();a.fail('tasks');
  await assert.rejects(a.run("DB.put('tasks',{id:'new',title:'new'})"));
  assert.deepEqual(await a.snapshot(),before);
});
for(const kind of ['update_schedule_batch','delete_schedule_batch','create_schedule_batch','convert_schedule_to_todo','update_todo']){
  for(const fault of ['tasks','operations','messages']){
    if(kind==='update_todo'&&fault==='tasks')continue;
    test(kind+' rolls back '+fault+' failure including memory',async t=>{
      const a=await fixture(t);
      if(kind==='create_schedule_batch')a.run("action={kind:'create_schedule_batch',rule:{date_from:'2026-11-09',date_to:'2026-11-16',weekdays:[1],title:'新增课程',time_type:'exact',start_time:'12:00',end_time:'13:00'}}");
      else if(kind==='convert_schedule_to_todo')a.run("action={kind:'convert_schedule_to_todo',target_id:'a',item:{}};UI.captureAgentScope(action)");
      else if(kind==='update_todo')a.run("action={kind:'update_todo',target_id:'todo',item:{note:'new'}};UI.captureAgentScope(action)");
      else a.run('action.kind='+JSON.stringify(kind));
      const before=await a.snapshot(),memory=a.memory();
      a.fail(fault,fault==='tasks'&&kind==='update_schedule_batch'?2:1,fault==='tasks'&&(kind==='delete_schedule_batch'||kind==='convert_schedule_to_todo')?'delete':'put');
      await assert.rejects(a.run("UI.executeAgentAction(action,S.messages[0])"));
      assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
    });
  }
}
for(const fault of ['tasks','operations','kv']){
  test('import rollback at '+fault+' preserves full backup',async t=>{
    const a=await fixture(t),before=await a.snapshot(),memory=a.memory();
    const data=a.backup();data.tasks[0].note='imported';data.pet.growth=99;data.operations.push({id:'import-op',chatId:'chat',messageId:'m',kind:'update_schedule',status:'done'});a.ctx.data=data;a.ctx.expected=before;
    a.fail(fault,1,'put',fault==='kv'?'quota':'abort');
    await assert.rejects(a.run('replaceBackup(data,expected)'));
    assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
    // Reopen the same synthetic DB to verify the persisted state survives restart.
    a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
  });
}
const invalid=[
 ['missing field',d=>delete d.todos],['missing id',d=>delete d.tasks[0].id],
 ['duplicate id',d=>d.tasks.push(structuredClone(d.tasks[0]))],
 ['invalid date',d=>d.tasks[0].execDate='2026-02-30'],
 ['invalid pet',d=>d.pet.growth=-1],['invalid stats',d=>d.dayStats={'bad':{points:1,done:1}}],
 ['invalid image',d=>d.tasks[0].images[0].data='javascript:bad'],
 ['invalid message reference',d=>d.messages[0].chatId='missing'],
 ['invalid operation reference',d=>d.operations.push({id:'op',chatId:'chat',messageId:'missing',status:'done'})]
];
for(const [name,change] of invalid)test('invalid backup rejected before clearing: '+name,async t=>{
  const a=await fixture(t),before=await a.snapshot(),data=a.backup();change(data);a.ctx.data=data;
  await assert.rejects(a.run('replaceBackup(data)'));assert.deepEqual(await a.snapshot(),before);
});
test('successful repeat import preserves exact counts, attachments, pet and totals',async t=>{
  const a=await fixture(t),data=a.backup();data.tasks[0].note='imported';a.ctx.data=data;
  for(let i=0;i<2;i++){a.ctx.expected=await a.snapshot();await a.run('replaceBackup(data,expected)');}
  assert.deepEqual(a.memory(),Object.fromEntries([...stores.filter(x=>x!=='kv'),'pet','dayStats','customTags','memoryGroups'].map(k=>[k,data[k]])));
});
test('preview becomes stale on another connection and cannot overwrite newer data',async t=>{
  const a=await fixture(t);a.ctx.data=a.backup();a.ctx.expected=await a.snapshot();
  await a.run("DB.put('tasks',{...S.tasks[0],note:'newer external'})");
  const before=await a.snapshot();await assert.rejects(a.run('replaceBackup(data,expected)'),/资料已变化/);
  assert.deepEqual(await a.snapshot(),before);
});
test('concurrent confirmation persists one operation and one final message',async t=>{
  const a=await fixture(t);await a.run("Promise.all([UI.confirmAgentAction('m'),UI.confirmAgentAction('m')])");
  assert.equal(a.json('S.operations.length'),1);assert.equal(a.json('S.messages[0].type'),'action_result');
  assert.deepEqual((await a.snapshot()).operations,a.json('S.operations'));
  assert.deepEqual((await a.snapshot()).messages,a.json('S.messages'));
  await assert.rejects(a.run("UI.executeAgentAction(action,S.messages[0])"),/重复/);
});
test('persisted target change after confirmation aborts all writes',async t=>{
  const a=await fixture(t);await a.run("DB.put('tasks',{...S.tasks[0],seriesId:'other'})");const before=await a.snapshot();
  await assert.rejects(a.run("UI.executeAgentAction(action,S.messages[0])"),/资料已变化/);assert.deepEqual(await a.snapshot(),before);
});
for(const mode of ['failure','changed','success'])test('undo batch: '+mode,async t=>{
  const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");
  if(mode==='changed')await a.run("DB.put('tasks',{...S.tasks[0],note:'external'})");
  const before=await a.snapshot(),memory=a.memory();
  if(mode==='failure')a.fail('operations');
  await a.run("UI.undoAgentOperation('m')");
  if(mode!=='success'){assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);}
  else{assert.equal(a.json('S.tasks[0].note'),'old');assert.equal(a.json("S.operations[0].status"),'undone');}
});
test('actual import UI validates, previews, cancels, confirms and blocks duplicate callback',async t=>{
  const a=await fixture(t);a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
  a.run("UI.confirm=(title,body,ok)=>{preview={title,body,ok};}");
  const before=await a.snapshot();a.ctx.event={target:{files:['{bad'],value:'selected'}};a.run('App.importData(event)');await a.ctx.readDone;
  assert.match(a.json('notices').at(-1),/导入失败/);assert.deepEqual(await a.snapshot(),before);
  const data=a.backup();data.tasks[0].note='UI import';a.ctx.event={target:{files:[JSON.stringify(data)],value:'selected'}};
  a.run('App.importData(event)');await a.ctx.readDone;assert.match(a.run('preview.body'),/不过滤或合并/);
  assert.deepEqual(await a.snapshot(),before); // cancel is just not invoking the callback
  await a.run('Promise.all([preview.ok(),preview.ok()])');assert.equal(a.json('S.tasks[0].note'),'UI import');
  assert.equal(a.json('notices.filter(x=>x.includes("导入成功")).length'),1);
});

test('todo content changed after confirmation blocks execution before writing',async t=>{
  const a=await fixture(t);a.run("action={kind:'update_todo',target_id:'todo',item:{note:'new'}};UI.captureAgentScope(action);S.todos[0].title='changed'");
  const before=await a.snapshot();await assert.rejects(a.run("UI.executeAgentAction(action,S.messages[0])"),/范围已变化/);assert.deepEqual(await a.snapshot(),before);
});
test('memory card batch is atomic on second record failure',async t=>{
  const a=await fixture(t);a.run("UI.renderMemoryPage=()=>{};UI.memoryImportCards=[{id:'one',content:'第一条合成记忆',category:'其他'},{id:'two',content:'第二条合成记忆',category:'其他'}]");
  const before=await a.snapshot(),memory=a.memory();a.fail('memories',2);
  await assert.rejects(a.run('UI.saveAllMemoryImportCards()'));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
test('chat deletion and its references roll back together',async t=>{
  const a=await fixture(t),before=await a.snapshot(),memory=a.memory();a.fail('messages',1,'delete');
  await assert.rejects(a.run("removeChatData('chat')"));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});

test('direct concurrent execution is serialized by persisted expectations',async t=>{
  const a=await fixture(t);
  const results=await a.run("Promise.allSettled([UI.executeAgentAction(action,S.messages[0]),UI.executeAgentAction(action,S.messages[0])])");
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await a.snapshot()).operations.length,1);
});
test('synchronous clone failure never clears or updates the database',async t=>{
  const a=await fixture(t),before=await a.snapshot();
  a.run("invalidWrites=[{store:'tasks',value:{id:'bad',callback:()=>{}}}]");
  await assert.rejects(a.run('commitDataChanges(invalidWrites)'));assert.deepEqual(await a.snapshot(),before);
});

test('keyed kv expectation prevents stale tag or profile overwrites',async t=>{
  const a=await fixture(t);await a.run("DB.put('kv',['external tag'],'customTags')");const before=await a.snapshot();
  await assert.rejects(a.run("commitDataChanges([{store:'kv',key:'customTags',value:['rename']}],{kv:{customTags:S.customTags}})"),/资料已变化/);
  assert.deepEqual(await a.snapshot(),before);
});

for(const fault of [false,true])test('profile transfer '+(fault?'rolls back kv failure':'commits with contents'),async t=>{
  const a=await fixture(t);
  a.run("S.memoryGroups=[{id:'source',name:'来源框',preset:false},{id:'target',name:'目标框',preset:false}];S.memories[0].category='来源框';UI.renderMemoryPage=()=>{}");
  await a.run("DB.put('kv',S.memoryGroups,'memoryGroups')");await a.run("DB.put('memories',S.memories[0])");
  const before=await a.snapshot(),memory=a.memory();if(fault)a.fail('kv');
  if(fault){await assert.rejects(a.run("UI.deleteMemoryGroup('source','target')"));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);}
  else{await a.run("UI.deleteMemoryGroup('source','target')");assert.equal(a.json('S.memories[0].category'),'目标框');assert.deepEqual((await a.snapshot()).memories,a.json('S.memories'));}
});
for(const fault of [false,true])test('tag rename '+(fault?'rolls back second task failure':'commits with tag list'),async t=>{
  const a=await fixture(t);a.ctx.window={prompt:()=> '新标签'};
  a.run("S.tasks.forEach(task=>task.category='合成');UI.cState={tag:'合成'};UI.openTagSelector=()=>{}");
  await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");
  const before=await a.snapshot(),memory=a.memory();if(fault)a.fail('tasks',2);
  if(fault){await assert.rejects(a.run("UI.renameCustomTag('合成')"));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);}
  else{await a.run("UI.renameCustomTag('合成')");assert.ok(a.json('S.tasks').every(task=>task.category==='新标签'));assert.deepEqual(a.json('S.customTags'),['新标签']);}
});
