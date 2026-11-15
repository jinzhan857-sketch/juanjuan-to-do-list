'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {IDBFactory}=require('fake-indexeddb');
async function fixture(t,kind='schedule'){
 const elements=new Map(),notices=[],storage=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{value:'',disabled:false,textContent:'',style:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn},classList:{add(){},remove(){},toggle(){},contains(){return false}},children:[],appendChild(x){this.children.push(x)},set innerHTML(v){this.children=[]},get innerHTML(){return ''}});return elements.get(key)};
 const visualViewport=Object.assign(new EventTarget(),{height:800,width:1200,offsetTop:0,pageTop:0,scale:1});
 const window=Object.assign(new EventTarget(),{innerHeight:800,screen:{height:900},visualViewport});
 const classes=new Set();
 const ctx=vm.createContext({window,crypto:require('node:crypto').webcrypto,console,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,indexedDB:new IDBFactory(),document:{activeElement:null,body:{classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k)},contains:k=>classes.has(k)}},addEventListener(){},querySelector:element,querySelectorAll:()=>[],createElement:()=>element(Math.random())},localStorage:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}});
 const html=fs.readFileSync(process.env.PUBLISH_SOURCE||path.join(__dirname,'../index.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=code=>vm.runInContext(code,ctx),json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
 ctx.scoring=await import('../src/rules/quick-score.mjs');ctx.notices=notices;
 run("toast=s=>notices.push(s);UI.loadScoring=async()=>scoring;S.pet=defaultPet();S.tasks=[];S.todos=[];S.dayStats={};actualRender=UI.renderCreate;UI.renderCreate=()=>{};UI.switchPage=()=>{};UI.renderAIResultVague=()=>{};UI.resetCreate("+JSON.stringify(kind)+");");
 await run("DB.open()");await run("DB.put('kv',S.pet,'pet')");t.after(()=>run('DB._db.close()'));
 element('#c-title').value='买跑步鞋 https://example.com';
 run("UI.cState.resultTitle='买跑步鞋';UI.cState.resultNote='资料 https://example.com';UI.cState.images=[{id:'pic',name:'合成',data:'data:image/png;base64,AA=='}]");
 const snapshot=async()=>JSON.parse(JSON.stringify(await run("DB.snapshot(['tasks','todos','kv'])")));
 const waitFor=async expression=>{for(let i=0;i<1000;i++){if(run(expression))return;await new Promise(setImmediate)}throw Error('Synthetic condition did not become ready: '+expression)};
 return {ctx,run,json,element,notices,snapshot,waitFor};
}
module.exports={fixture};
