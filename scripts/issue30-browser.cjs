'use strict';
const fs=require('fs'),http=require('http'),path=require('path');
const source=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,'');
const setup=require('./helpers/storage-fixture.cjs');
const checks=`document.querySelector('button').onclick=async()=>{
 const out=document.querySelector('pre');out.textContent='';let count=0;
 const check=(name,ok)=>{if(!ok)throw Error(name);count++;out.textContent+='通过：'+name+'\\n';};
 try{
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=()=>open('juanjuan-issue30-synthetic',3);await DB.open();
 const snapshot=()=>DB.snapshot([...DATA_STORES,'kv']);
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 for(const kind of ['update_schedule','update_schedule_batch'])for(const item of [{title:''},{title:'   '},{base_score:999},{base_score:-1},{time_type:'invalid'},{time_type:null},{time_type:'slot',slot:'invalid'},{slot:'invalid'},{start_time:'bad'},{end_time:'09:00'},{note:'仅改备注'},{base_score:4.5},{start_time:'10:15'},{end_time:'11:15'},{time_type:'exact',start_time:'10:15'}]){
 ${setup}
 action=kind==='update_schedule'?{kind,target_id:'a',item}:{...action,item};UI.captureAgentScope(action);S.messages[0].meta.action=action;
 await DB.batch([...DATA_STORES,'kv'].map(store=>({store,type:'clear'})).concat(DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),DATA_KV.map(key=>({store:'kv',key,value:S[key]}))));
 const before=await snapshot(),valid=['note','base_score','start_time','end_time'].includes(Object.keys(item)[0])&&Object.values(item)[0]!=='bad'&&Object.values(item)[0]!=='09:00'&&item.base_score!==999&&item.base_score!==-1||item.time_type==='exact';
 let rejected=false;try{await UI.executeAgentAction(action,S.messages[0]);}catch(error){rejected=true;}
 const after=await snapshot();
 if(!valid)check(kind+'拒绝'+JSON.stringify(item),rejected&&same(before,after));
 else{
 if(rejected)throw Error('合法修改被拒绝');
 for(const old of before.tasks){const actual=after.tasks.find(t=>t.id===old.id);const expected=copyData(old);if(old.id==='a'||kind.endsWith('_batch')&&old.id==='b'){expected.isBackfill=dayDiff(old.execDate,todayStr())<0;for(const [key,value]of Object.entries(item))expected[({base_score:'baseScore',start_time:'startTime',end_time:'endTime',time_type:'timeType'})[key]||key]=value;if(item.time_type)expected.slot=null;}if(!same(actual,expected))throw Error('字段不符'+old.id);}
 check(kind+'部分修改'+JSON.stringify(item),['todos','kv','chats','memories'].every(k=>same(before[k],after[k]))&&after.operations.length===1);
 }
 const final=await snapshot();DB._db.close();await DB.open();if(!same(final,await snapshot()))throw Error('重开不一致');
 }
 out.textContent+='全部 '+count+' 项通过，仅合成资料，未调用模型。';
 }catch(error){out.textContent+='失败：'+error.stack;}
};`;
const html='<!doctype html><meta charset="utf-8"><title>卷卷 #30 校验验收</title><h1>卷卷 #30 校验验收</h1><button>运行检查</button><pre>等待运行</pre><script>'+source+'</script><script>'+checks+'</script>';
http.createServer((req,res)=>{if(req.url!=='/')return res.writeHead(404).end();res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'");res.end(html)}).listen(4188,'127.0.0.1',()=>console.log('http://127.0.0.1:4188/'));
