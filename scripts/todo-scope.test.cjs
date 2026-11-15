'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {IDBFactory}=require('fake-indexeddb');
async function fixture(t,kind='todo'){
 const elements=new Map(),notices=[],storage=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{value:'',disabled:false,textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},children:[],appendChild(x){this.children.push(x)},set innerHTML(v){this.children=[]},get innerHTML(){return ''}});return elements.get(key)};
 const ctx=vm.createContext({console,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,indexedDB:new IDBFactory(),document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>element(Math.random())},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}});
 const html=fs.readFileSync(process.env.ISSUE65_SOURCE||path.join(__dirname,'../index.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=code=>vm.runInContext(code,ctx),json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
 ctx.scoring=await import('../src/rules/quick-score.mjs');ctx.notices=notices;
 run("toast=s=>notices.push(s);UI.loadScoring=async()=>scoring;S.pet=defaultPet();S.tasks=[];S.todos=[];S.dayStats={};actualRender=UI.renderCreate;UI.renderCreate=()=>{};UI.switchPage=()=>{};UI.renderAIResultVague=()=>{};UI.resetCreate("+JSON.stringify(kind)+");");
 await run('DB.open()');t.after(()=>run('DB._db.close()'));
 element('#c-title').value='买跑步鞋 https://example.com';
 run("UI.cState.resultTitle='买跑步鞋';UI.cState.resultNote='资料 https://example.com';UI.cState.images=[{id:'pic',name:'合成',data:'data:image/png;base64,AA=='}]");
 const snapshot=async()=>JSON.parse(JSON.stringify(await run("DB.snapshot(['tasks','todos','kv'])")));
 run("UI.todoCard=t=>({id:t.id});PetView.celebrate=()=>{};UI.confirm=(title,body,ok)=>confirmOK=ok");
 const view=(scope,filter)=>{ctx.scope=scope;ctx.filter=filter;run('UI.todoScope=scope;UI.todoFilter=filter;UI.renderTodos()');return {all:Number(element('#todo-all').textContent),open:Number(element('#todo-open').textContent),done:Number(element('#todo-done').textContent),ids:element('#todo-list').children.map(x=>x.id)};};
 return {ctx,run,json,element,notices,snapshot,view};
}

const cases={empty:[],open:[false,false],done:[true,true],mixed:[false,true,false]};
for(const scope of ['near','long'])for(const [name,statuses] of Object.entries(cases))for(const filter of ['all','open','done'])test('#65 '+scope+' '+name+' '+filter+' counts match scoped records',async t=>{
 const a=await fixture(t),period=scope==='near'?'week':'quarter';
 a.ctx.rows=[...statuses.map((done,index)=>({id:'shown'+index,period,done,createdAt:index})),{id:'elsewhere-open',period:scope==='near'?'year':'month',done:false,createdAt:0},{id:'elsewhere-done',period:scope==='near'?'quarter':'week',done:true,createdAt:0}];a.run('S.todos=rows');
 const before=a.json('S.todos'),pet=a.json('S.pet'),stats=a.json('S.dayStats');
 for(let repeat=0;repeat<2;repeat++){
  const v=a.view(scope,filter),done=statuses.filter(Boolean).length;
  assert.deepEqual({all:v.all,open:v.open,done:v.done},{all:statuses.length,open:statuses.length-done,done});
  assert.deepEqual(v.ids.slice().sort(),statuses.flatMap((done,i)=>filter==='all'||filter==='done'&&done||filter==='open'&&!done?['shown'+i]:[]).sort());
 }
 assert.deepEqual(a.json('S.todos'),before);assert.deepEqual(a.json('S.pet'),pet);assert.deepEqual(a.json('S.dayStats'),stats);
});
test('#65 all existing period values retain membership and counts across scope switches',async t=>{
 const a=await fixture(t);a.ctx.rows=[{id:'week',period:'week'},{id:'month',period:'month',done:true},{id:'quarter',period:'quarter'},{id:'year',period:'year',done:true},{id:'omitted'},{id:'empty',period:''},{id:'unknown',period:'other'}];a.run('S.todos=rows');
 for(let n=0;n<3;n++){
  assert.deepEqual(a.view('near','all'),{all:4,open:3,done:1,ids:['week','omitted','empty','month']});
  assert.deepEqual(a.view('long','all'),{all:2,open:1,done:1,ids:['quarter','year']});
 }
});
test('#65 create, edit period, complete, delete and reopen reflect persisted records',async t=>{
 const a=await fixture(t);a.run("UI.cState.period='quarter'");await a.run('UI.onSave()');
 assert.deepEqual(a.view('near','all'),{all:0,open:0,done:0,ids:[]});assert.equal(a.view('long','open').open,1);
 a.run("savedID=S.todos[0].id;UI.openTodoEditor(savedID);UI.cState.period='month'");await a.run('UI.onSave()');
 assert.equal(a.view('long','all').all,0);assert.equal(a.view('near','open').open,1);
 a.run('UI.completeTodo(savedID)');await a.run('confirmOK()');
 assert.equal(a.view('near','open').open,0);assert.equal(a.view('near','open').ids.length,0);assert.equal(a.view('near','done').done,1);
 const pet=a.json('S.pet'),stats=a.json('S.dayStats');
 a.run('DB._db.close()');await a.run('DB.open()');await a.run("(async()=>{S.todos=await DB.all('todos')})()");
 assert.equal(a.view('near','done').ids.length,1);assert.equal(a.view('long','all').all,0);
 assert.deepEqual(a.json('S.pet'),pet);assert.deepEqual(a.json('S.dayStats'),stats);
 await a.run('removeTodo(savedID)');assert.deepEqual(a.view('near','all'),{all:0,open:0,done:0,ids:[]});assert.equal((await a.snapshot()).todos.length,0);
});
