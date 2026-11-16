'use strict';
const fs=require('node:fs'),http=require('node:http');
const {openBudget}=require('./helpers/issue119-budget.cjs');
const live=process.argv.includes('--live');
if(!live)throw Error('Use explicit --live for budgeted browser direct acceptance');
if(!/jinzhan857-sketch\/juanjuan-to-do-list(?:\.git)?\s*$/.test(require('node:child_process').execFileSync('git',['remote','get-url','origin'],{encoding:'utf8'})))throw Error('Wrong repository');
const budget=openBudget();require('./ai-config.cjs').loadAIEnvironment();const key=process.env.DEEPSEEK_API_KEY;if(!key)throw Error('Missing key');
fs.mkdirSync('.reports/issue119',{recursive:true});const events=[];
const sources=Object.fromEntries(['index.html','src/assistant/materials.js','src/assistant/workflow.js'].map(p=>[p,require('node:crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const persist=()=>fs.writeFileSync('.reports/issue119/browser-live.json',JSON.stringify({mode:'browser_direct',sources,events,attempts:budget.state.attempts},null,2));
const bootstrap=`
localStorage.setItem('juanjuan_llm_source','custom');localStorage.setItem('juanjuan_llm_endpoint','https://api.deepseek.com/chat/completions');localStorage.setItem('juanjuan_llm_model','deepseek-flash');localStorage.setItem('juanjuan_llm_key',${JSON.stringify(key)});
const directFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('https://api.deepseek.com/'))return directFetch(url,options);
 const body=JSON.parse(options.body);if(String(url).endsWith('/chat/completions')){const text=JSON.stringify(body.messages, (k,v)=>k==='image_url'?{url:'pixel-content'}:v);if(new TextEncoder().encode(text).length>60000||body.max_tokens>6000)throw Error('真实测试输入超出预留边界');}
 const kind=String(url).endsWith('/search')?'search':String(url).endsWith('/fetch')?'fetch':'model';
 const r=await directFetch('/__reserve',{method:'POST',body:JSON.stringify({kind})});const receipt=await r.json();if(!receipt.id)throw Error('预算拒绝');
 try{const response=await directFetch(url,options);const data=await response.clone().json();await directFetch('/__result',{method:'POST',body:JSON.stringify({id:receipt.id,status:response.status,usage:data.usage,kind,result_count:data.results?.length,has_page_content:!!data.content,finish_reason:data.choices?.[0]?.finish_reason})});return response;}catch(error){await directFetch('/__result',{method:'POST',body:JSON.stringify({id:receipt.id,kind,error:error.name})});throw error;}
};
App.init().then(()=>{UI.switchPage('agent');const p=document.createElement('div');p.style='position:fixed;top:4px;right:4px;z-index:20000;background:var(--card);padding:4px;font-size:11px';p.innerHTML='<span>合成库，真实自配直连</span><button id="material-audit">记录验收状态</button><button id="material-finish">结束验收</button>';document.body.append(p);document.getElementById('material-audit').onclick=async()=>{const snapshot=await DB.snapshot([...DATA_STORES,'kv']);await directFetch('/__snapshot',{method:'POST',body:JSON.stringify(snapshot)});p.querySelector('span').textContent='已记录验收状态';};document.getElementById('material-finish').onclick=()=>directFetch('/__finish',{method:'POST'}).then(()=>p.textContent='验收服务已停止');});`;
const html=fs.readFileSync('index.html','utf8').replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-issue119-synthetic', 3)").replace('\nApp.init();','\n'+bootstrap);
const assets={'/assistant-materials.js':'src/assistant/materials.js','/assistant-workflow.js':'src/assistant/workflow.js','/quick-score.mjs':'src/rules/quick-score.mjs'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self' https://api.deepseek.com; img-src 'self' data: blob:; font-src 'self'");
 const host='127.0.0.1:'+server.address().port;if(req.headers.host!==host||req.headers.origin&&req.headers.origin!=='http://'+host){res.writeHead(403).end();return;}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 if(req.method==='GET'&&assets[req.url]){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(assets[req.url]));return;}
 if(req.method==='POST'&&['/__reserve','/__result','/__snapshot','/__finish'].includes(req.url)){
  try{const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>12*1024*1024)throw Error('body limit');chunks.push(b);}const data=JSON.parse(Buffer.concat(chunks).toString()||'{}');
   if(req.url==='/__reserve'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:budget.reserve(data.kind)}));return;}
   if(req.url==='/__result'){events.push(data);if(data.status)budget.finish(data.id,data);persist();res.end('recorded');return;}
   if(req.url==='/__snapshot'){fs.writeFileSync('.reports/issue119/browser-snapshot.json',JSON.stringify(data,null,2));res.end('recorded');return;}
   persist();res.end('stopped');server.close(()=>{budget.close();process.exit();});return;
  }catch{res.writeHead(409).end('{}');return;}
 }
 res.writeHead(404).end();
});server.listen(4289,'127.0.0.1',()=>console.log('Browser direct acceptance http://127.0.0.1:4289/ ; no remote proxy'));
