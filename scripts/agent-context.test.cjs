'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {fixture}=require('./publisher-fixture.cjs');
const setup=`Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']))}static now(){return new Date('2026-11-15T10:00:00+08:00').getTime()}};S.tasks=Array.from({length:140},(_,i)=>({id:'old'+i,title:'历史背景'+i,execDate:addDays('2025-01-01',i),timeType:'allday',baseScore:3,note:''}));
for(const [id,date]of [['past','2026-10-01'],['today',todayStr()],['future',addDays(todayStr(),7)]])S.tasks.push({id,title:'IDAT9001',seriesId:'course',execDate:date,timeType:'exact',startTime:'10:00',endTime:'11:00',baseScore:7,note:'教授：老师甲',images:[],links:['https://example.com']});S.messages=[];S.operations=[];S.chats=[{id:'chat',title:'合成'}];UI.renderAgent=()=>{};UI.agentChatId='chat';`;
for(const [id,date]of [['past','2026-10-01'],['today',null],['future','future']])test('select and persist actual '+id+' beyond 100 records',async t=>{
 const a=await fixture(t);a.run(setup);const d=date==='future'?a.run('addDays(todayStr(),7)'):date||a.run('todayStr()');
 a.ctx.question=`只把${d}的IDAT9001备注改成带电脑`;
 const wire=a.json("UI.agentContext('chat',question,'task')");assert.ok(wire.tasks.some(x=>x.id===id));assert.ok(wire.tasks.length<=100);
 await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})).concat(S.chats.map(value=>({store:'chats',value}))))");
 const before=await a.snapshot();a.run("result=AIService._localAgent(question,UI.agentContext('chat',question,'task'),'task');action=result.action");
 assert.equal(a.run('action.target_id'),id);assert.equal(a.run('UI.validateAgentRequest(action,question).ok'),true);
 a.run("UI.captureAgentScope(action);S.messages=[{id:'m',chatId:'chat',meta:{action,status:'pending'}}]");await a.run("DB.put('messages',S.messages[0])");await a.run("UI.confirmAgentAction('m')");
 const after=await a.snapshot();for(const old of before.tasks){const actual=after.tasks.find(x=>x.id===old.id);if(old.id===id){assert.equal(actual.note,'带电脑');assert.deepEqual(actual.links,old.links);assert.equal(actual.seriesId,old.seriesId);}else assert.deepEqual(actual,old);}
 assert.deepEqual(after.kv,before.kv);assert.deepEqual(after.todos,before.todos);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),after);
});
test('bounded fields and honest coverage survive server compaction',async t=>{
 const a=await fixture(t);a.run(setup+"S.tasks.forEach(t=>{t.title+='长'.repeat(400);t.note='备'.repeat(900)});");
 const wire=a.json("UI.agentContext('chat','今天日程','task')");assert.ok(wire.tasks.every(x=>x.title.length<=120&&x.note.length<=160));assert.equal(wire.selection.tasks_total,143);assert.equal(wire.selection.tasks_selected,wire.tasks.length);assert.equal(wire.selection.partial,true);
 const api=vm.createContext({require,module:{exports:{}},process:{env:{}},console,URL,AbortController,DOMException,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/ai.js'),'utf8'),api);api.wire=wire;
 const compact=JSON.parse(vm.runInContext('JSON.stringify(compactAgentContext(wire))',api));assert.equal(compact.selection.partial,true);assert.equal(compact.selection.tasks_total,143);assert.deepEqual(compact.tasks.map(x=>x.id),wire.tasks.map(x=>x.id));
});
test('query constraints come from question and results from full records',async t=>{
 const a=await fixture(t);a.run(setup);const date=a.run('todayStr()');a.ctx.question='今天IDAT9001日程';a.ctx.query={entity:'schedule',date_from:'2025-01-01',date_to:'2025-01-01',status:'all',keyword:'wrong'};
 const resolved=a.json('UI.resolveAgentQuery(query,question)');assert.equal(resolved.date_from,date);assert.equal(resolved.keyword,'IDAT9001');assert.deepEqual(a.json('UI.queryAgentItems(UI.resolveAgentQuery(query,question)).map(x=>x.id)'),['today']);
});
test('oversized group cannot turn partial context into partial group mutation',async t=>{
 const a=await fixture(t);a.run(setup+"S.tasks.forEach(t=>{t.title='IDAT9001';t.seriesId='course'});");a.ctx.question='全部IDAT9001备注改成带电脑';
 a.run("result=AIService._localAgent(question,UI.agentContext('chat',question,'task'),'task')");assert.equal(a.run('UI.validateAgentRequest(result.action,question).ok'),false);assert.equal(a.json('S.operations').length,0);
});
test('note value date does not displace target date; conflicting dates ask again',async t=>{
 const a=await fixture(t);a.run(setup);assert.deepEqual(a.json("UI.agentQuestionScope('只把今天IDAT9001备注改成2027年1月1日带电脑').dates"),['2026-11-15']);assert.equal(a.run("UI.resolveAgentQuery({},'今天或明天的日程')"),null);
});
test('selected target storage failure rolls back and retry succeeds once',async t=>{
 const a=await fixture(t);a.run(setup);await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");a.run("action={kind:'update_schedule',target_id:'today',item:{note:'带电脑'}};UI.captureAgentScope(action);S.messages=[{id:'m',chatId:'chat',meta:{action,status:'pending'}}]");await a.run("DB.put('messages',S.messages[0])");const before=await a.snapshot();
 a.run("originalBatch=DB.batch;DB.batch=async()=>{throw Error('synthetic failure')}");await assert.rejects(a.run("UI.executeAgentAction(action,S.messages[0])"));assert.deepEqual(await a.snapshot(),before);a.run('DB.batch=originalBatch');await a.run("UI.confirmAgentAction('m')");const after=await a.snapshot();await a.run("UI.confirmAgentAction('m')");assert.deepEqual(await a.snapshot(),after);assert.equal(a.json('S.operations').length,1);
});
test('model query reply is replaced by verified local count',async t=>{
 const a=await fixture(t);a.run(setup);await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");a.run("UI.agentSelectedRole='task';UI.agentThinking=false;UI.agentSending=null;UI.currentAgentChat=()=>S.chats[0];UI.resizeAgentInput=()=>{};AIService.agent=async()=>({type:'query',reply:'已经查完整库共999条',query:{entity:'schedule',date_from:'2025-01-01',date_to:'2025-01-01',keyword:'wrong',status:'all'}})");a.element('#agent-input').value='今天IDAT9001日程';await a.run('UI.sendAgentMessage()');assert.equal(a.json('S.messages.at(-1).meta.total'),1);assert.equal(a.json('S.messages.at(-1).meta.results')[0].id,'today');assert.ok(!a.run('S.messages.at(-1).content').includes('999'));
});
test('hosted handler passes selected future target and partial coverage to explicit stub',async t=>{
 const a=await fixture(t);a.run(setup);const api=vm.createContext({require,module:{exports:{}},process:{env:{KV_REST_API_URL:'https://synthetic.invalid/redis',KV_REST_API_TOKEN:'synthetic',RATE_LIMIT_SALT:'synthetic',DEEPSEEK_API_KEY:'synthetic'}},console,URL,AbortController,DOMException,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/ai.js'),'utf8'),api);let sent,calls=0;
 api.fetch=async(url,options)=>{if(url==='https://synthetic.invalid/redis')return {ok:true,json:async()=>({result:1})};assert.equal(url,'https://api.deepseek.com/chat/completions');calls++;sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({type:'proposal',action:{kind:'update_schedule',target_id:'future',item:{note:'带电脑'}}})}}]})}};
 const req={method:'POST',headers:{},body:{mode:'agent',agent_role:'task',device_id:'syntheticdevice0123456789abcd',message:'只把2026-11-22的IDAT9001备注改成带电脑',context:a.json("UI.agentContext('chat','只把2026-11-22的IDAT9001备注改成带电脑','task')"),client_date:'2026-11-15'}};
 let result;await api.module.exports(req,{status(){return this},json(value){result=value;return value}});assert.equal(calls,1);assert.equal(result.action.target_id,'future');assert.ok(sent.messages[0].content.includes('有限资料'));assert.ok(sent.messages[1].content.includes('"tasks_total":143'));assert.ok(sent.messages[1].content.includes('"id":"future"'));
});
