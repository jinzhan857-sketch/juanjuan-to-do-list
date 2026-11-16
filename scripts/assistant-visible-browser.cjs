'use strict';
// Explicit interactive test entry. Production application files remain unchanged.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {withBudget}=require('./helpers/issue115-budget.cjs');
const {createModelCheck}=require('./ai-simulation.cjs');
if(!process.argv.includes('--live'))throw Error('Use --live explicitly');
withBudget(async({key,source,request,state,save})=>{
 const dir=path.join('.reports','issue115-visible-browser',String(Date.now()));fs.mkdirSync(dir,{recursive:true});
 const startedCalls=state.attempts.length,phase=state.active_phase;
 const events=[],persist=()=>fs.writeFileSync(path.join(dir,'events.json'),JSON.stringify({source,phase,mode:'real_model_visible_browser',quota:'isolated_simulation',started_calls:startedCalls,events},null,2));
 const setup=createModelCheck({key,request:async(url,options)=>{const started=Date.now(),modelInput=JSON.parse(options.body);try{const response=await request(url,options),payload=await response.clone().json();events.push({kind:'model',at:new Date().toISOString(),duration_ms:Date.now()-started,request_messages:modelInput.messages,model_raw:payload.choices?.[0]?.message?.content,usage:payload.usage,status:response.status,attempt:state.attempts.length});persist();return response;}catch(e){events.push({kind:'model_error',at:new Date().toISOString(),attempt:state.attempts.length});persist();throw e;}}});
 const html=fs.readFileSync('index.html','utf8');if(!html.includes("indexedDB.open('juanjuan-pet', 3)"))throw Error('DB boundary changed');
 const bootstrap=`
App.init().then(async()=>{
 const panel=document.createElement('section');panel.style='position:fixed;right:10px;top:66px;z-index:20000;background:var(--card);border:1px solid var(--border);padding:8px;max-width:260px;font-size:12px';
 panel.innerHTML='<div>隔离演示：真实AI，合成资料</div><button id="visible-audit">核对实际记录</button><div id="visible-audit-result">尚未核对</div>';document.body.append(panel);
 const audit=async()=>{const data=await DB.snapshot([...DATA_STORES,'kv']);document.getElementById('visible-audit-result').textContent='日程 '+data.tasks.length+' 条，待办 '+data.todos.length+' 条，操作 '+data.operations.length+' 条';await fetch('/__evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tasks:data.tasks,todos:data.todos,messages:data.messages,operations:data.operations,kv:data.kv})});};
 document.getElementById('visible-audit').onclick=audit;
 UI.switchPage('agent');UI.renderAgent();
 if(!UI.currentAgentChat()){await UI.createAgentChat(false);UI.renderAgent();}
 audit();
}).catch(error=>document.body.append(error.message));`;
 const page=html.replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-issue115-visible-browser', 3)").replace('\nApp.init();','\n'+bootstrap);
 const assets=new Map([['/assistant-workflow.js',fs.readFileSync('src/assistant/workflow.js')],['/quick-score.mjs',fs.readFileSync('src/rules/quick-score.mjs')]]);
 let finish;const done=new Promise(resolve=>finish=resolve);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'");
  const authority='127.0.0.1:'+server.address().port;
  if(req.headers.host!==authority||req.headers.origin&&req.headers.origin!=='http://'+authority){res.writeHead(403).end();return;}
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page);return;}
  if(req.method==='GET'&&assets.has(req.url)){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(assets.get(req.url));return;}
  if(req.method==='POST'&&['/api/ai','/__evidence','/__finish'].includes(req.url)){
   let chunks=[],length=0;try{for await(const chunk of req){length+=chunk.length;if(length>1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
    if(req.url==='/__finish'){res.end('stopped');server.closeAllConnections();server.close(()=>finish());return;}
    if(req.url==='/__evidence'){events.push({kind:'database',at:new Date().toISOString(),snapshot:body});persist();res.end('saved');return;}
    req.body=body;res.status=n=>{res.statusCode=n;return res};res.json=body=>{res.setHeader('Content-Type','application/json;charset=utf-8');res.end(JSON.stringify(body));return res};
    await setup.handler(req,res);
   }catch(error){if(!res.writableEnded){res.statusCode=500;res.end(JSON.stringify({error:'隔离测试请求失败，未自动重试'}));}}
   return;
  }
  res.writeHead(404).end();
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.PORT||4270),'127.0.0.1',resolve)});
 const stop=()=>{server.closeAllConnections();server.close(()=>finish())};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/',mode:'real_model',database:'juanjuan-issue115-visible-browser',report:dir}));
 try{await done;}finally{persist();state.cases.push({phase,report:dir,source,at:new Date().toISOString(),model_calls:events.filter(e=>e.kind==='model'||e.kind==='model_error').length});save();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}).catch(error=>{console.error(error.message);process.exitCode=1});
