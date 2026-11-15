'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function check(record){
 assert.equal(record.probe,'','Acceptance requires unmodified application styles');
 assert.equal(record.summary.length,26,'24 directed transitions and two rapid sequences');
 const steadyHeights=new Map();
 for(const run of record.runs.filter(x=>x.length===0&&x.from)){
  const last=run.samples.at(-1);steadyHeights.set(last.page,last.scrollHeight);
 }
 for(const run of record.runs.filter(x=>x.samples)){
  assert.ok(run.samples.length>=10,'Insufficient animation samples');
  assert.ok(run.samples.every(s=>s.visible==='visible'),'Background sampling is invalid');
  for(const key of ['left','pageWidth','navLeft','navWidth']){
   const values=run.samples.map(s=>s[key]);assert.ok(Math.max(...values)-Math.min(...values)<.1,`${run.from} to ${run.target}: unstable ${key}`);
  }
  assert.ok(run.samples.every(s=>s.scrollWidth<=s.width),'Horizontal overflow');
  // Empty content may legitimately exceed the initially visible mobile viewport.
  // Compare each page with its settled geometry, including during rapid switching.
  if(run.length===0)assert.ok(run.samples.every(s=>s.scrollHeight<=steadyHeights.get(s.page)+1),'Transient short-page overflow');
  if(run.length===35&&run.target!=='rapid')assert.ok(run.scrollActual>0,'Long content cannot scroll');
 }
 assert.equal(record.runs.filter(x=>x.target==='database').length,2);
 assert.ok(record.runs.filter(x=>x.target==='database').every(x=>x.unchanged),'Navigation modified data');
 return {viewport:record.viewport,cases:26,sourceSha256:record.sourceSha256};
}
module.exports={check};
if(require.main===module){for(const file of process.argv.slice(2))console.log(JSON.stringify({file,...check(JSON.parse(fs.readFileSync(file,'utf8')))}));}
