'use strict';
require('./completion-stats-browser.cjs')({port:4197,database:'juanjuan-review80-84-synthetic',extra:String.raw`
for(const store of ['tasks','todos']){
 const id=store==='tasks'?'future':'review-todo';if(store==='todos')await commitDataChanges([{store,value:{id,title:'合成待办',baseScore:3,done:false,finalScore:0,createdAt:Date.now()}}]);
 const originalGet=DB.get.bind(DB);let resume,held=false;DB.get=async(s,k)=>{const value=await originalGet(s,k);if(s==='kv'&&k==='dayStats'&&!held){held=true;await new Promise(r=>resume=r)}return value};
 let pending;if(store==='tasks')pending=UI.confirmStatus(S.tasks.find(t=>t.id===id),'done',Date.now());else{const confirm=UI.confirm;UI.confirm=(t,b,callback)=>pending=callback();UI.completeTodo(id);UI.confirm=confirm;}
 while(!resume)await new Promise(r=>setTimeout(r,5));await commitDataChanges([{store,value:{...S[store].find(t=>t.id===id),title:'新编辑必须保留',note:'并发备注',baseScore:8}}]);const before=await DB.snapshot(['tasks','todos','kv']);resume();await pending;DB.get=originalGet;ok('同页并发编辑保护 '+store,JSON.stringify(before)===JSON.stringify(await DB.snapshot(['tasks','todos','kv']))&&S[store].find(t=>t.id===id).title==='新编辑必须保留');
}
const originalSave=saveChat;let resumeChat;await saveChat({id:'review-old-chat',title:'旧会话',createdAt:Date.now(),updatedAt:Date.now()});await saveChat({id:'review-new-chat',title:'新会话',createdAt:Date.now(),updatedAt:Date.now()});await saveMessage({id:'review-user',chatId:'review-old-chat',role:'user',content:'合成记录',type:'text',createdAt:Date.now()});UI.agentChatId='review-old-chat';saveChat=async c=>{await new Promise(r=>resumeChat=r);return originalSave(c)};const creating=UI.createAgentChat(false);while(!resumeChat)await new Promise(r=>setTimeout(r,5));UI.openAgentChat('review-new-chat');resumeChat();await creating;saveChat=originalSave;ok('新建会话迟到不抢回选择',UI.agentChatId==='review-new-chat');
`});
