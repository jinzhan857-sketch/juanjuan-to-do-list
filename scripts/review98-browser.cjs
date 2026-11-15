'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
http.createServer((req,res)=>{
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));}
 if(req.url!=='/')return res.writeHead(404).end();
 const api=vm.createContext({require,module:{exports:{}},process:{env:{}},console,URL,AbortController,DOMException,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(root,'api/ai.js'),'utf8'),api);api.data={type:'proposal',action:{kind:'create_schedule',item:{title:'MODEL9001',note:'备'.repeat(501)}}};
 const hostedResult=vm.runInContext('JSON.stringify(parseAgentResult(JSON.stringify(data),{}))',api);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/^App\.init\(\);$/m,'');
 const controls='<section style="position:fixed;inset:0;z-index:99999;background:white;color:black;overflow:auto;padding:20px"><h1>PR #98 合入后复查</h1><button id="recheck-run">运行合成边界验收</button><pre id="recheck-result"></pre></section>';
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data:; font-src 'none'");res.end(html.replace('</body>',controls+'<script>const hostedOversize='+hostedResult+';'+fs.readFileSync(path.join(__dirname,'helpers/review98-browser.js'),'utf8')+'</script></body>'));
}).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/')});
