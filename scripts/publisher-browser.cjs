'use strict';
// Isolated UI preview, synthetic IndexedDB only; no real model requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.join(__dirname,'..');
const controls='<div style="position:fixed;top:0;right:0;z-index:99999;background:white;color:black;padding:6px"><label>合成模型 <select id="synthetic-mode"><option>成功</option><option>失败</option><option>追问</option><option>迟到</option></select></label><button id="synthetic-db">查看合成数据库</button><pre id="synthetic-result"></pre></div>';
const setup="AIService.evaluate=async()=>{const mode=document.querySelector('#synthetic-mode').value;if(mode==='失败')throw Error('synthetic offline');if(mode==='追问')return {vague:true,reason:'请补充对象'};if(mode==='迟到')await new Promise(r=>setTimeout(r,4000));return {task:'复习课程',note:'合成备注',base_score:8.4,source:'ai',detected_time:'15:00-16:00'};};document.querySelector('#synthetic-db').onclick=async()=>{document.querySelector('#synthetic-result').textContent=JSON.stringify(await DB.snapshot(['tasks','todos','kv']),null,2);};";
http.createServer((req,res)=>{
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("indexedDB.open('juanjuan-pet'","indexedDB.open('juanjuan-publisher-synthetic'").replace('<body>','<body>'+controls).replace('App.init();',setup+'\nApp.init();');
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
}).listen(4176,'127.0.0.1',()=>console.log('Synthetic publisher: http://127.0.0.1:4176/'));
