'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const html=fs.readFileSync(process.env.NOTICE_SOURCE||path.join(__dirname,'../index.html'),'utf8');
 const area={set innerHTML(value){this.children=[];},children:[],appendChild(n){this.children.push(n);}};
 const ctx=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone,document:{querySelector:()=>area,createElement:()=>({style:{},querySelector:()=>({})})}});
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
test('repeated rendering replaces the previous count and removes cleared reminders',()=>{
 const a=fixture();
 for(const count of [1,100,10,0,1,0]){
  a.run(`S.tasks=Array.from({length:${count}},(_,i)=>({id:String(i),execDate:'2020-01-01',timeType:'allday'}));UI.renderNotices()`);
  assert.equal(a.area.children.length,count?1:0);
  if(count)assert.match(a.area.children[0].innerHTML,new RegExp('<b>'+count+'</b>'));
 }
});
test('all settled statuses remain excluded while missing and null statuses remain pending',()=>{
 const a=fixture();a.run("S.tasks=CONFIG.STATUS.map(({key:status})=>({status,execDate:'2020-01-01',timeType:'allday'}));S.tasks.push({execDate:'2020-01-01',timeType:'allday'},{status:null,execDate:'2020-01-01',timeType:'allday'});UI.renderNotices()");
 assert.equal(a.area.children.length,1);assert.match(a.area.children[0].innerHTML,/<b>2<\/b>/);
});
test('sick and hungry notices coexist with pending reminder and keep feeding action',()=>{
 const a=fixture();a.run("S.pet.sick=true;S.pet.satietyTask=1;S.pet.todayIntake=0;S.pet.fridge=[{}];S.tasks=[{execDate:'2020-01-01',timeType:'allday'}];before=JSON.stringify(S);UI.renderNotices()");
 assert.equal(a.area.children.length,3);
 assert.match(a.area.children[0].innerHTML,/卷卷生病了/);
 assert.match(a.area.children[1].innerHTML,/冰箱里有 1 份存粮/);
 assert.equal(typeof a.area.children[1].onclick,'function');
 assert.match(a.area.children[2].innerHTML,/<b>1<\/b>/);
 assert.equal(a.run('JSON.stringify(S)===before'),true);
});
test('pet departure retains original precedence over pending reminder',()=>{
 const a=fixture();a.run("S.pet.alive=false;S.tasks=[{execDate:'2020-01-01',timeType:'allday'}];UI.renderNotices()");
 assert.equal(a.area.children.length,1);assert.match(a.area.children[0].innerHTML,/重新领养/);assert.doesNotMatch(a.area.children[0].innerHTML,/notice-body/);
});
test('deadline boundary and settled tasks keep original reminder eligibility',()=>{
 const a=fixture();a.run("Date.now=()=>new Date(2026,10,15,12).getTime();S.tasks=[{id:'past',execDate:'2026-11-15',timeType:'exact',startTime:'10:00',endTime:'11:59'},{id:'equal',execDate:'2026-11-15',timeType:'exact',startTime:'10:00',endTime:'12:00'},{id:'future',execDate:'2026-11-15',timeType:'exact',startTime:'10:00',endTime:'12:01'},{id:'settled',execDate:'2026-11-14',timeType:'allday',status:'done'}];UI.renderNotices()");
 assert.equal(a.area.children.length,1);assert.match(a.area.children[0].innerHTML,/<b>1<\/b>/);
});
test('all day and evening slot deadlines remain pending only after midnight',()=>{
 const a=fixture();a.run("S.tasks=[{execDate:'2026-11-15',timeType:'allday'},{execDate:'2026-11-15',timeType:'slot',slot:'evening'}];Date.now=()=>new Date(2026,10,16).getTime();UI.renderNotices()");
 assert.equal(a.area.children.length,0);
 a.run('Date.now=()=>new Date(2026,10,16).getTime()+1;UI.renderNotices()');
 assert.equal(a.area.children.length,1);assert.match(a.area.children[0].innerHTML,/<b>2<\/b>/);
});
test('rendering does not change overdue scoring across 24 hour boundary',()=>{
 const a=fixture();a.run("task={id:'score',execDate:'2026-11-14',timeType:'exact',startTime:'10:00',endTime:'12:00',baseScore:5};S.tasks=[task];times=[24*3600000-1,24*3600000,24*3600000+1,48*3600000,168*3600000].map(d=>taskDeadline(task)+d);scores=JSON.stringify(times.map(t=>ScoreEngine.overdue(task,t)));UI.renderNotices()");
 assert.equal(a.run('JSON.stringify(times.map(t=>ScoreEngine.overdue(task,t)))===scores'),true);
 assert.deepEqual(JSON.parse(a.run('JSON.stringify(times.map(t=>ScoreEngine.overdue(task,t)?.coef??null))')),[null,null,0.5,0.5,0.25]);
});
