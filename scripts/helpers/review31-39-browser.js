document.querySelector('#review-run').onclick=async()=>{
 const out=document.querySelector('#review-result');out.textContent='';let count=0;
 const check=(name,ok)=>{if(!ok)throw Error(name);count++;out.textContent+='通过：'+name+'\n';};
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 try{
 const NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']))}static now(){return new NativeDate('2026-11-15T10:00:00+08:00').getTime()}};
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=()=>open('juanjuan-review31-39-synthetic',3);await DB.open();
 S.pet=defaultPet();S.dayStats={};S.customTags=[];S.memoryGroups=[];S.todos=[{id:'other',title:'无关待办',note:'重复\n重复',baseScore:3}];S.memories=[];S.operations=[];S.messages=[];S.chats=[{id:'chat',title:'合成聊天',createdAt:Date.now(),updatedAt:Date.now()}];UI.agentChatId='chat';
 S.tasks=Array.from({length:140},(_,i)=>({id:'old'+i,title:'今天',execDate:addDays('2025-01-01',i),timeType:'allday',baseScore:3}));
 for(const date of ['2026-11-15','2026-11-18','2026-11-22'])S.tasks.push({id:date,title:'真正的当日事项',execDate:date,timeType:'allday',baseScore:3});
 await DB.batch([...DATA_STORES,'kv'].map(store=>({store,type:'clear'})).concat(DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),DATA_KV.map(key=>({store:'kv',key,value:S[key]}))));
 PetView.startBehaviorLoop=PetView.moveCat=PetView.startWander=PetSystem.tickDecay=()=>{};App.bind();const snapshot=()=>DB.snapshot([...DATA_STORES,'kv']),business=()=>DB.snapshot(['tasks','todos','kv']);const initial=await business();
 AIService.agent=async()=>({type:'query',reply:'明确替身的错误数量',query:{entity:'schedule',date_from:'2025-01-01',date_to:'2025-01-02',status:'all',keyword:''}});
 const send=async text=>{UI.agentSelectedRole='task';document.querySelector('#agent-input').value=text;await UI.sendAgentMessage();return S.messages.at(-1)};
 const wire=UI.agentContext('chat','查询今天日程','task');check('今日目标优先于140条同名旧记录',wire.tasks.some(x=>x.id==='2026-11-15')&&wire.tasks.length<=100);
 let result=await send('查询今天日程');check('通用标题不缩窄今日查询',result.type==='query'&&result.meta.total===1&&result.meta.results[0].id==='2026-11-15');
 result=await send('查询2026年11月15日到2026年11月22日的日程');check('区间查询包含中间日期并核对实际数量',result.type==='query'&&result.meta.total===3&&same(result.meta.results.map(x=>x.id),['2026-11-15','2026-11-18','2026-11-22']));
 for(const question of ['查询今天或明天的日程','查询今天，不是明天的日程','查询2026年11月22日到2026年11月15日的日程']){result=await send(question);check('含糊或倒序区间继续追问'+question,result.type==='clarify')}
 check('查询和追问均零业务写入',same(initial,await business()));
 const values=['教室：A101，带电脑\n教授：老师甲','教室：A101；带电脑。\n教授：老师甲，带讲义！','教授：Dr. 老师甲\n教室：A101','教授：老师甲 去A101教室\n地点：教学楼'];
 for(const value of values){const parsed=AIService._localAgent('创建11到11月每周日10:00到11:00 IDAT9001\n'+value,{tasks:[],todos:[]},'task');check('解析保留原备注值'+value,parsed.action.rule.note===value)}
 const reversed=AIService._localAgent('创建11到11月每周日10:00到11:00 IDAT9001 A101教室 教授Dr. Example',{tasks:[],todos:[]},'task');check('后置教室仅在备注中出现',reversed.action.rule.title==='IDAT9001'&&reversed.action.rule.note==='教室：A101\n教授：Dr. Example');
 const note='带电脑\n教室：A101，带讲义！\n教授：Dr. 老师甲\n教授：Dr. 老师甲\nhttps://example.com';
 const action=AIService._localAgent('创建11到11月每周日10:00到11:00 IDAT9001\n'+note,{tasks:[],todos:[]},'task').action;UI.captureAgentScope(action);const message={id:uid(),chatId:'chat',role:'assistant',type:'proposal',content:'合成确认',createdAt:Date.now(),meta:{action,status:'pending'}};await saveMessage(message);await UI.confirmAgentAction(message.id);
 const created=S.tasks.filter(x=>x.title==='IDAT9001');check('确认五条课程完整保留原文和有意重复',created.length===5&&created.every(x=>x.note===note));
 UI.planView='week';UI.planCursor='2026-11-15';const beforeRender=await snapshot();for(let i=0;i<3;i++)UI.renderPlan();check('三轮周视图原文与存储一致',Array.from(document.querySelectorAll('.mini-note')).some(x=>x.textContent==='📝 '+note)&&same(beforeRender,await snapshot()));
 const originalURL=URL.createObjectURL;let blob;URL.createObjectURL=value=>{blob=value;return originalURL(value)};App.exportData();URL.createObjectURL=originalURL;const exported=JSON.parse(await blob.text());check('实际导出完整保留备注',same(exported.tasks,S.tasks));
 let onConfirm;const confirm=UI.confirm;UI.confirm=(title,body,callback)=>{onConfirm=callback;return confirm.call(UI,title,body,callback)};const beforeImport=await snapshot();App.importData({target:{files:[new File([await blob.text()],'synthetic.json',{type:'application/json'})],value:''}});for(let i=0;i<100&&!onConfirm;i++)await new Promise(r=>setTimeout(r,10));check('文件导入预览零写入',!!onConfirm&&same(beforeImport,await snapshot()));await document.querySelector('#confirm-ok').onclick();UI.confirm=confirm;check('文件导入保持完整字段和数量',same(beforeImport,await snapshot()));
 check('原有143条日程与无关待办积分宠物未改',initial.tasks.every(old=>same(old,S.tasks.find(x=>x.id===old.id)))&&same(initial.todos,(await business()).todos)&&same(initial.kv,(await business()).kv));
 const final=await snapshot();DB._db.close();await DB.open();check('数据库重开保持完整结果',same(final,await snapshot()));
 out.textContent+='全部 '+count+' 项通过。固定北京时间2026年11月15日10:00，独立合成库，模型为明确替身。';
 }catch(error){out.textContent+='失败：'+error.stack;}
};
