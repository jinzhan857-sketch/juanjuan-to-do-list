'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const html=fs.readFileSync(process.env.NOTICE_SOURCE||path.join(__dirname,'../index.html'),'utf8');
 const area={innerHTML:'',children:[],appendChild(n){this.children.push(n);}};
 const ctx=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone,document:{querySelector:()=>area,createElement:()=>({})}});
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=code=>vm.runInContext(code,ctx);
 run("S.pet=defaultPet();S.pet.alive=true;S.pet.sick=false;S.pet.fridge=[];S.tasks=[];S.dayStats={};DB.put=()=>{throw Error('unexpected write')};DB.batch=()=>{throw Error('unexpected write')}");
 return {run,area};
}
for(const count of [0,1,10,100])test('pending reminder count '+count+' keeps number inside one text body without state changes',()=>{
 const a=fixture();a.run(`S.tasks=Array.from({length:${count}},(_,i)=>({id:String(i),execDate:'2020-01-01',timeType:'allday',baseScore:5}));before=JSON.stringify(S);UI.renderNotices()`);
 assert.equal(a.run('JSON.stringify(S)===before'),true);
 assert.equal(a.area.children.length,count?1:0);
 if(count)assert.match(a.area.children[0].innerHTML,new RegExp('<span class="notice-icon" aria-hidden="true">⏰</span><span class="notice-body">有 <b>'+count+'</b> 个任务已过时间待确认状态，超 24 小时确认会扣分哦！</span>'));
});
test('deadline boundary and settled tasks keep original reminder eligibility',()=>{
 const a=fixture();a.run("Date.now=()=>new Date(2026,10,15,12).getTime();S.tasks=[{id:'past',execDate:'2026-11-15',timeType:'exact',startTime:'10:00',endTime:'11:59'},{id:'equal',execDate:'2026-11-15',timeType:'exact',startTime:'10:00',endTime:'12:00'},{id:'future',execDate:'2026-11-15',timeType:'exact',startTime:'10:00',endTime:'12:01'},{id:'settled',execDate:'2026-11-14',timeType:'allday',status:'done'}];UI.renderNotices()");
 assert.equal(a.area.children.length,1);assert.match(a.area.children[0].innerHTML,/<b>1<\/b>/);
});
test('rendering does not change overdue scoring across 24 hour boundary',()=>{
 const a=fixture();a.run("task={id:'score',execDate:'2026-11-14',timeType:'exact',startTime:'10:00',endTime:'12:00',baseScore:5};S.tasks=[task];times=[24*3600000-1,24*3600000,24*3600000+1,48*3600000,168*3600000].map(d=>taskDeadline(task)+d);scores=JSON.stringify(times.map(t=>ScoreEngine.overdue(task,t)));UI.renderNotices()");
 assert.equal(a.run('JSON.stringify(times.map(t=>ScoreEngine.overdue(task,t)))===scores'),true);
 assert.deepEqual(JSON.parse(a.run('JSON.stringify(times.map(t=>ScoreEngine.overdue(task,t)?.coef??null))')),[null,null,0.5,0.5,0.25]);
});
