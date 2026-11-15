'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const source=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,'');
let checks=fs.readFileSync(path.join(__dirname,'helpers/storage-browser-checks.js'),'utf8').replace('// SYNTHETIC_SETUP',require('./helpers/storage-fixture.cjs')).replaceAll('juanjuan-issue6-synthetic','juanjuan-issue27-synthetic');
checks=checks.replace(" out.textContent+='\\n全部 11 项通过。仅使用合成数据库，未调用模型。';",`
 const originalTask=copyData(S.tasks.find(t=>t.id==='a'));action={kind:'convert_schedule_to_todo',target_id:originalTask.id,item:{}};UI.captureAgentScope(action);
 S.messages=[{id:'convert',chatId:'chat',type:'proposal',meta:{status:'pending',action}}];await DB.batch([{store:'messages',type:'clear'},{store:'messages',value:S.messages[0]}]);
 const previous=await snapshot();await UI.confirmAgentAction('convert');const converted=S.todos.find(t=>t.sourceTaskId===originalTask.id);
 check('转换保留备注图片链接，来源与零奖励正确',JSON.stringify(converted.images)===JSON.stringify(originalTask.images)&&JSON.stringify(converted.links)===JSON.stringify(originalTask.links)&&converted.note===originalTask.note&&converted.finalScore===0&&!converted.done);
 check('转换后原件移出，其他资料和积分宠物保持',!S.tasks.some(t=>t.id===originalTask.id)&&JSON.stringify((await snapshot()).kv)===JSON.stringify(previous.kv));
 await UI.undoAgentOperation('convert');check('撤销恢复完整原件并移除待办',JSON.stringify(S.tasks.find(t=>t.id===originalTask.id))===JSON.stringify(originalTask)&&!S.todos.some(t=>t.id===converted.id));
 const final=JSON.stringify(await snapshot());DB._db.close();await DB.open();check('转换撤销后重开数据库一致',JSON.stringify(await snapshot())===final);
 out.textContent+='\\n全部 15 项通过。仅使用合成数据库，未调用模型。';`);
const html='<!doctype html><meta charset="utf-8"><title>卷卷 #27 合成数据库验收</title><h1>卷卷 #27 合成数据库验收</h1><button>运行检查</button><pre>等待运行</pre><script>'+source+'</script><script>'+checks+'</script>';
http.createServer((req,res)=>{if(req.url!=='/')return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'");res.end(html)}).listen(4187,'127.0.0.1',()=>console.log('http://127.0.0.1:4187/'));
