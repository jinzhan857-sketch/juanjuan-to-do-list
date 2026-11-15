'use strict';
async function seed(a,status='done'){
 a.ctx.seedStatus=status;
 a.run("S.pet=defaultPet();UI.renderAgent=()=>{};UI.agentChatId='chat';S.tasks=[{id:'a',seriesId:'group',seriesRule:{date_from:'2026-11-15',date_to:'2026-11-15',weekdays:[7]},title:'合成课程',note:'原备注',links:['https://example.com'],images:[{id:'pic',data:'data:image/png;base64,AA=='}],execDate:'2026-11-15',timeType:'allday',slot:null,startTime:null,endTime:null,createdAt:clock-2*86400000,baseScore:2,category:'学业事务',aiSource:'ai',aiReason:'合成',aiAdvice:'',isBackfill:false,status:seedStatus,statusAt:seedStatus?clock:null,statusEditCount:0,finalScore:seedStatus?1.2:0,parts:null,timeChangeMul:null,timeChangeLabel:null,timeChangeWhy:null},{id:'unrelated',title:'无关记录',execDate:'2026-12-01',timeType:'allday',baseScore:3,createdAt:clock,status:null,statusEditCount:0,finalScore:0}];S.dayStats={'2026-11-15':{points:seedStatus?1.2:0,done:seedStatus==='done'?1:0}};S.messages=[{id:'m',chatId:'chat',role:'assistant',type:'proposal',content:'确认',meta:{status:'pending'}}];");
 await a.run("DB.batch([...S.tasks.map(value=>({store:'tasks',value})),...S.messages.map(value=>({store:'messages',value})),{store:'kv',key:'pet',value:S.pet},{store:'kv',key:'dayStats',value:S.dayStats}])");
}
async function edit(a,entry,item={base_score:10}){
 a.ctx.patch=item;
 if(entry==='form'){
  a.run("UI.startEdit('a');const c=UI.cState;for(const [key,value] of Object.entries(patch)){const map={title:'resultTitle',note:'resultNote',exec_date:'date',time_type:'timeType',start_time:'start',end_time:'end',slot:'slot',category:'tag'};if(key==='base_score')c.ai.base_score=value;else c[map[key]]=value;}c.userFields={title:true,note:true,date:true,time:true,tag:true};");
  await a.run('UI.onSave()');
 }else{
  a.run("action="+(entry==='batch'?"{kind:'update_schedule_batch',rule:{series_id:'group',date_from:'2026-11-15',date_to:'2026-11-15',weekdays:[7]},item:patch}":"{kind:'update_schedule',target_id:'a',item:patch}")+";UI.captureAgentScope(action)");
  await a.run('UI.executeAgentAction(action,S.messages[0])');
 }
}
module.exports={seed,edit};
