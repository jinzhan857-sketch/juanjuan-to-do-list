'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/^App\.init\(\);$/m,'');
const fixture=require('./helpers/storage-fixture.cjs');
const checks=fs.readFileSync(path.join(__dirname,'helpers/review-27-30-browser.js'),'utf8').replace('// SYNTHETIC_SETUP',fixture);
const controls='<section style="position:fixed;inset:0;z-index:99999;background:white;color:black;overflow:auto;padding:20px"><h1>#27、#30独立复查</h1><button id="review-run">运行合成验收</button><pre id="review-result"></pre></section>';
http.createServer((req,res)=>{if(req.url!=='/')return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'");res.end(html.replace('</body>',controls+'<script>'+checks+'</script></body>'));}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/')});
