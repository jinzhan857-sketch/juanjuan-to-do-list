'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {newGrant}=require('./v27-experience.cjs'),{parseCode,experience}=require('../api/experience.cjs');
const {weekStart,quotaKeys}=require('../api/quota.cjs'),{fixture}=require('./publisher-fixture.cjs');
test('new cards have bounded lifetime credits, no default expiry and unguessable independent secrets',()=>{
 const a=newGrant({label:'Synthetic',credits:5000},100),b=newGrant({label:'Synthetic',credits:500});
 assert.equal(a.total,5000);assert.equal(a.expires,0);assert.notEqual(a.code,b.code);assert.equal(parseCode(a.code).hash,a.hash);assert.equal(parseCode(a.code.toUpperCase()).id,a.id);assert.equal(parseCode(a.code+'extra'),null);
 for(const credits of [0,-1,1.5,1000001,NaN])assert.throws(()=>newGrant({label:'Synthetic',credits}));
 assert.equal(newGrant({label:'Synthetic',days:3},100).expires,259200100);
});
test('Monday period keys span Beijing days and years; public and credit pools are distinct',()=>{
 assert.equal(weekStart('2027-01-01'),'2026-12-28');assert.equal(weekStart('2027-01-03'),'2026-12-28');assert.equal(weekStart('2027-01-04'),'2027-01-04');
 const r={day:'2026-11-17',device:'d'.repeat(32)},a=quotaKeys(r),b=quotaKeys({...r,day:'2026-11-18'});
 assert.notEqual(a[0],b[0]);assert.equal(a[1],b[1]);assert.equal(a[2],b[2]);assert.notEqual(a[2],quotaKeys({...r,pool:'public-new'})[2]);
 assert.equal(quotaKeys({...r,credit:{id:'c'.repeat(24)}}).length,1);
});
test('malformed card rejects without Redis; stored balances never come from client input',async()=>{
 let calls=0;assert.equal((await experience(async()=>{calls++;},'invalid','d'.repeat(32))).ok,false);assert.equal(calls,0);
 const g=newGrant({label:'Synthetic',credits:5000});const commands=[];
 const r=await experience(async c=>{commands.push(c);return c[0]==='EVAL'?['ok','0','5000']:4999;},g.code,'d'.repeat(32));
 assert.equal(r.remaining,1);assert.equal(r.total,5000);assert.equal(commands[0].includes(g.code),false);assert.equal(commands[0].includes(g.hash),true);
});
test('card redemption uses management operation, persists only after confirmation and sends no model request',async t=>{
 const a=await fixture(t),g=newGrant({label:'Synthetic',credits:500}),calls=[];a.ctx.cardCode=g.code;
 a.element('#experience-code').value=g.code;
 a.ctx.fetch=async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true,json:async()=>({active:true,total_credits:500,remaining_credits:499,expires_at:0})};};
 const before=await a.snapshot();await a.run('UI.redeemExperience()');
 assert.equal(a.run('AIService.experienceCode()'),g.code);assert.equal(a.element('#experience-code').value,'');assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.operation),['redeem','status']);assert.ok(calls.every(c=>c.mode==='experience'&&!c.request_id&&!c.message));
 assert.match(a.element('#experience-status').textContent,/499 \/ 500/);assert.deepEqual(await a.snapshot(),before);
 a.ctx.fetch=async()=>({ok:false,status:403,json:async()=>({code:'experience_bound',error:'体验码已在其他浏览器兑换，请联系提供者'})});a.element('#experience-code').value=newGrant({label:'Other'}).code;await a.run('UI.redeemExperience()');assert.equal(a.run('AIService.experienceCode()'),g.code);assert.match(a.element('#experience-status').textContent,/其他浏览器/);
});
test('only hosted model requests carry the card; cancellation and backups do not carry its secret',async t=>{
 const a=await fixture(t),g=newGrant({label:'Synthetic'});a.ctx.cardCode=g.code;a.run("localStorage.setItem('juanjuan_experience_code',cardCode);AIService.getDeviceId=()=> 'd'.repeat(32)");let sent;
 a.ctx.fetch=async(u,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({base_score:3})};};await a.run("AIService.hostedRequest({title:'Synthetic'})");assert.equal(sent.experience_code,g.code);
 a.run("AIService.storeRefund({id:'a'.repeat(32),device:'d'.repeat(32),pendingUntil:0})");a.ctx.fetch=async(u,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({released:true})};};await a.run('AIService.flushQuotaRefunds()');assert.equal(sent.experience_code,undefined);
 const create=a.ctx.document.createElement.bind(a.ctx.document);a.ctx.document.createElement=tag=>tag==='a'?{click(){}}:create(tag);a.ctx.Blob=class{constructor(parts){a.ctx.exportText=parts.join('');}};a.ctx.URL={createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}};a.run('App.exportData()');assert.ok(!a.ctx.exportText.includes(g.code));assert.ok(!a.ctx.exportText.includes('experience_code'));
});
