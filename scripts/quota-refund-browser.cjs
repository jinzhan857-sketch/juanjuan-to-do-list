'use strict';
// Dedicated synthetic origin. The real handler runs in a VM whose only Redis and
// model transports are test doubles. CSP forbids every external connection.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {handlerFixture}=require('./helpers/refund-handler-fixture.cjs');
const root=path.join(__dirname,'..');
module.exports=function start({port=4198,database='juanjuan-quota-refund-synthetic',extra='',controlsExtra=''}={}){
let api,mode='success',dropRefund=false,waiting=[],reloadArmed=false,reloadBaseline=null;
const good=()=>({ok:true,json:async()=>({choices:[{message:{content:'{"task":"明天下午三点复习课程","note":"带笔记本和讲义","base_score":8.4,"category":"学业事务"}'}}]})});
function reset(next){mode=next;dropRefund=false;api=handlerFixture();api.model=async()=>{
 if(mode==='network')throw TypeError('synthetic network');
 if(mode==='http')return {ok:false,status:502};
 if(mode==='json')return {ok:true,json:async()=>{throw SyntaxError('synthetic JSON')}};
 if(mode==='wait')return new Promise(r=>waiting.push(()=>r(good())));
 if(mode==='clarify')return {ok:true,json:async()=>({choices:[{message:{content:'{"type":"clarify","reply":"请补充合成对象"}'}}]})};
 return good();
};}reset('success');
const setup=String.raw`
const NativeDate=Date;const syntheticClock=new NativeDate('2026-11-15T10:00:00+08:00').getTime();
Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[syntheticClock]))}static now(){return syntheticClock}};
const syntheticSetDegraded=AIService.setDegraded.bind(AIService);
AIService.source=()=> 'hosted';AIService.getDeviceId=()=> 'a'.repeat(32);AIService.setDegraded=()=>{};
const nativeFetch=fetch;const control=async body=>(await nativeFetch('/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
const ledger=async()=>(await nativeFetch('/ledger')).json();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const requestOriginal=requestJSON;let fastTimeout=false;
requestJSON=(url,options,timeout)=>requestOriginal(url,options,fastTimeout&&url==='/api/ai'&&JSON.parse(options.body).mode!=='cancel'?70:timeout);
const output=document.querySelector('#quota-result');const results=[];
const business=async()=>({tasks:await DB.all('tasks'),todos:await DB.all('todos'),pet:await DB.get('kv','pet'),dayStats:await DB.get('kv','dayStats')});
function ok(name,value,fields){if(!value)throw Error(name+' '+JSON.stringify(fields));results.push({case:name,...fields});output.textContent=JSON.stringify({pass:results.length,results},null,2)}
async function prepare(mode){await AIService.flushQuotaRefunds();await control({reset:mode});AIService.cache={};UI.resetCreate('schedule');UI.switchPage('create');const input=document.querySelector('#c-title');input.value='明天下午三点复习课程\n带笔记本和讲义';input.dispatchEvent(new Event('input',{bubbles:true}));UI.cState.images=[{id:'synthetic-image',name:'合成附件',data:'data:image/png;base64,AA=='}];return DB.snapshot(['tasks','todos','kv']);}
async function unchanged(name,before){ok(name,JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv']))&&UI.cState.images.length===1)}
document.querySelector('#quota-run').onclick=async()=>{results.length=0;try{
 await DB.open();await DB.batch([...DATA_STORES.map(store=>({store,type:'clear'})),{store:'kv',type:'clear'}]);DATA_STORES.forEach(store=>S[store]=[]);S.pet=defaultPet();S.dayStats={};await DB.put('kv',S.pet,'pet');
 S.tasks=[{id:'unrelated',title:'合成无关记录',execDate:'2026-11-14',timeType:'allday',baseScore:3,status:null,finalScore:0,createdAt:syntheticClock,note:'保留',images:[],links:[],category:'日常生活'}];await DB.put('tasks',S.tasks[0]);const pet=JSON.stringify(S.pet);
 for(const failure of ['http','json','network','wait']){
  const before=await prepare(failure);fastTimeout=failure==='wait';await UI.onAIClick();fastTimeout=false;await AIService.flushQuotaRefunds();await unchanged(failure+' preserves draft and database',before);
  let state=await ledger();ok(failure+' releases quota without automatic model retry',state.global===0&&state.models===1&&AIService.refundEntries().length===0,state);
  if(failure==='wait'){await control({release:true});await sleep(30);state=await ledger();ok('late timeout result cannot charge or save',state.global===0&&JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])));}
  await control({mode:'success'});await UI.onAIClick();state=await ledger();ok(failure+' manual retry charges a new single attempt',state.global===1&&state.models===2,state);await UI.onSave();
  const after=await DB.snapshot(['tasks','todos','kv']),saved=after.tasks.filter(x=>!before.tasks.some(y=>y.id===x.id));const row=saved[0];ok(failure+' saves exact confirmed combination once',saved.length===1&&row.title==='明天下午三点复习课程'&&row.note==='带笔记本和讲义'&&row.execDate==='2026-11-16'&&row.startTime==='15:00'&&row.endTime==='16:00'&&row.baseScore===8.4&&row.category==='学业事务'&&row.status===null&&row.images.length===1&&row.finalScore===0,{row});
  ok(failure+' retains unrelated records and no reward',before.tasks.every(x=>JSON.stringify(x)===JSON.stringify(after.tasks.find(y=>y.id===x.id)))&&JSON.stringify(S.pet)===pet&&JSON.stringify(S.dayStats)==='{}');
 }
 for(const action of ['cancel','leave','replace','pagehide']){
  const before=await prepare('wait');const pending=UI.onAIClick();for(let i=0;i<100&&(await ledger()).models===0;i++)await sleep(10);
  if(action==='cancel')await UI.onAIClick();else if(action==='leave')UI.switchPage('home');else if(action==='replace')UI.resetCreate('todo');else window.dispatchEvent(new Event('pagehide'));
  await pending;await AIService.flushQuotaRefunds();await control({release:true});await sleep(30);const state=await ledger();const same=JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv']));ok(action+' late response releases exactly once',state.global===0&&state.models===1&&same,{...state,same,receipts:AIService.refundEntries()});
 }

 for(const phase of ['cancel','failure']){
  const before=await prepare('success'),load=UI.loadScoring;
  if(phase==='cancel'){
   const waiting=[];UI.loadScoring=()=>new Promise(resolve=>waiting.push(resolve));const pending=UI.onAIClick();
   for(let i=0;waiting.length<2&&i<100;i++)await sleep(1);if(!waiting.length)throw Error('preparation did not start');UI.loadScoring=load;await UI.onAIClick();const scoring=await load.call(UI);waiting.forEach(resolve=>resolve(scoring));await pending;
  }else{UI.loadScoring=async()=>{throw TypeError('synthetic module offline')};await UI.onAIClick();UI.loadScoring=load;}
  await AIService.flushQuotaRefunds();await unchanged('local preparation '+phase+' preserves draft and database',before);const state=await ledger();ok('local preparation '+phase+' dispatches and charges zero',state.models===0&&state.global===0&&AIService.refundEntries().length===0,state);
 }

 {
  const before=await prepare('wait');const oldPending=UI.onAIClick();for(let i=0;i<100&&(await ledger()).models<1;i++)await sleep(10);
  UI.cancelRecognition();const nextPending=UI.onAIClick();for(let i=0;i<100&&(await ledger()).models<2;i++)await sleep(10);await oldPending;
  const state=await ledger();ok('old cancelled request keeps the next request controls locked',state.models===2&&state.global===1&&document.querySelector('#btn-save').disabled&&document.querySelector('#btn-ai').textContent==='取消识别',state);
  UI.cancelRecognition();await nextPending;await AIService.flushQuotaRefunds();await control({release:true});await sleep(30);const after=await ledger();ok('both cancellations return quota once with no business writes',after.models===2&&after.global===0&&JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])),after);
 }
 await prepare('clarify');const before=await DB.snapshot(['tasks','todos','kv']);const reply=await AIService.agent('合成普通追问',{},'chat');ok('normal clarification counts once without business writes',reply.type==='clarify'&&(await ledger()).global===1&&JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])));
 await prepare('success');AIService.storeRefund({id:'f'.repeat(32),device:'a'.repeat(32),pendingUntil:syntheticClock+20000});await AIService.flushQuotaRefunds();ok('another page active receipt remains untouched',AIService.refundEntries().length===1&&(await ledger()).global===0);clearTimeout(AIService.refundTimer);AIService.readyRefund('f'.repeat(32));await AIService.flushQuotaRefunds();ok('interrupted page receipt releases after its deadline',AIService.refundEntries().length===0);
 const offlineBefore=await prepare('wait');await control({dropRefund:true});const cancelled=UI.onAIClick();for(let i=0;i<100&&(await ledger()).models===0;i++)await sleep(10);await UI.onAIClick();await cancelled;await AIService.flushQuotaRefunds();await control({release:true});await sleep(30);
 ok('lost cancel notification stays durable and visibly pending',AIService.refundEntries().length===1&&document.querySelector('#quota-refund-status').textContent.includes('待确认')&&(await ledger()).global===1&&JSON.stringify(offlineBefore)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])));
 await control({dropRefund:false});window.dispatchEvent(new Event('online'));await AIService.flushQuotaRefunds();ok('online notification confirms one refund',AIService.refundEntries().length===0&&(await ledger()).global===0&&!document.querySelector('#quota-refund-status').textContent);
 ok('final attachments unrelated records stats and pet remain',JSON.stringify(S.tasks.find(t=>t.id==='unrelated'))===JSON.stringify((await DB.all('tasks')).find(t=>t.id==='unrelated'))&&JSON.stringify(S.pet)===pet&&JSON.stringify(S.dayStats)==='{}');
 output.textContent=JSON.stringify({pass:results.length,clock:'2026-11-15T10:00:00+08:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,results},null,2);
 await nativeFetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:output.textContent});
 }catch(e){output.textContent=JSON.stringify({error:e.stack,results},null,2);await nativeFetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:output.textContent})}};
document.querySelector('#quota-reload-prepare').onclick=async()=>{try{
 await prepare('wait');const before=await business();await control({dropRefund:true});const pending=UI.onAIClick();for(let i=0;i<100&&(await ledger()).models===0;i++)await sleep(10);await UI.onAIClick();await pending;await AIService.flushQuotaRefunds();await control({release:true});await sleep(30);
 if(AIService.refundEntries().length!==1||(await ledger()).global!==1)throw Error('reload preparation failed');
 await control({armReload:true,baseline:before});output.textContent=JSON.stringify({phase:'ready for actual reload',pending:AIService.refundEntries().length,ledger:await ledger()});
 }catch(e){output.textContent=e.stack}};
document.querySelector('#quota-reload-check').onclick=async()=>{try{
 await AIService.flushQuotaRefunds();const before=await (await nativeFetch('/baseline')).json();const current=await business(),state=await ledger();
 const pass=AIService.refundEntries().length===0&&state.global===0&&JSON.stringify(current)===JSON.stringify(before);
 const result={reloadPass:pass,ledger:state,pending:AIService.refundEntries().length,businessUnchanged:JSON.stringify(current)===JSON.stringify(before)};output.textContent=JSON.stringify(result,null,2);await nativeFetch('/reload-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
 }catch(e){output.textContent=e.stack}};
`;
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port);let body={};if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;body=JSON.parse(raw||'{}');}
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/control'){if(body.reset)reset(body.reset);if(body.mode)mode=body.mode;if('dropRefund'in body)dropRefund=body.dropRefund;if(body.armReload){reloadArmed=true;reloadBaseline=body.baseline}if(body.release){const jobs=waiting;waiting=[];jobs.forEach(r=>r())}res.setHeader('Content-Type','application/json');return res.end('{}')}
 if(url.pathname==='/baseline')return res.end(JSON.stringify(reloadBaseline));
 if(url.pathname==='/reload-report'){fs.writeFileSync(path.join(root,'.reports/quota-refund-reload.json'),JSON.stringify(body,null,2));return res.end('{}')}
 if(url.pathname==='/ledger'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({global:api.values.get('quota:2026-11-15:global')||0,models:api.models.length,calls:api.values.get('metric:2026-11-15:calls')||0,cancelled:api.values.get('metric:2026-11-15:cancelled')||0}))}
 if(url.pathname==='/api/ai'){if(body.mode==='cancel'&&dropRefund){res.writeHead(503);return res.end('{}')}const r=await api.send(body);res.writeHead(r.code,{'Content-Type':'application/json'});return res.end(JSON.stringify(r.payload))}
 if(url.pathname==='/report'){fs.mkdirSync(path.join(root,'.reports'),{recursive:true});fs.writeFileSync(path.join(root,'.reports/quota-refund-browser.json'),JSON.stringify(body,null,2));return res.end('{}')}
 if(url.pathname==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')))}
 if(url.pathname!=='/'){res.writeHead(404);return res.end()}
 if(reloadArmed){dropRefund=false;reloadArmed=false;}
 const controls='<aside style="position:fixed;z-index:99999;right:0;top:0;background:white;color:black">'+controlsExtra+'<button id="quota-run">运行退次合成验收</button><button id="quota-reload-prepare">准备刷新补退</button><button id="quota-reload-check">核对刷新补退</button><pre id="quota-result" style="max-height:500px;max-width:600px;overflow:auto"></pre></aside>';
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet'","indexedDB.open('"+database+"'").replace('<body>','<body>'+controls).replace('App.init();',setup+extra+'\nApp.init();');
 res.setHeader('Content-Security-Policy',"connect-src 'self'; img-src data: blob:; font-src 'none'");res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
 }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}))}}).listen(port,'127.0.0.1',()=>console.log('Synthetic refundable handler http://127.0.0.1:'+port+'/'));

};
if(require.main===module)module.exports();
