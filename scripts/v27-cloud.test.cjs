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
