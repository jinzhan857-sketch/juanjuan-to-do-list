'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {withBudget}=require('./helpers/issue115-budget.cjs');
const {createModelCheck}=require('./ai-simulation.cjs');
const {createWorkflowFixture}=require('./helpers/workflow-fixture.cjs');
async function run(){
 if(!process.argv.includes('--live'))throw Error('Use --live explicitly');
 const batch=process.argv.find(x=>x.startsWith('--batch='))?.split('=')[1];
 const partition=process.argv.find(x=>x.startsWith('--partition='))?.split('=')[1]||'regression';
 const repeat=Number(process.argv.find(x=>x.startsWith('--repeat='))?.split('=')[1]||1);
 const addendum=process.argv.includes('--c-addendum');
 const dMode=['D','D-regression','D-review','Final-review'].includes(batch);
 const caseFile=dMode?'docs/audit/2026-11-16/issue115/'+(batch==='D'?'d-v1.json':batch==='D-review'?'d-review-v1.json':batch==='Final-review'?'final-review-v1.json':'d-regression-v1.json'):addendum?'docs/audit/2026-11-16/issue115/c-addendum-v1.json':batch?'docs/audit/2026-11-16/issue115/batches-v1.json':'docs/audit/2026-11-16/issue115/cases.json';
 const bytes=fs.readFileSync(caseFile),caseHash=crypto.createHash('sha256').update(bytes).digest('hex');
 const parsedCases=JSON.parse(bytes.toString().replace(/^\uFEFF/,''));
 const scenarios=(batch?parsedCases.cases:parsedCases).filter(s=>addendum?true:batch?s.batch===batch:s.partition===partition);
 if(!scenarios.length||!Number.isInteger(repeat)||repeat>5)throw Error('Unknown fixed suite');
 await withBudget(async({key,source,request,state,save,endpoint})=>{
  if(dMode){if(batch==='D'&&!state.cases.some(r=>r.batch==='D-regression'&&r.source===source&&r.passed===14&&r.total===14))throw Error('D regression gate not passed');}
  else if(batch&&batch!=='A'){const previous=batch==='B'?'A':'B';if(!state.cases.some(r=>r.batch===previous&&r.source===source&&r.passed===40&&r.total===40&&(addendum||r.caseHash===caseHash)))throw Error('Previous batch has not passed on this runtime and frozen set');}
  const report={source,batch,caseHash,partition,model:'deepseek-flash',pricing_source:'https://api-docs.deepseek.com/quick_start/pricing/',price_cny_per_million:{input:2.4,output:9.6},fx_conservative_cny_per_usd:8,cases:[]};
  const output='.reports/issue115/eval-'+(addendum?'C-addendum':batch||partition)+'-'+Date.now()+'.json';
  try{
   for(let repetition=1;repetition<=repeat;repetition++)for(const route of ['hosted','custom'])for(const scenario of scenarios){
    if(batch&&route!==scenario.route)continue;
    const date=scenario.date||'2026-11-16',app=await createWorkflowFixture(date),history=[],turns=[];let raw;
    const transport=async(url,options)=>{const res=await request(url,options);raw=await res.clone().json();return res;};
    const setup=createModelCheck({key,request:transport});
    app.ctx.fetch=transport;app.ctx.config={endpoint,model:'deepseek-flash',key};
    app.run("AIService.source=()=> 'custom';AIService.customConfig=()=>config;AIService.setDegraded=()=>{}");
    let failure=null;const initialPet=app.json('S.pet'),initialStats=app.json('S.dayStats');
    try{
     for(const step of scenario.turns){
      if(typeof step==='object'&&step.confirm){const pending=app.json("UI.assistantCurrentCards().filter(m=>m.meta.status==='pending').map(m=>({id:m.id,version:m.meta.workflow.version}))");await app.confirm(step.confirm==='all'?pending:pending.slice(0,step.confirm));turns.push({command:'confirm',scope:step.confirm,after:await app.snapshot()});continue;}
      const text=step;
      raw=null;const context={candidate_cards:app.cards(),history:[...history,{role:'user',content:text}]};let result;
      if(route==='hosted'){
       const req={method:'POST',headers:{'x-forwarded-for':'127.0.0.1'},socket:{remoteAddress:'127.0.0.1'},body:{mode:'agent',agent_role:'task',message:text,context,client_date:date,device_id:'syntheticdevice0123456789abcd',request_id:crypto.randomBytes(16).toString('hex')}};
       const res={status(n){this.code=n;return this;},json(x){result=x;}};await setup.handler(req,res);
      }else{app.ctx.text=text;app.ctx.context=context;result=await app.run("AIService.agent(text,context,'task')");}
      const before=await app.snapshot();let error=null;try{if(result.type==='workflow')await app.apply(result,text,context.candidate_cards);}catch(e){error=e.message;}
      const turn={input:text,context,raw:raw?.choices?.[0]?.message?.content,model_error:raw?.error,result,error,before,after:await app.snapshot(),cards:app.cards()};turns.push(turn);history.push({role:'user',content:text},{role:'assistant',content:result.reply||''});
      assert.equal(app.json('S.tasks.length+S.todos.length'),before.tasks.length+before.todos.length,'No writes before confirmation');
      if(error)throw Error(error);if(result.error||result.type==='error')throw Error('Model/contract failure');
     }
     if(scenario.noCards)assert.equal(app.cards().length,0,'Discussion cannot create cards');
     if(scenario.clarifyLast)assert.equal(turns.at(-1).result.type,'clarify','Unknown target must ask');
     if(!scenario.noCommit&&app.cards().some(c=>c.status==='pending'))await app.confirm();
     assert.deepEqual(app.json('S.pet'),initialPet,'No reward for unfinished items');assert.deepEqual(app.json('S.dayStats'),initialStats,'No unearned points');
     const tasks=app.json('S.tasks'),todos=app.json('S.todos');assert.equal(tasks.length,scenario.tasks,'Task count');assert.equal(todos.length,scenario.todos,'Todo count');
     if(scenario.titles)assert.deepEqual(tasks.map(t=>t.title),scenario.titles,'Full original titles');
     if(scenario.allDay)assert.ok(tasks.every(t=>t.timeType==='allday'));
     if(scenario.allExact)assert.ok(tasks.every(t=>t.startTime===scenario.start&&t.endTime===scenario.end));
     if(scenario.noteChecks)for(const [title,...parts] of scenario.noteChecks){const task=tasks.find(t=>t.title.includes(title));for(const part of parts)assert.ok(task?.note.includes(part),'Targeted note '+title+' '+part);}
     if(scenario.dates)assert.deepEqual(tasks.map(t=>t.execDate),scenario.dates,'Exact dates');
     if(scenario.fieldChecks)for(const check of scenario.fieldChecks){const actual=tasks[check.index]?.[check.field]??'';if(check.equals!==undefined)assert.equal(actual,check.equals);if(check.includes!==undefined)assert.ok(actual.includes(check.includes));}
     if(scenario.overnight)assert.equal(tasks[0].endDayOffset,1,'Explicit next-day end');
     if(scenario.start)assert.equal(tasks[0].startTime,scenario.start);if(scenario.end)assert.equal(tasks[0].endTime,scenario.end);if(scenario.secondStart)assert.equal(tasks[1].startTime,scenario.secondStart);
     if(scenario.groups)assert.equal(new Set(tasks.map(t=>t.seriesId)).size,scenario.groups);
     if(scenario.notes)scenario.notes.forEach((note,i)=>assert.ok(tasks[i].note.includes(note),'Preserve note'));
     app.run('DB._db.close()');await app.run('DB.open()');assert.equal((await app.snapshot()).tasks.length,scenario.tasks,'Reopen task count');
    }catch(e){failure=e.message;}
    report.cases.push({id:scenario.id,route,repetition,expected:scenario,passed:!failure,failure,turns,final:await app.snapshot()});app.close();
    fs.mkdirSync('.reports/issue115',{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({id:scenario.id,route,repetition,passed:!failure,failure}));
    if(batch==='C'&&failure){report.hasFailuresAwaitingUserDecision=true;} // Complete the requested 40-case evaluation without tuning C.
   }
  }finally{state.cases.push({report:output,source,partition,batch,caseHash,passed:report.cases.filter(c=>c.passed).length,total:report.cases.length,at:new Date().toISOString()});save();console.log(JSON.stringify({report:output,passed:report.cases.filter(c=>c.passed).length,total:report.cases.length}));}
 });
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
