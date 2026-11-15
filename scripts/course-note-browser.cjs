'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.join(__dirname,'..');
const controls='<section style="position:fixed;inset:0;z-index:99999;background:white;color:black;overflow:auto;padding:20px"><h1>#39 课程备注逐步验收</h1><button id="note-run">运行合成验收</button><pre id="note-result"></pre></section>';
http.createServer((req,res)=>{
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));}
 if(req.url!=='/')return res.writeHead(404).end();
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/^App\.init\(\);$/m,'');const checks=fs.readFileSync(path.join(__dirname,'helpers/course-note-browser.js'),'utf8');
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data:; font-src 'none'");res.end(html.replace('</body>',controls+'<script>'+checks+'</script></body>'));
}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/')});
