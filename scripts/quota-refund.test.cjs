'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {handlerFixture}=require('./helpers/refund-handler-fixture.cjs');
for(const mode of ['score','task','planning','chat'])test('successful '+mode+' charges once and cancellation releases every scope',async()=>{const a=handlerFixture();if(mode!=='score')a.model=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"type":"clarify","reply":"请补充"}'}}]})});const id='1'.repeat(32),body={request_id:id};if(mode!=='score')Object.assign(body,{mode:'agent',agent_role:mode,message:'合成问题'});assert.equal((await a.send(body)).code,200);assert.equal(a.values.get('quota:2026-11-15:global'),1);assert.equal((await a.send({mode:'cancel',request_id:id,title:undefined})).payload.released,true);assert.equal(a.values.get('quota:2026-11-15:global'),0);assert.equal(a.models.length,1);});
for(const failure of ['http','json','network','score'])test('model '+failure+' returns quota, and retry is a new single attempt',async()=>{
 const a=handlerFixture();
 a.model=async()=>{
  if(failure==='network')throw TypeError('offline');
  return {ok:failure!=='http',status:502,json:async()=>{
   if(failure==='json')throw SyntaxError('bad');
   return {choices:[{message:{content:'{"base_score":999}'}}]};
  }};
 };
 assert.equal((await a.send()).code,503);assert.equal(a.values.get('quota:2026-11-15:global'),0);assert.equal(a.models.length,1);
 a.model=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"base_score":3}'}}]})});
 assert.equal((await a.send()).code,200);assert.equal(a.values.get('quota:2026-11-15:global'),1);assert.equal(a.models.length,2);
});
test('cancellation before request and late returned model never charges or returns an executable result',async()=>{const a=handlerFixture(),id='2'.repeat(32);await a.send({mode:'cancel',request_id:id});assert.equal((await a.send({request_id:id})).code,409);assert.equal(a.models.length,0);let release;a.model=()=>new Promise(resolve=>release=resolve);const late=a.send({request_id:'3'.repeat(32),mode:'agent',agent_role:'task',message:'合成问题'});for(let i=0;!release&&i<1000;i++)await new Promise(setImmediate);assert.ok(release);await a.send({mode:'cancel',request_id:'3'.repeat(32)});release({ok:true,json:async()=>({choices:[{message:{content:'{"type":"chat","reply":"迟到"}'}}]})});assert.equal((await late).code,409);assert.equal(a.values.get('quota:2026-11-15:global'),0);});
test('duplicate ID cannot dispatch twice and different-device cancellation cannot release it',async()=>{const a=handlerFixture(),id='4'.repeat(32);assert.equal((await a.send({request_id:id})).code,200);assert.equal((await a.send({request_id:id})).code,409);await a.send({mode:'cancel',request_id:id,device_id:'b'.repeat(32)});assert.equal(a.values.get('quota:2026-11-15:global'),1);assert.equal(a.models.length,1);});
test('bad or missing request ID rejects before model or quota',async()=>{const a=handlerFixture();for(const request_id of [undefined,'',{},'bad'])assert.equal((await a.send({request_id})).code,400);assert.equal(a.models.length,0);assert.equal(a.values.size,0);});
test('cancellation after midnight releases original Beijing day',async()=>{const a=handlerFixture({now:Date.parse('2026-12-31T23:59:59.999+08:00')}),id='5'.repeat(32);assert.equal((await a.send({request_id:id,client_date:'2030-01-01'})).code,200);a.clock.now++;await a.send({mode:'cancel',request_id:id});assert.equal(a.values.get('quota:2026-12-31:global'),0);assert.equal(a.values.has('quota:2027-01-01:global'),false);assert.ok(a.models[0].messages[1].content.startsWith('今天是2030-01-01。'));});
test('failed response write releases successful receipt before reporting failure',async()=>{
 const a=handlerFixture();a.onResponse=code=>{if(code===200)throw Error('synthetic response failure')};assert.equal((await a.send()).code,503);assert.equal(a.values.get('quota:2026-11-15:global'),0);assert.equal(a.models.length,1);
});
