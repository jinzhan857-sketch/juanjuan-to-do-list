'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(){
  const app=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone});
  const html=fs.readFileSync(path.join(process.env.ISSUE5_SOURCE_ROOT||path.join(__dirname,'..'),'index.html'),'utf8');
  vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),app);
  const run=code=>vm.runInContext(code,app,{timeout:2000});
  run("S.tasks=[{id:'a',title:'同名课程',seriesId:'group-A',execDate:'2026-11-09',timeType:'exact',startTime:'10:00',endTime:'11:00',note:'old',baseScore:7},{id:'b',title:'同名课程',seriesId:'group-A',execDate:'2026-11-16',timeType:'exact',startTime:'10:00',endTime:'11:00',note:'old',baseScore:7},{id:'c',title:'同名课程',seriesId:'group-B',execDate:'2026-11-10',timeType:'exact',startTime:'10:00',endTime:'11:00',note:'other',baseScore:7}];S.todos=[];S.messages=[];S.operations=[];S.pet={synthetic:true};DB.writes=[];DB.deleted=[];DB.put=async(store,value)=>DB.writes.push({store,value:JSON.parse(JSON.stringify(value))});DB.del=async(store,id)=>DB.deleted.push({store,id});UI.renderAgent=()=>{};UI.agentChatId='test';toast=()=>{};");
  run("DB.batch=async(changes)=>{for(const c of changes){if(c.type==='delete')await DB.del(c.store,c.key);else await DB.put(c.store,c.value,c.key);}};");
  const ledger=require('./helpers/quota-oracle.cjs').quotaOracle();const api=vm.createContext({require:name=>name==='./quota.cjs'?{createQuota:()=>ledger}:require(name),module:{exports:{}},process:{env:{}},console,URL,AbortController,DOMException,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(process.env.ISSUE5_SOURCE_ROOT||path.join(__dirname,'..'),'api/ai.js'),'utf8'),api);
  const wire=JSON.parse(run("JSON.stringify(UI.agentContext('test','','task'))"));
  const parse=(data,context=wire)=>{api.data=data;api.context=context;return JSON.parse(vm.runInContext('JSON.stringify(parseAgentResult(JSON.stringify(data),compactAgentContext(context)))',api));};
  return {app,api,run,wire,parse,json:expr=>JSON.parse(run('JSON.stringify('+expr+')'))};
}
function proposal(series_id='group-A',kind='update_schedule_batch'){
  return {type:'batch_proposal',action:{kind,rule:{series_id,date_from:'2026-11-09',date_to:'2026-11-17',weekdays:[1,2],match_title:'同名课程',match_start_time:'10:00',match_end_time:'11:00'},item:{note:'new'}}};
}
test('frontend and hosted context preserve opaque identity and field whitelist',()=>{
  const a=load();
  a.api.wire={...a.wire,tasks:a.wire.tasks.map(t=>({...t,private_extra:'never copy'}))};
  const compact=JSON.parse(vm.runInContext('JSON.stringify(compactAgentContext(wire))',a.api));
  assert.deepEqual(compact.tasks.map(t=>t.series_id),['group-A','group-B','group-A']);
  assert.equal('private_extra' in compact.tasks[0],false);
  assert.deepEqual(a.wire.tasks.map(t=>t.series_id),compact.tasks.map(t=>t.series_id));
});
for(const value of ['x','组编号：A','x'.repeat(80)]){
  test('valid identity round trip: '+value.length,()=>{
    const a=load();a.run('S.tasks[0].seriesId='+JSON.stringify(value));
    const wire=a.json("UI.agentContext('test','','task')");
    const data=a.parse(proposal(value),wire);assert.equal(data.action.rule.series_id,value);
    a.app.data=data;assert.equal(a.run('AIService.normalizeAgent(data).action.rule.series_id'),value);
  });
}
for(const value of [0,42,true,{},[],['group-A'],'',' group-A','group-A ','x'.repeat(81),'a\nb']){
  test('invalid identity never becomes a valid target: '+JSON.stringify(value),async()=>{
    const a=load(), data=proposal(value);a.app.data=data;
    assert.equal(a.run('AIService.normalizeAgent(data).type'),'clarify');
    assert.equal(a.parse(data).type,'clarify');
    a.app.action=data.action;assert.equal(a.run('UI.validateAgentAction(action).ok'),false);
    await assert.rejects(a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})"));
    assert.deepEqual(a.json('DB.writes'),[]);
  });
}
for(const kind of ['update_schedule_batch','delete_schedule_batch']){
  test(kind+' confirms, persists and undoes only the selected group',async()=>{
    const a=load();const data=a.parse(proposal('group-A',kind));a.app.data=data;
    a.run('action=AIService.normalizeAgent(data).action');
    assert.equal(a.run("UI.validateAgentRequest(action,'每周一同名课程备注改成new').ok"),true);
    assert.equal(a.json('UI.agentActionRows(action)').find(r=>r[0]==='影响')[1],'2 条日程');
    const before=a.json('S.tasks'),pet=a.json('S.pet');
    a.run("UI.captureAgentScope(action);S.messages=[{id:'m',chatId:'test',meta:{action,status:'pending'}}]");
    await a.run("UI.confirmAgentAction('m')");
    assert.equal(a.run("S.messages[0].type"),'action_result');
    assert.deepEqual(a.json('S.tasks.find(t=>t.id==="c")'),before[2]);
    assert.deepEqual(a.json('S.operations[0].before.map(t=>t.id)'),['a','b']);
    assert.deepEqual(a.json(kind==='delete_schedule_batch'?'DB.deleted.filter(x=>x.store==="tasks").map(x=>x.id)':'DB.writes.filter(x=>x.store==="tasks").map(x=>x.value.id)'),['a','b']);
    await a.run("UI.undoAgentOperation('m')");
    assert.deepEqual(a.json('S.tasks.slice().sort((a,b)=>a.id.localeCompare(b.id))'),before);
    assert.deepEqual(a.json('S.pet'),pet);
  });
}
test('unknown ID and omitted ID cannot select identified schedules',()=>{
  const a=load();assert.equal(a.parse(proposal('invented')).type,'clarify');
  for(const id of [null,undefined]){
    a.app.action=proposal(id).action;
    // undefined default argument is replaced by proposal(), so explicitly omit it.
    if(id===undefined)a.run('delete action.rule.series_id');
    assert.equal(a.run('UI.validateAgentAction(action).ok'),false);
  }
});
test('same title in two groups remains ambiguous even if model guesses a real ID',()=>{
  const a=load();a.run("S.tasks[2].execDate='2026-11-09'");a.app.action=proposal().action;
  assert.equal(a.run("UI.validateAgentRequest(action,'全部同名课程备注改成new').ok"),false);
});
test('existing ungrouped path rejects mixed groups and does not change data during validation',()=>{
  const a=load();a.run('S.tasks.forEach(t=>delete t.seriesId)');a.app.action=proposal(null).action;
  assert.equal(a.run('UI.validateAgentAction(action).ok'),true);
  a.run("S.tasks[2].startTime='12:00';action.rule.match_start_time=null");
  assert.equal(a.run('UI.validateAgentAction(action).ok'),false);
  assert.deepEqual(a.json('DB.writes'),[]);
});
test('changed group membership after confirmation stops writes',async()=>{
  const a=load();a.app.action=proposal().action;a.run("UI.captureAgentScope(action);S.tasks[1].seriesId='group-B'");
  await assert.rejects(a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})"),/范围已变化/);
  assert.deepEqual(a.json('DB.writes'),[]);
});
test('hosted handler sends group IDs and rejects model-invented IDs without network',async()=>{
  const a=load();let output=proposal(), sent, calls=0;
  a.api.process.env={KV_REST_API_URL:'https://synthetic.invalid/redis',KV_REST_API_TOKEN:'synthetic',RATE_LIMIT_SALT:'synthetic',DEEPSEEK_API_KEY:'synthetic'};
  a.api.fetch=async(url,options)=>{
    if(url==='https://synthetic.invalid/redis')return {ok:true,json:async()=>({result:1})};
    assert.equal(url,'https://api.deepseek.com/chat/completions');calls++;sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(output)}}]})};
  };
  const req={method:'POST',headers:{},body:{mode:'agent',agent_role:'task',request_id:'a'.repeat(32),device_id:'syntheticdevice0123456789abcd',message:'每周一同名课程备注改成new',context:a.wire,client_date:'2026-11-15'}};
  let result,status;const res={setHeader(){},status(code){status=code;return this;},json(value){result=value;return value;}};
  await a.api.module.exports(req,res);assert.equal(status,200);assert.equal(result.action.rule.series_id,'group-A');
  assert.match(sent.messages[1].content,/"series_id":"group-A"/);
  assert.match(sent.messages[0].content,/rule.series_id/);
  output=proposal('invented');req.body.request_id='b'.repeat(32);await a.api.module.exports(req,res);
  assert.equal(result.type,'clarify');assert.equal(calls,2);
});

test('custom model path carries identity in both prompt and normalized result',async()=>{
  const a=load();a.app.output=proposal();a.app.context=a.wire;
  a.run("AIService.source=()=> 'custom';AIService.taskWorkflowResult=()=>null;AIService.setDegraded=()=>{};AIService.customRequest=async(messages)=>{captured=messages;return output;}");
  const result=await a.run("AIService.agent('每周一同名课程备注改成new',context,'task')");
  assert.equal(result.action.rule.series_id,'group-A');
  assert.match(a.run('captured[0].content'),/rule.series_id/);
  assert.match(a.run('captured[1].content'),/"series_id":"group-A"/);
});
test('invalid stored identity is omitted from context and cannot trigger title fallback writes',async()=>{
  const a=load();a.run("S.tasks.forEach(t=>t.seriesId=42)");a.app.action=proposal(null).action;
  assert.ok(a.json("UI.agentContext('test','','task').tasks").every(t=>t.series_id===null));
  a.api.context={tasks:[{id:'a',series_id:['group-A']}]};
  assert.equal(vm.runInContext('compactAgentContext(context).tasks[0].series_id',a.api),null);
  await assert.rejects(a.run("UI.executeAgentAction(action,{id:'m',chatId:'test'})"),/编号无效/);
  assert.deepEqual(a.json('DB.writes'),[]);
});
test('planning adoption validates raw group IDs before confirmation',()=>{
  const a=load();a.app.data={type:'recommendation',recommendations:[{action:proposal(['group-A']).action}]};
  assert.equal(a.run('UI.validateAgentAction(AIService.normalizeAgent(data).recommendations[0].action).ok'),false);
});
