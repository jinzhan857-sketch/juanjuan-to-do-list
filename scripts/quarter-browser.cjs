'use strict';
// Render the actual home reminders in memory. No app init, database or network.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const controls="<aside style=\"padding:65px 12px 12px;background:white;color:black\"><label>合成日期 <input id=\"sample-date\" type=\"date\" value=\"2026-11-15\"></label><label>范围 <select id=\"sample-scope\"><option value=\"long\">长期</option><option value=\"near\">近期</option></select></label><p>仅内存合成季度与年度待办，无数据库与外部连接。</p></aside>";
const setup="const NativeDate=Date;let sampleDate='2026-11-15';Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[sampleDate+'T12:00:00']))}};\nS.pet=defaultPet();S.tasks=[];S.todos=[{id:'q',title:'合成季度任务',period:'quarter',baseScore:5,createdAt:1},{id:'y',title:'合成年度任务',period:'year',baseScore:3,createdAt:2}];\nfunction previewQuarter(){sampleDate=document.querySelector('#sample-date').value;UI.todoScope=document.querySelector('#sample-scope').value;UI.todoFilter='all';UI.switchPage('todo');UI.renderTodos()}\ndocument.querySelector('#sample-date').onchange=previewQuarter;document.querySelector('#sample-scope').onchange=previewQuarter;previewQuarter();";
http.createServer((req,res)=>{
 if(req.url!=='/'){res.writeHead(404).end();return;}
 const original=fs.readFileSync(process.env.QUARTER_SOURCE||path.join(root,'index.html'),'utf8');
 if((original.match(/^App\.init\(\);$/gm)||[]).length!==1)throw Error('Expected exactly one app initialization to disable');
 const html=original.replace('<body>','<body>'+controls).replace(/^App\.init\(\);$/m,setup);
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data:; font-src 'none'");res.end(html);
}).listen(Number(process.env.PORT||4185),'127.0.0.1',function(){console.log('Synthetic notices: http://127.0.0.1:'+this.address().port+'/');});
