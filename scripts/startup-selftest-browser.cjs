'use strict';
// Dedicated synthetic browser integration. No repository directory is served.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),built=process.argv.includes('--dist');
const source=fs.readFileSync(process.env.STARTUP_SOURCE||path.join(root,built?'dist/index.html':'index.html'),'utf8');
if(!/^[a-z0-9-]+$/.test(process.env.STARTUP_EVIDENCE||'source'))throw Error('Invalid evidence name');
const hash=crypto.createHash('sha256').update(source).digest('hex');
const resources=new Map([['/assistant-workflow.js',fs.readFileSync(path.join(root,built?'dist/assistant-workflow.js':'src/assistant/workflow.js'))],['/checks.mjs',fs.readFileSync(path.join(root,'scripts/helpers/startup-selftest-checks.mjs'))],['/browser.mjs',fs.readFileSync(path.join(root,'scripts/helpers/startup-selftest-browser.mjs'))],['/quick-score.mjs',fs.readFileSync(path.join(root,built?'dist/quick-score.mjs':'src/rules/quick-score.mjs'))]]);
const testBuild=crypto.createHash('sha256').update(source).update(Buffer.concat([...resources.values()])).digest('hex');
const names='ScoreEngine,UI,S,AIService,DB,App,Date,todayStr,addDays,parseDate,taskDeadline,foodForScore,todoScore,normalizeTodoLinks,recognizePublishTime,parseNaturalDate,mapTag,$,document,getComputedStyle,AbortController,defaultPet,savePet,saveMemoryGroups,DATA_STORES,DATA_KV,localStorage';
if(source.split("indexedDB.open('juanjuan-pet', 3)").length!==2||source.split('\nApp.init();').length!==2)throw Error('Application boundary changed');
function app(instance){
 if(!/^[a-z0-9-]{1,80}$/.test(instance))throw Error('Invalid synthetic instance');
 const setup=`<script>{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-11-16T10:00:00+08:00']))}static now(){return new NativeDate('2026-11-16T10:00:00+08:00').getTime()}};
 const physical=window.localStorage,prefix=${JSON.stringify('issue106-'+instance+':')};Object.defineProperty(window,'localStorage',{value:{getItem:k=>physical.getItem(prefix+k),setItem:(k,v)=>physical.setItem(prefix+k,v),removeItem:k=>physical.removeItem(prefix+k),get length(){return Object.keys(physical).filter(k=>k.startsWith(prefix)).length},key(i){return Object.keys(physical).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)??null}}});
 window.startupLogs=[];for(const name of ['log','warn','error']){const original=console[name];console[name]=(...args)=>{startupLogs.push({level:name,text:args.join(' ')});original.apply(console,args)}};}</script>`;
 return source.replace('<head>','<head>'+setup).replace("indexedDB.open('juanjuan-pet', 3)","indexedDB.open('juanjuan-issue106-"+instance+"', 3)").replace('    this.selfTest();','    /* Baseline only: invoked explicitly in its own synthetic instance. */').replace('\nApp.init();','\nwindow.testApi={'+names+'};');
}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'");
 if(url.pathname==='/evidence'&&req.method==='POST'){
  let body='';req.on('data',c=>{body+=c;if(body.length>2000000)req.destroy()});req.on('end',()=>{try{const record=JSON.parse(body);if(record.sourceSha256!==hash||record.testBuild!==testBuild||!Array.isArray(record.scenarios))throw Error('Wrong evidence source');fs.mkdirSync(path.join(root,'.reports'),{recursive:true});fs.writeFileSync(path.join(root,'.reports','issue106-browser-'+(process.env.STARTUP_EVIDENCE||(built?'dist':'source'))+'.json'),JSON.stringify({...record,capturedAt:new Date().toISOString()},null,2));res.end('saved');}catch(e){res.writeHead(400).end(e.message)}});return;
 }
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(url.pathname==='/app'){try{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(app(url.searchParams.get('instance')||''))}catch(e){res.writeHead(400).end(e.message)}return;}
 if(resources.has(url.pathname)){res.setHeader('Content-Type','text/javascript');res.end(resources.get(url.pathname));return;}
 if(url.pathname!=='/'){res.writeHead(404).end();return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>卷卷 #106 合成隔离验收</title><style>body{font:16px system-ui;margin:24px}iframe{width:390px;height:650px}pre{white-space:pre-wrap}button{padding:12px}</style><h1>#106 合成隔离验收</h1><p>仅专用合成数据库，不访问4173。</p><p>来源 '+(built?'dist':'source')+'，SHA256 '+hash+'</p><button id="run">运行全部隔离检查</button><pre id="result">等待运行</pre><div id="frames"></div><script>window.sourceSha256='+JSON.stringify(hash)+';window.testBuild='+JSON.stringify(testBuild)+';</script><script type="module" src="/browser.mjs"></script>');
});
server.on('error',e=>{console.error(e);process.exitCode=1});server.listen(Number(process.env.PORT||4256),'127.0.0.1',()=>console.log('Startup synthetic checks: http://127.0.0.1:'+server.address().port+'/'));
