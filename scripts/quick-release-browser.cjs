'use strict';
// Native IndexedDB harness on a dedicated origin. Only synthetic records.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const checks=`document.querySelector('#quick-run').onclick=async()=>{const out=document.querySelector('#quick-results');try{
 await DB.open();S.tasks=[];S.todos=[];S.messages=[];S.operations=[];S.chats=[];S.memories=[];S.pet=defaultPet();S.dayStats={};UI.renderCreate=UI.switchPage=UI.renderTodos=UI.renderAgent=()=>{};toast=()=>{};UI.loadScoring=()=>import('/quick-score.mjs');
 await DB.batch(DATA_KV.map(key=>({store:'kv',key,value:S[key]})));
 const results=[],check=(ok,name)=>{if(!ok)throw Error(name);results.push(name)};
 for(const period of ['week','month','quarter','year']){UI.resetCreate('todo');document.querySelector('#c-title').value='合成简历';UI.cState.period=period;await UI.onSave();const old=S.todos.at(-1);UI.openTodoEditor(old.id);UI.cState.resultTitle='补充项目经历';UI.cState.resultNote='保留英文版';await UI.onSave();check(S.todos.find(t=>t.id===old.id).period===period,'编辑周期保持 '+period);}
 UI.resetCreate('schedule');document.querySelector('#c-title').value='11月30日23:30开始值班，次日00:30结束。';await UI.onSave();check(S.tasks.length===1&&S.tasks[0].endDayOffset===1&&S.tasks[0].endTime==='00:30','跨夜保存一条');
 S.chats=[{id:'synthetic-chat',title:'合成聊天'}];UI.agentChatId='synthetic-chat';await DB.put('chats',S.chats[0]);
 const answer={type:'workflow',intent:'propose',entries:[{action:{kind:'create_todo',item:{title:'合成旧卡',base_score:3}}}]};await UI.applyAssistantWorkflow(answer,'synthetic-chat','创建合成待办');const old=structuredClone(S.messages.at(-1));await UI.applyAssistantWorkflow(answer,'synthetic-chat','不，是新的内容');let blocked=false;try{await UI.executeAgentAction(old.meta.action,old)}catch{blocked=true}check(blocked,'更正后旧卡入口拒绝');
 const before=await DB.snapshot(DATA_STORES);DB._db.close();await DB.open();const after=await DB.snapshot(DATA_STORES);check(JSON.stringify(before)===JSON.stringify(after),'关闭重开持久化一致');
 check(UI.agentMessageHtml({...old,meta:{...old.meta,status:'undone'}}).includes('已撤销'),'撤销状态显示正确');
 out.textContent=JSON.stringify({status:'passed',database:'juanjuan-quick-release-synthetic',checks:results,counts:{tasks:after.tasks.length,todos:after.todos.length}},null,2);
 }catch(error){out.textContent='FAILED '+error.stack;}};`;
http.createServer((req,res)=>{
 const routes={'/quick-score.mjs':'src/rules/quick-score.mjs','/assistant-workflow.js':'src/assistant/workflow.js','/assistant-materials.js':'src/assistant/materials.js'};
 if(routes[req.url]){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,routes[req.url])));}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet'","indexedDB.open('juanjuan-quick-release-synthetic-"+Date.now()+"'").replace('App.init();','');
 html=html.replace('<body>','<body><div style="position:fixed;inset:0;z-index:999999;background:white;color:black;overflow:auto;padding:30px"><h1>卷卷必要修复合成检查</h1><button id="quick-run">运行隔离检查</button><pre id="quick-results">尚未执行</pre></div>').replace('</body>','<script>'+checks+'</script></body>');
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
}).listen(4261,'127.0.0.1',()=>console.log('Synthetic checks http://127.0.0.1:4261/'));
