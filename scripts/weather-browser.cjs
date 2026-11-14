'use strict';
// Isolated UI request lifecycle checks. App.init is disabled; no database opens.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const source=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,'');
const checks=fs.readFileSync(path.join(__dirname,'helpers/weather-browser-checks.js'),'utf8');
const html='<!doctype html><meta charset="utf-8"><title>卷卷 #7 隔离天气验证</title><style>body{font:18px system-ui;max-width:1000px;margin:40px auto;line-height:1.8}button{padding:12px}pre{white-space:pre-wrap}</style><h1>卷卷 #7 隔离天气验证</h1><p>合成消息与模拟天气，不启动应用，不打开数据库，不调用模型。</p><button id="run">运行隔离天气检查</button><textarea id="agent-input" hidden></textarea><pre id="result">等待运行</pre><script>'+source+'</script><script>'+checks+'</script>';
const server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(4175,'127.0.0.1',()=>console.log('Synthetic weather checks: http://127.0.0.1:4175/'));
