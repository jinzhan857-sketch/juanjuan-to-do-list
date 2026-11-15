'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/^App\.init\(\);$/m,'');
const checks=fs.readFileSync(path.join(__dirname,'helpers/agent-context-browser.js'),'utf8');
const controls='<section style="position:fixed;inset:0;z-index:99999;background:white;color:black;overflow:auto;padding:20px"><h1>#31 原生数据库验收</h1><button id="context-run">运行合成验收</button><pre id="context-result"></pre></section>';
http.createServer((req,res)=>{if(req.url!=='/')return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'");res.end(html.replace('</body>',controls+'<script>'+checks+'</script></body>'));}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/')});
