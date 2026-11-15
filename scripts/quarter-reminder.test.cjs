'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.env.QUARTER_SOURCE||'index.html','utf8');
function view(date,scope='long',todos=[{period:'quarter',done:false}]){
 const elements=new Map();const el=k=>{if(!elements.has(k))elements.set(k,{style:{},textContent:'',innerHTML:'',appendChild(){}});return elements.get(k)};
 const ctx=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,document:{querySelector:el,querySelectorAll:()=>[]}});
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 ctx.rows=todos;ctx.date=date;ctx.scope=scope;
 vm.runInContext(`NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[date+'T12:00:00']))}};S.todos=rows;S.pet=defaultPet();UI.todoScope=scope;UI.todoFilter='all';UI.todoCard=t=>({});DB.put=DB.batch=()=>{throw Error('unexpected write')};before=JSON.stringify(S);UI.renderTodos();if(before!==JSON.stringify(S))throw Error('state changed')`,ctx);
 return el('#todo-long-alert');
}
for(const year of [2024,2026])for(const [before,start,end,q] of [['02-'+(year===2024?'29':'28'),'03-01','03-31',1],['05-31','06-01','06-30',2],['08-31','09-01','09-30',3],['11-30','12-01','12-31',4]]){
 for(const [day,expected] of [[before,false],[start,true],[end,true]])test(year+'-'+day+' quarter boundary',()=>{const v=view(year+'-'+day);assert.equal(v.style.display,expected?'block':'none');if(expected)assert.match(v.textContent,new RegExp('第 '+q+' 季度'));});
}
for(const date of ['2026-01-01','2026-04-01','2026-07-01','2026-10-01','2026-11-15'])test(date+' does not remind early',()=>assert.equal(view(date).style.display,'none'));
for(const [scope,rows] of [['near',[{period:'quarter'}]],['long',[]],['long',[{period:'quarter',done:true}]],['long',[{period:'month'}]]])test('eligibility '+scope+JSON.stringify(rows),()=>assert.equal(view('2026-12-01',scope,rows).style.display,'none'));
for(const [date,expected] of [['2026-09-30',false],['2026-10-01',true],['2026-11-15',true],['2026-12-01',true]])test('annual unchanged '+date,()=>{const v=view(date,'long',[{period:'year'}]);assert.equal(v.style.display,expected?'block':'none');assert.doesNotMatch(v.textContent,/季度/);if(expected)assert.match(v.textContent,new RegExp('只剩 '+(12-Number(date.slice(5,7)))+' 个月'));});
test('both reminders coexist independently',()=>{const v=view('2026-12-01','long',[{period:'quarter'},{period:'year'}]);assert.match(v.textContent,/季度/);assert.match(v.textContent,/年度/)});
