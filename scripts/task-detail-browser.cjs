'use strict';
// Render actual task details in memory. No app init, database or network.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const controls="<aside style=\"padding:65px 12px 12px;background:white;color:black\"><label>合成状态 <select id=\"sample-status\"><option value=\"\">未结算</option><option value=\"done\">已完成</option><option value=\"skipped\">未做</option></select></label><p>#57 仅内存合成任务，无数据库及外部连接。</p></aside>";
const setup="S.pet=defaultPet();S.tasks=[{id:'detail',title:'合成详情任务',execDate:todayStr(),timeType:'exact',startTime:'14:00',endTime:'15:00',category:'学业事务',createdAt:new Date(2026,10,15,9,50).getTime(),baseScore:5,aiReason:'常规处理，细分依据不足',aiAdvice:'先确认材料，再开始执行。',note:'合成备注\\n保留第二行',images:[{data:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI2MCI+PHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjYwIiBmaWxsPSJvcmFuZ2UiLz48L3N2Zz4=',name:'合成橙色图片'}],links:['https://example.com'],finalScore:1.7,statusEditCount:0}];S.todos=[];S.dayStats={};\nDB.open=DB.put=DB.batch=()=>{throw Error('Synthetic preview blocks database writes')};\nApp.bind();UI.homeDate=todayStr();UI.planCursor=todayStr();UI.planView='day';UI.switchPage('home');\ndocument.querySelector('#sample-status').onchange=()=>{S.tasks[0].status=document.querySelector('#sample-status').value||null;UI.refreshActivePage();};";
http.createServer((req,res)=>{
 if(req.url==='/quick-score.mjs'){res.setHeader('Content-Type','text/javascript;charset=utf-8');return res.end(fs.readFileSync(path.join(root,'src/rules/quick-score.mjs')));}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 const original=fs.readFileSync(process.env.DETAIL_SOURCE||path.join(root,'index.html'),'utf8');
 if((original.match(/^App\.init\(\);$/gm)||[]).length!==1)throw Error('Expected exactly one app initialization to disable');
 const html=original.replace('<body>','<body>'+controls).replace(/^App\.init\(\);$/m,setup);
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data:; font-src 'none'");res.end(html);
}).listen(Number(process.env.PORT||4186),'127.0.0.1',function(){console.log('Synthetic notices: http://127.0.0.1:'+this.address().port+'/');});
