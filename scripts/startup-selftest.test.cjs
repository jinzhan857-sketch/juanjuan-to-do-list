'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./publisher-fixture.cjs');
const names='ScoreEngine,UI,S,AIService,DB,Date,todayStr,addDays,parseDate,taskDeadline,foodForScore,todoScore,normalizeTodoLinks,recognizePublishTime,parseNaturalDate,mapTag,$,AbortController';
async function regression(t){
 const f=await fixture(t);
 f.run(`NativeDate=Date;Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-11-16T10:00:00+08:00']))}static now(){return new NativeDate('2026-11-16T10:00:00+08:00').getTime()}};S.homeDate=todayStr();S.memories=[];S.messages=[];S.chats=[{id:'regression-chat',title:'合成聊天',createdAt:Date.now(),updatedAt:Date.now()}];S.operations=[];S.memoryGroups=[];UI.agentChatId='regression-chat';UI.renderAgent=()=>{};`);
 return {...f,api:f.run('({'+names+'})')};
}
test('42 old checks have explicit independent destinations; 37 non-DOM cases run without App.init',async t=>{
 const {runChecks,browserOnly}=await import('./helpers/startup-selftest-checks.mjs');
 const f=await regression(t),results=await runChecks(f.api);
 fs.mkdirSync(require('node:path').join(__dirname,'../.reports'),{recursive:true});fs.writeFileSync(require('node:path').join(__dirname,'../.reports/issue106-node.json'),JSON.stringify({results,knownBaselineFailures:['09','23']},null,2));console.warn('Legacy baseline assertions 09 and 23 still fail; retained as explicit observations, not functional passes.');assert.equal(results.length,37);assert.deepEqual(results.filter(r=>!r.ok).map(r=>r.id),['09','23'],'Keep the two reproduced baseline failures visible; any new failure blocks this migration');
 assert.deepEqual([...results.map(r=>r.id),...browserOnly].sort(),Array.from({length:42},(_,i)=>String(i+1).padStart(2,'0')));
});
test('tests before or after an app instance, including interrupted runs, cannot change its storage or state',async t=>{
 const {runChecks}=await import('./helpers/startup-selftest-checks.mjs');
 const normal=await regression(t);
 normal.run(`S.tasks=[{id:'unrelated',images:[{data:'data:image/png;base64,AA=='}],links:['https://example.com']}];S.pet.growth=17;S.pet.memoryEnabled=false;`);
 const snapshot=async f=>JSON.stringify({db:await f.run("DB.snapshot([...DATA_STORES,'kv'])"),state:f.json('S'),storage:f.run('localStorage.getItem("juanjuan_create_draft")')});
 const before=await snapshot(normal);
 for(const failAt of [null,'27','40']){
  const other=await regression(t);
  if(failAt)await assert.rejects(runChecks(other.api,{failAt}),/Injected interruption/);else assert.deepEqual((await runChecks(other.api)).filter(r=>!r.ok).map(r=>r.id),['09','23']);
  assert.equal(await snapshot(normal),before);
 }
 await assert.rejects(runChecks({}),TypeError);assert.equal(await snapshot(normal),before);
});
test('production source and built page contain neither selfTest nor regression fixture imports',()=>{
 for(const file of ['index.html','dist/index.html']){
  const html=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
  assert.doesNotMatch(html,/selfTest|\[自测\]|agent_query_test|agent_series_one|planning_inside_test|startup-selftest/);
 }
 assert.deepEqual(fs.readdirSync(require('node:path').join(__dirname,'../dist')).sort(),['build-info.json','index.html','quick-score.mjs']);
});

test('synthetic browser entry only serves explicit resources and isolates database and localStorage',async t=>{
 const {spawn}=require('node:child_process');const child=spawn(process.execPath,[require('node:path').join(__dirname,'startup-selftest-browser.cjs')],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview timeout')),10000);child.once('error',reject);child.stdout.on('data',c=>{const m=String(c).match(/http:\/\/\S+/);if(m){clearTimeout(timer);resolve(m[0])}})});
 const response=await fetch(new URL('/app?instance=node-test',url)),html=await response.text();assert.equal(response.status,200);assert.match(html,/juanjuan-issue106-node-test/);assert.doesNotMatch(html,/indexedDB.open\('juanjuan-pet'/);assert.match(html,/issue106-node-test:/);assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
 for(const p of ['package.json','api/ai','api/ai.js','.env','private/backup.json','scripts/startup-selftest.test.cjs','dist/index.html'])assert.equal((await fetch(new URL(p,url))).status,404);
 for(const p of ['checks.mjs','browser.mjs','quick-score.mjs'])assert.equal((await fetch(new URL(p,url))).status,200);
 assert.equal((await fetch(new URL('/app?instance=..%2Fprivate',url))).status,400);
 assert.equal((await fetch(new URL('evidence',url),{method:'POST',body:JSON.stringify({sourceSha256:'wrong',scenarios:[]})})).status,400);
});

test('evidence rejection or network failure cannot be reported as successful validation',async()=>{
 const {saveEvidence}=await import('./helpers/startup-selftest-checks.mjs');const report={sourceSha256:'synthetic',ok:true};
 await assert.rejects(saveEvidence(report,async()=>({ok:false,status:400})),/Evidence save failed: 400/);
 await assert.rejects(saveEvidence(report,async()=>{throw Error('offline')}),/offline/);
 let saved;assert.equal(await saveEvidence(report,async(url,options)=>{assert.equal(url,'/evidence');saved=JSON.parse(options.body);return {ok:true}}),report);assert.deepEqual(saved,report);
});
