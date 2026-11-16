'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{createQuota}=require('../api/quota.cjs');
if(!process.argv.includes('--live'))throw Error('Use --live for the real cloud Redis check');
const config=parseEnv(fs.readFileSync(path.join(os.homedir(),'.config/juanjuan/v27/cloud.env'),'utf8'));
const prefix='v27-audit:'+crypto.randomUUID()+':',keys=new Set(),results=[];
let section=0;
const raw=async command=>{
 const r=await fetch(config.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+config.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});
 const data=await r.json();if(!r.ok||data.error)throw Error('Cloud Redis command failed; no credentials logged');return data.result;
};
const setup=()=>{
 const p=prefix+(++section)+':';
 const key=k=>{const v=k.startsWith(p)?k:p+k;keys.add(v);return v;};
 const redis=command=>{const c=[...command];if(c[0]==='EVAL'){for(let i=3;i<3+Number(c[2]);i++)c[i]=key(c[i]);}else c[1]=key(c[1]);return raw(c);};
 const quota=createQuota(redis),day='2026-11-16',now=Date.now();
 const request=(n,extra={})=>({device:'d'.repeat(32),id:n.toString(16).padStart(32,'0'),day,now,deviceLimit:50,globalLimit:100,...extra});
 const count=(scope,device='d'.repeat(32),date=day)=>redis(['ZCARD',scope==='global'?`quota:${date}:global`:`quota:${date}:device:${device}`]);
 return{redis,quota,request,count,now,day};
};
async function check(name,fn){await fn(setup());results.push(name);console.log('PASS '+name);}
(async()=>{try{
 await check('device 50 under concurrent requests',async a=>{const r=await Promise.all(Array.from({length:60},(_,i)=>a.quota.reserve(a.request(i+1))));assert.equal(r.filter(x=>x==='reserved').length,50);assert.equal(r.filter(x=>x==='device').length,10);assert.equal(await a.count('global'),50);});
 await check('global 100 across devices, without IP counter',async a=>{const r=await Promise.all(Array.from({length:110},(_,i)=>a.quota.reserve(a.request(i+1,{device:i.toString(16).padStart(32,'a')}))));assert.equal(r.filter(x=>x==='reserved').length,100);assert.equal(r.filter(x=>x==='global').length,10);assert.equal([...keys].some(k=>k.includes(':ip:')),false);});
 await check('duplicate request reserves once',async a=>{const r=await Promise.all(Array.from({length:8},()=>a.quota.reserve(a.request(1))));assert.equal(r.filter(x=>x==='reserved').length,1);assert.equal(await a.count('global'),1);});
 await check('failed requests release both counts once',async a=>{const r=a.request(1);await a.quota.reserve(r);for(let i=0;i<3;i++)await a.quota.finish(r.device,r.id,'failed');assert.equal(await a.count('global'),0);assert.equal(await a.count('device'),0);});
 await check('cancel before arrival blocks delayed admission',async a=>{const r=a.request(1);await a.quota.finish(r.device,r.id,'cancelled');assert.equal(await a.quota.reserve(r),'cancelled');assert.equal(await a.count('global'),0);});
 await check('cancelled late success cannot charge again',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.finish(r.device,r.id,'cancelled');assert.equal(await a.quota.finish(r.device,r.id,'success'),'released');assert.equal(await a.count('device'),0);});
 await check('expired lease cannot reclaim its count',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.reserve(a.request(2,{now:a.now+60001}));assert.equal(await a.quota.finish(r.device,r.id,'success',a.now+60002),'expired');assert.equal(await a.count('global'),1);});
 await check('midnight refund stays in original day',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.finish(r.device,r.id,'success',a.now+1);await a.quota.reserve(a.request(2,{day:'2026-11-17',now:a.now+86400000}));await a.quota.finish(r.device,r.id,'cancelled',a.now+86400001);assert.equal(await a.count('global'),0);assert.equal(await a.count('global',r.device,'2026-11-17'),1);});
 await check('another device cannot refund a receipt',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.finish('e'.repeat(32),r.id,'cancelled');assert.equal(await a.count('global'),1);});
 }finally{if(keys.size)await raw(['UNLINK',...keys]);}
 fs.mkdirSync(path.join(__dirname,'../.reports/v27'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../.reports/v27/cloud-redis.json'),JSON.stringify({kind:'real-cloud-redis',prefix,checks:results,cleaned_keys:keys.size,at:new Date().toISOString()},null,2));
})().catch(()=>{console.error('Cloud Redis verification failed; credentials and raw errors suppressed');process.exitCode=1;});
