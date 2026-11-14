'use strict';
// Optional native IndexedDB check. The app never starts on this test origin.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const source=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,'');
const checks=fs.readFileSync(path.join(__dirname,'helpers/storage-browser-checks.js'),'utf8').replace('// SYNTHETIC_SETUP',require('./helpers/storage-fixture.cjs'));
const html='<!doctype html><meta charset="utf-8"><title>卷卷 #6 隔离故障验证</title><style>body{font:18px system-ui;max-width:1000px;margin:40px auto;line-height:1.8}button{padding:12px}pre{white-space:pre-wrap}</style><h1>卷卷 #6 隔离故障验证</h1><p>本页仅使用 4174 来源下的 juanjuan-issue6-synthetic 数据库。</p><button>运行隔离故障检查</button><pre>等待运行</pre><script>'+source+'</script><script>'+checks+'</script>';
const server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(4174,'127.0.0.1',()=>console.log('Synthetic storage checks: http://127.0.0.1:4174/'));
