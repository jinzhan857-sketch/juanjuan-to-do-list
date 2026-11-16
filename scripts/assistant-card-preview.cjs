'use strict';
// Free isolated visual fixture. No key or model transport is loaded.
const fs=require('node:fs'),http=require('node:http');
const source=fs.readFileSync('index.html','utf8');
if(!source.includes("indexedDB.open('juanjuan-pet', 3)"))throw Error('DB boundary changed');
const bootstrap=`App.init().then(async()=>{
 UI.switchPage('agent');if(!UI.currentAgentChat())await UI.createAgentChat(false);
 if(!S.messages.length)await UI.applyAssistantWorkflow({type:'workflow',intent:'propose',reply:'两项日程已整理好，请核对后确认。',entries:[{action:{kind:'create_schedule',item:{title:'复习课程',exec_date:'2026-12-25',time_type:'exact',start_time:'16:00',end_time:'17:00',category:'学业事务',base_score:7}}},{action:{kind:'create_todo',item:{title:'整理参考文献',note:'保存电子版',category:'学业事务',base_score:5}}}]},UI.agentChatId,'创建这两项合成事务。');
 const panel=document.createElement('div');panel.style='position:fixed;top:0;left:0;right:0;z-index:30000;text-align:center;font-size:11px;background:var(--card);color:var(--text2)';panel.textContent='候选卡外观预览，合成资料，AI未连接';document.body.append(panel);UI.renderAgent();
});`;
const page=source.replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-133-card-preview', 3)").replace('\nApp.init();','\n'+bootstrap);
const assets={'/assistant-workflow.js':fs.readFileSync('src/assistant/workflow.js'),'/quick-score.mjs':fs.readFileSync('src/rules/quick-score.mjs')};
http.createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'");if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page)}else if(req.method==='GET'&&assets[req.url]){res.setHeader('Content-Type','text/javascript');res.end(assets[req.url])}else res.writeHead(503).end('No live model connected');}).listen(4272,'127.0.0.1',()=>console.log('http://127.0.0.1:4272/'));
