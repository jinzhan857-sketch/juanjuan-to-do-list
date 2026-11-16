'use strict';
// The browser sends directly to DeepSeek. This local server records budget and
// sanitized evidence only; it never forwards a model/search/fetch request.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {openBudget}=require('./helpers/issue119-budget.cjs');
const {loadAIEnvironment}=require('./ai-config.cjs');
if(!process.argv.includes('--live'))throw Error('Explicit --live required');
if(!/jinzhan857-sketch\/juanjuan-to-do-list(?:\.git)?\s*$/.test(require('node:child_process').execFileSync('git',['remote','get-url','origin'],{encoding:'utf8'})))throw Error('Wrong repository');
const budget=openBudget(undefined,{initialize:process.argv.includes('--initialize')});
loadAIEnvironment();const key=process.env.DEEPSEEK_API_KEY;if(!key)throw Error('Missing key');
const events=[];fs.mkdirSync('.reports/issue119',{recursive:true});
const persist=()=>fs.writeFileSync('.reports/issue119/direct-probe.json',JSON.stringify({mode:'browser_direct_not_proxy',events,attempts:budget.state.attempts},null,2));
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');const authority='127.0.0.1:'+server.address().port;
 if(req.headers.host!==authority||req.headers.origin&&req.headers.origin!=='http://'+authority){res.writeHead(403).end();return;}
 if(req.method==='GET'&&req.url==='/'){
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><title>#119 自配直连检查</title><h1>浏览器直连 DeepSeek</h1><p>仅合成资料；调用计入#119累计100次10元。请求由浏览器直接发送，不经代理。</p><button id="run">检查搜索直连</button><pre id="result">尚未执行</pre><script>
 const key=${JSON.stringify(key)};
 document.getElementById('run').onclick=async()=>{const button=document.getElementById('run');button.disabled=true;const out=document.getElementById('result');
 const reserve=await fetch('/reserve',{method:'POST'}).then(r=>r.json());if(!reserve.id){out.textContent='预算拒绝';return;}
 try{const response=await fetch('https://api.deepseek.com/v1/tools/search',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({query:'example.com',count:1,need_content:true}),signal:AbortSignal.timeout(15000)});const data=await response.json();const evidence={id:reserve.id,status:response.status,result_count:data.results?.length,error_type:data.error?.type,error_code:data.error?.code};await fetch('/result',{method:'POST',body:JSON.stringify(evidence)});out.textContent=JSON.stringify(evidence,null,2);}catch(e){const evidence={id:reserve.id,error:e.name};await fetch('/result',{method:'POST',body:JSON.stringify(evidence)});out.textContent=JSON.stringify(evidence,null,2);}};
 </script>`);return;
 }
 if(req.method==='POST'&&req.url==='/reserve'){try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:budget.reserve('search')}));}catch{res.writeHead(409).end('{}');}return;}
 if(req.method==='POST'&&req.url==='/result'){const chunks=[];for await(const b of req){chunks.push(b);if(Buffer.concat(chunks).length>8192){res.writeHead(413).end();return;}}const event=JSON.parse(Buffer.concat(chunks));events.push(event);if(event.status)budget.finish(event.id,event);persist();res.end('saved');return;}
 res.writeHead(404).end();
});
server.listen(4289,'127.0.0.1',()=>console.log('Open http://127.0.0.1:4289/ ; browser direct probe'));
process.on('SIGINT',()=>{persist();server.close();budget.close();process.exit();});
