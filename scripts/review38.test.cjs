'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
const reply=data=>({ok:true,json:async()=>data});
async function client(t){const a=await fixture(t);a.run("AIService.getDeviceId=()=> 'a'.repeat(32);AIService.source=()=> 'hosted';AIService.setDegraded=()=>{}");t.after(()=>a.run('clearTimeout(AIService.refundTimer)'));return a;}
async function until(check){for(let i=0;!check()&&i<1000;i++)await new Promise(setImmediate);assert.ok(check(),'synthetic request did not start');}

test('page exit while awaiting a previous refund cannot dispatch a new model afterwards',async t=>{
 const a=await client(t);const requests=[];let finishRefund;
 a.ctx.fetch=async(u,o)=>{const body=JSON.parse(o.body);requests.push(body);if(body.mode==='cancel')return new Promise(r=>finishRefund=()=>r(reply({released:true})));return reply({base_score:8.4})};
 a.run("AIService.storeRefund({id:'b'.repeat(32),device:'a'.repeat(32),pendingUntil:0});pending=AIService.hostedRequest({title:'合成课程'});pending.catch(()=>{})");
 await until(()=>!!finishRefund);a.run('AIService.cancelHostedRequests()');finishRefund();
 let result,error;try{result=await a.run('pending')}catch(e){error=e}
 assert.ok(error,'leaving the page must reject the not-yet-dispatched request');assert.equal(result,undefined);
 assert.equal(requests.filter(x=>x.mode!=='cancel').length,0);assert.equal(a.run('AIService.refundEntries().length'),0);
 const next=await a.run("AIService.hostedRequest({title:'恢复后主动重试'})");assert.equal(next.base_score,8.4);assert.equal(requests.filter(x=>x.mode!=='cancel').length,1);
});

for(const role of ['task','planning','chat'])test('page exit cancels '+role+' rather than producing a local fallback reply',async t=>{
 const a=await client(t);let started=false;const calls=[];
 a.ctx.fetch=async(u,o)=>{const b=JSON.parse(o.body);calls.push(b);if(b.mode==='cancel')return reply({released:true});started=true;return new Promise(()=>{})};
 const pending=a.run("AIService.agent('讲个故事',{},'"+role+"')");await until(()=>started);a.run('AIService.cancelHostedRequests()');
 const result=await pending;await a.run('AIService.flushQuotaRefunds()');assert.equal(result.type,'cancelled');assert.equal(calls.filter(x=>x.mode!=='cancel').length,1);assert.equal(a.run('AIService.refundEntries().length'),0);
});

test('independent pages sharing storage retain each other active receipt and success',async t=>{
 const a=await client(t),b=await client(t);b.ctx.localStorage=a.ctx.localStorage;const calls=[];let first,second;
 a.ctx.fetch=async(u,o)=>{calls.push(JSON.parse(o.body));return new Promise(r=>first=()=>r(reply({base_score:8.4})))};
 b.ctx.fetch=async(u,o)=>{calls.push(JSON.parse(o.body));return new Promise(r=>second=()=>r(reply({base_score:7})))};
 const one=a.run("AIService.evaluate('合成课程一')");await until(()=>!!first);const two=b.run("AIService.evaluate('合成课程二')");await until(()=>!!second);
 assert.equal(a.run('AIService.refundEntries().length'),2);first();await one;assert.equal(b.run('AIService.refundEntries().length'),1);second();await two;
 assert.equal(a.run('AIService.refundEntries().length'),0);assert.equal(calls.length,2);assert.notEqual(calls[0].request_id,calls[1].request_id);
});

test('page exit during a sent chat does not save a fallback assistant message or executable card',async t=>{
 const a=await client(t);a.element('#agent-input').focus=()=>{};a.element('#agent-input').value='讲个故事';
 a.run("S.chats=[{id:'review38',title:'合成会话',createdAt:1,updatedAt:1}];S.messages=[];UI.agentChatId='review38';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};UI.resolveAgentRole=()=> 'chat';UI.agentContext=()=>({});UI.agentThinking=false");
 await a.run("DB.put('chats',S.chats[0])");let started=false;
 a.ctx.fetch=async(u,o)=>{if(JSON.parse(o.body).mode==='cancel')return reply({released:true});started=true;return new Promise(()=>{})};
 const pending=a.run('UI.sendAgentMessage()');await until(()=>started);const before=await a.snapshot();
 a.run('AIService.cancelHostedRequests()');await pending;await a.run('AIService.flushQuotaRefunds()');
 assert.equal((await a.run("DB.all('messages')")).filter(x=>x.role==='assistant').length,0);assert.equal(a.run('S.messages.some(x=>x.meta?.action)'),false);assert.deepEqual(await a.snapshot(),before);assert.equal(a.run('UI.agentThinking'),false);
});

test('quiet page-exit cancellation also stops a chat waiting for user-message persistence',async t=>{
 const a=await client(t);a.element('#agent-input').value='讲个故事';
 a.run("S.chats=[{id:'review38-storage',title:'合成会话',createdAt:1,updatedAt:1}];S.messages=[];UI.agentChatId='review38-storage';UI.renderAgent=()=>{throw Error('page exit must not render')};UI.resizeAgentInput=()=>{};UI.resolveAgentRole=()=> 'chat';UI.agentContext=()=>({});UI.agentThinking=false;originalSaveMessage=saveMessage;saveMessage=async m=>{await originalSaveMessage(m);await new Promise(r=>resumeUserSave=r)}");
 await a.run("DB.put('chats',S.chats[0])");let calls=0;a.ctx.fetch=async()=>{calls++;return reply({type:'chat',reply:'不应发送'})};
 const pending=a.run('UI.sendAgentMessage()');await until(()=>a.run("typeof resumeUserSave==='function'"));
 await a.run('UI.cancelAgentMessage({render:false})');a.run('AIService.cancelHostedRequests();resumeUserSave()');await pending;
 assert.equal(calls,0);assert.equal(a.run('UI.agentSending'),null);assert.equal((await a.run("DB.all('messages')")).length,1);
});

for(const source of ['hosted','custom'])test('intentional '+source+' score cancellation does not report service degradation',async t=>{
 const a=await client(t);const changes=[];a.ctx.changes=changes;
 a.run("AIService.source=()=> '"+source+"';AIService.setDegraded=value=>changes.push(value);AIService.customConfig=()=>({endpoint:'https://model.invalid',model:'synthetic',key:'synthetic'});controller=new AbortController()");
 let started=false;a.ctx.fetch=async(u,o)=>{if(JSON.parse(o.body).mode==='cancel')return reply({released:true});started=true;return new Promise(()=>{})};
 const pending=a.run("AIService.evaluate('合成取消评分',{signal:controller.signal})");await until(()=>started);a.run('controller.abort()');await assert.rejects(pending);await a.run('AIService.flushQuotaRefunds()');assert.deepEqual(changes,[]);
});

for(const failure of ['network','timeout'])test('actual '+failure+' remains a service failure with degraded state',async t=>{
 const a=await client(t),changes=[];a.ctx.changes=changes;a.run('AIService.setDegraded=value=>changes.push(value);controller=new AbortController()');let started=false;
 a.ctx.fetch=async(u,o)=>{if(JSON.parse(o.body).mode==='cancel')return reply({released:true});started=true;if(failure==='network')throw TypeError('offline');return new Promise(()=>{})};
 const pending=a.run("AIService.evaluate('合成失败评分',{signal:controller.signal})");pending.catch(()=>{});await until(()=>started);
 if(failure==='timeout')a.run("controller.abort(new Error('识别超时'))");await assert.rejects(pending);await a.run('AIService.flushQuotaRefunds()');assert.deepEqual(changes,[true]);
});
