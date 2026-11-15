'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.REVIEW_PORT||4212);
const setup=String.raw`
const reviewEvaluate=AIService.evaluate.bind(AIService),ReviewDate=Date;
Date=class extends ReviewDate{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']))}static now(){return new ReviewDate('2026-11-15T10:00:00+08:00').getTime()}};
AIService.source=()=> 'hosted';AIService.getDeviceId=()=> 'syntheticdevice0123456789abcd';
document.querySelector('#review-run').onclick=async()=>{const results=[];try{
 await DB.open();await DB.batch([...DATA_STORES.map(store=>({store,type:'clear'})),{store:'kv',type:'clear'}]);DATA_STORES.forEach(store=>S[store]=[]);S.pet=defaultPet();S.dayStats={};S.customTags=[];S.memoryGroups=[];await DB.put('kv',S.pet,'pet');
 for(const kind of ['schedule','todo']){
  UI.resetCreate(kind);UI.switchPage('create');const input=document.querySelector('#c-title');input.value='明天下午三点复习课程\n带笔记本和讲义';input.dispatchEvent(new Event('input',{bubbles:true}));UI.cState.images=[{id:'review-pic',name:'合成',data:'data:image/png;base64,AA=='}];
  const before=await DB.snapshot(['tasks','todos','kv']);let calls=0;window.fetch=async(u,o)=>{if(JSON.parse(o.body).mode==='cancel')return {ok:true,json:async()=>({released:true})};calls++;return {ok:true,json:async()=>null}};AIService.evaluate=reviewEvaluate;await UI.onAIClick();
  if(document.querySelector('#c-ai-status').textContent!=='识别失败，请重试。'||calls!==1)throw Error('null classification');if(JSON.stringify(await DB.snapshot(['tasks','todos','kv']))!==JSON.stringify(before))throw Error('null result saved');
  UI.resetCreate(kind);if(!UI.restoreCreateDraft()||UI.cState.images.length!==1)throw Error('draft restore');UI.renderCreate();await UI.onSave();const after=await DB.snapshot(['tasks','todos','kv']),store=kind==='todo'?'todos':'tasks';const saved=after[store].filter(x=>!before[store].some(y=>y.id===x.id));if(saved.length!==1||saved[0].note!=='带笔记本和讲义'||saved[0].images.length!==1||saved[0].finalScore!==0)throw Error('manual save');results.push({case:kind+' invalid response and explicit save',pass:true});
 }
 for(const scope of ['device','ip','global']){
  const source=S.tasks[0];UI.startEdit(source.id);UI.cState.resultTitle='手改标题';UI.cState.resultNote='手改备注';UI.cState.date='2026-12-01';UI.cState.timeType='exact';UI.cState.start='23:30';UI.cState.end='00:30';UI.cState.endDayOffset=1;UI.cState.userFields={title:true,note:true,date:true,time:true};UI.renderCreate();const before=await DB.snapshot(['tasks','todos','kv']);
  window.fetch=async(u,o)=>JSON.parse(o.body).mode==='cancel'?{ok:true,json:async()=>({released:true})}:{ok:false,status:429,json:async()=>({limit_scope:scope})};await UI.onAIClick();if(JSON.stringify(await DB.snapshot(['tasks','todos','kv']))!==JSON.stringify(before))throw Error('edit refusal wrote');
  const message=scope==='device'?'今日个人免费AI次数已达上限。':scope==='ip'?'今日当前网络免费AI次数已达上限。':'今日公共免费AI次数已达上限。';if(document.querySelector('#c-ai-status').textContent!==message)throw Error('quota message');
  UI.resetCreate('schedule');if(!UI.restoreCreateDraft()||UI.editingId!==source.id)throw Error('edit restore');UI.renderCreate();await UI.onSave();const after=await DB.snapshot(['tasks','todos','kv']),row=after.tasks.find(x=>x.id===source.id);if(after.tasks.length!==before.tasks.length||row.title!=='手改标题'||row.note!=='手改备注'||row.execDate!=='2026-12-01'||row.startTime!=='23:30'||row.endTime!=='00:30'||row.endDayOffset!==1||row.images.length!==1)throw Error('edit fields');if(JSON.stringify(after.kv)!==JSON.stringify(before.kv)||JSON.stringify(after.todos)!==JSON.stringify(before.todos))throw Error('unrelated changed');results.push({case:scope+' edit refusal, draft restore and explicit save',pass:true});
 }
 document.querySelector('#review-result').textContent=JSON.stringify({pass:results.length,results},null,2);
}catch(error){document.querySelector('#review-result').textContent=JSON.stringify({error:error.stack,results},null,2)}};
`;
http.createServer((req,res)=>{
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')))}
 if(req.url!=='/'){res.writeHead(404).end();return}
 const controls='<aside style="position:fixed;z-index:99999;right:0;top:0;background:white;color:black"><button disabled id="review-run">运行独立复查</button><pre id="review-result" style="max-height:220px;overflow:auto"></pre></aside>';
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet'","indexedDB.open('juanjuan-review89-91-synthetic'").replace('<body>','<body>'+controls).replace('App.init();',setup+"\nApp.init().then(()=>document.querySelector('#review-run').disabled=false);");
 res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data: blob:; font-src 'none'");res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);
}).listen(port,'127.0.0.1',()=>console.log('Synthetic review http://127.0.0.1:'+port+'/'));
