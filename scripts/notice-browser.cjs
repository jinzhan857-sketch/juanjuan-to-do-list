'use strict';
// Render the actual home reminders in memory. No app init, database or network.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const controls='<aside style="padding:12px;background:white;color:black"><label>合成待确认数量 <select id="notice-count"><option>0</option><option selected>1</option><option>10</option><option>100</option></select></label> <label><input id="notice-large" type="checkbox">双倍字体</label><p>#62 合成验收，无数据库与网络。长正文为真实提醒全文。</p></aside>';
const setup=`
S.pet=defaultPet();S.pet.alive=true;S.pet.sick=false;S.pet.fridge=[];
function previewNotices(){
 S.tasks=Array.from({length:Number(document.querySelector('#notice-count').value)},(_,i)=>({id:String(i),execDate:'2020-01-01',timeType:'allday',baseScore:5}));
 UI.renderNotices();
 document.querySelectorAll('.notice').forEach(n=>n.style.fontSize=document.querySelector('#notice-large').checked?'25px':'12.5px');
}
document.querySelector('#notice-count').onchange=previewNotices;
document.querySelector('#notice-large').onchange=previewNotices;
previewNotices();`;
http.createServer((req,res)=>{
 if(req.url!=='/'){res.writeHead(404).end();return;}
 const original=fs.readFileSync(process.env.NOTICE_SOURCE||path.join(root,'index.html'),'utf8');
 const html=original.replace('<body>','<body>'+controls).replace(/^App\.init\(\);$/m,setup);
 res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"connect-src 'none'; img-src data:; font-src 'none'");res.end(html);
}).listen(Number(process.env.PORT||4184),'127.0.0.1',function(){console.log('Synthetic notices: http://127.0.0.1:'+this.address().port+'/');});
