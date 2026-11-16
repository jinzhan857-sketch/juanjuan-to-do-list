'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {openBudget}=require('./helpers/v27-budget.cjs');
if(!process.argv.includes('--live'))throw Error('Use --live for the budgeted real cloud browser');
const events=fs.existsSync('.reports/v27/browser-events.json')?JSON.parse(fs.readFileSync('.reports/v27/browser-events.json','utf8')).events:[];const persist=()=>{fs.mkdirSync('.reports/v27',{recursive:true});fs.writeFileSync('.reports/v27/browser-events.json',JSON.stringify({mode:'real-cloud-visible-browser',events},null,2));};
const root=path.join(__dirname,'..'),budget=openBudget(),endpoint='https://juanjuan-v27-ai.vercel.app/api/ai';
const bootstrap=`
const directFetch=window.fetch.bind(window);
window.fetch=async(url,options={})=>{
 if(String(url)!==${JSON.stringify(endpoint)}||options.method!=='POST')return directFetch(url,options);
 const payload=JSON.parse(options.body);if(['cancel','experience'].includes(payload.mode))return directFetch(url,options);
 const reserved=await directFetch('/__reserve',{method:'POST',body:JSON.stringify(payload)});if(!reserved.ok){const failure=await reserved.json();throw Error(failure.error||'本轮真实测试预算已到上限');}const receipt=await reserved.json();
 const response=await directFetch(url,options);const result=await response.clone().json();
 if(result.provider_usage)await directFetch('/__result',{method:'POST',body:JSON.stringify({id:receipt.id,usage:result.provider_usage})});
 return response;
};
App.init().then(async()=>{UI.switchPage('agent');if(!UI.currentAgentChat())await UI.createAgentChat(false);const panel=document.createElement('div');panel.style='position:fixed;right:8px;top:58px;z-index:20000;padding:6px;background:var(--card);font-size:12px';panel.innerHTML='<button id="v27-audit">核对实际记录</button><button id="v27-close" aria-label="收起验收工具">×</button><span id="v27-audit-result"></span>';document.body.append(panel);document.getElementById('v27-close').onclick=()=>{panel.hidden=true;};document.getElementById('v27-audit').onclick=async()=>{const snapshot=await DB.snapshot([...DATA_STORES,'kv']);await directFetch('/__evidence',{method:'POST',body:JSON.stringify(snapshot)});document.getElementById('v27-audit-result').textContent='已记录 '+snapshot.tasks.length+'日程 '+snapshot.todos.length+'待办';};});`;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-v27-synthetic', 3)").replace('\nApp.init();','\n'+bootstrap);
const firstUseHtml=html.replace("indexedDB.open('juanjuan-v27-synthetic', 3)","indexedDB.open('juanjuan-v27-onboarding-final-v2', 3)").replace("App.init().then(async()=>{UI.switchPage('agent');","App.init().then(async()=>{UI.switchPage('home');");
const retestHtml=html.replace("indexedDB.open('juanjuan-v27-synthetic', 3)","indexedDB.open('juanjuan-v27-retest', 3)");
const firstLookHtml=firstUseHtml.replace('juanjuan-v27-onboarding-final-v2','juanjuan-v27-first-look-20261117').replaceAll('juanjuan_','juanjuan_v27_first_');
const assets={'/quick-score.mjs':'src/rules/quick-score.mjs','/assistant-workflow.js':'src/assistant/workflow.js','/assistant-materials.js':'src/assistant/materials.js'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');const authority='127.0.0.1:4297';
 if(req.headers.host!==authority||req.headers.origin&&req.headers.origin!=='http://'+authority){res.writeHead(403).end();return;}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 if(req.method==='GET'&&req.url==='/first-use'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(firstUseHtml);return;}
 if(req.method==='GET'&&req.url==='/first-look'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(firstLookHtml);return;}
 if(req.method==='GET'&&req.url==='/retest'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(retestHtml);return;}
 if(req.method==='GET'&&assets[req.url]){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,assets[req.url])));return;}
 if(req.method==='GET'&&req.url==='/__budget'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(budget.totals()));return;}
 if(req.method==='POST'&&['/__reserve','/__result','/__evidence'].includes(req.url)){
  try{let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('body size');chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');
   if(req.url==='/__evidence'){events.push({kind:'database',at:new Date().toISOString(),snapshot:body});persist();res.end('{}');return;}
   if(req.url==='/__reserve')res.end(JSON.stringify({id:budget.reserve(body)}));
   else {budget.finish(body.id,body.usage);events.push({kind:'usage',at:new Date().toISOString(),usage:body.usage});persist();res.end('{}');}
  }catch(error){res.writeHead(409).end(JSON.stringify({error:error.message==='Live synthetic input exceeds budget boundary'?'合成测试输入超过安全边界，本次未调用云端AI':'本轮真实测试预算已到上限'}));}return;
 }
 res.writeHead(404).end();
});
server.listen(4297,'127.0.0.1',()=>console.log('Real cloud acceptance at http://127.0.0.1:4297/; isolated synthetic database; budget 200 requests / 1 CNY'));
const stop=()=>server.close(()=>{budget.close();process.exit();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
