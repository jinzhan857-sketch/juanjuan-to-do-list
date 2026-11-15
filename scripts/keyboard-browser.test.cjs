'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
test('keyboard preview serves only the synthetic page and its explicit resources',async t=>{
 const child=spawn(process.execPath,[path.join(__dirname,'keyboard-browser.cjs')],{env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview not ready')),10000);child.once('error',reject);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/\S+/);if(match){clearTimeout(timer);resolve(match[0]);}});});
 const response=await fetch(url),html=await response.text();assert.equal(response.status,200);
 assert.match(html,/indexedDB.open\('juanjuan-issue33-synthetic', 3\)/);assert.doesNotMatch(html,/indexedDB.open\('juanjuan-pet'/);
 assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
 for(const name of ['.env','api/ai','api/ai.js','private/backup.json','package.json','docs/STATUS.md'])assert.equal((await fetch(new URL(name,url))).status,404);
 assert.equal((await fetch(new URL('quick-score.mjs',url))).status,200);
 const nativePage=await fetch(new URL('/native',url)),nativeHtml=await nativePage.text();assert.equal(nativePage.status,200);assert.doesNotMatch(nativeHtml,/indexedDB|syncAgentViewport/);assert.match(nativeHtml,/原生输入对照/);
 assert.equal((await fetch(new URL('/?build=old',url))).status,410);
 assert.equal((await fetch(new URL('/evidence',url),{method:'POST',body:JSON.stringify({events:[],sourceSha256:'old',testBuild:'old'})})).status,409,'Reject evidence from a stale page instead of relabeling it');
});
