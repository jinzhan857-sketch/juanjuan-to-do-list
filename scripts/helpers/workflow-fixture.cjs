'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const workflow=require('../../src/assistant/workflow.js');
async function createWorkflowFixture(date='2026-11-16'){
 class Clock extends Date{constructor(...args){super(...(args.length?args:[date+'T10:00:00+08:00']))}static now(){return new Date(date+'T10:00:00+08:00').getTime()}}
 const ctx=vm.createContext({Date:Clock,JuanjuanWorkflow:workflow,crypto:require('node:crypto').webcrypto,console,URL,AbortController,DOMException,setTimeout,clearTimeout,structuredClone,indexedDB:new IDBFactory()});
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=code=>vm.runInContext(code,ctx),json=expr=>JSON.parse(run('JSON.stringify('+expr+')'));
 await run('DB.open()');
 run("S.tasks=[];S.todos=[];S.messages=[];S.operations=[];S.memories=[];S.chats=[{id:'chat',title:'合成聊天'}];S.pet=defaultPet();S.dayStats={};UI.agentChatId='chat';UI.renderAgent=()=>{};UI.switchPage=()=>{};toast=()=>{};");
 await run("DB.batch([{store:'chats',value:S.chats[0]},...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))])");
 return {ctx,run,json,close:()=>run('DB._db.close()'),cards:()=>json("UI.assistantCandidateContext('chat')"),apply:async(result,content='',seen)=>{ctx.answer=result;ctx.input=content;ctx.seen=seen;return run("UI.applyAssistantWorkflow(answer,'chat',input,seen)");},confirm:async(ids)=>{ctx.refs=ids||json("UI.assistantCurrentCards().filter(m=>m.meta.status==='pending').map(m=>({id:m.id,version:m.meta.workflow.version}))");return run('UI.confirmAgentSelection(refs)');},snapshot:()=>run('DB.snapshot(DATA_STORES)')};
}
module.exports={createWorkflowFixture};
