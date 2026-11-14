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
 out.textContent+='\n全部 7 项通过。仅使用合成数据库，未调用模型。';
 }catch(error){out.textContent+='\n失败：'+error.stack;}
};
