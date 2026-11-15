document.querySelector('#context-run').onclick=async()=>{
 const out=document.querySelector('#context-result');out.textContent='';let count=0;
 const check=(name,ok)=>{if(!ok)throw Error(name);count++;out.textContent+='通过：'+name+'\n';};
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 try{
 const NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']))}static now(){return new NativeDate('2026-11-15T10:00:00+08:00').getTime()}};
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=()=>open('juanjuan-issue31-synthetic',3);await DB.open();
 S.pet=defaultPet();S.dayStats={};S.customTags=[];S.memoryGroups=[];S.todos=[{id:'todo',title:'无关待办',baseScore:3}];S.memories=[];S.operations=[];S.messages=[];S.chats=[{id:'chat',title:'合成聊天'}];UI.agentChatId='chat';
 S.tasks=Array.from({length:140},(_,i)=>({id:'old'+i,title:'历史背景'+i,execDate:addDays('2025-01-01',i),timeType:'allday',baseScore:3,note:''}));
 for(const [id,date]of [['past','2026-10-01'],['today','2026-11-15'],['future','2026-11-22']])S.tasks.push({id,title:'IDAT9001',seriesId:'course',execDate:date,timeType:'exact',startTime:'10:00',endTime:'11:00',baseScore:7,note:'教授：老师甲',images:[{id:'pic',name:'合成',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}],links:['https://example.com']});
 await DB.batch([...DATA_STORES,'kv'].map(store=>({store,type:'clear'})).concat(DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),DATA_KV.map(key=>({store:'kv',key,value:S[key]}))));
 const snapshot=()=>DB.snapshot([...DATA_STORES,'kv']);const initial=await snapshot();
 UI.agentSelectedRole='task';UI.renderAgent();AIService.agent=async(message,context)=>AIService._localAgent(message,context,'task');
 const send=async text=>{UI.agentSelectedRole='task';document.querySelector('#agent-input').value=text;await UI.sendAgentMessage();return S.messages.at(-1)};
 for(const [id,date]of [['past','2026-10-01'],['today','2026-11-15'],['future','2026-11-22']]){
 const wire=UI.agentContext('chat',date+' IDAT9001日程','task');check(id+'上下文有目标且有边界',wire.tasks.some(x=>x.id===id)&&wire.tasks.length<=100&&wire.selection.partial);
 AIService.agent=async()=>({type:'query',reply:'已查完整库999条',query:{entity:'schedule',date_from:'2025-01-01',date_to:'2025-01-01',keyword:'wrong',status:'all'}});
 const query=await send(date+' IDAT9001日程');check(id+'程序查询核对实际目标数量',query.meta.total===1&&query.meta.results[0].id===id&&!query.content.includes('999'));
 AIService.agent=async(message,context)=>AIService._localAgent(message,context,'task');
 let card=await send('只把'+date+'的IDAT9001备注改成带电脑');const beforeCancel=await snapshot();await UI.cancelAgentAction(card.id);const cancelled=await snapshot();check(id+'取消零业务写入',same(beforeCancel.tasks,cancelled.tasks)&&same(beforeCancel.kv,cancelled.kv));
 card=await send('只把'+date+'的IDAT9001备注改成带电脑');const before=await snapshot();
 const original=DB.batch;DB.batch=async()=>{throw Error('synthetic failure')};await UI.confirmAgentAction(card.id);DB.batch=original;check(id+'保存失败零写入',same(before,await snapshot()));
 await UI.confirmAgentAction(card.id);const after=await snapshot();
 check(id+'确认只改目标完整字段',before.tasks.every(old=>{const actual=after.tasks.find(x=>x.id===old.id);return same(actual,old.id===id?{...old,note:'带电脑',isBackfill:dayDiff(old.execDate,todayStr())<0}:old)}));
 check(id+'附件无关记录积分宠物不变',same(before.todos,after.todos)&&same(before.kv,after.kv)&&after.tasks.length===143);
 const once=await snapshot();await UI.confirmAgentAction(card.id);check(id+'重复确认不新增操作',same(once,await snapshot()));
 DB._db.close();await DB.open();check(id+'重开持久化完整',same(once,await snapshot()));
 }
 check('最终仅三条目标备注变化',S.tasks.filter(x=>x.note==='带电脑').length===3&&same(initial.kv,(await snapshot()).kv));
 out.textContent+='全部 '+count+' 项通过。北京时间2026年11月15日10:00，明确本地模型替身，仅合成库。';
 }catch(error){out.textContent+='失败：'+error.stack;}
};
