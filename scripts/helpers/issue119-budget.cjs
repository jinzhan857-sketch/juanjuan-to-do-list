'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const directory=path.join(os.homedir(),'.config','juanjuan','issue119');
function openBudget(root=directory,{initialize=false}={}){
 fs.mkdirSync(root,{recursive:true});
 const file=path.join(root,'budget.json'),lock=path.join(root,'budget.lock');
 const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));let state;
 const save=()=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,file);};
 try{if(fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));else{if(!initialize)throw Error('Missing budget ledger');state={issue:119,limits:{attempts:100,microCny:10000000},attempts:[]};save();}
 if(state.issue!==119||state.limits.attempts!==100||state.limits.microCny!==10000000||!Array.isArray(state.attempts))throw Error('Invalid budget ledger');
 }catch(error){fs.closeSync(fd);fs.unlinkSync(lock);throw error;}
 const cost=()=>state.attempts.reduce((n,a)=>n+Math.max(a.reservedMicroCny,a.actualMicroCny||0),0);
 return {state,reserve(kind){if(!['model','search','fetch'].includes(kind))throw Error('Invalid request kind');const amount=kind==='model'?200000:5000;if(state.attempts.length>=100||cost()+amount>10000000)throw Error('Budget exhausted');const a={id:crypto.randomUUID(),kind,reservedMicroCny:amount,status:'unknown',at:new Date().toISOString()};state.attempts.push(a);save();return a.id;},finish(id,result){const a=state.attempts.find(a=>a.id===id);if(!a||a.status!=='unknown')throw Error('Attempt already finalized or unknown');a.http_status=result.status;a.usage=result.usage;if(result.usage&&a.kind==='model'){const u=result.usage;if(!Number.isFinite(u.prompt_tokens)||!Number.isFinite(u.completion_tokens)||u.prompt_tokens<0||u.completion_tokens<0)throw Error('Invalid usage');a.actualMicroCny=Math.ceil(u.prompt_tokens*2+u.completion_tokens*8);}a.status='response';save();if(cost()>10000000||a.actualMicroCny>a.reservedMicroCny)throw Error('Usage exceeded reservation');},close(){fs.closeSync(fd);fs.unlinkSync(lock);}};
}
module.exports={openBudget,directory};
