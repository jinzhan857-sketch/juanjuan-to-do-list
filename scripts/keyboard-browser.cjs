'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const needle="indexedDB.open('juanjuan-pet', 3)";if(source.split(needle).length!==2)throw Error('Database entry changed');
const inspector=fs.readFileSync(path.join(__dirname,'helpers/keyboard-inspector.js'),'utf8');
const native=require('./helpers/keyboard-native.cjs');
const sourceSha256=crypto.createHash('sha256').update(source).digest('hex');
const controlsTemplate='<details id="keyboard-inspector" style="position:fixed;left:50%;transform:translateX(-50%);top:4px;z-index:99999;background:white;color:black;border:1px solid #637;padding:3px;font:11px monospace;max-width:80vw;max-height:170px;overflow:auto"><summary>#33 {{BUILD}}</summary><button id="keyboard-save" style="padding:6px">保存验收记录</button><button id="keyboard-leave" style="padding:6px">离开助手</button><details><summary>电脑自动检查</summary><button id="keyboard-desktop">开始桌面检查</button></details><pre id="keyboard-result">键盘变化会自动记录</pre></details>';
const testBuild=crypto.createHash('sha256').update(source).update(inspector).update(controlsTemplate).digest('hex').slice(0,10);
const controls=controlsTemplate.replace('{{BUILD}}',testBuild);
const clock="<script>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-15T10:00:00+08:00']));}static now(){return new RealDate('2026-11-15T10:00:00+08:00').getTime();}};}</script>";
const identity='window.KEYBOARD_SOURCE_HASH='+JSON.stringify(sourceSha256)+';window.KEYBOARD_TEST_BUILD='+JSON.stringify(testBuild)+';';
const html=source.replace('<head>','<head>'+clock).replace(needle,"indexedDB.open('juanjuan-issue33-synthetic', 3)").replace('this.selfTest();','/* Independent checks below. */').replace('App.init();','App.init().then(()=>window.keyboardReady=true);').replace('</body>',controls+'<script>'+identity+inspector+'</script></body>');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/evidence'&&req.method==='POST'){
  let data='';req.on('data',chunk=>{data+=chunk;if(data.length>4000000)req.destroy();});req.on('end',()=>{
   let record;try{record=JSON.parse(data);if(!Array.isArray(record.events))throw Error('Invalid record');}catch{res.writeHead(400).end();return;}
   const identity=record.scenario==='native'?native:{sourceSha256,testBuild};
   if(record.sourceSha256!==identity.sourceSha256||record.testBuild!==identity.testBuild){res.writeHead(409).end('Stale test page');return;}
   record.capturedAt=new Date().toISOString();
   fs.mkdirSync(path.join(root,'.reports'),{recursive:true});fs.writeFileSync(path.join(root,'.reports','keyboard-'+Date.now()+'.json'),JSON.stringify(record,null,2));res.end('saved');
  });return;
 }
 if(url.pathname==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));return;}
 if(!['/','/native'].includes(url.pathname)){res.writeHead(404).end();return;}
 const page=url.pathname==='/native'?native:{html,testBuild};
 if(url.searchParams.has('build')&&url.searchParams.get('build')!==page.testBuild){res.writeHead(410).end('Test version changed. Open '+url.pathname+'?build='+page.testBuild);return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"connect-src 'self'; img-src 'self' data:; font-src 'self'");res.end(page.html);
});
const host=process.env.HOST||'127.0.0.1';server.listen(Number(process.env.PORT||4234),host,()=>console.log('Keyboard synthetic preview: http://'+host+':'+server.address().port+'/?build='+testBuild));
