'use strict';
// Offline UI inspection: actual page/storage, synthetic transport, no Key load.
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
const source=fs.readFileSync('index.html','utf8');
const sources=Object.fromEntries(['index.html','src/assistant/materials.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const bootstrap=`
App.init().then(async()=>{
 UI.switchPage('agent');AIService.source=()=> 'custom';AIService.customConfig=()=>({endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'synthetic'});
 const m=await UI.loadMaterials(),collect=m.collect;let failSave=false,calls=0;
 m.collect=(input,config,signal)=>collect(input,config,signal,async(url,options)=>({ok:true,json:async()=>url.endsWith('/fetch')?{title:'合成网页',content:'SYNTHETIC_PAGE_BODY'}:url.endsWith('/search')?{results:[{url:'https://example.com',title:'合成来源',content:'synthetic search'}]}:{choices:[{finish_reason:'stop',message:{content:'合成图片课程BETA，VALUE 83'}}]}}));
 AIService.customRequest=async()=>{calls++;return {type:'chat',reply:'离线合成回答，资料已读取。'}};
 const put=DB.put.bind(DB);DB.put=(store,value,key)=>{if(failSave&&store==='messages'&&value.role==='assistant')throw Error('synthetic save failure');return put(store,value,key);};
 const panel=document.createElement('div');panel.style='position:fixed;right:4px;top:4px;z-index:20000;background:var(--card);padding:4px;font-size:12px';
 panel.innerHTML='<span id="review-state">离线复审，合成库</span><button id="review-fault">开启回复保存失败</button><button id="review-audit">记录复审状态</button><button id="review-stop">停止复审服务</button>';document.body.append(panel);
 document.getElementById('review-fault').onclick=()=>{failSave=!failSave;document.getElementById('review-fault').textContent=failSave?'关闭回复保存失败':'开启回复保存失败';};
 document.getElementById('review-audit').onclick=async()=>{const snapshot=await DB.snapshot([...DATA_STORES,'kv']);const draft=await DB.get('kv','assistant-draft:'+UI.agentChatId);const data={calls,failSave,chatId:UI.agentChatId,input:document.getElementById('agent-input').value,selected:UI.agentPictures.length,draft,snapshot,controls:[...document.querySelectorAll('#agent-material-preview button,#agent-add-image')].map(el=>({label:el.getAttribute('aria-label'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))};await fetch('/evidence',{method:'POST',body:JSON.stringify(data)});document.getElementById('review-state').textContent='已记录：'+(draft?'有草稿':'无草稿')+'，选图'+UI.agentPictures.length;};
 document.getElementById('review-stop').onclick=()=>fetch('/stop',{method:'POST'}).then(()=>panel.textContent='离线复审服务已停止');
});`;
const page=source.replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-issue119-review', 3)").replace('\nApp.init();','\n'+bootstrap);
const assets={'/assistant-materials.js':'src/assistant/materials.js','/assistant-workflow.js':'src/assistant/workflow.js','/quick-score.mjs':'src/rules/quick-score.mjs'};
const events=[];fs.mkdirSync('.reports/issue119',{recursive:true});
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'");
 const authority='127.0.0.1:'+server.address().port;
 if(req.headers.host!==authority||req.headers.origin&&req.headers.origin!=='http://'+authority){res.writeHead(403).end();return;}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page);return;}
 if(req.method==='GET'&&assets[req.url]){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(assets[req.url]));return;}
 if(req.method==='POST'&&req.url==='/evidence'){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}events.push(JSON.parse(Buffer.concat(chunks)));fs.writeFileSync('.reports/issue119/review-browser.json',JSON.stringify({mode:'offline_synthetic_browser',sources,events},null,2));res.end('saved');return;}
 if(req.method==='POST'&&req.url==='/stop'){res.end('stopped');server.close();return;}
 res.writeHead(404).end();
});server.listen(4290,'127.0.0.1',()=>console.log('Offline review http://127.0.0.1:4290/ ; no external transport or private Key'));
