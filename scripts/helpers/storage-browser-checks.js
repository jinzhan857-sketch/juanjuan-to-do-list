document.querySelector('button').onclick=async()=>{
 const out=document.querySelector('pre');const report=[];const check=(name,ok)=>{if(!ok)throw Error(name);report.push('通过：'+name);out.textContent=report.join('\n');};
 try{
 const realOpen=indexedDB.open.bind(indexedDB);indexedDB.open=()=>realOpen('juanjuan-issue6-synthetic',3);
 await DB.open();
 await DB.batch(['tasks','todos','chats','messages','memories','operations','kv'].map(store=>({store,type:'clear'})));
// SYNTHETIC_SETUP
 await DB.batch([...DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))]);
 const snapshot=()=>DB.snapshot([...DATA_STORES,'kv']);const before=JSON.stringify(await snapshot());const memory=JSON.stringify(S);
 const original=DB._db.transaction.bind(DB._db);let injected=false;
 DB._db.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){const get=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=get(name);if(name==='operations'){const put=store.put.bind(store);store.put=value=>{const request=put(value);request.addEventListener('success',()=>{injected=true;tx.abort();});return request;};}return store;};}return tx;};
 let failed=false;try{await UI.executeAgentAction(action,S.messages[0]);}catch(error){failed=true;}
 check('原生事务在操作记录请求成功后中止',failed&&injected);
 check('数据库整体回滚',JSON.stringify(await snapshot())===before);check('内存和附件积分保持原样',JSON.stringify(S)===memory);
 DB._db.transaction=original;
 await UI.confirmAgentAction('m');check('正常批量修改和操作记录同时保存',S.operations.length===1&&S.tasks[0].note==='new'&&S.messages[0].type==='action_result');
 await UI.undoAgentOperation('m');check('撤销恢复原任务',S.tasks[0].note==='old'&&S.operations[0].status==='undone');
 const expected=await snapshot();let rejected=false;try{await replaceBackup({app:'卷卷AI Todo',version:'2.2',tasks:[{id:'duplicate'},{id:'duplicate'}]});}catch(error){rejected=true;}
 check('非法备份在清空前拒绝',rejected&&JSON.stringify(await snapshot())===JSON.stringify(expected));
 DB._db.close();await DB.open();check('重开数据库后结果仍一致',JSON.stringify(await snapshot())===JSON.stringify(expected));
 const backup={app:'卷卷AI Todo',version:'2.2',...Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,copyData(S[key])])),appearance:{followSystem:true,lightTheme:'warm',darkTheme:'soft',fixedTheme:'warm'}};
 const request='11月9日不要改，只改11月16日同名课程备注改成带电脑';
 const proposal=AIService._localAgent(request,UI.agentContext('chat',request,'task'),'task');
 check('多日期请求追问，模型猜测目标也被拒绝且原库不变',proposal.type==='clarify'&&!UI.validateAgentRequest({kind:'delete_schedule',target_id:'a',item:{}},request).ok&&JSON.stringify(await snapshot())===JSON.stringify(expected));
 const invalid=copyData(backup);invalid.tasks[0].status='invalid-status';rejected=false;
 try{await replaceBackup(invalid);}catch(error){rejected=true;}
 check('非法状态整份拒绝，数据库和内存均保留',rejected&&JSON.stringify(await snapshot())===JSON.stringify(expected)&&S.tasks[0].status!=='invalid-status');
 for(const status of [null,'done','doing','failed','paused','skipped']){const valid=copyData(backup);Object.assign(valid.tasks[0],{status,finalScore:0,statusEditCount:0});validateBackup(valid);}
 check('全部现有合法状态均通过共用校验',true);
 action=copyData(action);UI.captureAgentScope(action);S.operations=[];S.messages=[{id:'m2',chatId:'chat',role:'assistant',content:'待确认',meta:{status:'pending',action}}];
 await DB.batch([{store:'operations',type:'clear'},{store:'messages',type:'clear'},{store:'messages',value:S.messages[0]}]);
 await UI.confirmAgentAction('m2');S.operations[0].before[0].status='invalid-status';await DB.put('operations',S.operations[0]);
 const damaged=JSON.stringify(await snapshot());await UI.undoAgentOperation('m2');
 check('损坏状态的撤销快照拒绝执行，已保存数据不被覆盖',JSON.stringify(await snapshot())===damaged&&S.operations[0].status==='done');
 out.textContent+='\n全部 11 项通过。仅使用合成数据库，未调用模型。';
 }catch(error){out.textContent+='\n失败：'+error.stack;}
};
