'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {IDBFactory}=require('fake-indexeddb');
async function fixture(t,kind='schedule'){
 const elements=new Map(),notices=[],storage=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{value:'',disabled:false,textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},children:[],appendChild(x){this.children.push(x)},set innerHTML(v){this.children=[]},get innerHTML(){return ''}});return elements.get(key)};
 const ctx=vm.createContext({console,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,indexedDB:new IDBFactory(),document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>element(Math.random())},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}});
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=code=>vm.runInContext(code,ctx),json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
 ctx.scoring=await import('../src/rules/quick-score.mjs');ctx.notices=notices;
 run("toast=s=>notices.push(s);UI.loadScoring=async()=>scoring;S.pet=defaultPet();S.tasks=[];S.todos=[];S.dayStats={};actualRender=UI.renderCreate;UI.renderCreate=()=>{};UI.switchPage=()=>{};UI.renderAIResultVague=()=>{};UI.resetCreate("+JSON.stringify(kind)+");");
 await run('DB.open()');t.after(()=>run('DB._db.close()'));
 element('#c-title').value='买跑步鞋 https://example.com';
 run("UI.cState.resultTitle='买跑步鞋';UI.cState.resultNote='资料 https://example.com';UI.cState.images=[{id:'pic',name:'合成',data:'data:image/png;base64,AA=='}]");
 const snapshot=async()=>JSON.parse(JSON.stringify(await run("DB.snapshot(['tasks','todos','kv'])")));
 return {ctx,run,json,element,notices,snapshot};
}
for(const kind of ['schedule','todo']){
 test(kind+' quick publish stores attachments and rule evidence without AI or rewards',async t=>{
  const a=await fixture(t,kind);a.run("AIService.evaluate=()=>{throw Error('must not call')}");
  const pet=a.json('S.pet');await a.run('UI.onSave()');const s=await a.snapshot(),rows=s[kind==='todo'?'todos':'tasks'];
  assert.equal(rows.length,1);assert.equal(rows[0].baseScore,2);assert.equal(rows[0].aiSource,'rule');assert.equal(rows[0].scoreRule.id,'simple');assert.equal(rows[0].images.length,1);assert.equal(rows[0].links.length,1);assert.deepEqual(a.json('S.pet'),pet);assert.deepEqual(a.json('S.dayStats'),{});
 });
 test(kind+' failure auto publishes once; duplicate clicks ignored',async t=>{
  const a=await fixture(t,kind);a.run("AIService.evaluate=async()=>{throw Error('quota')}");
  await a.run('Promise.all([UI.onAIClick(),UI.onSave()])');assert.equal((await a.snapshot())[kind==='todo'?'todos':'tasks'].length,1);assert.ok(a.notices.includes('AI识别失败，已快速发布'));
 });
 test(kind+' AI score remains after editing every field',async t=>{
  const a=await fixture(t,kind);a.run("AIService.evaluate=async()=>({task:'复习课程',base_score:8.7,source:'ai',detected_date:'2026-12-05'});UI.cState.userFields.date=true;UI.cState.date='2026-12-03'");
  await a.run('UI.onAIClick()');assert.equal((await a.snapshot())[kind==='todo'?'todos':'tasks'].length,0);
  a.run("UI.cState.resultTitle='修改标题';UI.cState.resultNote='修改备注';UI.cState.tag='职场工作';UI.cState.date='2026-12-04'");
  await a.run('UI.onSave()');const row=(await a.snapshot())[kind==='todo'?'todos':'tasks'][0];assert.equal(row.baseScore,8.7);assert.equal(row.title,'修改标题');assert.equal(row.aiSource,'ai');
 });
 test(kind+' cancel and replaced draft ignore late success',async t=>{
  for(const cancel of ['UI.cancelRecognition()',"UI.resetCreate('todo')"]){
   const a=await fixture(t,kind);a.run('AIService.evaluate=()=>new Promise(resolve=>late=resolve);pending=UI.onAIClick()');a.run(cancel);a.run("late({task:'旧内容',base_score:9,source:'ai'})");await a.run('pending');assert.equal((await a.snapshot()).tasks.length,0);assert.equal((await a.snapshot()).todos.length,0);
  }
 });
 test(kind+' edit failure requires save and preserves ID',async t=>{
  const a=await fixture(t,kind);await a.run('UI.onSave()');
  const store=kind==='todo'?'todos':'tasks';a.run("UI.resetCreate("+JSON.stringify(kind)+");UI."+ (kind==='todo'?'todoEditingId':'editingId')+"=S."+store+"[0].id;UI.cState.recognized=true;UI.cState.resultTitle='改标题';UI.cState.ai={base_score:2,source:'ai',reason:'旧分'};UI.cState.images=S."+store+"[0].images;AIService.evaluate=async()=>{throw Error('offline')}");
  await a.run('UI.onAIClick()');assert.equal((await a.snapshot())[store][0].title,'买跑步鞋');await a.run('UI.onSave()');assert.equal((await a.snapshot())[store].length,1);assert.equal((await a.snapshot())[store][0].title,'改标题');
 });
}
test('#43 selected date retained with time-only recognition and persisted without second click',async t=>{
 const a=await fixture(t);a.element('#c-title').value='下午三点复习';a.run("UI.cState.date='2026-12-03';UI.cState.userFields.date=true;AIService.evaluate=async()=>({task:'复习',base_score:6,source:'ai',detected_time:'15:00-16:00'})");
 await a.run('UI.onAIClick()');assert.equal(a.run('UI.cState.date'),'2026-12-03');assert.equal(a.run('UI.cState.missingDate'),false);await a.run('UI.onSave()');const row=(await a.snapshot()).tasks[0];assert.equal(row.execDate,'2026-12-03');assert.equal(row.startTime,'15:00');
});
test('#43 conflicting date and fields modified during request win',async t=>{
 const a=await fixture(t);a.run("AIService.evaluate=()=>new Promise(resolve=>late=resolve);pending=UI.onAIClick();UI.cState.userFields={date:true,time:true,tag:true};UI.cState.date='2027-01-01';UI.cState.resultTitle='手写';UI.cState.resultNote='手写备注';UI.cState.tag='金钱复盘';late({task:'旧标题',note:'旧备注',base_score:9,source:'ai',detected_date:'2026-12-03',detected_time:'15:00-16:00'})");await a.run('pending');
 assert.equal(a.run('UI.cState.resultTitle'),'手写');assert.equal(a.run('UI.cState.date'),'2027-01-01');assert.match(a.run('UI.cState.dateConflict'),/已保留/);assert.equal(a.run('UI.cState.timeType'),'allday');
});
test('failed storage preserves draft and attachments; retry and render failure do not duplicate',async t=>{
 const a=await fixture(t);a.run("originalBatch=DB.batch;DB.batch=async()=>{throw Error('quota')}");
 await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('UI.cState.images.length'),1);a.run("DB.batch=originalBatch;UI.switchPage=()=>{throw Error('render')}");
 await a.run('Promise.all([UI.onSave(),UI.onSave()])');assert.equal((await a.snapshot()).tasks.length,1);assert.match(a.notices.at(-1),/已保存/);
});
test('invalid date and time never save; vague model never auto publishes',async t=>{
 const a=await fixture(t);a.run("UI.cState.date='2026-02-30'");await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);
 a.run("UI.cState.date=todayStr();UI.cState.timeType='exact';UI.cState.start='16:00';UI.cState.end='15:00'");await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);
 a.run("AIService.evaluate=async()=>({vague:true,reason:'补充对象'})");await a.run('UI.onAIClick()');assert.equal((await a.snapshot()).tasks.length,0);
});
test('#44 full months cover leap year and year boundary with selection',async t=>{
 const a=await fixture(t);a.run("UI.renderCreate=actualRender;UI.renderPublishImages=()=>{};UI.renderAIResult=()=>{};UI.refreshRulePreview=()=>{};S.customTags=[]");
 for(const [month,count] of [['2026-02',28],['2028-02',29],['2026-04',30],['2026-12',31],['2027-01',31]]){
  a.ctx.month=month;a.run("UI.cState.calMonth=month;UI.cState.date=month+'-15';UI.renderCreate()");
  const cells=a.element('#c-cal').children.filter(x=>x.className?.includes('cal-cell'));assert.equal(cells.length,count);assert.ok(cells.every(x=>!x.style.display));assert.equal(cells.filter(x=>x.className.includes(' sel')).length,1);
 }
});

test('timeout auto publishes but explicit cancellation and late rejection never publish',async t=>{
 const a=await fixture(t);a.run("AIService.evaluate=()=>new Promise((resolve,reject)=>lateReject=reject);pending=UI.onAIClick();UI.recognition.controller.abort(new Error('timeout'))");await a.run('pending');a.run("lateReject(Error('late'))");assert.equal((await a.snapshot()).tasks.length,1);
 const b=await fixture(t);b.run("AIService.evaluate=()=>new Promise((resolve,reject)=>lateReject=reject);pending=UI.onAIClick();UI.cancelRecognition();lateReject(Error('late'))");await b.run('pending');assert.equal((await b.snapshot()).tasks.length,0);
});
test('AI service boundary validates hosted score and keeps successful cache separate from rules',async t=>{
 const a=await fixture(t);a.run("AIService.getDeviceId=()=> 'a'.repeat(32);AIService.source=()=> 'hosted';AIService.setDegraded=()=>{}");
 // fixture does not replace evaluate for this test.
 a.ctx.fetch=async()=>({ok:true,json:async()=>({base_score:8.4,task:'合成',category:'日常生活'})});
 assert.equal((await a.run("AIService.evaluate('合成事务')")).base_score,8.4);
 a.ctx.fetch=async()=>({ok:false,json:async()=>({error:'quota'})});
 await assert.rejects(a.run("AIService.evaluate('不同事务')"));
 assert.equal(a.run("Object.keys(AIService.cache).length"),1);
});
test('abort after IndexedDB request success retains memory and attachments',async t=>{
 const a=await fixture(t);
 a.run("originalTx=DB._db.transaction.bind(DB._db);DB._db.transaction=(...args)=>{const tx=originalTx(...args);if(args[1]==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='tasks'){const put=store.put.bind(store);store.put=(...values)=>{const req=put(...values);req.addEventListener('success',()=>tx.abort());return req;};}return store;};}return tx;}");
 await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('S.tasks.length'),0);assert.equal(a.run('UI.cState.images.length'),1);
});
test('settled todo edit updates persisted statistics and pet atomically, failure rolls back',async t=>{
 const a=await fixture(t,'todo');await a.run('UI.onSave()');
 a.run("S.todos[0].done=true;S.todos[0].finalScore=1.4;UI.todoEditingId=S.todos[0].id;UI.cState.recognized=true;UI.cState.resultTitle='完成报告';UI.cState.ai={base_score:8,source:'ai',reason:'合成'}");
 await a.run("DB.put('todos',S.todos[0]);DB.put('kv',S.pet,'pet');DB.put('kv',S.dayStats,'dayStats')");
 const before=await a.snapshot();
 a.run("batch=DB.batch;DB.batch=async()=>{throw Error('kv quota')}");
 await a.run('UI.onSave()');assert.deepEqual(await a.snapshot(),before);
 a.run('DB.batch=batch');await a.run('UI.onSave()');const saved=await a.snapshot();
 assert.equal(saved.todos[0].finalScore,5.6);assert.equal(a.run("S.dayStats[todayStr()].points"),4.2);assert.deepEqual(JSON.parse(JSON.stringify(await a.run("DB.get('kv','pet')"))),a.json('S.pet'));
});

test('successful recognition with rendering failure never becomes automatic publish',async t=>{
 const a=await fixture(t);a.run("AIService.evaluate=async()=>({task:'识别内容',base_score:8,source:'ai'});UI.renderCreate=()=>{if(UI.cState.recognized)throw Error('render')}");
 await a.run('UI.onAIClick()');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('UI.cState.ai.base_score'),8);assert.match(a.notices.at(-1),/识别成功/);
});

test('replaying persisted draft cannot overwrite its already saved record',async t=>{
 const a=await fixture(t);a.run('draft=copyData(UI.cState)');await a.run('UI.onSave()');const before=await a.snapshot();
 a.run("UI.cState=draft;UI.cState.resultTitle='不应覆盖'");await a.run('UI.onSave()');assert.deepEqual(await a.snapshot(),before);assert.match(a.notices.at(-1),/已保存/);
});
for(const kind of ['schedule','todo']){
 test(kind+' homework quick publish and AI failure use academic category with unchanged score',async t=>{
  for(const failedAI of [false,true]){
   const a=await fixture(t,kind);
   a.element('#c-title').value='递交作业';
   a.run("UI.cState.rawText='递交作业';UI.cState.resultTitle='递交作业';UI.cState.resultNote='';AIService.evaluate=async()=>{throw Error('synthetic offline')}");
   await a.run(failedAI?'UI.onAIClick()':'UI.onSave()');
   const row=(await a.snapshot())[kind==='todo'?'todos':'tasks'][0];
   assert.equal(row.category,'学业事务');assert.equal(row.baseScore,3);assert.equal(row.aiSource,'rule');
  }
 });
 test(kind+' manual category remains independent from quick score',async t=>{
  const a=await fixture(t,kind);a.element('#c-title').value='递交作业';
  a.run("UI.cState.resultTitle='递交作业';UI.cState.tag='职场工作';UI.cState.userFields.tag=true");
  await a.run('UI.onSave()');const row=(await a.snapshot())[kind==='todo'?'todos':'tasks'][0];
  assert.equal(row.category,'职场工作');assert.equal(row.baseScore,3);
 });
}

test('quick preview follows task text until category is explicitly selected',async t=>{
 const a=await fixture(t);
 a.run("UI.cState.resultTitle='递交作业';UI.cState.rawText='递交作业'");
 await a.run('UI.refreshRulePreview()');assert.equal(a.run('UI.cState.tag'),'学业事务');assert.equal(a.run('UI.cState.ai.base_score'),3);
 a.run("UI.cState.resultTitle='买牛奶'");
 await a.run('UI.refreshRulePreview()');assert.equal(a.run('UI.cState.tag'),'日常生活');assert.equal(a.run('UI.cState.ai.base_score'),2);
 a.run("UI.cState.tag='自选分类';UI.cState.userFields.tag=true;UI.cState.resultTitle='递交作业'");
 await a.run('UI.refreshRulePreview()');assert.equal(a.run('UI.cState.tag'),'自选分类');assert.equal(a.run('UI.cState.ai.base_score'),3);
});
test('local preview does not overwrite AI categories or reclassify existing records',async t=>{
 const a=await fixture(t);
 a.run("UI.cState.resultTitle='递交作业';UI.cState.tag='职场工作';UI.cState.ai={base_score:8.4,source:'ai'}");
 await a.run('UI.refreshRulePreview()');assert.equal(a.run('UI.cState.tag'),'职场工作');assert.equal(a.run('UI.cState.ai.base_score'),8.4);
 a.run("UI.cState.ai={base_score:3,source:'rule'};UI.editingId='existing'");
 await a.run('UI.refreshRulePreview()');assert.equal(a.run('UI.cState.tag'),'职场工作');
});

for(const kind of ['schedule','todo']){
 test('review: deleted edit draft never becomes a new record after restore '+kind,async t=>{
  const a=await fixture(t,kind);await a.run('UI.onSave()');const store=kind==='todo'?'todos':'tasks';
  a.run(kind==='todo'?"UI.openTodoEditor(S.todos[0].id)":"UI.startEdit(S.tasks[0].id)");a.run('UI.saveCreateDraft()');
  await a.run("DB.del('"+store+"',S."+store+"[0].id)");a.run('S.'+store+'=[];UI.resetCreate();UI.restoreCreateDraft();AIService.evaluate=async()=>{throw Error("offline")}');
  await a.run('UI.onAIClick()');await a.run('UI.onSave()');assert.equal((await a.snapshot())[store].length,0);
 });
 test('review: edit keeps historical rule score and version '+kind,async t=>{
  const a=await fixture(t,kind);await a.run('UI.onSave()');const store=kind==='todo'?'todos':'tasks';
  a.run('S.'+store+'[0].baseScore=4;S.'+store+'[0].scoreRule={id:"sustained",version:"earlier-synthetic",fallback:false}');await a.run("DB.put('"+store+"',S."+store+"[0])");
  a.run(kind==='todo'?"UI.openTodoEditor(S.todos[0].id)":"UI.startEdit(S.tasks[0].id)");a.run("UI.cState.resultTitle='递交作业';UI.cState.resultNote='只修改文字'");await a.run('UI.onSave()');
  const row=(await a.snapshot())[store][0];assert.equal(row.baseScore,4);assert.equal(row.scoreRule.version,'earlier-synthetic');
 });
}
test('review: opening a publisher while save waits cannot replace its draft',async t=>{
 const a=await fixture(t);a.run('UI.saveCreateDraft();originalDraft=UI.cState;UI.loadScoring=()=>new Promise(resolve=>resume=resolve);pending=UI.onSave();UI.openPublisher("todo")');
 assert.equal(a.run('UI.cState===originalDraft'),true);a.run('resume(scoring)');await a.run('pending');assert.equal((await a.snapshot()).tasks.length,1);
});
test('review: saving waits for an attachment already being compressed',async t=>{
 const a=await fixture(t);a.run('UI.renderPublishImages=()=>{};compressTodoImage=()=>new Promise(resolve=>imageReady=resolve);upload=UI.addPublishImages([{}]);pending=UI.onSave()');
 a.run("imageReady({id:'late-image',name:'合成',data:'data:image/png;base64,AA=='})");await a.run('Promise.all([upload,pending])');assert.equal((await a.snapshot()).tasks[0].images.length,2);
});

test('review: failed compression blocks publication and keeps existing media',async t=>{
 const a=await fixture(t);a.run("UI.renderPublishImages=()=>{};compressTodoImage=async()=>{throw Error('synthetic image failure')}");
 await a.run('UI.addPublishImages([{}]);UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('UI.cState.images.length'),1);assert.match(a.notices.at(-1),/图片处理失败/);
});
test('review: title-only visible input remains recoverable as draft',async t=>{
 const a=await fixture(t);a.element('#c-title').value='';
 a.run("UI.cState.rawText='';UI.cState.resultTitle='标题里填写的事务';UI.cState.resultNote='';UI.cState.images=[];UI.saveCreateDraft();UI.resetCreate();UI.restoreCreateDraft()");
 assert.equal(a.run('UI.cState.resultTitle'),'标题里填写的事务');
});
test('review: date conflict remains visible with date help expanded',async t=>{
 const a=await fixture(t);a.run("UI.renderCreate=actualRender;UI.renderPublishImages=()=>{};UI.renderAIResult=()=>{};UI.refreshRulePreview=()=>{};UI.cState.dateInfo=true;UI.cState.dateConflict='AI建议 2026-12-03，已保留你选择的日期';S.customTags=[];UI.renderCreate()");
 assert.match(a.element('#c-date-hint').textContent,/AI建议.*已保留/);
});
