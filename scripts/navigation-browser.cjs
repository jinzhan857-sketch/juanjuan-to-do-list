'use strict';
// Dedicated loopback origin and synthetic database. Never serves repository files.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const needle="indexedDB.open('juanjuan-pet', 3)";
if(source.split(needle).length!==2)throw Error('Database entry changed');
const inspector=fs.readFileSync(path.join(__dirname,'helpers/navigation-inspector.js'),'utf8');
const banner='<aside style="position:fixed;right:0;top:0;z-index:99999;background:white;color:black;font:12px monospace"><button id="nav-run">测量导航</button><select id="nav-probe"><option value="">原样</option><option value=".page{animation:none!important}">关闭页面动画</option><option value="@keyframes pageIn{from{opacity:0}to{opacity:1}}">仅透明动画</option><option value=".page{min-height:0!important}">去最小高度</option></select><pre id="nav-result">仅合成库</pre></aside>';
const clock="<script>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']));}static now(){return new RealDate('2026-11-15T10:00:00+08:00').getTime();}};}</script>";
const html=source.replace('<head>','<head>'+clock).replace(needle,"indexedDB.open('juanjuan-issue32-synthetic', 3)").replace('this.selfTest();','/* Independent browser checks below. */').replace('App.init();','App.init().then(()=>window.navigationReady=true);').replace('</body>',banner.replace('font:12px monospace','font:12px monospace;max-width:min(80vw,340px);max-height:140px;overflow:auto')+'<script>'+inspector+'</script></body>');
const server=http.createServer((req,res)=>{
 if(req.url==='/evidence'&&req.method==='POST'){
  let data='';req.on('data',chunk=>{data+=chunk;if(data.length>4000000)req.destroy();});req.on('end',()=>{
   let record;try{record=JSON.parse(data);if(!Array.isArray(record.runs))throw Error('Invalid record');}catch{res.writeHead(400).end();return;}
   record.capturedAt=new Date().toISOString();record.sourceSha256=crypto.createHash('sha256').update(source).digest('hex');
   fs.mkdirSync(path.join(root,'.reports'),{recursive:true});
   fs.writeFileSync(path.join(root,'.reports','navigation-'+Date.now()+'.json'),JSON.stringify(record,null,2));res.end('saved');
  });return;
 }
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));return;}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"connect-src 'self'; img-src 'self' data:; font-src 'self'");res.end(html);
});
const host=process.env.HOST||'127.0.0.1';
server.listen(Number(process.env.PORT||4232),host,()=>console.log('Navigation synthetic preview: http://'+host+':'+server.address().port+'/'));
