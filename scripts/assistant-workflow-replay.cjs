'use strict';
// Offline replay is explicitly distinct from a fresh model request. Never load AI configuration.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createWorkflowFixture}=require('./helpers/workflow-fixture.cjs');
async function run(){
 const result={kind:'offline_history_replay_not_new_model',runtime_sha256:crypto.createHash('sha256').update(fs.readFileSync('index.html')).update(fs.readFileSync('api/ai.js')).update(fs.readFileSync('src/assistant/workflow.js')).digest('hex'),cases:[]};
 for(const file of ['eval-A-1794808403764.json','eval-B-1794808495042.json','eval-D-1794809709439.json']){
  const report=JSON.parse(fs.readFileSync('.reports/issue115/'+file));
  for(const c of report.cases){const a=await createWorkflowFixture(c.expected.date||'2026-11-16');let failure=null;try{
   let index=0;
   for(const step of c.expected.turns){
    if(typeof step==='object'){const refs=a.json("UI.assistantCurrentCards().filter(m=>m.meta.status==='pending').map(m=>({id:m.id,version:m.meta.workflow.version}))");await a.confirm(step.confirm==='all'?refs:refs.slice(0,step.confirm));continue;}
    const recorded=c.turns.filter(t=>t.input)[index++];if(!recorded.raw)throw Error('Missing original raw response');
    let answer=JSON.parse(recorded.raw);
    // Rebind only opaque model card IDs to the same ordinal identities in this isolated replay.
    const ids=new Map((recorded.context.candidate_cards||[]).map((card,i)=>[card.card_id,a.cards()[i]?.card_id]));
    if(answer.entries)answer.entries=answer.entries.map(e=>e.card_id?{...e,card_id:ids.get(e.card_id)||e.card_id}:e);
    if(answer.type==='workflow')await a.apply(answer,step,a.cards());
   }
   if(a.cards().some(c=>c.status==='pending'))await a.confirm();
   const tasks=a.json('S.tasks'),todos=a.json('S.todos');assert.equal(tasks.length,c.expected.tasks);assert.equal(todos.length,c.expected.todos);
   if(c.expected.dates)assert.deepEqual(tasks.map(t=>t.execDate),c.expected.dates);
   if(c.expected.start)assert.equal(tasks[0].startTime,c.expected.start);if(c.expected.end)assert.equal(tasks[0].endTime,c.expected.end);
   if(c.expected.noteChecks)for(const [title,...parts] of c.expected.noteChecks)for(const part of parts)assert.ok(tasks.find(t=>t.title.includes(title))?.note.includes(part));
  }catch(e){failure=e.message;}finally{a.close();}result.cases.push({id:c.id,passed:!failure,failure,source_report:file});
  }
 }
 fs.writeFileSync('.reports/issue115/d-offline-replay.json',JSON.stringify(result,null,2));console.log(JSON.stringify({kind:result.kind,total:result.cases.length,passed:result.cases.filter(c=>c.passed).length,failures:result.cases.filter(c=>!c.passed)}));if(result.cases.some(c=>!c.passed))process.exitCode=1;
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
