document.querySelector('#review-run').onclick=async()=>{
 const out=document.querySelector('#review-result');out.textContent='';let count=0;
 const check=(name,ok)=>{if(!ok)throw Error(name);count++;out.textContent+='通过：'+name+'\n';};
 try{
 const NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']))}static now(){return new NativeDate('2026-11-15T10:00:00+08:00').getTime()}};
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=()=>open('juanjuan-review-27-30-synthetic',3);await DB.open();
 const snapshot=()=>DB.snapshot([...DATA_STORES,'kv']);const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const reopen=async()=>{const before=await snapshot();DB._db.close();await DB.open();if(!same(before,await snapshot()))throw Error('重开数据库不一致');};
 const reset=async()=>{
// SYNTHETIC_SETUP
 S.tasks[0].images[0].data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 await DB.batch([...DATA_STORES,'kv'].map(store=>({store,type:'clear'})).concat(DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),DATA_KV.map(key=>({store:'kv',key,value:S[key]}))));
 };
 for(const stage of ['详情打开后','确认弹出后'])for(const mode of ['修改附件备注','删除原件']){
 await reset();UI.openTaskDetail('a');await document.querySelector('#task-detail-body img').decode();
 if(stage==='确认弹出后')document.querySelector('#td-to-todo').onclick();
 await commitDataChanges(mode==='修改附件备注'?[{store:'tasks',value:{...S.tasks[0],note:'新备注',images:[],links:['https://example.com/new']}}]:[{store:'tasks',type:'delete',key:'a'}]);
 if(stage==='详情打开后')document.querySelector('#td-to-todo').onclick();
 const before=await snapshot();await document.querySelector('#confirm-ok').onclick();check(stage+mode+'保留新数据',same(before,await snapshot())&&notices.some(x=>x.includes('资料已变化')));await reopen();
 }
 await reset();UI.openTaskDetail('a');document.querySelector('#td-to-todo').onclick();const cancelled=await snapshot();await document.querySelector('#mask-confirm [data-close]').onclick();check('真实取消控件零写入',same(cancelled,await snapshot()));
 UI.openTaskDetail('a');document.querySelector('#td-to-todo').onclick();const before=await snapshot();await document.querySelector('#confirm-ok').onclick();const converted=S.todos.find(x=>x.sourceTaskId==='a');
 check('真实确认保留完整附件备注与零奖励',converted.note===before.tasks[0].note&&same(converted.images,before.tasks[0].images)&&same(converted.links,before.tasks[0].links)&&converted.finalScore===0&&!converted.done&&S.tasks.length===2&&S.todos.length===2&&same((await snapshot()).kv,before.kv));
 const once=await snapshot();await document.querySelector('#confirm-ok').onclick();check('顺序重复确认不重复生成',same(once,await snapshot()));await reopen();
 for(const type of ['allday','slot'])for(const kind of ['update_schedule','update_schedule_batch'])for(const key of ['start_time','end_time']){
 await reset();for(const task of S.tasks.slice(0,2)){task.timeType=type;task.slot=CONFIG.SLOTS[0].key;task.startTime=null;task.endTime=null;}
 action=kind==='update_schedule'?{kind,target_id:'a',item:{[key]:'bad'}}:{...action,item:{[key]:'bad'}};UI.captureAgentScope(action);S.messages[0].meta.action=action;
 await DB.batch([...S.tasks.map(value=>({store:'tasks',value})),{store:'messages',value:S.messages[0]}]);const before=await snapshot();let rejected=false;try{await UI.executeAgentAction(action,S.messages[0]);}catch(error){rejected=true;}
 check(type+kind+key+'非法时间零写入',rejected&&same(before,await snapshot()));await reopen();
 }
 await reset();action={kind:'convert_schedule_to_todo',target_id:'a',item:{}};UI.captureAgentScope(action);S.messages[0].meta.action=action;await DB.put('messages',S.messages[0]);const original=copyData(S.tasks[0]);await UI.confirmAgentAction('m');await UI.undoAgentOperation('m');check('助手转换撤销恢复完整原件',same(original,S.tasks.find(x=>x.id==='a'))&&S.todos.length===1);await reopen();
 out.textContent+='全部 '+count+' 项通过。固定北京时间2026年11月15日10:00，仅合成数据库，未调用模型。';
 }catch(error){out.textContent+='失败：'+error.stack;}
};
