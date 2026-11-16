import {runChecks,saveEvidence} from './checks.mjs';
const result=document.querySelector('#result'),frames=document.querySelector('#frames');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const expect=(ok,message)=>{if(!ok)throw Error(message)};
async function instance(name){
 const frame=document.createElement('iframe');frame.src='/app?instance='+name;frames.append(frame);
 await new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=reject});
 const api=frame.contentWindow.testApi;if(!api)throw Error('Application script failed');
 return {frame,api,dispose(){api.DB._db?.close();frame.remove()}};
}
async function seed(api,{crossDay=false,empty=false}={}){
 const {DB,defaultPet,todayStr,addDays,Date,localStorage}=api;await DB.open();
 if(empty)return;
 const pet={...defaultPet(),growth:19.7,streak:3,memoryEnabled:false,lastSettle:crossDay?addDays(todayStr(),-1):todayStr()};
 const image={id:'synthetic-image',name:'合成像素',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
 await DB.put('tasks',{id:'unrelated-task',title:'合成保留日程',execDate:todayStr(),createdAt:Date.now(),timeType:'allday',baseScore:3,note:'合成备注',links:['https://example.com'],images:[image]});
 await DB.put('todos',{id:'unrelated-todo',title:'合成保留待办',createdAt:Date.now(),baseScore:3,done:false,images:[image],links:['https://example.com'],note:'另一条备注'});
 await DB.put('chats',{id:'normal-chat',title:'合成聊天',createdAt:Date.now(),updatedAt:Date.now()});
 await DB.put('messages',{id:'normal-message',chatId:'normal-chat',role:'user',content:'合成文字',createdAt:Date.now()});
 await DB.put('memories',{id:'normal-memory',content:'合成记忆',createdAt:Date.now()});
 await DB.put('operations',{id:'normal-operation',createdAt:Date.now(),status:'undone'});
 await DB.put('kv',pet,'pet');await DB.put('kv',{},'dayStats');await DB.put('kv',['合成标签'],'customTags');await DB.put('kv',[],'memoryGroups');
 localStorage.setItem('juanjuan_active_chat','normal-chat');
 // Use the actual draft methods, including attachments.
 api.S.pet=pet;api.UI.resetCreate('schedule');api.$('#c-title').value='合成草稿';api.UI.cState.resultTitle='合成草稿';api.UI.cState.images=[image];api.UI.saveCreateDraft();
}
async function snapshot(api){
 const stored=await api.DB.snapshot([...api.DATA_STORES,'kv']);
 const storage=Object.fromEntries(Array.from({length:api.localStorage.length},(_,i)=>api.localStorage.key(i)).sort().map(k=>[k,api.localStorage.getItem(k)]));
 return {stored,state:JSON.parse(JSON.stringify(api.S)),storage};
}
async function regression(test,{failAt=null}={}){
 const a=test.api;await a.DB.open();a.S.pet=a.defaultPet();a.S.tasks=[];a.S.todos=[];a.S.memories=[];a.S.messages=[];a.S.operations=[];a.S.dayStats={};a.S.chats=[{id:'regression-chat',title:'合成测试聊天',createdAt:a.Date.now(),updatedAt:a.Date.now()}];a.UI.agentChatId='regression-chat';
 return runChecks(a,{dom:true,failAt});
}
async function verifyUnchanged(api,before,label){expect(canonical(await snapshot(api))===canonical(before),label+' changed normal state/storage')}
async function run(){
 const report={sourceSha256:window.sourceSha256,testBuild:window.testBuild,scenarios:[],legacyResults:[],baselineLegacyErrors:[]};
 const session=crypto.randomUUID().slice(0,8);let sequence=0;
 const create=()=>instance(session+'-'+(++sequence));
 const show=()=>{const {normalBefore,normalAfter,...summary}=report;result.textContent=JSON.stringify(summary,null,2)};
 const record=(name,detail={})=>{report.scenarios.push({name,ok:true,...detail});show()};
 const normal=await create();
 try{
  await seed(normal.api,{crossDay:true});const before=await snapshot(normal.api);
  const early=await create();try{report.legacyResults=await regression(early);if(typeof early.api.App.selfTest==='function'){early.api.App.selfTest();report.baselineLegacyErrors=early.frame.contentWindow.startupLogs.filter(x=>x.level==='error'&&x.text.includes('[自测]'));}expect(report.legacyResults.length===42,'All 42 legacy checks must run');expect(canonical(report.legacyResults.filter(r=>!r.ok).map(r=>r.id))===canonical(['09','23','31']),'Unexpected legacy failure: '+canonical(report.legacyResults.filter(r=>!r.ok)));}finally{early.dispose()}
  await verifyUnchanged(normal.api,before,'Test before startup');record('自测先运行，正常应用状态与存储不变');
  await normal.api.App.init();const started=await snapshot(normal.api);
  for(const store of normal.api.DATA_STORES)expect(canonical(started.stored[store])===canonical(before.stored[store]),'Startup changed '+store);
  expect(normal.api.S.pet.lastSettle===normal.api.todayStr(),'Cross-day settlement missing');
  expect(normal.api.S.pet.satietyTask===3&&normal.api.S.pet.growth===21.7,'Cross-day food/growth incorrect: '+canonical(normal.api.S.pet));
  expect(normal.api.UI.agentChatId==='normal-chat','Chat restore failed');expect(normal.api.UI.cState.resultTitle==='合成草稿','Draft restore failed');
  expect(normal.api.S.pet.memoryEnabled===false,'Memory consent changed');expect(normal.frame.contentWindow.startupLogs.every(l=>!l.text.includes('[自测]')),'Startup emitted self-test logs');
  expect(typeof normal.api.$('#fab').onclick==='function'&&typeof normal.api.$('#day-next').onclick==='function','Bindings missing');
  record('真实App.init保留六类记录、附件、草稿、聊天、授权及跨日业务');
  const beforeDay=normal.api.S.homeDate;normal.api.$('#day-next').click();expect(normal.api.S.homeDate===normal.api.addDays(beforeDay,1),'Day binding failed');normal.api.$('#day-prev').click();
  record('实际日期按钮绑定往返正常');
  const stable=await snapshot(normal.api);
  for(const failAt of [null,'27','40']){
   const test=await create();try{if(failAt){let error;try{await regression(test,{failAt})}catch(e){error=e}expect(error?.message.includes('Injected interruption'),'Failure injection missing');}else {const results=await regression(test);expect(results.length===42&&canonical(results.filter(r=>!r.ok).map(r=>r.id))===canonical(['09','23','31']),'Post-start regression results changed');}}finally{test.dispose()}
   await verifyUnchanged(normal.api,stable,'Test after startup '+failAt);record(failAt?'测试中断于'+failAt+'后正常实例不变':'正常启动后自测，正常实例不变');
  }
  const broken=await create();broken.api.DB.open=async()=>{throw Error('Injected initialization failure')};try{await regression(broken);throw Error('Expected failure')}catch(e){expect(e.message==='Injected initialization failure','Wrong initialization failure')}finally{broken.dispose()}
  await verifyUnchanged(normal.api,stable,'Test initialization failure');record('测试初始化失败后正常实例不变');
  const interrupted=await create();await interrupted.api.DB.open();await interrupted.api.DB.put('tasks',{id:'unfinished-test'});interrupted.dispose();await verifyUnchanged(normal.api,stable,'Closed test');record('测试途中关闭后正常实例不变');
  const normalName=new URL(normal.frame.src).searchParams.get('instance');normal.dispose();const reopened=await instance(normalName);
  try{await reopened.api.App.init();const again=await snapshot(reopened.api);expect(canonical(again.stored)===canonical(stable.stored),'Reopen changed stored data or repeated rewards');expect(reopened.api.S.pet.growth===21.7,'Duplicate reward');report.normalBefore=before;report.normalAfter=again;record('同日重开不重复结算，持久数据与附件不变');
   const images=[...reopened.api.S.tasks,...reopened.api.S.todos].flatMap(x=>x.images||[]);for(const value of images){const image=new Image();image.src=value.data;await image.decode()}record('重开后两份合成图片实际解码成功');
  }finally{reopened.dispose()}
  const fresh=await create();try{await seed(fresh.api,{empty:true});await fresh.api.App.init();expect(fresh.api.S.chats.length===1&&fresh.api.S.tasks.length===0,'Fresh initialization incorrect');expect(!!await fresh.api.DB.get('kv','pet'),'Initial pet missing');expect(Array.isArray(await fresh.api.DB.get('kv','memoryGroups')),'Memory groups missing');record('首次空库初始化宠物、聊天与资料框正常')}finally{fresh.dispose()}
  report.ok=true;
 }catch(e){report.ok=false;report.error=e.stack;}finally{normal.dispose()}
 await saveEvidence(report,fetch);show();return report;
}
document.querySelector('#run').onclick=async()=>{
 const button=document.querySelector('#run');if(button.disabled)return;button.disabled=true;
 try{await run()}catch(e){result.textContent='验收未完成：'+e.stack}finally{button.disabled=false}
};
