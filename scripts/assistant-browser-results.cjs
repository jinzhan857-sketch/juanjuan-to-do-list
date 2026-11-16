'use strict';
// Validate recorded browser database snapshots; never drives UI or calls AI.
const fs=require('node:fs'),assert=require('node:assert/strict');
const inputs=process.argv.slice(2);if(inputs.length<2)throw Error('Provide batch JSON and one or more browser events JSON files');
const batch=JSON.parse(fs.readFileSync(inputs.shift(),'utf8')),events=inputs.flatMap(file=>JSON.parse(fs.readFileSync(file,'utf8')).events),snapshots=events.filter(e=>e.kind==='database'),latest=snapshots.at(-1)?.snapshot;if(!latest)throw Error('No actual database snapshot');
const results=[];const flat=operation=>Array.isArray(operation.after)?operation.after:operation.after?[operation.after]:[];
const normalize=text=>String(text).replace(/\s+/g,'');
for(const test of batch.cases){
 const r={id:test.id,family:test.family,passed:false};results.push(r);
 try{
  // Retests can use a separate synthetic profile. Select the latest explicitly
  // repeated input, preserving every original failed snapshot and assertion.
  const first=snapshots.flatMap(e=>e.snapshot.messages).findLast(m=>m.role==='user'&&m.content===test.inputs[0]);assert.ok(first,'No actual user message');r.chat_id=first.chatId;
  const caseLatest=snapshots.findLast(e=>e.snapshot.messages.some(m=>m.id===first.id)).snapshot;
  const initialCards=new Set(caseLatest.messages.filter(m=>m.chatId===first.chatId&&m.meta?.workflow?.requestId===first.id).map(m=>m.meta.workflow.cardId));
  const expectedOperations=test.expected.operations||initialCards.size;
  // Each case is assessed at its own first completed confirmation, so a later
  // authorized retest in another chat cannot be mistaken for unrelated damage.
  const last=snapshots.find(e=>test.inputs.every(text=>e.snapshot.messages.some(m=>m.chatId===first.chatId&&m.role==='user'&&m.content===text))&&e.snapshot.operations.filter(op=>op.chatId===first.chatId&&op.status==='done').length===expectedOperations)?.snapshot;assert.ok(last,'No completed browser confirmation');
  const rootTime=op=>{const message=last.messages.find(m=>m.id===op.messageId),cardId=message?.meta?.workflow?.cardId;return Math.min(...last.messages.filter(m=>m.chatId===first.chatId&&m.meta?.workflow?.cardId===cardId).map(m=>m.createdAt));};
  const operations=last.operations.filter(op=>op.chatId===first.chatId&&op.status==='done').sort((a,b)=>rootTime(a)-rootTime(b));
  const orderedIds=[...new Set(operations.flatMap(flat).map(x=>x.id))],ids=new Set(orderedIds),tasks=orderedIds.map(id=>last.tasks.find(t=>t.id===id)).filter(Boolean),todos=orderedIds.map(id=>last.todos.find(t=>t.id===id)).filter(Boolean);r.actual={tasks,todos,operations};
  assert.equal(tasks.length,test.expected.tasks);assert.equal(todos.length,test.expected.todos);
  if(test.expected.operations)assert.equal(operations.length,test.expected.operations);
  const creation=operations.filter(o=>o.kind.startsWith('create')).flatMap(flat);
  for(const key of ['titles','todo_titles'])if(test.expected[key])assert.deepEqual((key==='titles'?tasks:todos).map(t=>normalize(t.title)),test.expected[key].map(normalize));
  if(test.expected.groups)assert.equal(new Set(tasks.map(t=>t.seriesId)).size,test.expected.groups);
  if(test.expected.times)assert.deepEqual(tasks.map(t=>[t.startTime,t.endTime]),test.expected.times);
  if(test.expected.notes)test.expected.notes.forEach((note,i)=>{if(note)assert.ok(tasks[i].note.includes(note));else assert.equal(tasks[i].note||'','')});
  if(test.expected.preserve_ids)assert.deepEqual(tasks.map(t=>t.id),creation.map(t=>t.id));
  if(test.expected.superseded)assert.ok(last.messages.filter(m=>m.chatId===first.chatId&&m.meta?.status==='superseded').length>=test.expected.superseded);
  // Last send before first confirmation was captured using the visible audit
  // button; it must contain no record created by this case.
  const pre=snapshots.find(e=>e.snapshot.messages.some(m=>m.id===first.id));assert.ok(pre);assert.equal(pre.snapshot.tasks.filter(t=>ids.has(t.id)).length,0);assert.equal(pre.snapshot.todos.filter(t=>ids.has(t.id)).length,0);
  const beforeIds=new Set([...pre.snapshot.tasks,...pre.snapshot.todos].map(t=>t.id));for(const t of [...pre.snapshot.tasks,...pre.snapshot.todos]){if(ids.has(t.id))continue;assert.deepEqual((t.execDate?last.tasks:last.todos).find(x=>x.id===t.id),t,'Unrelated record changed')}
  assert.ok([...ids].every(id=>!beforeIds.has(id)),'Case reused a prior unrelated record');assert.deepEqual(last.kv,pre.snapshot.kv,'Points or pet changed');
  r.before_confirmation={tasks:pre.snapshot.tasks.length,todos:pre.snapshot.todos.length,operations:pre.snapshot.operations.length};r.passed=true;
 }catch(error){r.error=error.message;}
}
const report={batch:batch.batch,mode:'actual_browser_database_snapshot_validation',cases:results,passed:results.filter(r=>r.passed).length,total:results.length};
const destination='.reports/unified-ui/'+batch.batch.toLowerCase()+'-database-validation.json';fs.writeFileSync(destination,JSON.stringify(report,null,2));for(const r of results)console.log(r.id+': '+(r.passed?'PASS':'FAIL '+r.error));console.log(destination);
if(report.passed!==report.total)process.exitCode=1;
