'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const limits={requests:100,microCny:1000000};
function openBudget(directory=path.join(os.homedir(),'.config/juanjuan/v27')){
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'budget.json'),lock=path.join(directory,'budget.lock');
 const handle=fs.openSync(lock,'wx');let state;
 const save=()=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,file);};
 try{state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{issue:82,version:'2.7',limits,entries:[]};
  if(state.issue!==82||state.version!=='2.7'||JSON.stringify(state.limits)!==JSON.stringify(limits)||!Array.isArray(state.entries))throw Error('Invalid V2.7 budget ledger');
  for(const e of state.entries)if(!Number.isSafeInteger(e.maxRequests)||e.maxRequests<0||!Number.isSafeInteger(e.reservedMicroCny)||e.reservedMicroCny<0||!['unknown','complete'].includes(e.state))throw Error('Invalid V2.7 budget entry');
  save();
 }catch(e){fs.closeSync(handle);fs.unlinkSync(lock);throw e;}
 const totals=()=>state.entries.reduce((s,e)=>({requests:s.requests+(e.state==='complete'?e.requests:e.maxRequests),microCny:s.microCny+(e.state==='complete'?e.estimatedMicroCny:e.reservedMicroCny)}),{requests:0,microCny:0});
 return {state,totals,reserve(body){
  // The server excludes previous_materials from its compact model context and
  // selects at most 65536 UTF8 bytes below; do not count all saved pages twice.
  const input={...body};if(body.context){input.context={...body.context};delete input.context.previous_materials;}
  // Match the existing server history bound. The current message is included in
  // full separately; historical copies do not consume their full length again.
  if(Array.isArray(input.context?.history))input.context.history=input.context.history.slice(-12).map(item=>({...item,content:String(item.content||'').slice(0,500)}));
  const bytes=Buffer.byteLength(JSON.stringify(input));
  if(Buffer.byteLength(JSON.stringify(body))>1024*1024||bytes>32768||body.context?.selected_images?.length)throw Error('Live synthetic input exceeds budget boundary');
  // Two model calls, at most two Fetch and one Search. External text is capped at
  // 65536 UTF8 bytes. Model tokens cannot exceed UTF8 bytes plus framing reserve.
  // 2/8 CNY per million tokens and 0.005 CNY/tool are conservative price ceilings.
  const inputBytes=bytes+16000+65536+4096;
  const reservedMicroCny=2*(inputBytes*2+6000*8)+3*5000,maxRequests=5,total=totals();
  if(total.requests+maxRequests>limits.requests||total.microCny+reservedMicroCny>limits.microCny)throw Error('V2.7 test budget exhausted');
  const e={id:crypto.randomUUID(),state:'unknown',at:new Date().toISOString(),maxRequests,reservedMicroCny};state.entries.push(e);save();return e.id;
 },finish(id,usage){const e=state.entries.find(e=>e.id===id);if(!e||e.state!=='unknown')throw Error('Invalid receipt');
  if(!usage?.complete)return;
  for(const k of ['model_requests','search_requests','fetch_requests','prompt_tokens','completion_tokens'])if(!Number.isSafeInteger(usage[k])||usage[k]<0)throw Error('Invalid provider usage');
  const requests=usage.model_requests+usage.search_requests+usage.fetch_requests;
  const estimatedMicroCny=usage.prompt_tokens*2+usage.completion_tokens*8+(usage.search_requests+usage.fetch_requests)*5000;
  if(requests>e.maxRequests||estimatedMicroCny>e.reservedMicroCny)throw Error('Provider usage exceeded the reservation');
  Object.assign(e,{state:'complete',requests,estimatedMicroCny,usage});save();
 },close(){fs.closeSync(handle);fs.unlinkSync(lock);}};
}
module.exports={openBudget,limits};
