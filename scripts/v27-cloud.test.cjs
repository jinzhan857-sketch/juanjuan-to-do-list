'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {handlerFixture} = require('./helpers/refund-handler-fixture.cjs');
const {fixture} = require('./publisher-fixture.cjs');
const gate = require('../api/cloud.cjs');
const materials = require('../src/assistant/materials.js');
const origin = 'https://jinzhan857-sketch.github.io';
function response() {
  return {code: null, body: null, headers: {}, status(n) {this.code=n;return this;},
    json(v) {this.body=JSON.parse(JSON.stringify(v));return v;}, end() {}, setHeader(k,v) {this.headers[k]=v;}};
}
function json(data) {return {ok:true,status:200,json:async()=>data};}
function model(data) {return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage:{prompt_tokens:100,completion_tokens:30}});}
function hosted(provider = async()=>model({type:'chat',reply:'合成回答'})) {
  let state='pending',serial=0;
  const calls=[];
  const a=handlerFixture({redis:async command=>command[0]==='HGET'?state:1,model:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body),options});return provider(url,options,calls);
  }});
  Object.assign(a.context.process.env,{VERCEL:'1',AI_ENABLED:'1'});
  const send=async(body={},options={})=>{
    const res=response();
    await a.context.module.exports({method:'POST',headers:{origin,'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.50',...options.headers},
      body:{title:'整理书桌',device_id:'d'.repeat(32),request_id:(++serial).toString(16).padStart(32,'0'),...body},...options,headers:{origin,'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.50',...options.headers}},res);
    return res;
  };
  return {...a,calls,send,setState:v=>state=v};
}
test('cloud preflight permits the exact Pages origin without touching providers',()=>{
  const res=response();assert.equal(gate.prepare({method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'},query:{}},res,{}),true);
  assert.equal(res.code,204);assert.equal(res.headers['Access-Control-Allow-Origin'],origin);
});
for(const headers of [{origin:'https://attacker.invalid'},{origin:origin+'.attacker.invalid'},{origin:origin,'access-control-request-method':'DELETE'},{origin:origin,'access-control-request-method':'POST','access-control-request-headers':'authorization'}])test('cloud rejects unapproved origin or preflight '+JSON.stringify(headers),()=>{
  const res=response();assert.equal(gate.prepare({method:'OPTIONS',headers},res,{}),true);assert.equal(res.code,403);
});
test('disabled cloud exposes only safe health metadata and keeps refunds available',async()=>{
  const a=hosted();a.context.process.env.AI_ENABLED='0';
  const closed=await a.send();assert.equal(closed.code,503);assert.equal(closed.body.code,'service_disabled');assert.equal(a.calls.length,0);
  const health=await a.send({}, {method:'GET',query:{health:'1'}});assert.equal(health.body.enabled,false);assert.equal(health.body.images,false);assert.ok(!JSON.stringify(health.body).includes('synthetic'));
  assert.equal((await a.send({mode:'cancel'})).body.released,true);assert.equal(a.calls.length,0);
});
test('cloud does not use or require IP identity',async()=>{
  const a=hosted();const r=await a.send({mode:'agent',message:'你好',context:{}},{headers:{'x-vercel-forwarded-for':undefined,'x-forwarded-for':'spoofed'}});
  assert.equal(r.code,200);assert.equal([...a.values.keys()].some(k=>k.includes(':ip:')),false);
});
test('cloud rejects oversize, malformed and non-JSON payloads before quota or provider calls',async()=>{
  const a=hosted();assert.equal((await a.send({}, {headers:{'content-type':'text/plain'}})).code,415);
  assert.equal((await a.send({}, {body:'{'})).code,400);
  assert.equal((await a.send({}, {body:{message:'a'.repeat(gate.maxBodyBytes+1)}})).code,413);
  assert.equal(a.calls.length,0);assert.equal(a.quota.reserve?true:false,true);
});
test('cloud images fail clearly before quota and do not remove the original image',async()=>{
  const a=hosted(),image={id:'i',data:'data:image/png;base64,AA=='};
  const result=await a.send({mode:'agent',message:'图片',context:{selected_images:[image]}});
  assert.equal(result.code,400);assert.equal(result.body.code,'images_unsupported');assert.equal(a.calls.length,0);assert.equal(image.data,'data:image/png;base64,AA==');
});
test('plain cloud chat is exactly one fixed-provider request, without search',async()=>{
  const a=hosted(),r=await a.send({mode:'agent',message:'解释三角形',context:{}});
  assert.equal(r.code,200);assert.equal(r.body.type,'chat');assert.deepEqual(a.calls.map(c=>c.url),['https://api.deepseek.com/chat/completions']);
  assert.equal(a.calls[0].options.redirect,'error');assert.equal(r.body.provider_usage.model_requests,1);assert.equal(r.body.provider_usage.prompt_tokens,100);
  assert.ok(!JSON.stringify(r.body).includes('synthetic'));
});
test('cloud score still uses the original scoring parser',async()=>{
  const a=hosted(async()=>model({task:'整理书桌',note:'',base_score:3,vague:false}));
  const r=await a.send();assert.equal(r.code,200);assert.equal(r.body.base_score,3);assert.equal(a.calls[0].body.max_tokens,300);
});
test('cloud search reads once and produces an answer with matching sources',async()=>{
  const a=hosted(async(url,options,calls)=>url.endsWith('/search')?json({results:[{url:'https://example.com',title:'合成来源',content:'合成事实'}]}):model(calls.length===1?{type:'research',query:'合成查询'}:{type:'chat',reply:'合成事实'}));
  const r=await a.send({mode:'agent',message:'搜索合成资料',context:{}});
  assert.equal(r.code,200);assert.equal(r.body.materials.evidence[0].url,'https://example.com/');
  assert.deepEqual(a.calls.map(c=>c.url.split('/').at(-1)),['completions','search','completions']);
  assert.equal(r.body.provider_usage.model_requests,2);assert.equal(r.body.provider_usage.search_requests,1);
  assert.match(a.calls.at(-1).body.messages.at(-1).content,/不可信外部资料/);
});
test('cloud links fetch before understanding, and a followup can reuse the saved text',async()=>{
  const a=hosted(async url=>url.endsWith('/fetch')?json({title:'Example',content:'正文内容'}):model({type:'chat',reply:'正文内容'}));
  const first=await a.send({mode:'agent',message:'阅读 https://example.com',context:{}});assert.equal(first.code,200);
  assert.deepEqual(a.calls.map(c=>c.url.split('/').at(-1)),['fetch','completions']);
  const second=await a.send({mode:'agent',message:'刚才这个网页说什么',context:{previous_materials:[first.body.materials]}});assert.equal(second.code,200);assert.equal(a.calls.length,3);assert.equal(second.body.materials.evidence[0].reused,true);
});
test('a failed link never becomes a successful answer or billable model request',async()=>{
  const a=hosted(async()=>json({content:''}));const r=await a.send({mode:'agent',message:'阅读 https://example.com',context:{}});
  assert.equal(r.code,503);assert.equal(a.calls.length,1);assert.equal([...a.values].filter(([k])=>k.startsWith('quota:')).every(([,v])=>v===0),true);
});
test('untrusted previous sources reject private URLs without provider calls',()=>{
  assert.throws(()=>materials.previous([{content:'test',evidence:[{kind:'link',url:'http://127.0.0.1',title:'private'}]}]),/不合法/);
});
test('cancellation after research cannot launch search or a second model call',async()=>{
  let a;a=hosted(async()=>{a.setState('cancelled');return model({type:'research',query:'stop'});});
  const r=await a.send({mode:'agent',message:'搜索测试',context:{}});assert.equal(r.code,503);assert.equal(a.calls.length,1);
});
test('repeated research is bounded and never triggers a tool loop',async()=>{
  const a=hosted(async url=>url.endsWith('/search')?json({results:[{url:'https://example.com',content:'fact'}]}):model({type:'research',query:'loop'}));
  const r=await a.send({mode:'agent',message:'搜索',context:{}});assert.equal(r.code,503);assert.equal(a.calls.length,3);
});
test('truncated cloud answers refund quota rather than presenting partial success',async()=>{
  const a=hosted(async()=>json({choices:[{finish_reason:'length',message:{content:'{"type":"chat","reply":"partial"}'}}]}));
  assert.equal((await a.send({mode:'agent',message:'测试',context:{}})).code,422);
});
test('actual hosted proposal still requires confirmation and supports undo',async t=>{
  const a=await fixture(t),api=hosted(async()=>model({type:'workflow',intent:'propose',reply:'请核对',entries:[{action:{kind:'create_todo',item:{title:'云端合成待办',base_score:3}}}]}));
  a.run("S.chats=[{id:'cloud',title:'合成聊天'}];S.messages=[];UI.agentChatId='cloud';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};AIService.setDegraded=()=>{};");await a.run("DB.put('chats',S.chats[0])");
  a.ctx.fetch=async(url,options)=>{const res=await api.send(JSON.parse(options.body));return{ok:res.code===200,status:res.code,json:async()=>res.body};};
  a.element('#agent-input').value='创建一个待办，云端合成待办';await a.run('UI.sendAgentMessage()');assert.equal(a.run('S.todos.length'),0);
  const refs=a.json('UI.assistantCurrentCards().map(m=>({id:m.id,version:m.meta.workflow.version}))');assert.equal(refs.length,1);a.ctx.refs=refs;
  await a.run('UI.confirmAgentSelection(refs)');assert.equal(a.run('S.todos.length'),1);
  const pet=a.json('S.pet');await a.run('UI.undoAgentOperation(S.messages.at(-1).id)');assert.equal(a.run('S.todos.length'),0);assert.deepEqual(a.json('S.pet'),pet);
});
test('cloud image selection shows a message without reading files or erasing drafts',async t=>{
  const a=await fixture(t);a.run("AIService.source=()=> 'hosted';UI.agentPictures=[{id:'old',name:'保留',data:'data:image/png;base64,AA=='}]");
  await a.run("UI.addMaterialImages([{arrayBuffer(){throw Error('must not read')}}])");assert.equal(a.run('UI.agentPictures.length'),1);assert.match(a.notices.at(-1),/暂不支持图片/);
});
test('cloud failure remains an error and cannot invoke the local agent fallback',async t=>{
  const a=await fixture(t);a.run("AIService.hostedRequest=async()=>{throw Error('暂时关闭')};AIService._localAgent=()=>{throw Error('must not fabricate success')};AIService.setDegraded=()=>{}");
  const r=await a.run("AIService.agent('你好',{},'chat')");assert.equal(r.type,'error');assert.match(r.reply,/关闭/);
});

test('cloud chat preserves a complete 2400-character answer including its ending',async()=>{
 const reply='完整内容'.repeat(600)+'结束标记。';const a=hosted(async()=>model({type:'chat',reply}));
 const r=await a.send({mode:'agent',message:'写一篇长文',context:{}});assert.equal(r.code,200);assert.equal(r.body.reply,reply);assert.ok(r.body.reply.endsWith('结束标记。'));
});
test('custom chat preserves the same full answer',async t=>{
 const a=await fixture(t);a.ctx.longReply='完整内容'.repeat(600)+'结束标记。';
 const result=a.run("AIService.normalizeAgent({type:'chat',reply:longReply},{},'长文')");assert.equal(result.reply,a.ctx.longReply);
});

test('first profile persists its default pet before editing a newly saved schedule',async t=>{
 const a=await fixture(t);await a.run("DB.del('kv','pet');App.loadPet()");
 assert.deepEqual(JSON.parse(JSON.stringify(await a.run("DB.get('kv','pet')"))),a.json('S.pet'));
 await a.run('UI.onSave()');const id=a.run('S.tasks[0].id');a.ctx.savedId=id;
 await a.run("settlementExpectation('tasks')");assert.equal(a.run('S.tasks[0].id'),id);
 const before=a.json('S.pet');await a.run('App.loadPet()');assert.deepEqual(a.json('S.pet'),before);
});

test('real hosted memory result is only a proposal until the existing review saves it',async t=>{
 const a=await fixture(t),api=hosted(async()=>model({type:'memory_import',reply:'请核对两条个人记忆。',cards:[{category:'学业与工作',content:'我在学习合成材料工程。'},{category:'兴趣与交流偏好',content:'我喜欢摄影，回答时希望先说重点。'}]}));
 a.run("S.chats=[{id:'memory-chat',title:'新聊天'}];S.messages=[];S.memories=[];UI.agentChatId='memory-chat';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};UI.renderMemoryPage=()=>{};AIService.setDegraded=()=>{};");await a.run("DB.put('chats',S.chats[0])");
 a.ctx.fetch=async(url,options)=>{const r=await api.send(JSON.parse(options.body));return{ok:r.code===200,status:r.code,json:async()=>r.body};};
 const before=await a.snapshot();a.element('#agent-input').value='请把下面的个人资料整理成记忆：我在学习合成材料工程，喜欢摄影，交流时先说重点。';await a.run('UI.sendAgentMessage()');
 assert.equal((await a.run("DB.all('memories')")).length,0);assert.equal(a.run('S.messages.at(-1).meta.memoryImportCards.length'),2);
 a.run("UI.switchPage=name=>{reviewedPage=name}");await a.run('UI.reviewChatMemories(S.messages.at(-1).id)');assert.equal(a.run('reviewedPage'),'memory');assert.equal(a.run('UI.memoryImportCards.length'),2);
 a.run("UI.memoryImportCards[0].content='我在学习材料工程，资料已核对。'");await a.run('UI.saveAllMemoryImportCards()');
 assert.equal((await a.run("DB.all('memories')")).length,2);assert.equal(a.run('S.messages.at(-1).meta.memoryImportCards.length'),0);assert.equal(a.run('S.memories[0].content'),'我在学习材料工程，资料已核对。');
 assert.deepEqual((await a.snapshot()).kv,before.kv);assert.equal(a.run('S.pet.memoryEnabled'),undefined);
});

test('memory confirmation is atomic and retry deduplicates instead of silently overwriting',async t=>{
 const a=await fixture(t);a.run("S.memories=[];S.messages=[];UI.renderMemoryPage=()=>{};UI.memoryImportCards=[{id:'one',category:'个人基本信息',content:'我学习合成材料工程。'}];originalBatch=DB.batch;DB.batch=async()=>{throw Error('synthetic failure')}");
 await assert.rejects(a.run('UI.saveAllMemoryImportCards()'),/synthetic failure/);assert.equal(a.run('S.memories.length'),0);assert.equal(a.run('UI.memoryImportCards.length'),1);
 a.run('DB.batch=originalBatch');await a.run('UI.saveAllMemoryImportCards()');a.run("UI.memoryImportCards=[{id:'two',category:'个人基本信息',content:'我学习合成材料工程。'}]");await a.run('UI.saveAllMemoryImportCards()');assert.equal(a.run('S.memories.length'),1);assert.equal((await a.run("DB.all('memories')")).length,1);
});

test('custom memory proposals share validation and retain complete content',async t=>{
 const a=await fixture(t);a.ctx.memoryReply={type:'memory_import',cards:[{category:'兴趣与交流偏好',content:'我喜欢摄影，希望回答先说重点。'}]};
 const r=a.run('AIService.normalizeAgent(memoryReply)');assert.equal(r.cards[0].content,a.ctx.memoryReply.cards[0].content);
 a.ctx.memoryReply.cards[0].content='长'.repeat(1001);assert.throws(()=>a.run('AIService.normalizeAgent(memoryReply)'),/长度不完整/);
});

test('enabled memory includes work and interests in a separate chat and remains absent when disabled',async t=>{
 const a=await fixture(t);a.run("S.messages=[];S.memories=[{id:'work',category:'学业与工作',content:'我学习材料工程。'},{id:'interest',category:'兴趣与交流偏好',content:'我喜欢摄影，回答先说重点。'}];S.pet.memoryEnabled=true");
 const context=a.json("UI.agentContext('new-chat','我的专业和兴趣是什么')");assert.deepEqual(context.memories.map(m=>m.id),['work','interest']);
 a.run('S.pet.memoryEnabled=false');assert.deepEqual(a.json("UI.agentContext('new-chat','我的专业和兴趣是什么').memories"),[]);
});

test('first use atomically seeds two ordinary schedules and three todos exactly once',async t=>{
 const a=await fixture(t);await a.run("Promise.all([...DATA_STORES,'kv'].map(store=>DB.clear(store)))");
 const results=await a.run('Promise.all([App.initializeFirstUse(),App.initializeFirstUse()])');assert.equal(results.filter(Boolean).length,1);
 const data=await a.snapshot();assert.equal(data.tasks.length,2);assert.equal(data.todos.length,3);assert.equal(data.tasks[0].execDate,a.run('todayStr()'));
 const sleep=data.tasks.find(t=>t.title==='今晚早睡哦！');assert.equal(sleep.startTime,'23:00');assert.equal(sleep.endTime,'00:00');assert.equal(sleep.endDayOffset,1);assert.equal(sleep.note,'睡不着可以找卷卷聊天呀！');
 await a.run("DB.clear('tasks');DB.clear('todos')");assert.equal(await a.run('App.initializeFirstUse()'),false);assert.equal((await a.snapshot()).tasks.length,0);assert.equal((await a.snapshot()).todos.length,0);
});

test('first use defaults to P and fixed blue even when the system is dark, without resetting later choices',async t=>{
 const a=await fixture(t);await a.run("Promise.all([...DATA_STORES,'kv'].map(store=>DB.clear(store)))");
 a.run("App.themeMedia={matches:true}");assert.equal(await a.run('App.initializeFirstUse()'),true);
 assert.equal((await a.run("DB.get('kv','pet')")).personType,'P');assert.equal(a.run('App.followsSystem()'),false);assert.equal(a.run('App.activeAppearance()'),'blue');
 assert.equal(a.run("localStorage.getItem('juanjuan_light_theme')"),'blue');
 a.run("localStorage.setItem('juanjuan_follow_system','1');localStorage.setItem('juanjuan_light_theme','warm');localStorage.setItem('juanjuan_fixed_theme','black')");
 assert.equal(await a.run('App.initializeFirstUse()'),false);assert.equal(a.run('App.followsSystem()'),true);assert.equal(a.run("localStorage.getItem('juanjuan_light_theme')"),'warm');assert.equal(a.run("localStorage.getItem('juanjuan_fixed_theme')"),'black');
});
test('any existing use or restored profile prevents onboarding from adding records',async t=>{
 const a=await fixture(t);const before=await a.snapshot();assert.equal(await a.run('App.initializeFirstUse()'),false);assert.deepEqual(await a.snapshot(),before);
 await a.run("DB.clear('kv');DB.put('chats',{id:'used',title:'已有聊天'})");assert.equal(await a.run('App.initializeFirstUse()'),false);assert.equal((await a.snapshot()).tasks.length,0);
});

test('onboarding records use normal editing completion rewards and deletion',async t=>{
 const a=await fixture(t);await a.run("Promise.all([...DATA_STORES,'kv'].map(store=>DB.clear(store)))");await a.run('App.initializeFirstUse()');
 await a.run("(async()=>{S.tasks=await DB.all('tasks');S.todos=await DB.all('todos');S.pet=await DB.get('kv','pet');S.dayStats={};UI.renderHome=()=>{};UI.renderTodos=()=>{};UI.mask=()=>{};PetView.celebrate=()=>{};})()");
 const todoId=a.run('S.todos[0].id');a.ctx.todoId=todoId;a.run("UI.openTodoEditor(todoId);UI.cState.resultTitle='已编辑的引导待办';UI.cState.rawText='已编辑的引导待办';UI.cState.resultNote='我自己修改的备注'");a.element('#c-title').value='已编辑的引导待办';await a.run('UI.onSave()');assert.equal(a.run('S.todos.find(t=>t.id===todoId).title'),'已编辑的引导待办');
 a.run("UI.confirm=(title,body,fn)=>{todoConfirmation=fn()};UI.completeTodo(todoId)");await a.run('todoConfirmation');assert.equal(a.run('S.todos.find(t=>t.id===todoId).done'),true);assert.ok(a.run('S.todos.find(t=>t.id===todoId).finalScore')>0);
 await a.run("UI.confirmStatus(S.tasks.find(t=>t.title==='欢迎使用卷卷！'),'done',Date.now())");assert.equal(a.run("S.tasks.find(t=>t.title==='欢迎使用卷卷！').status"),'done');
 await a.run('removeTodo(todoId);removeTask(S.tasks[0].id)');assert.equal((await a.snapshot()).todos.length,2);assert.equal((await a.snapshot()).tasks.length,1);assert.equal(await a.run('App.initializeFirstUse()'),false);
});

test('5000 Chinese characters reach the provider intact and 5001 reject before dispatch',async()=>{
 const a=hosted(),text='合'.repeat(4996)+'结尾标记';assert.equal(text.length,5000);const r=await a.send({mode:'agent',message:text,context:{}});assert.equal(r.code,200);assert.ok(a.calls[0].body.messages.at(-1).content.endsWith(text));
 const rejected=hosted(),bad=await rejected.send({mode:'agent',message:text+'超',context:{}});assert.equal(bad.code,400);assert.match(bad.body.error,/5000/);assert.equal(rejected.calls.length,0);
});

test('long chat drafts survive restoration and sending without losing the ending',async t=>{
 const a=await fixture(t);a.run("S.chats=[{id:'long',title:'新聊天'}];S.messages=[];UI.agentChatId='long';UI.agentPictures=[];UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};UI.renderMaterialPreview=()=>{};AIService.agent=async text=>{sentText=text;return {type:'chat',reply:'已收到'}}");await a.run("DB.put('chats',S.chats[0])");
 const text='长'.repeat(4996)+'结尾标记';a.element('#agent-input').value=text;await a.run('UI.saveMaterialDraft()');a.element('#agent-input').value='';await a.run('UI.restoreMaterialDraft()');assert.equal(a.element('#agent-input').value,text);
 await a.run('UI.sendAgentMessage()');assert.equal(a.run('sentText'),text);assert.equal(a.run("S.messages.find(m=>m.role==='user').content"),text);
 a.element('#agent-input').value=text+'超';a.run('sentText=null');await a.run('UI.sendAgentMessage()');assert.equal(a.run('sentText'),null);assert.match(a.notices.at(-1),/5000/);assert.equal(a.element('#agent-input').value,text+'超');
});

test('oversized paste preserves existing text while selected-text replacement fits',async t=>{
 const a=await fixture(t);let prevented=0;const event={currentTarget:{value:'原文',selectionStart:0,selectionEnd:2},clipboardData:{getData:()=> '长'.repeat(5000)},preventDefault(){prevented++;}};a.ctx.pasteEvent=event;
 a.run('UI.guardAgentPaste(pasteEvent)');assert.equal(prevented,0);event.currentTarget.selectionEnd=0;a.run('UI.guardAgentPaste(pasteEvent)');assert.equal(prevented,1);assert.equal(event.currentTarget.value,'原文');assert.match(a.notices.at(-1),/原文未改/);
});

test('unstructured model replies have a precise failure and known usage while refunding quota',async()=>{
 const a=hosted(async()=>json({choices:[{finish_reason:'stop',message:{content:'我没有你的出生年份。'}}],usage:{prompt_tokens:100,completion_tokens:20}}));
 const r=await a.send({mode:'agent',message:'我几岁了',context:{}});assert.equal(r.code,503);assert.equal(r.body.code,'invalid_model_reply');assert.match(r.body.error,/回答格式/);assert.equal(r.body.provider_usage.complete,true);assert.equal(r.body.provider_usage.model_requests,1);assert.equal(r.body.provider_usage.completion_tokens,20);assert.equal([...a.values].filter(([k])=>k.startsWith('quota:')).every(([,v])=>v===0),true);
});

test('network failures retain unknown model billing rather than reporting zero known cost',async()=>{
 const a=hosted(async()=>{throw Error('synthetic network failure')});const r=await a.send({mode:'agent',message:'合成',context:{}});assert.equal(r.code,503);assert.equal(r.body.provider_usage.complete,false);assert.equal(r.body.provider_usage.model_requests,1);
});

test('basic identity facts are retained when many newer memories exceed the context budget',async t=>{
 const a=await fixture(t);a.run("S.pet.memoryEnabled=true;S.memories=[{id:'birth',category:'个人基本信息',content:'我出生于2001年。',createdAt:1},...Array.from({length:40},(_,i)=>({id:'work'+i,category:'学业与工作',content:'合成项目背景'.repeat(20),createdAt:100+i}))]");
 const items=a.json("UI.planningMemoryItems('我几岁了')");assert.equal(items[0].id,'birth');assert.ok(items.reduce((n,m)=>n+m.content.length,0)<=2400);
});

test('an oversized memory cannot exhaust the budget and hide all later short facts',async t=>{
 const a=await fixture(t);a.run("S.memories=[{id:'long',category:'个人基本信息',content:'长'.repeat(4000),createdAt:2},{id:'birth',category:'个人基本信息',content:'我出生于2001年。',createdAt:1}]");
 assert.deepEqual(a.json("UI.planningMemoryItems('我几岁了').map(m=>m.id)"),['birth']);
});

test('feeding notice uses current satiety and fresh pets start within their profile cap',async t=>{
 const a=await fixture(t);assert.equal(a.run('S.pet.satietyTask'),a.run('petFullLine()'));assert.ok(a.run('petSatiety()<=petEatMax()'));
 a.run("noticeHtml=[];document.createElement=()=>({style:{},setAttribute(){},set innerHTML(text){noticeHtml.push(text)},querySelector:()=>({})});S.tasks=[];S.pet.satietyTask=5;S.pet.todayIntake=0;S.pet.fridge=[{id:'food',value:1,name:'饼干',emo:'🍪'}];UI.renderNotices()");assert.equal(a.json('noticeHtml').some(text=>text.includes('没吃饱')),false);const before=a.json('S.pet');assert.equal(await a.run("PetSystem.feedFromFridge('food')"),null);assert.deepEqual(a.json('S.pet'),before);
 a.run("S.pet.satietyTask=1;S.pet.todayIntake=20;noticeHtml=[];UI.renderNotices()");assert.ok(a.json('noticeHtml').some(text=>text.includes('现在还没吃饱（1/2）')));assert.ok((await a.run("PetSystem.feedFromFridge('food')")).fed>0);
});
