'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.join(__dirname,'..');
http.createServer((req,res)=>{
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));}
 if(req.url!=='/')return res.writeHead(404).end();
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/^App\.init\(\);$/m,'');
 const controls='<section style="position:fixed;inset:0;z-index:99999;background:white;color:black;overflow:auto;padding:20px"><h1>#31、#39 合入后复查</h1><button id="review-run">运行新增边界验收</button><pre id="review-result"></pre></section>';
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data:; font-src 'none'");res.end(html.replace('</body>',controls+'<script>'+fs.readFileSync(path.join(__dirname,'helpers/review31-39-browser.js'),'utf8')+'</script></body>'));
}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/')});
