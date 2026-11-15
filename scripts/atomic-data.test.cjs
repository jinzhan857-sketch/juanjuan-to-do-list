'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const stores=['tasks','todos','chats','messages','memories','operations','kv'];
async function fixture(t){
  const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,console,URL,AbortController,setTimeout,clearTimeout,structuredClone,indexedDB:new IDBFactory()});
  const source=fs.readFileSync(process.env.ISSUE6_SOURCE||path.join(__dirname,'../index.html'),'utf8');
  vm.runInContext([...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
  const run=code=>vm.runInContext(code,ctx,{timeout:3000});
  const json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
  await run('DB.open()');t.after(()=>run('DB._db.close()'));
  run(require('./helpers/storage-fixture.cjs'));
  run("importFeedback={hidden:true,textContent:''};document={querySelector:()=>importFeedback};const showImportError=App.showImportError.bind(App);App.showImportError=error=>{showImportError(error);notices.push(importFeedback.textContent);};UI.mask=()=>{}"); // DOM boundary only; storage and import callbacks remain real.
  await run("DB.batch([...DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))])");
  const local=new Map();ctx.localStorage={getItem:key=>local.get(key),setItem:(key,value)=>local.set(key,value),removeItem:key=>local.delete(key)};
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
    const data=a.backup();data.tasks[0].note='imported';data.pet.growth=99;data.operations.push({id:'import-op',chatId:'chat',messageId:'m',kind:'create_todo',status:'done',summary:'合成创建',before:null,after:structuredClone(data.todos[0])});a.ctx.data=data;a.ctx.expected=before;
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

test('renderer failure after confirmation reports saved data accurately',async t=>{
  const a=await fixture(t);a.run("UI.renderAgent=()=>{throw Error('synthetic render failure')}");
  await a.run("UI.confirmAgentAction('m')");
  assert.equal((await a.snapshot()).operations.length,1);assert.match(a.json('notices').at(-1),/操作已保存/);
});
test('renderer failure after undo cannot be reported as an uncommitted operation',async t=>{
  const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");
  a.run("UI.renderAgent=()=>{throw Error('synthetic render failure')}");
  await a.run("UI.undoAgentOperation('m')");
  assert.equal((await a.snapshot()).operations[0].status,'undone');assert.match(a.json('notices').at(-1),/撤销已保存/);
});
test('import renderer failure after commit reports imported data accurately',async t=>{
  const a=await fixture(t);a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
  a.run("UI.confirm=(title,body,ok)=>{importOK=ok};UI.switchPage=()=>{throw Error('synthetic render failure')}");
  const data=a.backup();data.tasks[0].note='import committed';
  a.ctx.event={target:{files:[JSON.stringify(data)],value:'selected'}};
  a.run('App.importData(event)');await a.ctx.readDone;await a.run('importOK()');
  assert.equal((await a.snapshot()).tasks.find(task=>task.id==='a').note,'import committed');
  assert.match(a.json('notices').at(-1),/资料已导入/);
});

for(const [name,damage] of [
 ['missing snapshot date',"delete data.operations[0].before[0].execDate"],
 ['changed update identity',"data.operations[0].before[0].id='other'"],
 ['duplicate snapshot id',"data.operations[0].before.push(copyData(data.operations[0].before[0]))"],
 ['missing update after',"delete data.operations[0].after"]
])test('import rejects unsafe undo history: '+name,async t=>{
  const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");
  a.ctx.data=a.backup();a.run(damage);const before=await a.snapshot();
  await assert.rejects(a.run('replaceBackup(data)'));assert.deepEqual(await a.snapshot(),before);
});
test('undo refuses malformed persisted snapshots without any writes',async t=>{
  const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");
  a.run("delete S.operations[0].before[0].execDate");await a.run("DB.put('operations',S.operations[0])");
  const before=await a.snapshot();await a.run("UI.undoAgentOperation('m')");
  assert.deepEqual(await a.snapshot(),before);
});

const actionCases=[
 ['create_schedule',"{kind:'create_schedule',item:{title:'新增',exec_date:'2026-11-18',time_type:'allday',base_score:3}}"],
 ['create_todo',"{kind:'create_todo',item:{title:'新增待办',base_score:3}}"],
 ['update_schedule',"{kind:'update_schedule',target_id:'a',item:{note:'new'}}"],
 ['delete_schedule',"{kind:'delete_schedule',target_id:'a',item:{}}"],
 ['update_todo',"{kind:'update_todo',target_id:'todo',item:{note:'new'}}"],
 ['delete_todo',"{kind:'delete_todo',target_id:'todo',item:{}}"],
 ['convert_schedule_to_todo',"{kind:'convert_schedule_to_todo',target_id:'a',item:{}}"],
 ['create_schedule_batch',"{kind:'create_schedule_batch',rule:{date_from:'2026-11-09',date_to:'2026-11-16',weekdays:[1],title:'新增课程',time_type:'exact',start_time:'12:00',end_time:'13:00'}}"],
 ['update_schedule_batch','action'],
 ['delete_schedule_batch',"{...action,kind:'delete_schedule_batch'}"]
];

const damagedBusinessFields=[
 ['status','invalid-status'],['status',''],['status','DONE'],['status',0],['status',false],['status',{}],['status',[]],
 ['finalScore','7'],['finalScore',null],['finalScore',-1],['finalScore',Infinity],['finalScore',NaN],
 ['statusEditCount','1'],['statusEditCount',-1],['statusEditCount',0.5],['statusEditCount',null],
 ['statusAt','2026-11-15'],['statusAt',-1],['statusAt',Infinity]
];
for(const [field,value] of damagedBusinessFields)test('damaged business field rejects entire import: '+field+' '+String(value),async t=>{
 const a=await fixture(t),before=await a.snapshot(),memory=a.memory(),data=a.backup();
 data.tasks[0][field]=value;a.ctx.data=data;
 await assert.rejects(a.run('replaceBackup(data)'));
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
 a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
});
for(const status of [undefined,null,'done','doing','failed','paused','skipped'])test('valid status round trips without altering other records: '+String(status),async t=>{
 const a=await fixture(t),data=a.backup();
 if(status===undefined)delete data.tasks[0].status;else data.tasks[0].status=status;
 data.tasks[0].finalScore=1.5;data.tasks[0].statusEditCount=0;data.tasks[0].statusAt=null;
 a.ctx.data=data;await a.run('replaceBackup(data)');
 const disk=await a.snapshot();assert.deepEqual(disk.tasks.find(x=>x.id==='a'),data.tasks[0]);
 assert.deepEqual(disk.todos,data.todos);assert.deepEqual(a.json('S.pet'),data.pet);
 a.ctx.document={querySelector:()=>({querySelector:()=>({}),querySelectorAll:()=>[],classList:{add(){},remove(){}}})};
 a.run('UI.mask=()=>{}');assert.doesNotThrow(()=>a.run("UI.openTaskDetail('a')"));
});
for(const side of ['before','after'])for(const [field,value] of [['status','invalid-status'],['finalScore',-3],['statusEditCount',0.5]])test('damaged '+side+' snapshot blocks import and undo: '+field,async t=>{
 const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");
 a.ctx.field=field;a.ctx.badValue=value;a.ctx.side=side;
 a.run('S.operations[0][side][0][field]=badValue');await a.run("DB.put('operations',S.operations[0])");
 const before=await a.snapshot(),memory=a.memory();a.ctx.data=a.backup();
 await assert.rejects(a.run('replaceBackup(data)'));
 await a.run("UI.undoAgentOperation('m')");
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
 assert.match(a.json('notices').at(-1),/不合法/);
});
for(const value of ['3',-1,null,Infinity])test('todo score cannot bypass common record validation: '+String(value),async t=>{
 const a=await fixture(t),before=await a.snapshot();a.ctx.data=a.backup();a.ctx.badValue=value;
 a.run('data.todos[0].finalScore=badValue');await assert.rejects(a.run('replaceBackup(data)'));assert.deepEqual(await a.snapshot(),before);
});
test('multiple date request cannot create a confirmation card or write through UI',async t=>{
 const a=await fixture(t),before=await a.snapshot(),memory=a.memory();
 for(const request of ['11月9日不要改，只改11月16日同名课程备注改成带电脑','11月16日保留，删除11月9日同名课程']){
  a.ctx.request=request;
  assert.equal(a.run("AIService._localAgent(request,UI.agentContext('chat',request,'task'),'task').type"),'clarify');
  for(const target_id of ['a','b']){a.ctx.proposal={kind:'delete_schedule',target_id,item:{}};assert.equal(a.run('UI.validateAgentRequest(proposal,request).ok'),false);}
 }
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
for(const damage of ["data.tasks[0].status='invalid-status'","data.tasks[0].finalScore='7'","data.tasks[0].statusEditCount=0.5"])test('file import refuses damaged fields before showing overwrite confirmation: '+damage,async t=>{
 const a=await fixture(t),before=await a.snapshot(),memory=a.memory();a.ctx.data=a.backup();a.run(damage);
 a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
 a.run('previewCount=0;UI.confirm=()=>previewCount++');a.ctx.event={target:{files:[JSON.stringify(a.ctx.data)],value:'selected'}};
 a.run('App.importData(event)');await a.ctx.readDone;
 assert.equal(a.run('previewCount'),0);assert.match(a.json('notices').at(-1),/导入失败/);
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
for(const [score,count,time] of [[0,0,null],[1.5,1,0],[10,2,1794700800000]])test('valid settlement fields survive import: '+JSON.stringify([score,count,time]),async t=>{
 const a=await fixture(t),data=a.backup();Object.assign(data.tasks[0],{status:'done',finalScore:score,statusEditCount:count,statusAt:time});a.ctx.data=data;
 await a.run('replaceBackup(data)');assert.deepEqual((await a.snapshot()).tasks.find(x=>x.id==='a'),data.tasks[0]);
});
for(const source of ['custom','hosted'])for(const target_id of ['a','b'])test('actual send flow refuses '+source+' model guess '+target_id+' for multiple dates',async t=>{
 const a=await fixture(t),before=await a.snapshot();
 const input={value:'11月9日不要改，只改11月16日同名课程备注改成带电脑'};a.ctx.document={querySelector:()=>input};
 a.ctx.output={type:'proposal',reply:'请确认',action:{kind:'update_schedule',target_id,item:{note:'new'}}};
 a.ctx.modelSource=source;let calls=0;
 a.ctx.fetch=async()=>{calls++;return {ok:true,json:async()=>a.ctx.output};};
 a.ctx.customModel=async()=>{calls++;return a.ctx.output;};
 a.run("AIService.source=()=>modelSource;AIService.customRequest=customModel;AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd';UI.currentAgentChat=()=>S.chats[0];UI.resolveAgentRole=()=> 'task';UI.resizeAgentInput=()=>{};UI.agentThinking=false;UI.agentRequestSerial=0;");
 await a.run('UI.sendAgentMessage()');assert.equal(calls,1);
 const disk=await a.snapshot(),last=a.json('S.messages.at(-1)');
 assert.equal(last.type,'clarify');assert.equal(last.meta.action,undefined);assert.match(last.content,/多个日期/);
 for(const store of ['tasks','todos','operations','kv'])assert.deepEqual(disk[store],before[store]);
 assert.deepEqual(disk.messages.find(x=>x.id===last.id),last);
});
for(const [kind,expression] of actionCases)test('valid '+kind+' history exports and undoes without losing records',async t=>{
  const a=await fixture(t),before=a.memory();a.run('action='+expression+';UI.captureAgentScope(action)');
  await a.run('UI.executeAgentAction(action,S.messages[0])');a.ctx.data=a.backup();
  assert.doesNotThrow(()=>a.run('validateBackup(data)'));
  await a.run("UI.undoAgentOperation('m')");
  const byId=(a,b)=>a.id.localeCompare(b.id);
  assert.deepEqual(a.json('S.tasks').sort(byId),before.tasks.sort(byId));assert.deepEqual(a.json('S.todos').sort(byId),before.todos.sort(byId));
  assert.equal(a.json('S.operations[0].status'),'undone');
});
test('concurrent undo restores one batch and leaves one undone operation',async t=>{
  const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");
  await a.run("Promise.all([UI.undoAgentOperation('m'),UI.undoAgentOperation('m')])");
  const saved=await a.snapshot();assert.equal(saved.operations.length,1);assert.equal(saved.operations[0].status,'undone');
  assert.equal(saved.tasks.find(task=>task.id==='a').note,'old');
});
for(const outcome of ['success','failure'])test('file import '+outcome+' only closes data window after commit',async t=>{
 const a=await fixture(t);a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
 a.run("UI.confirm=(title,body,ok)=>importOK=ok;closedMasks=[];UI.mask=(id,show)=>closedMasks.push({id,show});UI.switchPage=()=>{};");
 const data=a.backup();data.tasks[0].note='imported';a.ctx.event={target:{files:[JSON.stringify(data)],value:'selected'}};
 const before=await a.snapshot(),memory=a.memory();a.run('App.importData(event)');await a.ctx.readDone;
 assert.deepEqual(a.json('closedMasks'),[]);
 if(outcome==='failure')a.fail('kv');await a.run('importOK()');
 if(outcome==='success'){assert.deepEqual(a.json('closedMasks'),[{id:'mask-data',show:false}]);assert.equal((await a.snapshot()).tasks.find(x=>x.id==='a').note,'imported');}
 else{assert.deepEqual(a.json('closedMasks'),[]);assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);}
});
for(const field of ['finalScore','statusEditCount'])test('settled schedule cannot import without '+field,async t=>{
 const a=await fixture(t),before=await a.snapshot(),memory=a.memory();a.ctx.data=a.backup();a.ctx.field=field;
 a.run("Object.assign(data.tasks[0],{status:'done',finalScore:1,statusEditCount:0});delete data.tasks[0][field]");
 await assert.rejects(a.run('replaceBackup(data)'));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
for(const side of ['before','after'])for(const field of ['finalScore','statusEditCount'])test('settled '+side+' snapshot without '+field+' cannot import or undo',async t=>{
 const a=await fixture(t);await a.run("UI.confirmAgentAction('m')");a.ctx.field=field;a.ctx.side=side;
 a.run("Object.assign(S.operations[0][side][0],{status:'done',finalScore:1,statusEditCount:0});delete S.operations[0][side][0][field]");
 await a.run("DB.put('operations',S.operations[0])");const before=await a.snapshot(),memory=a.memory();a.ctx.data=a.backup();
 await assert.rejects(a.run('replaceBackup(data)'));await a.run("UI.undoAgentOperation('m')");
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);assert.match(a.json('notices').at(-1),/不合法/);
});

// #64: use the actual file callback, validator, feedback renderer and database.
const locationCases=[
 ['date',d=>d.tasks[1].execDate='2026-02-30','tasks[1].execDate','日程第2条'],
 ['reverse time',d=>Object.assign(d.tasks[1],{startTime:'23:30',endTime:'16:30'}),'tasks[1].endTime','结束时间早于或等于开始时间'],
 ['equal time',d=>d.tasks[1].endTime='10:00','tasks[1].endTime','结束时间早于或等于开始时间'],
 ['start time',d=>d.tasks[1].startTime='bad','tasks[1].startTime','开始时间'],
 ['duplicate id',d=>d.tasks.push(structuredClone(d.tasks[0])),'tasks[3].id','与第1条重复'],
 ['missing id',d=>delete d.todos[0].id,'todos[0].id','待办第1条'],
 ['image',d=>d.tasks[0].images[0].data='private-image-sentinel','tasks[0].images','图片格式'],
 ['link',d=>d.tasks[0].links=['private-link-sentinel'],'tasks[0].links','链接格式'],
 ['operation reference',d=>d.operations.push({id:'op',chatId:'chat',messageId:'private-reference-sentinel',status:'done',kind:'create_todo'}),'operations[0].messageId','操作记录第1条'],
 ['snapshot',d=>d.operations.push({id:'op',chatId:'chat',messageId:'m',status:'done',kind:'create_schedule',summary:'合成',before:null,after:{...d.tasks[0],execDate:'bad'}}),'operations[0].after.execDate','操作记录第1条'],
 ['message reference',d=>d.messages[0].chatId='private-chat-sentinel','messages[0].chatId','消息第1条'],
 ['pet',d=>d.pet.growth=-1,'pet.growth','宠物数值'],
];
for(const [name,damage,field,reason] of locationCases)test('#64 file error locates '+name+' and preserves all data',async t=>{
 const a=await fixture(t),before=await a.snapshot(),memory=a.memory(),data=a.backup();damage(data);
 data.tasks[1].note='PRIVATE_NOTE_MUST_NOT_APPEAR';a.ctx.data=data;
 a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
 a.run('previewCount=0;UI.confirm=()=>previewCount++');a.ctx.event={target:{files:[JSON.stringify(data)],value:'selected'}};
 a.run('App.importData(event)');await a.ctx.readDone;
 const feedback=a.run('importFeedback.textContent');assert.ok(feedback.includes(field),feedback);assert.ok(feedback.includes(reason),feedback);
 assert.equal(a.run('importFeedback.hidden'),false);assert.equal(a.run('previewCount'),0);assert.equal(a.ctx.event.target.value,'');
 assert.doesNotMatch(feedback,/PRIVATE_NOTE_MUST_NOT_APPEAR|private-image-sentinel|private-link-sentinel|private-reference-sentinel|private-chat-sentinel/);
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
test('#64 corrected copy previews, cancels without writes, then imports unchanged',async t=>{
 const a=await fixture(t),before=await a.snapshot(),memory=a.memory(),data=a.backup();Object.assign(data.tasks[1],{startTime:'23:30',endTime:'16:30'});
 a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
 a.run('UI.confirm=(title,body,ok)=>preview={title,body,ok}');
 const select=async()=>{a.ctx.event={target:{files:[JSON.stringify(data)],value:'selected'}};a.run('App.importData(event)');await a.ctx.readDone;};
 await select();assert.match(a.run('importFeedback.textContent'),/同名课程.*2026-11-16/);
 data.tasks[1].startTime='11:30';await select();assert.equal(a.run('importFeedback.hidden'),true);
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory); // cancel
 await select();await a.run('preview.ok()');assert.deepEqual((await a.snapshot()).tasks,data.tasks);
 assert.equal(a.run('S.pet.growth'),data.pet.growth);
});
test('#64 malformed JSON and file read errors never echo file content or parser snippets',async t=>{
 const a=await fixture(t),before=await a.snapshot();a.ctx.FileReader=class{readAsText(value){this.result=value;a.ctx.readDone=this.onload();}};
 a.ctx.event={target:{files:['{"apiKey":"PRIVATE_SECRET" bad}'],value:'selected'}};a.run('App.importData(event)');await a.ctx.readDone;
 assert.doesNotMatch(a.run('importFeedback.textContent'),/PRIVATE_SECRET|apiKey/);
 a.ctx.FileReader=class{readAsText(){this.onerror();}};a.run('App.importData(event)');assert.equal(a.ctx.event.target.value,'');assert.deepEqual(await a.snapshot(),before);
});
test('#64 feedback treats HTML title as text and limits readable identity',async t=>{
 const a=await fixture(t);a.ctx.data=a.backup();a.run('data.tasks[0].title="<img onerror=alert(1)>"+"合".repeat(100);data.tasks[0].execDate="bad"');
 try{a.run('validateBackup(data)');assert.fail('must reject');}catch(error){a.ctx.error=error;a.run('App.showImportError(error)');}
 assert.ok(a.run('importFeedback.textContent').includes('<img onerror=alert(1)>'));assert.ok(a.run('importFeedback.textContent.length')<300);assert.equal(a.run('importFeedback.innerHTML'),undefined);
});

for(const store of ['tasks','todos','chats','messages','memories','memoryGroups'])test('PR68 review: duplicate location in '+store,async t=>{
 const a=await fixture(t),data=a.backup(),before=await a.snapshot(),memory=a.memory();
 if(store==='memoryGroups')data.memoryGroups=[{id:'group',name:'合成资料框'}];
 data[store].push(structuredClone(data[store][0]));a.ctx.data=data;
 await assert.rejects(a.run('replaceBackup(data)'),error=>error.field===store+'['+(data[store].length-1)+'].id'&&error.message.includes('与第1条重复'));
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
for(const side of ['before','after'])test('PR68 review: nested batch '+side+' retains exact record path',async t=>{
 const a=await fixture(t),data=a.backup(),before=await a.snapshot(),memory=a.memory();
 data.operations=[{id:'op',chatId:'chat',messageId:'m',status:'done',kind:'update_schedule_batch',summary:'合成修改',before:structuredClone(data.tasks.slice(0,2)),after:structuredClone(data.tasks.slice(0,2))}];
 data.operations[0][side][1].baseScore=-1;a.ctx.data=data;
 await assert.rejects(a.run('replaceBackup(data)'),error=>error.field==='operations[0].'+side+'[1].baseScore');
 assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});
test('PR68 review: empty collections import unchanged and invalid missing collection is identified',async t=>{
 const a=await fixture(t),data=a.backup();for(const key of ['tasks','todos','chats','messages','memories','operations','memoryGroups'])data[key]=[];
 a.ctx.data=data;assert.deepEqual(a.json('validateBackup(data)'),data);await a.run('replaceBackup(data)');
 const before=await a.snapshot();delete data.todos;a.ctx.data=data;
 await assert.rejects(a.run('replaceBackup(data)'),error=>error.field==='todos');assert.deepEqual(await a.snapshot(),before);
});

for(const entry of ['assistant','ordinary'])for(const fault of [null,'todos','tasks','operations','messages']){
 if(entry==='ordinary'&&['operations','messages'].includes(fault))continue;
 test('issue27 '+entry+' conversion '+(fault||'confirm and undo'),async t=>{
  const a=await fixture(t);
  a.run("Object.assign(S.tasks[0],{category:'学业事务',aiReason:'合成理由',aiAdvice:'合成建议',aiSource:'rules',createdAt:1794700000000});action={kind:'convert_schedule_to_todo',target_id:'a',item:{}};UI.captureAgentScope(action);S.messages[0].meta.action=action");
  await a.run("DB.put('tasks',S.tasks[0]);DB.put('messages',S.messages[0])");
  const before=await a.snapshot(),original=structuredClone(before.tasks.find(x=>x.id==='a'));
  if(entry==='ordinary'){
   const nodes=new Map(),el=k=>{if(!nodes.has(k))nodes.set(k,{innerHTML:'',querySelector:el,querySelectorAll:()=>[]});return nodes.get(k)};
   a.ctx.document={querySelector:el};a.run("UI.confirm=(title,body,ok)=>confirmed=ok;UI.openTaskDetail('a')");el('#td-to-todo').onclick();
   assert.deepEqual(await a.snapshot(),before);
  }
  if(fault)a.fail(fault,1,fault==='tasks'?'delete':'put');
  const execute=()=>a.run(entry==='ordinary'?'confirmed()':"UI.confirmAgentAction('m')");
  if(fault){if(entry==='ordinary')await assert.rejects(execute());else await execute();assert.deepEqual(await a.snapshot(),before);return;}
  await execute();const after=await a.snapshot(),todo=after.todos.find(x=>x.sourceTaskId==='a');
  assert.equal(after.tasks.length,before.tasks.length-1);assert.equal(after.todos.length,before.todos.length+1);
  for(const key of ['title','note','category','baseScore','aiReason','aiAdvice','aiSource','links','images'])assert.deepEqual(todo[key],original[key],key);
  assert.equal(todo.done,false);assert.equal(todo.finalScore,0);
  for(const key of ['kv','memories','chats'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.tasks,before.tasks.filter(x=>x.id!=='a'));assert.deepEqual(after.todos.filter(x=>x.id!==todo.id),before.todos);
  a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),after);
  if(entry==='assistant'){assert.deepEqual(after.operations[0].before,original);assert.deepEqual(after.operations[0].after,todo);await a.run("UI.undoAgentOperation('m')");const undone=await a.snapshot();assert.deepEqual(undone.tasks,before.tasks);assert.deepEqual(undone.todos,before.todos);assert.deepEqual(undone.kv,before.kv);}
 });
}

for(const kind of ['update_schedule','update_schedule_batch']){
 for(const item of [{title:''},{title:'   '},{base_score:999},{base_score:-1},{base_score:NaN},{time_type:'invalid'},{time_type:null},{time_type:'slot',slot:'invalid'},{slot:'invalid'},{start_time:'bad'},{end_time:'09:00'}])test('issue30 rejects '+kind+' '+JSON.stringify(item),async t=>{
  const a=await fixture(t);a.ctx.patch=item;
  a.run(kind==='update_schedule'?"action={kind:'update_schedule',target_id:'a',item:patch};UI.captureAgentScope(action)":"action.item=patch;UI.captureAgentScope(action)");
  await a.run("S.messages[0].meta.action=action;DB.put('messages',S.messages[0])");
  const before=await a.snapshot(),memory=a.memory();assert.equal(a.json('UI.validateAgentAction(action).ok'),false);
  await assert.rejects(a.run("UI.executeAgentAction(action,S.messages[0])"));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
 });
 for(const item of [{note:'仅改备注'},{base_score:4.5},{start_time:'10:15'},{end_time:'11:15'},{time_type:'exact',start_time:'10:15'}])test('issue30 partial '+kind+' '+JSON.stringify(item),async t=>{
  const a=await fixture(t);a.ctx.patch=item;
  a.run(kind==='update_schedule'?"action={kind:'update_schedule',target_id:'a',item:patch};UI.captureAgentScope(action)":"action.item=patch;UI.captureAgentScope(action)");
  await a.run("S.messages[0].meta.action=action;DB.put('messages',S.messages[0])");
  const before=await a.snapshot();assert.equal(a.json('UI.validateAgentAction(action).ok'),true);await a.run("UI.executeAgentAction(action,S.messages[0])");const after=await a.snapshot();
  for(const task of before.tasks){const actual=after.tasks.find(x=>x.id===task.id);if(task.id==='a'||(kind.endsWith('_batch')&&task.id==='b')){const expected={...task,isBackfill:a.run('dayDiff('+JSON.stringify(task.execDate)+',todayStr())<0')};for(const [key,val] of Object.entries(item))expected[({base_score:'baseScore',start_time:'startTime',end_time:'endTime',time_type:'timeType'})[key]||key]=val;if(item.time_type)expected.slot=null;assert.deepEqual(actual,expected);}else assert.deepEqual(actual,task);}
  for(const key of ['todos','kv','memories','chats'])assert.deepEqual(after[key],before[key]);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),after);
 });
}

test('issue30 validates merged time against every member before any writes',async t=>{
 const a=await fixture(t);a.run("S.tasks[1].endTime='10:20';action.item={start_time:'10:30'};UI.captureAgentScope(action)");await a.run("DB.put('tasks',S.tasks[1]);DB.put('messages',S.messages[0])");const before=await a.snapshot();assert.equal(a.json('UI.validateAgentAction(action).ok'),false);await assert.rejects(a.run('UI.executeAgentAction(action,S.messages[0])'));assert.deepEqual(await a.snapshot(),before);
});

async function ordinaryConversionFixture(t){
 const a=await fixture(t),nodes=new Map();
 const el=k=>{if(!nodes.has(k))nodes.set(k,{innerHTML:'',querySelector:el,querySelectorAll:()=>[]});return nodes.get(k)};
 a.ctx.document={querySelector:el};a.run("UI.confirm=(title,body,ok)=>confirmed=ok;UI.openTaskDetail('a')");
 return {...a,select:()=>el('#td-to-todo').onclick()};
}
for(const stage of ['before click','after click'])for(const change of ['edit','delete'])test('review27 stale ordinary '+stage+' '+change,async t=>{
 const a=await ordinaryConversionFixture(t);if(stage==='after click')a.select();
 await a.run(change==='edit'?"commitDataChanges([{store:'tasks',value:{...S.tasks[0],note:'新备注',links:['https://example.com/new'],images:[]}}])":"commitDataChanges([{store:'tasks',type:'delete',key:'a'}])");
 if(stage==='before click')a.select();const before=await a.snapshot(),memory=a.memory();await assert.rejects(a.run('confirmed()'),/资料已变化/);assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
 a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
});
for(const mode of ['sequential','concurrent'])test('review27 ordinary confirmation runs once '+mode,async t=>{
 const a=await ordinaryConversionFixture(t);a.select();const before=await a.snapshot();
 if(mode==='sequential'){await a.run('confirmed()');await assert.rejects(a.run('confirmed()'),/资料已变化/);}
 else {const results=await a.run('Promise.allSettled([confirmed(),confirmed()])');assert.equal(results.filter(r=>r.status==='fulfilled').length,1);}
 const after=await a.snapshot();assert.equal(after.todos.length,2);assert.equal(after.tasks.length,2);assert.equal(after.todos.filter(x=>x.sourceTaskId==='a').length,1);for(const key of ['kv','messages','operations','memories','chats'])assert.deepEqual(after[key],before[key]);
});
for(const type of ['allday','slot'])for(const kind of ['update_schedule','update_schedule_batch'])for(const key of ['start_time','end_time'])test('review30 rejects hidden invalid '+type+' '+kind+' '+key,async t=>{
 const a=await fixture(t);a.ctx.type=type;a.ctx.kind=kind;a.ctx.key=key;
 a.run("for(const task of S.tasks.slice(0,2)){task.timeType=type;task.slot=CONFIG.SLOTS[0].key;task.startTime=null;task.endTime=null;}action=kind==='update_schedule'?{kind,target_id:'a',item:{[key]:'bad'}}:{...action,item:{[key]:'bad'}};UI.captureAgentScope(action);S.messages[0].meta.action=action");await a.run("DB.batch([...S.tasks.map(value=>({store:'tasks',value})),{store:'messages',value:S.messages[0]}])");
 const before=await a.snapshot(),memory=a.memory();assert.equal(a.json('UI.validateAgentAction(action).ok'),false);await assert.rejects(a.run('UI.executeAgentAction(action,S.messages[0])'));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);
});

for(const fault of ['tasks','todos','operations','messages'])test('review27 conversion undo rolls back '+fault,async t=>{
 const a=await fixture(t);a.run("action={kind:'convert_schedule_to_todo',target_id:'a',item:{}};UI.captureAgentScope(action);S.messages[0].meta.action=action");await a.run("DB.put('messages',S.messages[0]);UI.confirmAgentAction('m')");
 const before=await a.snapshot(),memory=a.memory();a.fail(fault,1,fault==='todos'?'delete':'put');await a.run("UI.undoAgentOperation('m')");assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.memory(),memory);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
});
for(const conflict of ['converted todo','source id'])test('review27 undo preserves changed '+conflict,async t=>{
 const a=await fixture(t);a.run("action={kind:'convert_schedule_to_todo',target_id:'a',item:{}};UI.captureAgentScope(action);S.messages[0].meta.action=action");await a.run("DB.put('messages',S.messages[0]);UI.confirmAgentAction('m')");
 await a.run(conflict==='converted todo'?"commitDataChanges([{store:'todos',value:{...S.todos.find(x=>x.sourceTaskId==='a'),note:'new content'}}])":"commitDataChanges([{store:'tasks',value:{...S.operations[0].before,note:'new source'}}])");const before=await a.snapshot();await a.run("UI.undoAgentOperation('m')");assert.deepEqual(await a.snapshot(),before);
});
for(const kind of ['update_schedule','update_schedule_batch'])test('review30 valid time type transition '+kind,async t=>{
 const a=await fixture(t);a.ctx.kind=kind;a.run("action=kind==='update_schedule'?{kind,target_id:'a',item:{time_type:'allday',slot:null,start_time:null,end_time:null}}:{...action,item:{time_type:'allday',slot:null,start_time:null,end_time:null}};UI.captureAgentScope(action);S.messages[0].meta.action=action");await a.run("DB.put('messages',S.messages[0])");const before=await a.snapshot();await a.run('UI.executeAgentAction(action,S.messages[0])');const after=await a.snapshot();for(const old of before.tasks){const actual=after.tasks.find(x=>x.id===old.id);if(old.id==='a'||kind.endsWith('_batch')&&old.id==='b')assert.deepEqual(actual,{...old,timeType:'allday',slot:null,startTime:null,endTime:null,isBackfill:a.run('dayDiff('+JSON.stringify(old.execDate)+',todayStr())<0')});else assert.deepEqual(actual,old);}assert.deepEqual(after.kv,before.kv);
});
