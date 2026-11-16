'use strict';
// Real model + actual send/context/handler/confirmation functions. No browser UI
// is automated here. All stores and quota are isolated synthetic fixtures.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {withBudget}=require('./helpers/issue115-budget.cjs');
const {createWorkflowFixture}=require('./helpers/workflow-fixture.cjs');
const {createModelCheck}=require('./ai-simulation.cjs');
if(!process.argv.includes('--live'))throw Error('Explicit --live is required');
const definitions=[
 {id:'correction',steps:['帮我创建2026年12月25日15点到16点复习课程。','不，是16点到17点。'],titles:['复习课程'],check:tasks=>assert.equal(tasks[0].startTime,'16:00')},
 {id:'clarification',steps:['帮我创建一次体检，上午9点到10点，日期还没定，先问我日期。','2026年12月26日。'],titles:['体检'],emptyAt:0,check:tasks=>assert.equal(tasks[0].execDate,'2026-12-26')},
 {id:'discussion-to-create',steps:['我想练习Python，先讨论怎么入门，不要生成候选或创建。','就先创建2026年12月27日19点到20点练习Python。','不对，20点到21点。'],titles:['Python'],emptyAt:0,check:tasks=>assert.equal(tasks[0].startTime,'20:00')},
 {id:'planning-to-create',steps:['我下个月想整理学习笔记，帮我想一个小步方案，现在只讨论。','那先创建2026年12月28日全天整理学习笔记。','晚上七点吧。'],titles:['学习笔记'],emptyAt:0,check:tasks=>assert.equal(tasks[0].startTime,'19:00')},
 {id:'mixed',steps:['帮我创建2026年12月20日全天参加学术分享，以及没有固定日期的待办整理参考文献。','学术分享是在A楼，参考文献需要带电脑，分别补充备注。'],titles:['学术分享'],todos:1,check:(tasks,todos)=>{assert.match(tasks[0].note,/A楼/);assert.match(todos[0].note,/电脑/)}},
 {id:'repeat-groups',steps:['帮我创建两组日程，从2026年12月1日到12月14日，每周二全天阅读论文，每周四全天整理资料。','全都是晚上7点。'],count:4,check:tasks=>assert.ok(tasks.every(t=>t.startTime==='19:00'&&t.endTime==='20:00'))},
 {id:'same-title',steps:['分别创建2026年12月5日和12月6日两条全天复查日程，标题都叫复查。','复查加备注带清单。','只给12月5日的复查补充备注带清单。'],count:2,check:tasks=>{assert.match(tasks.find(t=>t.execDate==='2026-12-05').note,/清单/);assert.equal(tasks.find(t=>t.execDate==='2026-12-06').note||'','')}},
 {id:'todo-note',steps:['创建一个没有固定日期的待办，整理发票。','还要备注，保存电子版。'],count:0,todos:1,check:(tasks,todos)=>assert.match(todos[0].note,/电子版/)},
 {id:'created-edit',steps:['帮我创建2026年12月22日15点到16点检查仪器。','地点补充在B楼，其他不变。'],confirmAt:0,titles:['检查仪器'],check:tasks=>assert.match(tasks[0].note,/B楼/)},
 {id:'cancel-part',steps:['帮我创建2026年12月23日全天读书，以及12月24日全天写作。','取消第二项，第一项保留待确认。'],count:1,check:tasks=>assert.match(tasks[0].title,/读书/)}
];
withBudget(async({key,source,request,state,save})=>{
 const directory='.reports/unified-live/'+Date.now();fs.mkdirSync(directory,{recursive:true});
 const report={source,mode:'real_model_send_entry_integration',browser:false,quota:'synthetic',start_calls:state.attempts.length,cases:[]};
 const persist=()=>fs.writeFileSync(directory+'/results.json',JSON.stringify(report,null,2));
 for(const preference of ['auto','chat','planning','task'])for(const definition of definitions){
  const result={id:preference+'/'+definition.id,preference,steps:[],passed:false},a=await createWorkflowFixture();report.cases.push(result);
  try{
   const input={value:''};a.ctx.document={querySelector:selector=>selector==='#agent-input'?input:null};
   a.ctx.localStorage={setItem(){}};a.run('UI.resizeAgentInput=()=>{};AIService.source=()=> "hosted";AIService.setDegraded=()=>{};');
   let activeStep;
   const handler=createModelCheck({key,request:async(url,options)=>{const wire=JSON.parse(options.body),response=await request(url,options),raw=await response.clone().json();activeStep.model_request=wire.messages;activeStep.model_raw=raw.choices?.[0]?.message?.content;activeStep.usage=raw.usage;return response;}}).handler;
   a.ctx.hosted=async body=>{let status,payload;await handler({method:'POST',headers:{},body:{...body,device_id:'syntheticdevice0123456789abcd',request_id:require('node:crypto').randomBytes(16).toString('hex')}},{status(n){status=n;return this},json(value){payload=value;return value}});if(status!==200)throw Error('Handler status '+status);return payload};
   a.run('AIService.hostedRequest=hosted;');
   const confirm=async()=>{const cards=a.json('UI.assistantCurrentCards().filter(m=>m.meta.status==="pending").map(m=>({id:m.id,version:m.meta.workflow.version}))');assert.ok(cards.length,'No pending cards');await a.confirm(cards)};
   for(let i=0;i<definition.steps.length;i++){
    activeStep={input:definition.steps[i]};result.steps.push(activeStep);input.value=activeStep.input;a.ctx.preference=preference;a.run('UI.agentSelectedRole=preference');
    await a.run('UI.sendAgentMessage()');activeStep.output=a.json('S.messages.filter(m=>m.role==="assistant").slice(-5)');activeStep.cards=a.cards();activeStep.tasks=a.json('S.tasks');activeStep.todos=a.json('S.todos');
    assert.notEqual(a.run('S.messages.at(-1).type'),'error');
    assert.ok(!/切换到卷卷|交给卷卷事务处理/.test(a.run('S.messages.at(-1).content')),'Mode barrier returned');
    if(definition.emptyAt===i)assert.equal(activeStep.cards.length,0,'Discussion unexpectedly produced candidates');
    if(definition.id==='same-title'&&i===1)assert.equal(activeStep.cards.every(c=>!c.action.item.note),true,'Ambiguous title changed a draft');
    if(definition.confirmAt===i){await confirm();result.ids_before_edit=a.json('S.tasks.map(t=>t.id)');}
    else assert.equal(activeStep.tasks.length,definition.confirmAt===undefined||i<=definition.confirmAt?0:1,'Unexpected write before confirmation');
    persist();
   }
   await confirm();const tasks=a.json('S.tasks'),todos=a.json('S.todos');
   assert.equal(tasks.length,definition.count??1);assert.equal(todos.length,definition.todos??0);
   for(const title of definition.titles||[])assert.ok(tasks.some(t=>t.title.includes(title)),'Title was lost: '+title);
   definition.check(tasks,todos);if(result.ids_before_edit)assert.deepEqual(tasks.map(t=>t.id),result.ids_before_edit);
   result.final={tasks,todos,operations:a.json('S.operations'),messages:a.json('S.messages')};
   await a.run('DB._db.close();DB.open()');assert.equal((await a.snapshot()).tasks.length,tasks.length);result.passed=true;
  }catch(error){result.error=error.message;result.final={tasks:a.json('S.tasks'),todos:a.json('S.todos'),messages:a.json('S.messages')};}
  finally{await a.close();persist();console.log(result.id+': '+(result.passed?'PASS':'FAIL '+result.error));}
 }
 report.end_calls=state.attempts.length;report.passed=report.cases.filter(c=>c.passed).length;report.total=report.cases.length;persist();
 state.cases.push({phase:state.active_phase,report:directory,source,at:new Date().toISOString(),model_calls:report.end_calls-report.start_calls,passed:report.passed,total:report.total});save();console.log(JSON.stringify({report:directory,passed:report.passed,total:report.total}));
}).catch(error=>{console.error(error.message);process.exitCode=1});
