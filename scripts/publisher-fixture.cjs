'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {IDBFactory}=require('fake-indexeddb');
async function fixture(t,kind='schedule'){
 const elements=new Map(),notices=[],storage=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{value:'',disabled:false,textContent:'',style:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn},classList:{add(){},remove(){},toggle(){}},children:[],appendChild(x){this.children.push(x)},set innerHTML(v){this.children=[]},get innerHTML(){return ''}});return elements.get(key)};
 const ctx=vm.createContext({console,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,indexedDB:new IDBFactory(),document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>element(Math.random())},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}});
 const html=fs.readFileSync(process.env.PUBLISH_SOURCE||path.join(__dirname,'../index.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=code=>vm.runInContext(code,ctx),json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
 ctx.scoring=await import('../src/rules/quick-score.mjs');ctx.notices=notices;
 run("toast=s=>notices.push(s);UI.loadScoring=async()=>scoring;S.pet=defaultPet();S.tasks=[];S.todos=[];S.dayStats={};actualRender=UI.renderCreate;UI.renderCreate=()=>{};UI.switchPage=()=>{};UI.renderAIResultVague=()=>{};UI.resetCreate("+JSON.stringify(kind)+");");
 await run('DB.open()');t.after(()=>run('DB._db.close()'));
 element('#c-title').value='买跑步鞋 https://example.com';
 run("UI.cState.resultTitle='买跑步鞋';UI.cState.resultNote='资料 https://example.com';UI.cState.images=[{id:'pic',name:'合成',data:'data:image/png;base64,AA=='}]");
 const snapshot=async()=>JSON.parse(JSON.stringify(await run("DB.snapshot(['tasks','todos','kv'])")));
 return {ctx,run,json,element,notices,snapshot};
}
module.exports={fixture};
