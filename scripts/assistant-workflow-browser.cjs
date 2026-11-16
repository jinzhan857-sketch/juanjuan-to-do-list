'use strict';
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
const built=process.argv.includes('--dist'),source=fs.readFileSync(built?'dist/index.html':'index.html','utf8');
const hash=crypto.createHash('sha256').update(source).digest('hex');
if(!source.includes("indexedDB.open('juanjuan-pet', 3)"))throw Error('DB boundary changed');
const setup=`
App.init().then(()=>{
const panel=document.createElement('div');panel.style='position:relative;background:var(--card);padding:12px;z-index:1';panel.innerHTML='<button id="issue115-prepare">准备七项合成候选</button><button id="issue115-check">核对并保存数据库证据</button><pre id="issue115-result" style="white-space:pre-wrap;font-size:12px"></pre>';document.body.prepend(panel);
const output=document.getElementById('issue115-result');
const report=async()=>{const persisted=await DB.snapshot(DATA_STORES);output.textContent=JSON.stringify({sourceSha256:${JSON.stringify(hash)},tasks:persisted.tasks.map(t=>({id:t.id,title:t.title,date:t.execDate,start:t.startTime,end:t.endTime,note:t.note})),cards:UI.assistantCandidateContext(UI.agentChatId),operations:persisted.operations.length},null,2);await fetch('/evidence',{method:'POST',body:output.textContent});};
document.getElementById('issue115-check').onclick=report;
document.getElementById('issue115-prepare').onclick=async()=>{
 await UI.loadAssistantWorkflow();const expected=await DB.snapshot(DATA_STORES);const changes=DATA_STORES.flatMap(store=>expected[store].map(v=>({store,type:'delete',key:v.id})));
 await commitDataChanges(changes,expected);await saveChat({id:'issue115-browser-chat',title:'七项合成验收',createdAt:Date.now(),updatedAt:Date.now()});UI.agentChatId='issue115-browser-chat';
 const titles=['6098项目上交日期','7215项目pre','7215项目递交时间','7508智能系统安全期末考','7215编程与应用期末考','7224深度学习期末考','TCL参观'],days=[1,3,7,8,10,11,15];
 await UI.applyAssistantWorkflow({type:'workflow',intent:'propose',reply:'七项全天合成候选，请核对',entries:titles.map((title,i)=>({action:{kind:'create_schedule',item:{title,exec_date:'2026-12-'+String(days[i]).padStart(2,'0'),time_type:'allday',category:'学业事务',base_score:7}}}))},UI.agentChatId,'合成七项');UI.switchPage('agent');UI.renderAgent();await report();
};
}).catch(e=>document.body.append(e.message));`;
const page=source.replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-issue115-synthetic', 3)").replace('\nApp.init();','\n'+setup);
const resources=new Map([['/assistant-workflow.js',fs.readFileSync(built?'dist/assistant-workflow.js':'src/assistant/workflow.js')],['/quick-score.mjs',fs.readFileSync(built?'dist/quick-score.mjs':'src/rules/quick-score.mjs')]]);
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'");
 if(req.url==='/evidence'&&req.method==='POST'){let body='';req.on('data',c=>{body+=c;if(body.length>1000000)req.destroy()});req.on('end',()=>{try{const value=JSON.parse(body);if(value.sourceSha256!==hash)throw Error('Source mismatch');fs.mkdirSync('.reports/issue115',{recursive:true});fs.writeFileSync('.reports/issue115/browser-'+(built?'dist':'source')+'.json',JSON.stringify(value,null,2));res.end('saved');}catch{res.writeHead(400).end()}});return;}
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page);return;}
 if(resources.has(req.url)){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(resources.get(req.url));return;}
 res.writeHead(404).end();
});server.listen(Number(process.env.PORT||4260),'127.0.0.1',()=>console.log('Synthetic #115 browser http://127.0.0.1:'+server.address().port+'/'));
