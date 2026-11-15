'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const {check}=require('./check-navigation-evidence.cjs');
test('dynamic evidence oracle rejects the reproduced jump and accepts desktop and real phone geometry',()=>{
 const evidence=name=>require('../docs/audit/2026-11-15/issue32-evidence/'+name+'.json');
 assert.throws(()=>check(evidence('baseline')));
 for(const name of ['desktop-wide','desktop-narrow','phone'])assert.equal(check(evidence(name)).cases,26);
});
test('navigation preview isolates synthetic storage and never exposes repository files',async t=>{
 const child=spawn(process.execPath,[path.join(__dirname,'navigation-browser.cjs')],{env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const url=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Preview did not start')),10000);
  child.once('error',reject);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/\S+/);if(match){clearTimeout(timer);resolve(match[0]);}});
 });
 const response=await fetch(url),html=await response.text();
 assert.equal(response.status,200);assert.match(html,/indexedDB.open\('juanjuan-issue32-synthetic', 3\)/);assert.doesNotMatch(html,/indexedDB.open\('juanjuan-pet'/);
 assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
 for(const file of ['.env','package.json','api/ai.js','api/ai','docs/STATUS.md','private/backup.json','evidence'])assert.equal((await fetch(new URL(file,url))).status,404,file);
 assert.equal((await fetch(new URL('quick-score.mjs',url))).status,200);
});
