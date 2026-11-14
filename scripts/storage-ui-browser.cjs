'use strict';
// Real application import UI, isolated origin and database; no production data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const needle="indexedDB.open('juanjuan-pet', 3)";
if(original.split(needle).length!==2)throw Error('Expected exactly one database entry point');
const source=original.replace(needle,"indexedDB.open('juanjuan-issue37-synthetic', 3)");
const inspector=fs.readFileSync(path.join(__dirname,'helpers/storage-ui-inspector.js'),'utf8');
const banner='<aside id="storage-inspector" style="position:fixed;z-index:99999;left:4px;bottom:80px;max-width:96vw;max-height:150px;overflow:auto;background:white;border:2px solid green;padding:6px;font:12px monospace;pointer-events:none"><strong>#37 隔离验收，仅合成库，网络已禁用</strong><pre id="storage-inspector-result">等待数据库初始化</pre></aside>';
const html=source.replace('</body>',banner+'<script>'+inspector+'</script></body>');
const server=http.createServer((req,res)=>{
 if(!['/','/index.html'].includes(req.url)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src 'self' data:; font-src 'self'");res.end(html);
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
const port=Number(process.env.PORT||0);
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/',database:'juanjuan-issue37-synthetic',sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),network:'CSP connect-src none'})));
