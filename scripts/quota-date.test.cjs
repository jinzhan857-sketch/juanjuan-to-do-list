const {quotaKeys:weeklyKeys,weekStart}=require('../api/quota.cjs');
const quotaKey=day=>weeklyKeys({day,device:'a'.repeat(32)})[2];
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const traces=[];
if(process.env.QUOTA_TRACE)process.on('exit',()=>fs.writeFileSync(process.env.QUOTA_TRACE,JSON.stringify(traces,null,2)));
const device='syntheticdevice0123456789abcd';
function fixture(){
 const clock={now:Date.parse('2026-11-15T10:00:00+08:00')},commands=[],models=[],values=new Map(),expiry=new Map();
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}
 traces.push({commands,models});
 const a={clock,commands,models,values,expiry,model:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({type:'chat',reply:'合成回复',task:'合成课程',base_score:3})}}]})})};
 const ledger=require('./helpers/quota-oracle.cjs').quotaOracle({commands,values,expiry,now:()=>clock.now});
 const wrapped={...ledger,reserve:async r=>{if(a.beforeRedis)await a.beforeRedis(['QUOTA_RESERVE',`quota:${r.day}:device:${r.device}`]);return ledger.reserve(r)}};let serial=0;
 const context=vm.createContext({require:name=>name==='./quota.cjs'?{createQuota:()=>wrapped}:require(name),module:{exports:{}},Buffer,Date:Clock,AbortController,DOMException,setTimeout,clearTimeout,process:{env:{KV_REST_API_URL:'https://redis.invalid',KV_REST_API_TOKEN:'synthetic',RATE_LIMIT_SALT:'synthetic',DEEPSEEK_API_KEY:'synthetic',OWNER_STATS_TOKEN:'synthetic'}},fetch:async(url,options)=>{
  if(url!=='https://redis.invalid'){models.push(JSON.parse(options.body));return a.model()}
  const c=JSON.parse(options.body);commands.push(c);if(a.beforeRedis)await a.beforeRedis(c);const [op,key,...args]=c;
  if(expiry.has(key)&&expiry.get(key)<=clock.now){values.delete(key);expiry.delete(key)}
  let result;
  if(op==='INCR'){result=(values.get(key)||0)+1;values.set(key,result)}
  else if(op==='EXPIRE'){expiry.set(key,clock.now+Number(args[0])*1000);result=1}
  else if(op==='PFADD'){const set=values.get(key)||new Set();set.add(args[0]);values.set(key,set);result=1}
  else if(op==='PFCOUNT')result=values.get(key)?.size||0;
  else if(op==='GET')result=values.get(key)||null;
  else throw Error('unexpected Redis command '+op);
  return {ok:true,json:async()=>({result})};
 }});
 vm.runInContext(fs.readFileSync(process.env.QUOTA_SOURCE||'api/ai.js','utf8'),context);
 a.send=async(body={},options={})=>{let code,payload;await context.module.exports({method:'POST',headers:{'x-forwarded-for':'192.0.2.29'},body:{title:'合成课程',device_id:device,request_id:(++serial).toString(16).padStart(32,'0'),...body},...options},{status(c){code=c;return this},json(p){payload=JSON.parse(JSON.stringify(p))}});return {code,payload}};
 a.stats=(query={})=>a.send({}, {method:'GET',headers:{'x-owner-token':'synthetic'},query:{stats:'1',...query}});
 a.count=(name,date='2026-11-15')=>values.get(`metric:${date}:${name}`)||0;
 a.assertDates=date=>{const week=weekStart(date);for(const c of commands)assert.ok(c[1].startsWith('quota:public-0:'+week+':')||c[1].startsWith('quota:'+date+':')||c[1]==='quota-public-epoch:'+week||new RegExp('^(active|metric):'+date+'(?:$|:)').test(c[1]),JSON.stringify(c));};
 return a;
}
for(const mode of ['score','task','planning','chat'])test('client dates cannot mint quota and model keeps user date: '+mode,async()=>{
 const a=fixture(),dates=['2026-11-15','2026-11-16',undefined,'bad','2026-02-30','2027-01-01','2025-12-31',null];
 for(const client_date of dates){const body={client_date};if(mode!=='score')Object.assign(body,{mode:'agent',agent_role:mode,message:'今天整理合成课程'});assert.equal((await a.send(body)).code,200);const expected=/^\d{4}-\d{2}-\d{2}$/.test(client_date||'')&&client_date!=='2026-02-30'?client_date:'2026-11-15';assert.ok(a.models.at(-1).messages[1].content.startsWith('今天是'+expected+'。'));}
 a.assertDates('2026-11-15');assert.equal(a.models.length,8);assert.equal(a.values.get(`quota:2026-11-15:device:${device}`),8);assert.equal(a.count('calls'),8);assert.equal(a.count('success'),8);
 assert.equal([...a.values.keys()].some(k=>k.includes(':ip:')),false);
});
test('300 device calls then changed dates still blocked',async()=>{const a=fixture();for(let i=0;i<304;i++)assert.equal((await a.send({client_date:'2027-01-01'})).code,i<300?200:429);a.assertDates('2026-11-15');assert.equal(a.models.length,300);assert.equal(a.count('blocked'),4);assert.equal(a.count('calls'),300);assert.equal(a.values.get('active:2026-11-15').size,1)});
test('60 devices on the same network are not blocked by an IP cap',async()=>{const a=fixture();for(let i=0;i<60;i++)assert.equal((await a.send({device_id:device+i})).code,200);a.assertDates('2026-11-15');assert.equal(a.models.length,60);assert.equal(a.count('blocked'),0)});
for(const fail of ['http','json','network'])test('failure and manual retry keep original quota day: '+fail,async()=>{const a=fixture();a.model=async()=>{if(fail==='network')throw Error('synthetic');return {ok:fail!=='http',status:502,json:async()=>{if(fail==='json')throw Error('bad JSON');return {}}}};assert.equal((await a.send({client_date:'2027-01-01'})).code,503);assert.equal(a.models.length,1);assert.equal(a.count('failures'),1);a.model=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"task":"合成","base_score":3}'}}]})});assert.equal((await a.send({client_date:'2025-01-01'})).code,200);a.assertDates('2026-11-15');assert.equal(a.count('calls'),2);assert.equal(a.models.length,2);assert.equal(a.values.get(`quota:2026-11-15:device:${device}`),1);assert.equal(a.values.get(quotaKey('2026-11-15')),1)});
test('concurrent changed dates enforce device cap',async()=>{const a=fixture();const rows=await Promise.all(Array.from({length:312},(_,i)=>a.send({client_date:`2027-02-${String(i%28+1).padStart(2,'0')}`})));assert.equal(rows.filter(x=>x.code===200).length,300);assert.equal(rows.filter(x=>x.code===429).length,12);assert.equal(a.models.length,300);a.assertDates('2026-11-15')});
for(const outcome of ['success','failure'])test('request crossing Beijing midnight retains start day: '+outcome,async()=>{const a=fixture();a.clock.now=Date.parse('2026-12-31T23:59:59.999+08:00');a.model=async()=>{a.clock.now++;if(outcome==='failure')throw Error('synthetic');return {ok:true,json:async()=>({choices:[{message:{content:'{"task":"合成","base_score":3}'}}]})}};assert.equal((await a.send({client_date:'2025-01-01'})).code,outcome==='failure'?503:200);a.assertDates('2026-12-31');assert.equal(a.count(outcome==='failure'?'failures':'success','2026-12-31'),1);assert.ok(a.models[0].messages[1].content.startsWith('今天是2025-01-01。'));const stats=await a.stats();assert.equal(stats.payload.date,'2027-01-01')});
test('daily limit resets at midnight while weekly device limit waits for Monday',async()=>{const a=fixture();a.clock.now=Date.parse('2026-11-14T23:59:59.999+08:00');for(let i=0;i<300;i++)await a.send();assert.equal((await a.send()).code,429);const key=`quota:2026-11-14:device:${device}`,expires=a.expiry.get(key);assert.equal(expires,a.clock.now+777600000);a.clock.now++;const blocked=await a.send();assert.equal(blocked.code,429);assert.equal(blocked.payload.limit_period,'week');assert.equal(a.models.length,300);assert.equal(a.expiry.get(key),expires);a.clock.now=Date.parse('2026-11-16T00:00:00+08:00');assert.equal((await a.send()).code,200);assert.equal(a.values.get(`quota:2026-11-16:device:${device}`),1);});
test('stats default, explicit history and invalid date use same Beijing calendar',async()=>{const a=fixture();a.clock.now=Date.parse('2026-11-16T00:01:00+08:00');await a.send({client_date:'2026-11-15'});assert.equal((await a.stats()).payload.date,'2026-11-16');assert.equal((await a.stats({date:'2026-02-30'})).payload.date,'2026-11-16');const history=await a.stats({date:'2026-11-15'});assert.equal(history.payload.date,'2026-11-15');assert.equal(history.payload.calls,0);assert.equal((await a.stats()).payload.calls,1);assert.equal((await a.stats()).payload.active_devices,1)});

// Keep a replayable local trace without logging private requests or credentials.
for(const boundary of ['2026-11-15T23:59:59.999+08:00','2026-12-31T23:59:59.999+08:00'])test('concurrent requests straddle trusted midnight: '+boundary,async()=>{
 const a=fixture();a.clock.now=Date.parse(boundary);const day=boundary.slice(0,10);let finish;let entered;
 const started=new Promise(r=>entered=r);a.model=()=>{entered();return new Promise(r=>finish=r)};
 const pending=a.send({client_date:'2025-01-01'});await started;a.clock.now++;
 a.model=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"task":"合成","base_score":3}'}}]})});
 assert.equal((await a.send({client_date:'2025-01-01'})).code,200);
 finish({ok:true,json:async()=>({choices:[{message:{content:'{"task":"合成","base_score":3}'}}]})});assert.equal((await pending).code,200);
 const next=new Date(a.clock.now+8*3600000).toISOString().slice(0,10);
 for(const date of [day,next]){assert.equal(a.count('calls',date),1);assert.equal(a.count('success',date),1);assert.equal(a.values.get(`quota:${date}:device:${device}`),1)}
});
test('expired daily counters do not retain a past day indefinitely',async()=>{const a=fixture();await a.send();a.clock.now+=86400000;const old=await a.stats({date:'2026-11-15'});assert.equal(old.payload.calls,0);assert.equal(old.payload.active_devices,1);assert.equal((await a.send()).code,200);assert.equal(a.count('calls','2026-11-16'),1)});
const {statsFixture,seed}=require('./completion-stats-fixture.cjs');
for(const outcome of ['quota','cancel'])test('client agent '+outcome+' preserves business database, attachments, stats and pet',async t=>{
 const a=await statsFixture(t);await seed(a);const before=await a.snapshot();
 a.element('#agent-input').focus=()=>{};a.element('#agent-input').value='合成助手请求';
 a.run("S.chats=[{id:'synthetic-chat',title:'合成',createdAt:clock,updatedAt:clock}];S.messages=[];UI.agentChatId='synthetic-chat';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};UI.agentContext=()=>({});UI.resolveAgentRole=()=> 'chat';UI.agentThinking=false;AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd'");
 await a.run("DB.put('chats',S.chats[0])");let calls=0,resolve,started;const entered=new Promise(r=>started=r);
 a.ctx.fetch=async(url,options)=>{if(JSON.parse(options.body).mode==='cancel')return {ok:true,json:async()=>({released:true})};calls++;started();if(outcome==='quota')return {ok:false,status:429,json:async()=>({error:'quota'})};return new Promise(r=>resolve=r)};
 const pending=a.run('UI.sendAgentMessage()');await entered;
 if(outcome==='cancel'){await a.run('UI.cancelAgentMessage()');resolve({ok:true,json:async()=>({type:'proposal',reply:'迟到',action:{kind:'delete_schedule',target_id:'a'}})})}
 await pending;assert.equal(calls,1);assert.deepEqual(await a.snapshot(),before);assert.equal(a.run("S.messages.some(m=>m.meta?.action)"),false);
});
test('crossing midnight during first Redis wait pins every later key',async()=>{const a=fixture();a.clock.now=Date.parse('2026-11-15T23:59:59.999+08:00');a.beforeRedis=async()=>{a.clock.now=Date.parse('2026-11-16T00:00:01+08:00')};assert.equal((await a.send()).code,200);a.assertDates('2026-11-15');assert.ok(a.models[0].messages[1].content.startsWith('今天是2026-11-15。'))});
test('same-network devices can use their own quota up to the global cap',async()=>{const a=fixture();const results=await Promise.all(Array.from({length:60},(_,i)=>a.send({device_id:device+i,client_date:i%2?'2026-01-01':'2027-01-01'})));assert.equal(results.filter(r=>r.code===200).length,60);assert.equal(a.models.length,60);assert.equal(a.count('blocked'),0);a.assertDates('2026-11-15')});
test('bookkeeping failure after midnight refunds in request start day',async()=>{const a=fixture();a.clock.now=Date.parse('2026-11-15T23:59:59.999+08:00');a.beforeRedis=async c=>{a.clock.now++;if(c[0]==='PFADD')throw Error('synthetic Redis failure')};assert.equal((await a.send()).code,503);assert.equal(a.models.length,0);a.assertDates('2026-11-15');assert.equal(a.count('failures'),1)});
for(const concurrent of [false,true])test('global 1000 across devices and networks with changed client dates: '+concurrent,async()=>{const a=fixture();const send=i=>a.send({device_id:device+i,client_date:i%2?'2025-01-01':'2027-01-01'},{headers:{'x-forwarded-for':`192.0.2.${i%4+1}`}});const rows=concurrent?await Promise.all(Array.from({length:1020},(_,i)=>send(i))):[];if(!concurrent)for(let i=0;i<1020;i++)rows.push(await send(i));assert.equal(rows.filter(r=>r.code===200).length,1000);assert.equal(rows.filter(r=>r.code===429&&r.payload.limit_scope==='global').length,20);assert.equal(a.models.length,1000);assert.equal(a.count('calls'),1000);assert.equal(a.count('blocked'),20);a.assertDates('2026-11-15');assert.equal(a.values.get(quotaKey('2026-11-15')),1000)});
test('device refusal does not consume global budget and another device is allowed on the same network',async()=>{const a=fixture();for(let i=0;i<300;i++)await a.send();assert.equal((await a.send()).payload.limit_scope,'device');assert.equal(a.values.get(quotaKey('2026-11-15')),300);assert.equal((await a.send({device_id:device+'other'})).code,200);assert.equal(a.values.get(quotaKey('2026-11-15')),301)});
test('global weekly quota resets at Beijing Monday, not UTC Monday',async()=>{const a=fixture();a.clock.now=Date.parse('2027-01-03T23:59:59.999+08:00');for(let i=0;i<1000;i++)await a.send({device_id:device+i});assert.equal((await a.send({device_id:device+'end'})).payload.limit_scope,'global');a.clock.now++;assert.equal((await a.send({device_id:device+'end',client_date:'2026-12-31'})).code,200);assert.equal(a.values.get(quotaKey('2027-01-04')),1);assert.equal(a.values.get(quotaKey('2026-12-28')),1000);assert.equal(a.count('calls','2027-01-03'),1000);assert.equal(a.count('calls','2027-01-04'),1);});
for(const scope of ['device','global'])test('frontend and actual handler agree on '+scope+' rejection without business writes',async t=>{
 const server=fixture();const total=scope==='device'?300:1000;
 for(let i=0;i<total;i++)await server.send({device_id:scope==='device'?device:device+i},{headers:{'x-forwarded-for':scope==='global'?`192.0.2.${i%4+1}`:'192.0.2.29'}});
 const a=await statsFixture(t);await seed(a);const before=await a.snapshot();
 a.run("AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd'");let payload;let requests=0;
 a.ctx.fetch=async(url,options)=>{assert.equal(url,'/api/ai');const body=JSON.parse(options.body);if(body.mode!=='cancel')requests++;const r=await server.send(body);if(body.mode!=='cancel')payload=r.payload;return {ok:r.code<400,status:r.code,json:async()=>r.payload}};
 const modelCalls=server.models.length;await a.run('UI.onAIClick()');assert.equal(requests,1);assert.equal(payload.limit_scope,scope);assert.equal(server.models.length,modelCalls);assert.deepEqual(await a.snapshot(),before);assert.equal(a.run('UI.cState.images.length'),1);
 assert.equal(a.notices.at(-1),scope==='device'?'今日个人免费AI次数已达上限。':'本周公共免费AI次数已达上限。');server.assertDates('2026-11-15');
});
