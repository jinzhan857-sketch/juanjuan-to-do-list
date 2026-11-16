'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {loadAIEnvironment}=require('../ai-config.cjs');
const ledger=path.join(os.homedir(),'.config/juanjuan/test-runs/issue115-assistant-workflow.json');
const endpoint='https://api.deepseek.com/chat/completions';
async function withBudget(work){
 const remote=require('node:child_process').execFileSync('git',['remote','get-url','origin'],{encoding:'utf8'});if(!/jinzhan857-sketch\/juanjuan-to-do-list(?:\.git)?\s*$/.test(remote))throw Error('Wrong repository');
 loadAIEnvironment();const key=process.env.DEEPSEEK_API_KEY;if(!key)throw Error('Missing configured key');
 const lock=ledger+'.lock',fd=fs.openSync(lock,'wx');
 try{
  const state=JSON.parse(fs.readFileSync(ledger,'utf8'));
  if(state.session!=='issue115-assistant-workflow'||state.limits.calls!==500||state.limits.budget_cny!==15)throw Error('Ledger mismatch');
  const save=()=>{const tmp=ledger+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,ledger);};
  const source=crypto.createHash('sha256').update(fs.readFileSync('index.html')).update(fs.readFileSync('api/ai.js')).update(fs.readFileSync('src/assistant/workflow.js')).digest('hex');
  async function request(url,options){
   if(String(url)!==endpoint||options.method!=='POST'||options.headers.Authorization!==`Bearer ${key}`)throw Error('Unexpected destination');
   const body=JSON.parse(options.body);body.model='deepseek-flash';
   if(!Number.isInteger(body.max_tokens)||body.max_tokens>6000||Buffer.byteLength(JSON.stringify(body.messages))>100000)throw Error('Request exceeds reviewed reservation limits');
   const reserve=(Buffer.byteLength(JSON.stringify(body.messages))*2.4+body.max_tokens*9.6+10000)/1e6;
   const committed=state.attempts.reduce((n,a)=>n+(a.estimated_cny_at_peak??a.reserved_cny),0);
   if(state.attempts.length>=500||committed+reserve>15)throw Error('Budget exhausted');
   const attempt={number:state.attempts.length+1,status:'reserved',reserved_cny:reserve,source,started_at:new Date().toISOString()};state.attempts.push(attempt);state.reserved_cny=committed+reserve;save();
   try{
    const response=await fetch(endpoint,{...options,body:JSON.stringify(body),redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
    const payload=await response.clone().json();if(JSON.stringify(payload).includes(key))throw Error('Sensitive output');
    attempt.http_status=response.status;attempt.usage=payload.usage;attempt.finish_reason=payload.choices?.[0]?.finish_reason;
    if(Number.isFinite(payload.usage?.prompt_tokens)&&Number.isFinite(payload.usage?.completion_tokens))attempt.estimated_cny_at_peak=(payload.usage.prompt_tokens*2.4+payload.usage.completion_tokens*9.6)/1e6;
    attempt.status='response';return response;
   }catch(error){attempt.status='failed_or_unknown';throw Error('Real request failed; reservation retained');}
   finally{state.reserved_cny=state.attempts.reduce((n,a)=>n+(a.estimated_cny_at_peak??a.reserved_cny),0);save();}
  }
  await work({key,source,request,state,save,endpoint});
  console.log(JSON.stringify({cumulative_calls:state.attempts.length,estimated_or_reserved_cny:state.reserved_cny}));
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={withBudget};
