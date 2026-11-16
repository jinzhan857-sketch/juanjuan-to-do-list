'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const wf=require('../src/assistant/workflow.js');
const {createWorkflowFixture}=require('./helpers/workflow-fixture.cjs');
const names=['6098项目上交日期','7215项目pre','7215项目递交时间','7508智能系统安全期末考','7215编程与应用期末考','7224深度学习期末考','TCL参观'];
const dates=[1,3,7,8,10,11,15];
const seven=()=>({type:'workflow',intent:'propose',reply:'7项全天日程',entries:names.map((title,i)=>({action:{kind:'create_schedule',item:{title,exec_date:`2026-12-${String(dates[i]).padStart(2,'0')}`,time_type:'allday',category:'学业事务',base_score:7}}}))});
async function fixture(t){const a=await createWorkflowFixture();t.after(a.close);return a;}
test('seven independent cards create zero before consent and exactly seven after; stale, double and reopen preserve seven',async t=>{
 const a=await fixture(t);await a.apply(seven());assert.equal(a.json('S.tasks.length'),0);assert.equal(a.cards().length,7);
 const refs=a.json('UI.assistantCurrentCards().map(m=>({id:m.id,version:m.meta.workflow.version}))');await a.confirm(refs);
 assert.deepEqual(a.json('S.tasks.map(t=>t.title)'),names);assert.equal(a.json('S.operations.length'),7);assert.equal(a.json('S.messages.filter(m=>m.meta.recordIds?.length===1).length'),7);
 await assert.rejects(a.confirm(refs),/旧版本/);a.run('DB._db.close()');await a.run('DB.open()');assert.equal((await a.snapshot()).tasks.length,7);
});
test('version correction preserves other six and rejects old action at execution entry',async t=>{
 const a=await fixture(t);await a.apply(seven());const old=a.json('S.messages[0]');const c=a.cards()[0];
 await a.apply({type:'workflow',intent:'propose',entries:[{card_id:c.card_id,version:c.version,patch:{time_type:'exact',start_time:'16:00',end_time:'17:00'}}]});
 a.ctx.old=old;await assert.rejects(a.run('UI.executeAgentAction(old.meta.action,old)'),/旧版本/);assert.equal(a.cards().length,7);await a.confirm();assert.equal(a.json('S.tasks.length'),7);assert.equal(a.json('S.tasks[0].startTime'),'16:00');
});
test('partial create, targeted notes, all time, remaining confirm and created edit preserve identities and attachments',async t=>{
 const a=await fixture(t);await a.apply(seven());await a.confirm(a.json('UI.assistantCurrentCards().slice(0,2).map(m=>({id:m.id,version:m.meta.workflow.version}))'));
 const original=a.json('S.tasks.map(t=>t.id)');let cards=a.cards();await a.apply({type:'workflow',intent:'propose',entries:cards.map(c=>({card_id:c.card_id,version:c.version,patch:{time_type:'exact',start_time:'19:00',end_time:'20:00'}}))});
 cards=a.cards();await a.apply({type:'workflow',intent:'propose',entries:cards.slice(0,2).map((c,i)=>({card_id:c.card_id,version:c.version,append_note:i?'地点：B楼':'地点：A楼'}))});await a.confirm();
 assert.equal(a.json('S.tasks.length'),7);assert.deepEqual(a.json('S.tasks.slice(0,2).map(t=>t.id)'),original);assert.deepEqual(a.json('S.tasks.slice(0,2).map(t=>t.note)'),['地点：A楼','地点：B楼']);assert.ok(a.json("S.tasks.every(t=>t.startTime==='19:00'&&t.endTime==='20:00')"));
});
for(const store of ['tasks','operations','messages'])test('whole selected batch rolls back on '+store+' failure',async t=>{
 const a=await fixture(t);await a.apply(seven());const before=JSON.stringify(await a.snapshot());
 a.ctx.faultStore=store;a.run("const originalBatch=DB.batch.bind(DB);DB.batch=(changes,expected)=>originalBatch([...changes,{store:faultStore,value:{id:'bad',bad:()=>{}}}],expected)");
 await assert.rejects(a.confirm());assert.equal(JSON.stringify(await a.snapshot()),before);assert.equal(a.json('S.tasks.length'),0);
});
test('model cannot consent for user or expand unknown card scope',async t=>{
 const a=await fixture(t);await a.apply(seven());const c=a.cards()[0];
 await assert.rejects(a.apply({type:'workflow',intent:'confirm',entries:[{card_id:c.card_id,version:c.version}]},'好'),/明确确认/);
 await assert.rejects(a.apply({type:'workflow',intent:'propose',entries:[{card_id:'invented',version:1,patch:{note:'bad'}}]}),/范围/);assert.equal(a.json('S.tasks.length'),0);
});
test('strict contract rejects truncation, excess count, duplicate identities and invalid patch fields',()=>{
 assert.throws(()=>wf.parse({type:'workflow',intent:'propose',entries:[]}));assert.throws(()=>wf.parse({...seven(),entries:[{card_id:'x',version:1,patch:{images:[]}}]}));assert.throws(()=>wf.parse({...seven(),entries:[{action:{kind:'create_todo',item:{title:'x'.repeat(301)}}}]}));
 assert.equal(wf.explicitConfirmation('好'),false);assert.equal(wf.explicitConfirmation('不要确认全部'),false);assert.equal(wf.explicitConfirmation('确认全部'),true);
});
module.exports={seven};

test('two all-day repeat groups expand to four records, with independent group identity',async t=>{
 const a=await fixture(t);await a.apply({type:'workflow',intent:'propose',entries:[2,4].map((day,i)=>({action:{kind:'create_schedule_batch',rule:{title:i?'发票':'书架',date_from:'2026-12-01',date_to:'2026-12-14',weekdays:[day],time_type:'allday',base_score:2}}}))});await a.confirm();assert.equal(a.json('S.tasks.length'),4);assert.equal(a.json('new Set(S.tasks.map(t=>t.seriesId)).size'),2);assert.ok(a.json("S.tasks.every(t=>t.timeType==='allday')"));
});
test('explicit scope rejects omission of third matching title before changing any drafts',async t=>{
 const a=await fixture(t);await a.apply(seven());const cards=a.cards(),before=JSON.stringify(await a.snapshot());const matching=cards.filter(c=>c.action.item.title.includes('7215'));
 await assert.rejects(a.apply({type:'workflow',intent:'propose',scope:{kind:'title_contains',text:'7215'},entries:matching.slice(0,2).map(c=>({card_id:c.card_id,version:c.version,append_note:'地点：B楼'}))},'所有7215的事项都备注B楼。'),/匹配数量/);assert.equal(JSON.stringify(await a.snapshot()),before);
 await a.apply({type:'workflow',intent:'propose',scope:{kind:'title_contains',text:'7215'},entries:matching.map(c=>({card_id:c.card_id,version:c.version,append_note:'地点：B楼'}))},'所有7215的事项都备注B楼。');assert.equal(a.cards().filter(c=>c.action.item.note==='地点：B楼').length,3);
});
test('selected scope cannot expand to unselected cards or another chat',async t=>{
 const a=await fixture(t);await a.apply(seven());a.run('UI.assistantSelected=new Set([S.messages[0].id])');const cards=a.cards();await assert.rejects(a.apply({type:'workflow',intent:'propose',entries:[{card_id:cards[1].card_id,version:1,patch:{note:'bad'}}]}),/范围/);
 a.ctx.other={...seven()};await a.run("UI.applyAssistantWorkflow(other,'other-chat','new')");assert.equal(a.run("UI.assistantCandidateContext('chat').length"),7);assert.equal(a.run("UI.assistantCandidateContext('other-chat').length"),7);
});
test('duplicate model return with same durable user request never creates another candidate batch',async t=>{
 const a=await fixture(t);a.ctx.answer=seven();await a.run("UI.applyAssistantWorkflow(answer,'chat','input',[],'user-request-1')");await assert.rejects(a.run("UI.applyAssistantWorkflow(answer,'chat','input',[],'user-request-1')"),/已处理/);assert.equal(a.cards().length,7);
});
test('two concurrent whole-batch submissions commit exactly one set of records and history',async t=>{
 const a=await fixture(t);await a.apply(seven());const refs=a.json('UI.assistantCurrentCards().map(m=>({id:m.id,version:m.meta.workflow.version}))');const results=await Promise.allSettled([a.confirm(refs),a.confirm(refs)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.json('S.tasks.length'),7);assert.equal(a.json('S.operations.length'),7);
});
test('natural consent and button confirmation use identical scope and persistence',async t=>{
 const a=await fixture(t);await a.apply(seven());await a.apply({type:'workflow',intent:'confirm',entries:a.cards().map(c=>({card_id:c.card_id,version:c.version}))},'确认全部');assert.equal(a.json('S.tasks.length'),7);assert.equal(a.json('S.operations.length'),7);
});
test('a cancelled detached object cannot execute even with unchanged version',async t=>{
 const a=await fixture(t);await a.apply(seven());a.ctx.old=a.json('S.messages[0]');const c=a.cards()[0];await a.apply({type:'workflow',intent:'cancel',entries:[{card_id:c.card_id,version:1}]},'取消');await assert.rejects(a.run('UI.executeAgentAction(old.meta.action,old)'),/旧版本/);assert.equal(a.json('S.tasks.length'),0);
});
test('all confirmation with one incomplete card does not silently save ready subset',async t=>{
 const a=await fixture(t);const input=seven();delete input.entries[3].action.item.exec_date;await a.apply(input);await assert.rejects(a.confirm(),/日期/);assert.equal(a.json('S.tasks.length'),0);
});
for(const store of ['tasks','operations','messages'])test('native transaction abort after request success rolls back '+store+' including card state',async t=>{
 const a=await fixture(t);await a.apply(seven());const before=JSON.stringify(await a.snapshot()),memory=a.json('S');a.ctx.failureStore=store;
 a.run("const originalTx=DB._db.transaction.bind(DB._db);DB._db.transaction=(...args)=>{const tx=originalTx(...args);if(args[1]!=='readwrite')return tx;const originalStore=tx.objectStore.bind(tx);let n=0;tx.objectStore=name=>{const object=originalStore(name);if(name===failureStore){const put=object.put.bind(object);object.put=(...values)=>{const request=put(...values);if(++n===1)request.addEventListener('success',()=>tx.abort());return request;};}return object;};return tx;}");
 await assert.rejects(a.confirm());assert.equal(JSON.stringify(await a.snapshot()),before);assert.deepEqual(a.json('S'),memory);
});
test('external persisted edit blocks a created-card update and retains unrelated fields',async t=>{
 const a=await fixture(t);await a.apply(seven());await a.confirm();const c=a.cards()[0];await a.apply({type:'workflow',intent:'propose',entries:[{card_id:c.card_id,version:1,append_note:'附件随身带'}]});await a.run("DB.put('tasks',{...S.tasks[0],note:'external'})");const before=JSON.stringify(await a.snapshot());await assert.rejects(a.confirm(),/资料已变化/);assert.equal(JSON.stringify(await a.snapshot()),before);
});
test('created repeat-group editing updates original group records',async t=>{
 const a=await fixture(t);await a.apply({type:'workflow',intent:'propose',entries:[{action:{kind:'create_schedule_batch',rule:{title:'反思',date_from:'2026-12-01',date_to:'2026-12-14',weekdays:[2],time_type:'allday',base_score:3}}}]});await a.confirm();const ids=a.json('S.tasks.map(t=>t.id)'),c=a.cards()[0];await a.apply({type:'workflow',intent:'propose',entries:[{card_id:c.card_id,version:1,append_note:'带纸笔'}]});await a.confirm();assert.deepEqual(a.json('S.tasks.map(t=>t.id)'),ids);assert.ok(a.json("S.tasks.every(t=>t.note==='带纸笔')"));
});

test('uniform title selector expands every match and preserves unrelated cards',()=>{
 const context=seven().entries.map((e,i)=>({card_id:'c'+i,version:1,status:'pending',action:e.action}));
 const result=wf.parse({type:'workflow',intent:'propose',scope:{kind:'title_contains',text:'7215'},uniform:{append_note:'地点：B楼'}});
 const expanded=wf.expandUniform(result,context,'所有7215的事项',{minutes:t=>{const [h,m]=t.split(':').map(Number);return h*60+m},format:m=>String(m)});
 assert.deepEqual(expanded.entries.map(e=>e.card_id),['c1','c2','c4']);wf.assertScope(expanded,context,'所有7215的事项');
});
test('uniform start-time updates keep explicit duration and give all-day one hour',()=>{
 const context=[{card_id:'a',version:1,status:'pending',action:{kind:'create_schedule',item:{time_type:'exact',start_time:'15:00',end_time:'17:00'}}},{card_id:'b',version:1,status:'pending',action:{kind:'create_schedule',item:{time_type:'allday'}}}];
 const result=wf.parse({type:'workflow',intent:'propose',scope:{kind:'all'},uniform:{patch:{time_type:'exact',start_time:'19:00'},keep_duration:true}});
 const expanded=wf.expandUniform(result,context,'全部19点',{minutes:t=>{const [h,m]=t.split(':').map(Number);return h*60+m},format:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')});
 assert.deepEqual(expanded.entries.map(e=>e.patch.end_time),['21:00','20:00']);
});
test('model context excludes private snapshots and attachment pixels',()=>{
 const context=wf.contextCards([{card_id:'c',version:1,status:'pending',action:{kind:'update_schedule',target_id:'task',item:{note:'a'},confirmed_scope:'private snapshots',images:['pixels']}}]);assert.equal(JSON.stringify(context).includes('pixels'),false);assert.equal(JSON.stringify(context).includes('private snapshots'),false);
});
