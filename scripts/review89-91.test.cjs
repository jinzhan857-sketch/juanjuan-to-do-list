'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
for(const kind of ['schedule','todo'])test('review: null hosted result is an invalid response, not a network failure: '+kind,async t=>{
 const a=await fixture(t,kind);a.run("AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd'");let calls=0;
 a.ctx.fetch=async()=>{calls++;return {ok:true,json:async()=>null}};
 const before=await a.snapshot();await a.run('UI.onAIClick()');
 assert.equal(a.notices.at(-1),'识别失败，请重试。');assert.equal(calls,1);assert.deepEqual(await a.snapshot(),before);assert.equal(a.run('UI.cState.images.length'),1);assert.equal(a.run('Object.keys(AIService.cache).length'),0);
 a.run("UI.resetCreate('schedule');UI.restoreCreateDraft()");assert.equal(a.run('UI.cState.kind'),kind);assert.equal(a.run('UI.cState.images.length'),1);
});
for(const scope of ['device','ip','global'])test('review: quota refusal keeps the pending edit and original data: '+scope,async t=>{
 const a=await fixture(t);await a.run('UI.onSave()');const before=await a.snapshot();
 a.run("UI.startEdit(S.tasks[0].id);UI.cState.resultTitle='手改标题';UI.cState.resultNote='手改备注';UI.cState.date='2026-12-01';UI.cState.timeType='exact';UI.cState.start='23:30';UI.cState.end='00:30';UI.cState.endDayOffset=1;UI.cState.userFields={title:true,note:true,date:true,time:true};AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd'");
 a.ctx.fetch=async()=>({ok:false,status:429,json:async()=>({limit_scope:scope})});await a.run('UI.onAIClick()');assert.deepEqual(await a.snapshot(),before);
 const draft=a.json('UI.cState');a.run("UI.resetCreate('schedule');UI.restoreCreateDraft()");assert.deepEqual(a.json('UI.cState'),{...draft,saving:false});assert.equal(a.run('UI.editingId'),before.tasks[0].id);
 await a.run('UI.onSave()');const after=await a.snapshot();assert.equal(after.tasks.length,1);assert.equal(after.tasks[0].id,before.tasks[0].id);assert.equal(after.tasks[0].title,'手改标题');assert.equal(after.tasks[0].note,'手改备注');assert.equal(after.tasks[0].execDate,'2026-12-01');assert.equal(after.tasks[0].endDayOffset,1);assert.equal(after.tasks[0].images.length,1);assert.equal(after.tasks[0].links.length,1);assert.deepEqual(after.kv,before.kv);
});
for(const value of [false,0,'invalid',[]])test('review: malformed hosted JSON keeps generic error and empty cache: '+JSON.stringify(value),async t=>{const a=await fixture(t);a.run("AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd'");a.ctx.fetch=async()=>({ok:true,json:async()=>value});const before=await a.snapshot();await a.run('UI.onAIClick()');assert.equal(a.notices.at(-1),'识别失败，请重试。');assert.deepEqual(await a.snapshot(),before);assert.equal(a.run('Object.keys(AIService.cache).length'),0)});
for(const vague of [false,true])test('review: zero score and normal clarification remain valid: '+vague,async t=>{const a=await fixture(t);a.run("AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd'");a.ctx.fetch=async()=>({ok:true,json:async()=>({vague,base_score:vague?null:0,reason:'补充信息'})});await a.run('UI.onAIClick()');assert.equal(a.notices.length,0);assert.equal((await a.snapshot()).tasks.length,0);if(!vague){assert.equal(a.run('UI.cState.ai.base_score'),0);await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks[0].baseScore,0)}});
const fs=require('node:fs'),vm=require('node:vm');
for(const scope of ['device','ip','global'])test('review: '+scope+' block crossing midnight retains the start day for every key',async()=>{
 let clock=Date.parse('2026-12-31T23:59:59.999+08:00'),modelCalls=0;const commands=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
 const context=vm.createContext({require,module:{exports:{}},Buffer,Date:Clock,AbortController,DOMException,setTimeout,clearTimeout,process:{env:{KV_REST_API_URL:'https://redis.invalid',KV_REST_API_TOKEN:'synthetic',RATE_LIMIT_SALT:'synthetic',DEEPSEEK_API_KEY:'synthetic'}},fetch:async(url,options)=>{
  if(url!=='https://redis.invalid'){modelCalls++;throw Error('blocked request must not call model')}
  const c=JSON.parse(options.body);commands.push(c);clock=Date.parse('2027-01-01T00:00:01+08:00');
  const result=c[0]==='INCR'&&(scope==='global'?c[1].endsWith(':global'):c[1].includes(':'+scope+':'))?scope==='device'?21:scope==='ip'?51:101:1;
  return {ok:true,json:async()=>({result})};
 }});vm.runInContext(fs.readFileSync('api/ai.js','utf8'),context);let status,body;
 await context.module.exports({method:'POST',headers:{'x-forwarded-for':'192.0.2.91'},body:{title:'合成事务',device_id:'syntheticdevice0123456789abcd',client_date:'2025-01-01'}},{status(c){status=c;return this},json(b){body=b}});
 assert.equal(status,429);assert.equal(body.limit_scope,scope);assert.equal(modelCalls,0);for(const c of commands)assert.match(c[1],/^(limit|active|metric):2026-12-31(?:$|:)/);assert.ok(commands.some(c=>c[0]==='INCR'&&c[1]==='metric:2026-12-31:blocked'));assert.equal(commands.some(c=>c[1].endsWith(':calls')),false);
});
