'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.join(__dirname,'..'),{seed}=require('./edit-score-fixture.cjs');
const setup=String.raw`
var clock=new Date('2026-11-15T10:00:00+08:00').getTime();const NativeDate=Date;Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}};
const seed=${seed.toString()};
const originalRenderAgent=UI.renderAgent;
const a={ctx:window,run:code=>(0,eval)(code)};
const snapshot=()=>DB.snapshot([...DATA_STORES,'kv']);
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
async function reset(status='done'){
 clock=new NativeDate('2026-11-15T10:00:00+08:00').getTime();await DB.batch([...DATA_STORES,'kv'].map(store=>({store,type:'clear'})));DATA_STORES.forEach(store=>S[store]=[]);UI.resetCreate();await seed(a,status);S.chats=[{id:'chat',title:'合成编辑验收',updatedAt:clock}];await DB.put('chats',S.chats[0]);UI.renderAgent=originalRenderAgent;
}
async function agent(entry,patch){
 const action=entry==='batch'?{kind:'update_schedule_batch',rule:{series_id:'group',date_from:'2026-11-15',date_to:'2026-11-15',weekdays:[7]},item:patch}:{kind:'update_schedule',target_id:'a',item:patch};
 UI.captureAgentScope(action);S.messages[0].meta.action=action;await DB.put('messages',S.messages[0]);UI.switchPage('agent');await document.querySelector('[data-agent-confirm="m"]').onclick();
}
App.bind();
document.querySelector('#edit-run').onclick=async()=>{
 const results=[],details=[];const ok=(name,value)=>{if(!value)throw Error(name);results.push(name)};const out=document.querySelector('#edit-result');out.textContent='运行中';
 try{await DB.open();
 for(const status of [null,'done']){
  const comparison=[];
  for(const entry of ['form','single','batch']){
   await reset(status);const before=await snapshot(),beforeStats=copyData(S.dayStats);
   if(entry==='form'){UI.startEdit('a');UI.cState.ai.base_score=10;await document.querySelector('#btn-save').onclick();}else await agent(entry,{base_score:10});
   const row=copyData(S.tasks[0]);ok(entry+' '+status+' 基础价值和所得',row.baseScore===10&&row.finalScore===(status?5.9:0));ok(entry+' '+status+' 完整附件和无关资料',same(row.images,before.tasks[0].images)&&same(row.links,before.tasks[0].links)&&same(S.tasks[1],before.tasks[1])&&S.tasks.length===2);
   const pet={...S.pet,fridge:S.pet.fridge.map(({id,...food})=>food)};
   comparison.push({score:row.finalScore,stats:S.dayStats,pet});
   if(entry!=='form'){
    const once=await snapshot();await UI.confirmAgentAction('m');ok(entry+'重复确认零变化',same(once,await snapshot()));const fed=copyData(S.pet);await document.querySelector('[data-agent-undo="m"]').onclick();ok(entry+'撤销恢复记录和流水，保留宠物',same(S.tasks[0],before.tasks[0])&&same(S.dayStats,beforeStats)&&same(S.pet,fed));
   }
   const persisted=await snapshot();DB._db.close();await DB.open();ok(entry+' '+status+' 重开一致',same(persisted,await snapshot()));details.push({entry,status,record:row,counts:{tasks:S.tasks.length,todos:S.todos.length},database:persisted});
  }
  ok(status+' 三入口计分统计宠物一致',same(comparison[0],comparison[1])&&same(comparison[0],comparison[2]));
 }
 await reset();UI.startEdit('a');UI.cState.ai.base_score=10;const beforeFailure=await snapshot(),batch=DB.batch;DB.batch=async()=>{throw Error('synthetic capacity')};await document.querySelector('#btn-save').onclick();DB.batch=batch;ok('表单保存失败保留草稿且零写入',same(beforeFailure,await snapshot())&&UI.cState.ai.base_score===10&&!UI.cState.saved);await document.querySelector('#btn-save').onclick();ok('用户重试仅保存一次',S.tasks.length===2&&S.tasks[0].finalScore===5.9);
 await reset();Object.assign(S.tasks[0],{timeType:'exact',slot:'evening',startTime:'23:30',endTime:'00:30',endDayOffset:1});await DB.put('tasks',S.tasks[0]);await agent('single',{note:'跨日保留'});ok('跨日内容编辑保留结束日与附件',taskDeadline(S.tasks[0])===new NativeDate('2026-11-16T00:30:00+08:00').getTime()&&S.tasks[0].endDayOffset===1&&S.tasks[0].images.length===1);
 const stable=await snapshot();let refused=false;try{await agent('single',{start_time:'22:00'});}catch(e){refused=true;}ok('跨日改时仍要求表单核对',same(stable.tasks,(await snapshot()).tasks)&&same(stable.kv,(await snapshot()).kv)&&same(stable.operations,(await snapshot()).operations));
 await reset();await agent('single',{base_score:10});const failedUndo=await snapshot(),originalBatch=DB.batch;DB.batch=async()=>{throw Error('synthetic undo failure')};await UI.undoAgentOperation('m');DB.batch=originalBatch;ok('撤销失败保留记录流水和宠物',same(failedUndo,await snapshot()));
 out.textContent=JSON.stringify({pass:results.length,results,clock:'2026-11-15T10:00:00+08:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,details},null,2);
 }catch(error){out.textContent=JSON.stringify({error:error.stack,results},null,2);}
};
`;
const controls='<aside style="position:fixed;top:0;right:0;z-index:99999;background:white;color:black;padding:12px;max-width:470px"><button id="edit-run">运行编辑合成验收</button><pre id="edit-result" style="max-height:400px;overflow:auto"></pre></aside>';
http.createServer((req,res)=>{if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')))}if(req.url!=='/')return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"connect-src 'none';img-src data: blob:;font-src 'none'");res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet'","indexedDB.open('juanjuan-issue28-synthetic'").replace('<body>','<body>'+controls).replace(/^App\.init\(\);$/m,setup));}).listen(0,'127.0.0.1',function(){console.log('Synthetic #28 http://127.0.0.1:'+this.address().port+'/')});
