'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');const {quotaOracle}=require('./quota-oracle.cjs');
function handlerFixture({quota,model,redis,now=Date.parse('2026-11-15T10:00:00+08:00')}={}){
 const commands=[],values=new Map(),expiry=new Map(),clock={now},models=[];
 const ledger=quota||quotaOracle({commands,values,expiry,now:()=>clock.now});let serial=0;
 const apiPath=path.join(__dirname,'../../api/ai.js'),baseRequire=createRequire(apiPath);
 const a={commands,values,expiry,clock,models,quota:ledger,model:model|| (async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"task":"合成课程","base_score":3}'}}]})}))};
 const context=vm.createContext({require:name=>name==='./quota.cjs'?{createQuota:()=>ledger}:baseRequire(name),module:{exports:{}},process:{env:{KV_REST_API_URL:'https://redis.invalid',KV_REST_API_TOKEN:'synthetic',RATE_LIMIT_SALT:'synthetic',DEEPSEEK_API_KEY:'synthetic',OWNER_STATS_TOKEN:'synthetic'}},AbortController,DOMException,setTimeout,clearTimeout,URL,console,Date:class extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}},fetch:async(url,options)=>{if(String(url).includes('redis.invalid')){const c=JSON.parse(options.body);if(redis)return {ok:true,json:async()=>({result:await redis(c)})};commands.push(c);let result=1;if(c[0]==='GET')result=values.get(c[1])||0;else if(c[0]==='PFADD'){if(!values.has(c[1]))values.set(c[1],new Set());values.get(c[1]).add(c[2]);}else if(c[0]==='PFCOUNT')result=values.get(c[1])?.size||0;else if(c[0]==='INCR'){result=(values.get(c[1])||0)+1;values.set(c[1],result);}else if(c[0]==='EXPIRE')expiry.set(c[1],clock.now+Number(c[2])*1000);return {ok:true,json:async()=>({result})};}models.push(JSON.parse(options.body));return a.model(url,options);}});
 vm.runInContext(fs.readFileSync(apiPath,'utf8'),context);a.context=context;
 a.send=async(body={},options={})=>{let code,payload;await context.module.exports({method:'POST',headers:{'x-forwarded-for':'192.0.2.38'},body:{title:'合成课程',device_id:'a'.repeat(32),request_id:(++serial).toString(16).padStart(32,'0'),...body},...options},{status(n){code=n;return this},json(v){if(a.onResponse)a.onResponse(code,v);payload=JSON.parse(JSON.stringify(v))}});return {code,payload};};
 return a;
}
module.exports={handlerFixture};
