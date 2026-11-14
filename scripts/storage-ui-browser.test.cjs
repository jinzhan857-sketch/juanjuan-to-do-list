'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const {once}=require('node:events');
test('real import UI harness isolates database and network without replacing application handlers',async t=>{
 const root=path.resolve(__dirname,'..');
 const child=cp.spawn(process.execPath,['scripts/storage-ui-browser.cjs'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}});
 const info=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Harness failed to start')),5000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(text.trim()));}catch(error){reject(error);}}});});
 const response=await fetch(info.url),html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
 assert.equal(info.database,'juanjuan-issue37-synthetic');
 const original=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-issue37-synthetic', 3)");
 const scripts=text=>[...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 const originals=scripts(original),served=scripts(html);assert.deepEqual(served.slice(0,originals.length),originals);assert.equal(served.length,originals.length+1);
 served.forEach(code=>new vm.Script(code));assert.doesNotMatch(html,/indexedDB\.open\('juanjuan-pet'/);
 const scoring=await fetch(info.url+'quick-score.mjs');assert.equal(scoring.status,200);assert.equal(await scoring.text(),fs.readFileSync(path.join(root,'src/rules/quick-score.mjs'),'utf8'));
 for(const route of ['api/ai','.env','.git/config','private/backup.json','docs/'])assert.equal((await fetch(info.url+route)).status,404);
});
