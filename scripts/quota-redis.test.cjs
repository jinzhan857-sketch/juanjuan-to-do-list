'use strict';
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const {createQuota}=require('../api/quota.cjs');const {redisCommand:redis}=require('./helpers/redis-test-client.cjs');
const quota=createQuota(redis),device='a'.repeat(32),ip='b'.repeat(64),day='2026-11-15';
const request=(n,extra={})=>({device,deviceLimit:20,ipLimit:50,globalLimit:100,id:String(n).padStart(32,'0'),day,ip,now:1794708000000,...extra});
const count=kind=>redis(['ZCARD',`quota:${day}:${kind}:${kind==='device'?device:ip}`]);
beforeEach(async()=>{await redis(['FLUSHDB'])});
test('real Lua failure and repeated release return both budgets exactly once',async()=>{const r=request(1);assert.equal(await quota.reserve(r),'reserved');assert.equal(await count('device'),1);assert.equal(await quota.finish(device,r.id,'failed',r.now+1),'released');await quota.finish(device,r.id,'failed',r.now+2);await quota.finish(device,r.id,'cancelled',r.now+3);assert.equal(await count('device'),0);assert.equal(await count('ip'),0);assert.equal(await redis(['GET',`metric:${day}:failures`]),'1');});
test('cancel before arrival prevents any later model admission',async()=>{const r=request(1);await quota.finish(device,r.id,'cancelled',r.now);assert.equal(await quota.reserve(r),'cancelled');assert.equal(await count('device'),0);});
test('late success after cancellation cannot charge again',async()=>{const r=request(1);await quota.reserve(r);await quota.finish(device,r.id,'cancelled',r.now+1);assert.equal(await quota.finish(device,r.id,'success',r.now+2),'released');assert.equal(await count('device'),0);});
test('successful reply then client cancellation releases once; replay is not a retry',async()=>{const r=request(1);await quota.reserve(r);assert.equal(await quota.finish(device,r.id,'success',r.now+2),'success');await quota.finish(device,r.id,'success',r.now+3);assert.equal(await count('device'),1);await quota.finish(device,r.id,'cancelled',r.now+4);await quota.finish(device,r.id,'cancelled',r.now+5);assert.equal(await count('device'),0);assert.equal(await quota.reserve(r),'cancelled');assert.equal(await quota.reserve(request(2)),'reserved');assert.equal(await count('device'),1);});
test('concurrent same request admitted once',async()=>{const r=request(1);const results=await Promise.all(Array.from({length:8},()=>quota.reserve(r)));assert.equal(results.filter(v=>v==='reserved').length,1);assert.equal(await count('device'),1);});
test('device budget admits exactly20 across parallel requests; blocked attempts charge zero',async()=>{const results=await Promise.all(Array.from({length:30},(_,i)=>quota.reserve(request(i+1))));assert.equal(results.filter(v=>v==='reserved').length,20);assert.equal(results.filter(v=>v==='device').length,10);assert.equal(await count('device'),20);assert.equal(await count('ip'),20);});
test('IP budget admits exactly50 across different devices',async()=>{const results=await Promise.all(Array.from({length:60},(_,i)=>quota.reserve(request(i+1,{device:i.toString(16).padStart(32,'a')}))));assert.equal(results.filter(v=>v==='reserved').length,50);assert.equal(results.filter(v=>v==='ip').length,10);assert.equal(await count('ip'),50);});
test('cancel arriving before midnight releases original day after midnight, even from another IP',async()=>{const r=request(1);await quota.reserve(r);await quota.finish(device,r.id,'success',r.now+1);await quota.reserve(request(2,{day:'2026-11-16',now:r.now+86400000,ip:'c'.repeat(64)}));await quota.finish(device,r.id,'cancelled',r.now+86400001);assert.equal(await count('device'),0);assert.equal(await redis(['ZCARD',`quota:2026-11-16:device:${device}`]),1);});
test('lost handler lease expires, and late result cannot reclaim freed quota',async()=>{const r=request(1);await quota.reserve(r);await quota.reserve(request(2,{now:r.now+60001}));assert.equal(await count('device'),1);assert.equal(await quota.finish(device,r.id,'success',r.now+60002),'expired');assert.equal(await count('device'),1);});
test('request cancellation cannot release another device receipt',async()=>{const r=request(1);await quota.reserve(r);await quota.finish('c'.repeat(32),r.id,'cancelled',r.now+1);assert.equal(await count('device'),1);});
test('new accounting leaves historical integer limit keys unchanged',async()=>{await redis(['SET',`limit:${day}:device:${device}`,'9']);await quota.reserve(request(1));await quota.finish(device,request(1).id,'failed');assert.equal(await redis(['GET',`limit:${day}:device:${device}`]),'9');});

test('global budget admits exactly100 and release frees all three budgets',async()=>{const entries=Array.from({length:110},(_,i)=>request(i+1,{device:i.toString(16).padStart(32,'c'),ip:i.toString(16).padStart(64,'d')}));const results=await Promise.all(entries.map(r=>quota.reserve(r)));assert.equal(results.filter(v=>v==='reserved').length,100);assert.equal(results.filter(v=>v==='global').length,10);const r=entries[results.indexOf('reserved')];await quota.finish(r.device,r.id,'failed');assert.equal(await redis(['ZCARD',`quota:${day}:global`]),99);assert.equal(await redis(['ZCARD',`quota:${day}:device:${r.device}`]),0);assert.equal(await redis(['ZCARD',`quota:${day}:ip:${r.ip}`]),0);});
test('cancel metadata read racing admission retries atomically rather than losing refund',async()=>{const r=request(1);let raced=false;const racing=createQuota(async command=>{const result=await redis(command);if(command[0]==='HMGET'&&!raced){raced=true;assert.equal(await quota.reserve(r),'reserved')}return result});assert.equal(await racing.finish(device,r.id,'cancelled',r.now+1),'released');assert.equal(await count('device'),0);assert.equal(await redis(['ZCARD',`quota:${day}:global`]),0);assert.equal(await quota.finish(device,r.id,'success',r.now+2),'released');});
test('repeated early cancellation and blocked receipts always confirm release',async()=>{const r=request(1);await quota.finish(device,r.id,'cancelled');assert.equal(await quota.finish(device,r.id,'cancelled'),'released');assert.equal(await quota.reserve(r),'cancelled');assert.equal(await quota.finish(device,r.id,'cancelled'),'released');for(let i=2;i<=21;i++)await quota.reserve(request(i));const blocked=request(22);assert.equal(await quota.reserve(blocked),'device');assert.equal(await quota.finish(device,blocked.id,'cancelled'),'released');assert.equal(await quota.finish(device,blocked.id,'cancelled'),'released');assert.equal(await count('device'),20);});

const {handlerFixture}=require('./helpers/refund-handler-fixture.cjs');
const handler=extra=>handlerFixture({quota,redis,...extra});
for(const failure of ['http','json','network','score'])test('actual handler and Redis return all budgets on '+failure+' then admit one manual retry',async()=>{
 const a=handler();a.model=async()=>{if(failure==='network')throw TypeError('offline');return {ok:failure!=='http',status:502,json:async()=>{if(failure==='json')throw SyntaxError('bad');return {choices:[{message:{content:'{"base_score":999}'}}]}}};};
 assert.equal((await a.send()).code,503);assert.equal(await redis(['ZCARD',`quota:${day}:global`]),0);assert.equal(await count('device'),0);assert.equal(a.models.length,1);
 a.model=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"base_score":8.4}'}}]})});assert.equal((await a.send()).code,200);assert.equal(await redis(['ZCARD',`quota:${day}:global`]),1);assert.equal(a.models.length,2);
});
test('actual handler late reply after repeated cancellation returns no action and zero charge',async()=>{
 const a=handler();let resolve;const id='9'.repeat(32);a.model=()=>new Promise(r=>resolve=r);const pending=a.send({request_id:id});for(let i=0;!resolve&&i<1000;i++)await new Promise(setImmediate);assert.ok(resolve);
 for(let i=0;i<3;i++)assert.equal((await a.send({mode:'cancel',request_id:id})).payload.released,true);
 resolve({ok:true,json:async()=>({choices:[{message:{content:'{"base_score":8.4}'}}]})});assert.equal((await pending).code,409);assert.equal(await count('device'),0);assert.equal(await redis(['ZCARD',`quota:${day}:global`]),0);assert.equal(a.models.length,1);
});
test('lost reserve response is refunded before dispatch; lost refund response can be confirmed again',async()=>{
 let loseReserve=true;const unreliable=createQuota(async c=>{const result=await redis(c);if(c[0]==='EVAL'&&c[1]===require('../api/quota.cjs').RESERVE&&loseReserve){loseReserve=false;throw Error('synthetic lost admission response')}return result});
 const a=handler({quota:unreliable});assert.equal((await a.send()).code,503);assert.equal(await count('device'),0);assert.equal(a.models.length,0);
 const id='8'.repeat(32);assert.equal((await a.send({request_id:id})).code,200);let loseRefund=true;const finish=unreliable.finish;unreliable.finish=async(...args)=>{const result=await finish(...args);if(args[2]==='cancelled'&&loseRefund){loseRefund=false;throw Error('synthetic lost refund response')}return result};
 assert.equal((await a.send({mode:'cancel',request_id:id})).code,503);assert.equal(await count('device'),0);assert.equal((await a.send({mode:'cancel',request_id:id})).payload.released,true);assert.equal(await count('device'),0);
});
test('actual handlers atomically share the100 cap across devices and networks',async()=>{
 const a=handler();const rows=await Promise.all(Array.from({length:120},(_,i)=>a.send({device_id:i.toString(16).padStart(32,'c')},{headers:{'x-forwarded-for':`192.0.2.${i%4+1}`}})));
 assert.equal(rows.filter(r=>r.code===200).length,100);assert.equal(rows.filter(r=>r.code===429&&r.payload.limit_scope==='global').length,20);assert.equal(await redis(['ZCARD',`quota:${day}:global`]),100);assert.equal(a.models.length,100);
});
test('response serialization failure releases an already successful server receipt',async()=>{
 const a=handler();a.onResponse=code=>{if(code===200)throw Error('synthetic response write failure')};
 assert.equal((await a.send()).code,503);assert.equal(await count('device'),0);assert.equal(await redis(['ZCARD',`quota:${day}:global`]),0);assert.equal(a.models.length,1);
});
for(const boundary of ['2026-11-15T23:59:59.999+08:00','2026-12-31T23:59:59.999+08:00'])test('review29-38: failure before a delayed admission blocks the original day after midnight: '+boundary,async()=>{
 const now=Date.parse(boundary),originalDay=boundary.slice(0,10),nextDay=new Date(now+1+8*3600000).toISOString().slice(0,10);
 const r=request(41,{day:originalDay,now});
 assert.equal(await quota.finish(r.device,r.id,'failed',now+1),'released');
 assert.equal(await quota.reserve({...r,now:now+2}),'failed');
 for(const key of [`quota:${originalDay}:device:${r.device}`,`quota:${originalDay}:ip:${r.ip}`,`quota:${originalDay}:global`])assert.equal(await redis(['ZCARD',key]),0);
 assert.equal(await redis(['GET',`metric:${originalDay}:calls`]),null);
 const retry=request(42,{day:nextDay,now:now+3});assert.equal(await quota.reserve(retry),'reserved');assert.equal(await redis(['ZCARD',`quota:${nextDay}:global`]),1);
});
test('review29-38: actual handler failure compensation precedes a lost admission command without later charge',async()=>{
 let lateAdmission;const delayed=createQuota(async command=>{if(command[0]==='EVAL'&&command[1]===require('../api/quota.cjs').RESERVE&&!lateAdmission){lateAdmission=()=>redis(command);throw Error('synthetic admission timeout before execution')}return redis(command)});
 const a=handler({quota:delayed,now:Date.parse('2026-12-31T23:59:59.999+08:00')}),id='7'.repeat(32);
 assert.equal((await a.send({request_id:id,client_date:'2030-01-01'})).code,503);assert.equal(a.models.length,0);assert.ok(lateAdmission);
 a.clock.now++;assert.equal(await lateAdmission(),'failed');
 assert.equal(await redis(['ZCARD','quota:2026-12-31:global']),0);assert.equal(await redis(['GET','metric:2026-12-31:calls']),null);
 assert.equal((await a.send({mode:'cancel',request_id:id})).payload.released,true);
 assert.equal((await a.send({request_id:'6'.repeat(32),client_date:'2030-01-01'})).code,200);assert.equal(a.models.length,1);assert.equal(await redis(['ZCARD','quota:2027-01-01:global']),1);assert.ok(a.models[0].messages[1].content.startsWith('今天是2030-01-01。'));
});
