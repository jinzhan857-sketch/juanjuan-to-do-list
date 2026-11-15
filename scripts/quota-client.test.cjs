'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./publisher-fixture.cjs');
async function client(t){const a=await fixture(t);a.ctx.crypto=require('node:crypto').webcrypto;a.run("AIService.getDeviceId=()=> 'a'.repeat(32);AIService.source=()=> 'hosted';AIService.setDegraded=()=>{}");return a;}
const body=options=>JSON.parse(options.body),reply=data=>({ok:true,json:async()=>data});
for(const source of ['evaluate','agent'])test('successful hosted '+source+' has request ID, clears receipt and sends once',async t=>{const a=await client(t),calls=[];a.ctx.fetch=async(u,o)=>{calls.push(body(o));return reply(source==='evaluate'?{base_score:8.4}:{type:'clarify',reply:'请补充'})};await a.run(source==='evaluate'?"AIService.evaluate('合成课程')":"AIService.agent('合成问题',{},'chat')");assert.equal(calls.length,1);assert.match(calls[0].request_id,/^[a-f0-9]{32}$/);assert.deepEqual(a.json('AIService.refundEntries()'),[]);});
for(const failure of ['network','json','invalid','http'])test('failure '+failure+' persists then refunds without retrying model',async t=>{const a=await client(t),calls=[];a.ctx.fetch=async(u,o)=>{const b=body(o);calls.push(b);if(b.mode==='cancel')return reply({released:true});if(failure==='network')throw TypeError('offline');if(failure==='json')return {ok:true,json:async()=>{throw SyntaxError('bad')}};if(failure==='invalid')return reply({base_score:999});return {ok:false,status:503};};await assert.rejects(a.run("AIService.evaluate('合成课程')"));await a.run('AIService.flushQuotaRefunds()');assert.equal(calls.filter(b=>b.mode!=='cancel').length,1);assert.equal(calls.filter(b=>b.mode==='cancel').length,1);assert.equal(calls[0].request_id,calls[1].request_id);assert.deepEqual(a.json('AIService.refundEntries()'),[]);});
test('cancelled successful late body never enters score cache and refunds same ID',async t=>{const a=await client(t);let resolve;const calls=[];a.ctx.fetch=async(u,o)=>{const b=body(o);calls.push(b);if(b.mode==='cancel')return reply({released:true});return new Promise(r=>resolve=r)};a.run("controller=new AbortController();pending=AIService.evaluate('合成课程',{signal:controller.signal})");for(let i=0;!resolve&&i<1000;i++)await new Promise(setImmediate);assert.ok(resolve);a.run('controller.abort()');resolve(reply({base_score:8.4}));await assert.rejects(a.run('pending'));await a.run('AIService.flushQuotaRefunds()');assert.equal(a.run('Object.keys(AIService.cache).length'),0);assert.equal(calls[1].request_id,calls[0].request_id);});
test('offline refund survives reload and next online flush; retry uses a fresh ID',async t=>{const a=await client(t);let online=false;const calls=[];a.ctx.fetch=async(u,o)=>{const b=body(o);calls.push(b);if(!online)throw TypeError('offline');return reply(b.mode==='cancel'?{released:true}:{base_score:8.4})};await assert.rejects(a.run("AIService.evaluate('第一次')"));await a.run('AIService.flushQuotaRefunds()');assert.equal(a.run('AIService.refundEntries().length'),1);a.run('AIService.activeHosted=new Map()');online=true;await a.run('AIService.flushQuotaRefunds()');assert.equal(a.run('AIService.refundEntries().length'),0);await a.run("AIService.evaluate('第二次')");const attempts=calls.filter(b=>b.mode!=='cancel');assert.equal(attempts.length,2);assert.notEqual(attempts[0].request_id,attempts[1].request_id);});
test('page exit aborts all active hosted requests and keeps durable receipts',async t=>{const a=await client(t);let started=false;a.ctx.fetch=async(u,o)=>{if(body(o).mode==='cancel')throw TypeError('offline');started=true;return new Promise(()=>{})};a.run("pending=AIService.evaluate('合成课程')");for(let i=0;!started&&i<1000;i++)await new Promise(setImmediate);assert.ok(started);a.run('AIService.cancelHostedRequests()');await assert.rejects(a.run('pending'));await a.run('AIService.flushQuotaRefunds()');assert.equal(a.run('AIService.activeHosted.size'),0);assert.equal(a.run('AIService.refundEntries().length'),1);});
test('storage failure before dispatch makes no model call',async t=>{const a=await client(t);let calls=0;a.ctx.fetch=async()=>{calls++;return reply({})};a.run("localStorage.setItem=()=>{throw Error('quota')}");await assert.rejects(a.run("AIService.evaluate('合成课程')"));assert.equal(calls,0);});

test('another page cannot cancel a still active receipt; an interrupted page releases after deadline',async t=>{
 const a=await client(t);let calls=0;a.ctx.fetch=async()=>{calls++;return reply({released:true})};
 a.run("clock=Date.now();Date=class extends Date{static now(){return clock}};timers=[];setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};clearTimeout=()=>{};AIService.storeRefund({id:'a'.repeat(32),device:'d'.repeat(32),pendingUntil:Date.now()+20000})");
 await a.run('AIService.flushQuotaRefunds()');assert.equal(calls,0);assert.equal(a.run('AIService.refundEntries().length'),1);
 assert.equal(a.run('timers[0].ms'),20001);a.run('clock+=20001;timers[0].fn()');
 await a.run('AIService.flushQuotaRefunds()');assert.equal(calls,1);assert.equal(a.run('AIService.refundEntries().length'),0);
});

test('cancel publishes the refund immediately before the UI abort race can settle',async t=>{
 const a=await client(t);const calls=[];let start,refund;
 a.ctx.fetch=async(u,o)=>{const b=body(o);calls.push(b);if(b.mode==='cancel')return new Promise(r=>refund=()=>r(reply({released:true})));start=true;return new Promise(()=>{})};
 a.run("controller=new AbortController();pending=AIService.hostedRequest({title:'合成课程'},{signal:controller.signal});pending.catch(()=>{})");
 for(let i=0;!start&&i<1000;i++)await new Promise(setImmediate);assert.ok(start);
 a.run('controller.abort()');assert.equal(a.run('AIService.activeHosted.size'),0);assert.equal(calls.filter(b=>b.mode==='cancel').length,1);
 let done=false;const flush=a.run('AIService.flushQuotaRefunds()').then(()=>done=true);await new Promise(setImmediate);assert.equal(done,false);refund();await flush;
 await assert.rejects(a.run('pending'));assert.equal(a.run('AIService.refundEntries().length'),0);
});

test('a refund already in flight drains newly failed receipts once, without retrying failed notifications',async t=>{
 const a=await client(t);const calls=[];let resume;
 a.ctx.fetch=async(u,o)=>{const b=body(o);calls.push(b);if(b.request_id==='a'.repeat(32))return new Promise(r=>resume=()=>r(reply({released:true})));throw TypeError('offline')};
 a.run("AIService.storeRefund({id:'a'.repeat(32),device:'d'.repeat(32),pendingUntil:0});flush=AIService.flushQuotaRefunds()");
 for(let i=0;!resume&&i<1000;i++)await new Promise(setImmediate);assert.ok(resume);
 a.run("AIService.storeRefund({id:'b'.repeat(32),device:'d'.repeat(32),pendingUntil:0})");resume();await a.run('flush');
 assert.equal(calls.length,2);assert.equal(a.run('AIService.refundEntries().length'),1);assert.match(a.element('#quota-refund-status').textContent,/待确认/);
});
