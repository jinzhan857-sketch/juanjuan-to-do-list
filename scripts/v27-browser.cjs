'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {openBudget}=require('./helpers/v27-budget.cjs');
if(!process.argv.includes('--live'))throw Error('Use --live for the budgeted real cloud browser');
const root=path.join(__dirname,'..'),budget=openBudget(),endpoint='https://juanjuan-v27-ai.vercel.app/api/ai';
const bootstrap=`
const directFetch=window.fetch.bind(window);
window.fetch=async(url,options={})=>{
 if(String(url)!==${JSON.stringify(endpoint)}||options.method!=='POST')return directFetch(url,options);
 const payload=JSON.parse(options.body);if(payload.mode==='cancel')return directFetch(url,options);
 const reserved=await directFetch('/__reserve',{method:'POST',body:JSON.stringify(payload)});if(!reserved.ok)throw Error('本轮真实测试预算已到上限');const receipt=await reserved.json();
 const response=await directFetch(url,options);const result=await response.clone().json();
 if(response.ok&&result.provider_usage)await directFetch('/__result',{method:'POST',body:JSON.stringify({id:receipt.id,usage:result.provider_usage})});
 return response;
};
App.init();`;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-v27-synthetic', 3)").replace('\nApp.init();','\n'+bootstrap);
const assets={'/quick-score.mjs':'src/rules/quick-score.mjs','/assistant-workflow.js':'src/assistant/workflow.js','/assistant-materials.js':'src/assistant/materials.js'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');const authority='127.0.0.1:4297';
 if(req.headers.host!==authority||req.headers.origin&&req.headers.origin!=='http://'+authority){res.writeHead(403).end();return;}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 if(req.method==='GET'&&assets[req.url]){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,assets[req.url])));return;}
 if(req.method==='GET'&&req.url==='/__budget'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(budget.totals()));return;}
 if(req.method==='POST'&&['/__reserve','/__result'].includes(req.url)){
  try{let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>20000)throw Error('body size');chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');
   if(req.url==='/__reserve')res.end(JSON.stringify({id:budget.reserve(body)}));
   else {budget.finish(body.id,body.usage);res.end('{}');}
  }catch{res.writeHead(409).end('{}');}return;
 }
 res.writeHead(404).end();
});
server.listen(4297,'127.0.0.1',()=>console.log('Real cloud acceptance at http://127.0.0.1:4297/; isolated synthetic database; budget 100 requests / 1 CNY'));
const stop=()=>server.close(()=>{budget.close();process.exit();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
