/* Browser measurement of actual navigation and native IndexedDB, test page only. */
document.querySelector('#nav-run').onclick=async()=>{
 const output=document.querySelector('#nav-result');
 const button=document.querySelector('#nav-run');button.disabled=true;output.textContent='正在采样';
 try{
 if(!window.navigationReady)throw Error('Application still starting');
 const probe=document.createElement('style');probe.textContent=document.querySelector('#nav-probe').value;document.head.append(probe);
 const snapshot=()=>DB.snapshot(['tasks','todos','chats','messages','memories','operations','kv']);
 const original=await snapshot();
 const evidence={time:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],probe:probe.textContent,runs:[]};
 const frame=()=>new Promise(requestAnimationFrame);
 const measure=()=>{
  const p=document.querySelector('.page.active'),r=p.getBoundingClientRect(),n=document.querySelector('#nav').getBoundingClientRect();
  return {t:performance.now(),visible:document.visibilityState,page:p.id,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,left:r.left,pageWidth:r.width,top:r.top,navLeft:n.left,navWidth:n.width,scrollY,transform:getComputedStyle(p).transform};
 };
 const attachment={id:'nav-image',name:'合成图片',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
 for(const length of [0,35]){
  S.tasks=Array.from({length},(_,i)=>({id:'nav-task-'+i,title:'合成日程 '+i,execDate:todayStr(),timeType:'allday',category:'日常生活',baseScore:3,createdAt:Date.now(),note:'合成备注',status:null,images:[attachment],links:['https://example.com/']}));
  S.todos=Array.from({length},(_,i)=>({id:'nav-todo-'+i,title:'合成待办 '+i,kind:'recent',category:'日常生活',baseScore:3,createdAt:Date.now(),done:false,images:[attachment],links:['https://example.com/']}));
  S.messages=Array.from({length},(_,i)=>({id:'nav-message-'+i,chatId:UI.agentChatId,role:i%2?'assistant':'user',content:'合成聊天内容，用于验证长对话可以正常滚动。'.repeat(8),createdAt:Date.now()+i}));
  // Persist only our dedicated synthetic records to check navigation leaves them unchanged.
  for(const store of ['tasks','todos','messages']){await DB.request(store,'readwrite',object=>object.clear());for(const value of S[store])await DB.put(store,value);}
  const before=JSON.stringify(await snapshot());
  for(const from of ['home','plan','todo','agent'])for(const target of ['home','plan','todo','agent'].filter(x=>x!==from)){
   UI.switchPage(from);for(let i=0;i<20;i++)await frame();
   const beforeSwitch=measure(),started=performance.now();UI.switchPage(target);const switchMs=performance.now()-started;const samples=[beforeSwitch,measure()];const end=performance.now()+380;
   while(performance.now()<end||samples.length<16){await frame();samples.push(measure());}
   const scroller=target==='agent'?document.querySelector('#agent-messages'):document.scrollingElement;
   scroller.scrollTop=0;const bottom=scroller.scrollHeight-scroller.clientHeight;scroller.scrollTop=bottom;await frame();const scrollActual=scroller.scrollTop;scroller.scrollTop=0;
   evidence.runs.push({length,from,target,samples,scrollActual,switchMs});
  }
  // Rapid changes every frame, including interruption of the entering animation.
  const samples=[];
  for(let i=0;i<32;i++){UI.switchPage(['home','plan','todo','agent'][i%4]);await frame();samples.push(measure());}
  evidence.runs.push({length,target:'rapid',samples});
  evidence.runs.push({length,target:'database',unchanged:before===JSON.stringify(await snapshot())});
 }
 UI.switchPage('home');probe.remove();
 evidence.summary=evidence.runs.filter(x=>x.samples).map(x=>({length:x.length,from:x.from,target:x.target,frames:x.samples.length,visible:x.samples.every(s=>s.visible==='visible'),widths:[...new Set(x.samples.map(s=>s.width))],lefts:[Math.min(...x.samples.map(s=>s.left)),Math.max(...x.samples.map(s=>s.left))],heights:[Math.min(...x.samples.map(s=>s.scrollHeight)),Math.max(...x.samples.map(s=>s.scrollHeight))],maxFrameGap:Math.max(...x.samples.slice(1).map((s,i)=>s.t-x.samples[i].t)),scrollActual:x.scrollActual}));
 evidence.originalCounts=Object.fromEntries(Object.entries(original).map(([k,v])=>[k,v.length]));
 await fetch('/evidence',{method:'POST',body:JSON.stringify(evidence)});
 const layoutChanges=evidence.runs.filter(x=>x.samples&&(['left','pageWidth','navLeft','navWidth'].some(key=>Math.max(...x.samples.map(s=>s[key]))-Math.min(...x.samples.map(s=>s[key]))>.1)));
 output.textContent='layoutChanges: '+layoutChanges.length+'\ndatabaseUnchanged: '+evidence.runs.filter(x=>x.target==='database').every(x=>x.unchanged)+'\ncases: '+evidence.summary.length+'，viewport: '+evidence.viewport.join(' × ');
 }catch(e){output.textContent=e.stack;}finally{button.disabled=false;}
};
