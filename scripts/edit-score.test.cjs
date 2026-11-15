'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {statsFixture}=require('./completion-stats-fixture.cjs');
const {seed,edit}=require('./edit-score-fixture.cjs');
for(const entry of ['form','single','batch'])test(entry+' settled base 2 to 10 recalculates score and ledger',async t=>{
 const a=await statsFixture(t);await seed(a);await edit(a,entry);
 assert.equal(a.run('S.tasks[0].finalScore'),5.9);assert.equal(a.run("S.dayStats['2026-11-15'].points"),5.9);
 assert.equal(a.run("completionSummary('2026-11-15','2026-11-15').total"),1);
 assert.equal(a.run('S.tasks.length'),2);assert.equal(a.run('S.tasks[0].images.length'),1);
});
const entries=['form','single','batch'];
for(const fault of ['kv','operations','messages'])test('settled batch abort at '+fault+' preserves complete transaction',async t=>{
 const a=await statsFixture(t);await seed(a);const before=await a.snapshot(),memory=a.json('({tasks:S.tasks,pet:S.pet,dayStats:S.dayStats,operations:S.operations,messages:S.messages})');a.ctx.fault=fault;a.run("txOriginal=DB._db.transaction.bind(DB._db);DB._db.transaction=(...args)=>{const tx=txOriginal(...args);if(args[1]==='readwrite'){const get=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=get(name);if(name===fault){const put=store.put.bind(store);store.put=(...values)=>{const req=put(...values);req.addEventListener('success',()=>tx.abort());return req;}}return store;}}return tx;}");await assert.rejects(edit(a,'batch'));assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.json('({tasks:S.tasks,pet:S.pet,dayStats:S.dayStats,operations:S.operations,messages:S.messages})'),memory);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
});
for(const entry of entries)test(entry+' concurrent task change while reading ledger refuses stale edit',async t=>{
 const a=await statsFixture(t);await seed(a);a.run("getOriginal=DB.get.bind(DB);held=false;DB.get=async(store,key)=>{const value=await getOriginal(store,key);if(store==='kv'&&key==='dayStats'&&!held){held=true;await new Promise(resolve=>resume=resolve)}return value}");
 const pending=edit(a,entry).catch(()=>{});for(let n=0;n<1000&&a.run("typeof resume")!=='function';n++)await new Promise(setImmediate);assert.equal(a.run('typeof resume'),'function');await a.run("commitDataChanges([{store:'tasks',value:{...copyData(S.tasks[0]),note:'并发新备注'}}])");const before=await a.snapshot();a.run('resume()');await pending;assert.deepEqual(await a.snapshot(),before);
});
for(const entry of ['single','batch'])test(entry+' simultaneous confirmations commit one operation and one reward',async t=>{
 const a=await statsFixture(t);await seed(a);await edit(a,entry,{base_score:10});await a.run("UI.undoAgentOperation('m')");await seed(a);a.run('S.operations=[]');await a.run("DB.clear('operations')");a.ctx.entry=entry;a.run("action=entry==='batch'?{kind:'update_schedule_batch',rule:{series_id:'group',date_from:'2026-11-15',date_to:'2026-11-15',weekdays:[7]},item:{base_score:10}}:{kind:'update_schedule',target_id:'a',item:{base_score:10}};UI.captureAgentScope(action)");
 const results=await a.run('Promise.allSettled([UI.executeAgentAction(action,S.messages[0]),UI.executeAgentAction(action,S.messages[0])])');assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.run('S.operations.length'),1);assert.equal(a.run("S.dayStats['2026-11-15'].points"),5.9);
});
test('mixed batch rewards match the same edits individually, including negative deltas',async t=>{
 const results=[];
 for(const batch of [false,true]){const a=await statsFixture(t);await seed(a);a.run("S.tasks.splice(1,0,{...copyData(S.tasks[0]),id:'b',baseScore:10,finalScore:5.9});S.dayStats['2026-11-15'].points=7.1");await a.run("DB.batch([...S.tasks.map(value=>({store:'tasks',value})),{store:'kv',key:'dayStats',value:S.dayStats}])");
 if(batch)await edit(a,'batch',{base_score:5});else {await edit(a,'single',{base_score:5});a.run("action={kind:'update_schedule',target_id:'b',item:{base_score:5}};UI.captureAgentScope(action);S.messages.push({id:'m2',chatId:'chat',role:'assistant',meta:{status:'pending'}})");await a.run("DB.put('messages',S.messages[1]);UI.executeAgentAction(action,S.messages[1])");}
 results.push(a.json('({tasks:S.tasks,stats:S.dayStats,pet:{...S.pet,fridge:S.pet.fridge.map(({id,...food})=>food)}})'));}
 assert.deepEqual(results[0],results[1]);
});
for(const entry of entries)test(entry+' persistent ledger conflict refuses all writes',async t=>{
 const a=await statsFixture(t);await seed(a);await a.run("DB.put('kv',{'2026-11-15':{points:99,done:7}},'dayStats')");const before=await a.snapshot();try{await edit(a,entry)}catch(_){}assert.deepEqual(await a.snapshot(),before);
});
for(const entry of ['single','batch'])test(entry+' undo failure rolls back record, ledger, operation and message',async t=>{
 const a=await statsFixture(t);await seed(a);await edit(a,entry);const before=await a.snapshot(),memory=a.json('({tasks:S.tasks,dayStats:S.dayStats,pet:S.pet,operations:S.operations,messages:S.messages})');a.run("batchOriginal=DB.batch;DB.batch=async()=>{throw Error('synthetic kv failure')}");await a.run("UI.undoAgentOperation('m')");assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.json('({tasks:S.tasks,dayStats:S.dayStats,pet:S.pet,operations:S.operations,messages:S.messages})'),memory);a.run('DB.batch=batchOriginal');await a.run("UI.undoAgentOperation('m')");assert.equal(a.run('S.tasks[0].baseScore'),2);
});
for(const entry of ['single','batch'])test(entry+' undo after later record changes preserves new content',async t=>{
 const a=await statsFixture(t);await seed(a);await edit(a,entry);await a.run("commitDataChanges([{store:'tasks',value:{...copyData(S.tasks[0]),note:'后来修改'}}])");const before=await a.snapshot();await a.run("UI.undoAgentOperation('m')");assert.deepEqual(await a.snapshot(),before);
});
test('form snapshot protects a record changed after editor opens',async t=>{
 const a=await statsFixture(t);await seed(a);a.run("UI.startEdit('a');UI.cState.resultNote='过期草稿'");await a.run("commitDataChanges([{store:'tasks',value:{...copyData(S.tasks[0]),note:'后来修改'}}])");const before=await a.snapshot();await a.run('UI.onSave()');assert.deepEqual(await a.snapshot(),before);assert.equal(a.run('UI.cState.resultNote'),'过期草稿');
});
const fields=['title','note','execDate','timeType','slot','startTime','endTime','endDayOffset','baseScore','createdAt','status','statusAt','statusEditCount','finalScore','parts','timeChangeMul','timeChangeLabel','timeChangeWhy','isBackfill','images','links','seriesId','seriesRule'];
for(const status of [null,'done','doing','failed','paused','skipped'])for(const patch of [{base_score:10},{title:'合成修改',note:'保留新备注'},{exec_date:'2026-11-16'},{time_type:'exact',start_time:'14:00',end_time:'15:00'}])test('entry parity '+status+' '+JSON.stringify(patch),async t=>{
 const results=[];
 for(const entry of entries){const a=await statsFixture(t);await seed(a,status);const before=await a.snapshot();await edit(a,entry,patch);const row=a.json('S.tasks[0]');results.push({row:Object.fromEntries(fields.map(k=>[k,row[k]])),stats:a.json('S.dayStats'),pet:a.json('({...S.pet,fridge:S.pet.fridge.map(({id,...food})=>food)})')});assert.deepEqual((await a.snapshot()).tasks.find(x=>x.id==='unrelated'),before.tasks.find(x=>x.id==='unrelated'));if(!status)assert.deepEqual((await a.snapshot()).kv,before.kv);if(entry!=='form'){assert.deepEqual(entry==='batch'?a.json('S.operations[0].before')[0]:a.json('S.operations[0].before'),before.tasks.find(x=>x.id==='a'));assert.deepEqual(Array.isArray(a.json('S.operations[0].after'))?a.json('S.operations[0].after')[0]:a.json('S.operations[0].after'),row);}}
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});
for(const hours of [-1,0,1,1.001,6,6.001,12,12.001])test('deadline timing boundary '+hours,async t=>{
 const results=[];for(const entry of entries){const a=await statsFixture(t);await seed(a,null);a.ctx.hours=hours;a.run("clock=taskDeadline(S.tasks[0])+hours*3600000");await edit(a,entry,{time_type:'exact',start_time:'14:00',end_time:'15:00'});results.push(a.json('S.tasks[0].timeChangeMul'));}
 const expected=hours>12?.7:hours>6?.8:hours>1?.9:null;assert.deepEqual(results,[expected,expected,expected]);
});
for(const entry of entries)test(entry+' stronger old time penalty is retained with its explanation',async t=>{
 const a=await statsFixture(t);await seed(a);a.run("clock=taskDeadline(S.tasks[0])+2*3600000;Object.assign(S.tasks[0],{timeChangeMul:.7,timeChangeLabel:'旧惩罚',timeChangeWhy:'保留依据'})");await a.run("DB.put('tasks',S.tasks[0])");await edit(a,entry,{time_type:'exact',start_time:'14:00',end_time:'15:00'});assert.equal(a.run('S.tasks[0].timeChangeMul'),.7);assert.equal(a.run('S.tasks[0].timeChangeLabel'),'旧惩罚');
});
for(const entry of ['single','batch'])for(const base of [0,10])test(entry+' undo points without retracting or awarding pet '+base,async t=>{
 const a=await statsFixture(t);await seed(a);const original=a.json('S.tasks[0]');await edit(a,entry,{base_score:base});const pet=a.json('S.pet');await a.run("UI.undoAgentOperation('m')");assert.deepEqual(a.json('S.tasks[0]'),original);assert.equal(a.run("S.dayStats['2026-11-15'].points"),1.2);assert.deepEqual(a.json('S.pet'),pet);const once=await a.snapshot();await a.run("UI.undoAgentOperation('m')");assert.deepEqual(await a.snapshot(),once);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),once);
});
for(const entry of entries)test(entry+' failure after task request success rolls back every store and memory',async t=>{
 const a=await statsFixture(t);await seed(a);const before=await a.snapshot(),memory=a.json('({tasks:S.tasks,stats:S.dayStats,pet:S.pet,messages:S.messages,operations:S.operations})');a.run("txOriginal=DB._db.transaction.bind(DB._db);DB._db.transaction=(...args)=>{const tx=txOriginal(...args);if(args[1]==='readwrite'){const get=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=get(name);if(name==='tasks'){const put=store.put.bind(store);store.put=value=>{const req=put(value);req.addEventListener('success',()=>tx.abort());return req;}}return store;}}return tx;}");try{await edit(a,entry)}catch(_){}assert.deepEqual(await a.snapshot(),before);assert.deepEqual(a.json('({tasks:S.tasks,stats:S.dayStats,pet:S.pet,messages:S.messages,operations:S.operations})'),memory);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
});
for(const entry of ['single','batch'])test(entry+' repeat confirmation is rejected without reward',async t=>{
 const a=await statsFixture(t);await seed(a);await edit(a,entry);const once=await a.snapshot();await assert.rejects(a.run('UI.executeAgentAction(action,S.messages[0])'),/重复确认/);assert.deepEqual(await a.snapshot(),once);
});
for(const entry of entries)test(entry+' cross-day content edit retains exact end date and attachments',async t=>{
 const a=await statsFixture(t);await seed(a);a.run("Object.assign(S.tasks[0],{timeType:'exact',slot:'evening',startTime:'23:30',endTime:'00:30',endDayOffset:1})");await a.run("DB.put('tasks',S.tasks[0])");await edit(a,entry,{title:'合成新内容',base_score:10});assert.equal(a.run('taskDeadline(S.tasks[0])'),new Date('2026-11-16T00:30:00+08:00').getTime());assert.equal(a.run('S.tasks[0].images.length'),1);assert.equal(a.run('S.tasks[0].endDayOffset'),1);
});
for(const entry of entries)test(entry+' later-day edit posts delta today, keeps original status time and count',async t=>{
 const a=await statsFixture(t);await seed(a);a.run('clock+=86400000');await edit(a,entry);assert.equal(a.run("S.dayStats['2026-11-15'].points"),1.2);assert.equal(a.run("S.dayStats['2026-11-16'].points"),a.run('r1(S.tasks[0].finalScore-1.2)'));assert.equal(a.run('S.tasks[0].statusAt'),a.ctx.clock-86400000);assert.equal(a.run('S.tasks[0].statusEditCount'),0);
});
