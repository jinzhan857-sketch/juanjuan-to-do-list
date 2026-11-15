const review38Results=[];
AIService.setDegraded=syntheticSetDegraded;
function check38(name,condition,details){if(!condition)throw Error(name+' '+JSON.stringify(details));review38Results.push({case:name,...details});output.textContent=JSON.stringify({pass:review38Results.length,results:review38Results},null,2);}
async function wait38(check){for(let i=0;i<100;i++){if(await check())return;await sleep(10);}throw Error('synthetic operation did not start');}
document.querySelector('#review38-run').onclick=async()=>{
 const originalFetch=fetch,originalToast=toast,notices=[];toast=message=>notices.push(message);review38Results.length=0;
 try{
  await DB.open();await DB.batch([...DATA_STORES.map(store=>({store,type:'clear'})),{store:'kv',type:'clear'}]);DATA_STORES.forEach(store=>S[store]=[]);S.pet=defaultPet();S.dayStats={};await DB.put('kv',S.pet,'pet');
  let before=await prepare('wait');const score=UI.onAIClick();await wait38(async()=>(await ledger()).models===1);window.dispatchEvent(new Event('pagehide'));await score;await AIService.flushQuotaRefunds();await control({release:true});
  check38('publisher pagehide is quiet, refunds once and preserves draft database',UI.recognition===null&&!AIService.degraded&&notices.length===0&&(await ledger()).global===0&&AIService.refundEntries().length===0&&JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])));
  await prepare('success');let unblock,entered=false;
  fetch=async(u,o)=>{const response=await originalFetch(u,o);if(u==='/api/ai'&&JSON.parse(o.body).mode==='cancel'){entered=true;await new Promise(r=>unblock=r);}return response;};
  AIService.storeRefund({id:'d'.repeat(32),device:'a'.repeat(32),pendingUntil:0});
  let error;const waiting=AIService.hostedRequest({title:'不应离页后发送'}).catch(e=>error=e);await wait38(()=>entered);window.dispatchEvent(new Event('pagehide'));unblock();await waiting;fetch=originalFetch;
  check38('pagehide before dispatch never starts a model after refund acknowledgement',error?.name==='AbortError'&&(await ledger()).models===0&&AIService.refundEntries().length===0);
  for(const role of ['task','planning','chat']){
   before=await prepare('wait');const pending=AIService.agent('讲个故事',{},role);await wait38(async()=>(await ledger()).models===1);window.dispatchEvent(new Event('pagehide'));const result=await pending;await AIService.flushQuotaRefunds();await control({release:true});
   check38(role+' pagehide returns cancelled instead of a fallback',result.type==='cancelled'&&(await ledger()).global===0&&JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])));
  }
  before=await prepare('success');let releaseCustom,customStarted=false;AIService.source=()=> 'custom';AIService.customConfig=()=>({endpoint:'https://model.invalid',model:'synthetic',key:'synthetic'});
  fetch=async(u,o)=>{if(u==='https://model.invalid'){customStarted=true;return new Promise(r=>releaseCustom=()=>r({ok:true,json:async()=>({choices:[{message:{content:'{"base_score":8.4}'}}]})}));}return originalFetch(u,o);};
  const custom=UI.onAIClick();await wait38(()=>customStarted);window.dispatchEvent(new Event('pagehide'));await custom;releaseCustom();fetch=originalFetch;AIService.source=()=> 'hosted';
  check38('custom publisher also stops quietly on pagehide without public quota or writes',UI.recognition===null&&!AIService.degraded&&notices.length===0&&(await ledger()).models===0&&JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv'])));
  await prepare('success');const chat={id:'review38-chat',title:'合成聊天',createdAt:Date.now(),updatedAt:Date.now()};await saveChat(chat);UI.agentChatId=chat.id;UI.agentSelectedRole='chat';UI.switchPage('agent');document.querySelector('#agent-input').value='讲个故事';
  const saveOriginal=saveMessage;let resume;
  saveMessage=async m=>{await saveOriginal(m);if(m.role==='user')await new Promise(r=>resume=r);};
  const sending=UI.sendAgentMessage();await wait38(()=>!!resume);window.dispatchEvent(new Event('pagehide'));resume();await sending;saveMessage=saveOriginal;
  check38('pagehide during persistence never sends or creates an assistant card',(await ledger()).models===0&&UI.agentSending===null&&!UI.agentThinking&&(await DB.all('messages')).every(m=>m.role==='user')&&(await DB.all('operations')).length===0);
  const pet=JSON.stringify(S.pet);await prepare('success');await UI.onAIClick();await UI.onSave();const rows=await DB.all('tasks');
  check38('explicit retry after pagehide still saves one correct uncompleted record',rows.length===1&&rows[0].execDate==='2026-11-16'&&rows[0].startTime==='15:00'&&rows[0].endTime==='16:00'&&rows[0].baseScore===8.4&&rows[0].images.length===1&&rows[0].status===null&&rows[0].finalScore===0&&JSON.stringify(S.pet)===pet&&(await ledger()).global===1,{row:rows[0]});
  output.textContent=JSON.stringify({pass:review38Results.length,clock:'2026-11-15T10:00:00+08:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,results:review38Results},null,2);
  await nativeFetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:output.textContent});
 }catch(e){output.textContent=JSON.stringify({error:e.stack,results:review38Results},null,2);await nativeFetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:output.textContent});}
 finally{fetch=originalFetch;toast=originalToast;AIService.source=()=> 'hosted';}
};
document.querySelector('#review38-reload').onclick=async()=>{
 try{
  await prepare('wait');const before=await business();const pending=UI.onAIClick();pending.catch(()=>{});await wait38(async()=>(await ledger()).models===1);
  await control({armReload:true,baseline:before});output.textContent=JSON.stringify({phase:'ready for actual reload with active model',ledger:await ledger(),pending:AIService.refundEntries().length});
 }catch(e){output.textContent=e.stack;}
};
