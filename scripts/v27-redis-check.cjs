'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{createQuota,quotaKeys}=require('../api/quota.cjs');
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
 const request=(n,extra={})=>({device:'d'.repeat(32),id:n.toString(16).padStart(32,'0'),day,now,deviceLimit:300,dailyLimit:300,globalLimit:1000,...extra});
 const count=(scope,device='d'.repeat(32),date=day)=>redis(['ZCARD',quotaKeys({day:date,device})[scope==='global'?2:0]]);
 return{redis,quota,request,count,now,day};
};
const {newGrant}=require('./v27-experience.cjs'),{experience}=require('../api/experience.cjs');
async function createCard(a,total){const g=newGrant({label:'Synthetic audit',credits:total});await a.redis(['HSET','experience:grant:'+g.id,'hash',g.hash,'active','1','expires','0','total',String(total)]);return g;}
async function check(name,fn){await fn(setup());results.push(name);console.log('PASS '+name);}
(async()=>{try{
 await check('device 300 under concurrent requests',async a=>{for(const key of quotaKeys(a.request(1)).slice(0,2))await a.redis(['EVAL',"for i=1,299 do redis.call('ZADD',KEYS[1],ARGV[1],'synthetic-prior:'..i) end;return 1",1,key,String(a.now+777600000)]);const r=await Promise.all(Array.from({length:11},(_,i)=>a.quota.reserve(a.request(i+1))));assert.equal(r.filter(x=>x==='reserved').length,1);assert.equal(r.filter(x=>x==='device').length,10);assert.equal(await a.count('global'),1);});
 await check('global 1000 across devices, without IP counter',async a=>{await a.redis(['EVAL',"for i=1,999 do redis.call('ZADD',KEYS[1],ARGV[1],'synthetic-prior:'..i) end;return 1",1,quotaKeys(a.request(1))[2],String(a.now+777600000)]);const r=await Promise.all(Array.from({length:11},(_,i)=>a.quota.reserve(a.request(i+1,{device:i.toString(16).padStart(32,'a')}))));assert.equal(r.filter(x=>x==='reserved').length,1);assert.equal(r.filter(x=>x==='global').length,10);assert.equal([...keys].some(k=>k.includes(':ip:')),false);});
 await check('duplicate request reserves once',async a=>{const r=await Promise.all(Array.from({length:8},()=>a.quota.reserve(a.request(1))));assert.equal(r.filter(x=>x==='reserved').length,1);assert.equal(await a.count('global'),1);});
 await check('failed requests release both counts once',async a=>{const r=a.request(1);await a.quota.reserve(r);for(let i=0;i<3;i++)await a.quota.finish(r.device,r.id,'failed');assert.equal(await a.count('global'),0);assert.equal(await a.count('device'),0);});
 await check('cancel before arrival blocks delayed admission',async a=>{const r=a.request(1);await a.quota.finish(r.device,r.id,'cancelled');assert.equal(await a.quota.reserve(r),'cancelled');assert.equal(await a.count('global'),0);});
 await check('cancelled late success cannot charge again',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.finish(r.device,r.id,'cancelled');assert.equal(await a.quota.finish(r.device,r.id,'success'),'released');assert.equal(await a.count('device'),0);});
 await check('expired lease cannot reclaim its count',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.reserve(a.request(2,{now:a.now+60001}));assert.equal(await a.quota.finish(r.device,r.id,'success',a.now+60002),'expired');assert.equal(await a.count('global'),1);});
 await check('weekly refund remains in the original week',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.finish(r.device,r.id,'success',a.now+1);await a.quota.reserve(a.request(2,{day:'2026-11-23',now:a.now+7*86400000}));await a.quota.finish(r.device,r.id,'cancelled',a.now+7*86400000+1);assert.equal(await a.count('global'),0);assert.equal(await a.count('global',r.device,'2026-11-23'),1);});
 await check('another device cannot refund a receipt',async a=>{const r=a.request(1);await a.quota.reserve(r);await a.quota.finish('e'.repeat(32),r.id,'cancelled');assert.equal(await a.count('global'),1);});
 await check('one card binds to one device under concurrent redemption',async a=>{const g=await createCard(a,3);const rows=await Promise.all(['d'.repeat(32),'e'.repeat(32)].map(device=>experience(a.redis,g.code,device,'redeem',a.now)));assert.equal(rows.filter(r=>r.ok).length,1);assert.equal(rows.filter(r=>r.code==='experience_bound').length,1);});
 await check('lifetime credits are independent, never overdraw and failed or cancelled requests refund once',async a=>{const g=await createCard(a,2),info=await experience(a.redis,g.code,'d'.repeat(32),'redeem',a.now);const credit={id:info.id,total:info.total,hash:info.hash};const r=a.request(1,{credit});assert.equal(await a.quota.reserve(r),'reserved');assert.equal(await a.quota.finish(r.device,r.id,'success',a.now+1),'success');const rows=await Promise.all([2,3,4].map(n=>a.quota.reserve(a.request(n,{credit}))));assert.equal(rows.filter(x=>x==='reserved').length,1);assert.equal(rows.filter(x=>x==='credit').length,2);const n=rows.indexOf('reserved')+2;await a.quota.finish(r.device,a.request(n).id,'failed',a.now+2);assert.equal((await experience(a.redis,g.code,r.device,'check',a.now+3)).remaining,1);await a.quota.finish(r.device,r.id,'cancelled',a.now+4);await a.quota.finish(r.device,r.id,'cancelled',a.now+5);assert.equal((await experience(a.redis,g.code,r.device,'check',a.now+6)).remaining,2);assert.equal(await a.count('global'),0);});
 await check('manual rebinding and revocation preserve balance and reject stale authorization',async a=>{const g=await createCard(a,3),info=await experience(a.redis,g.code,'d'.repeat(32),'redeem',a.now);await a.redis(['HSET','experience:grant:'+g.id,'device','e'.repeat(32)]);assert.equal((await experience(a.redis,g.code,'d'.repeat(32),'check',a.now)).code,'experience_bound');const current=await experience(a.redis,g.code,'e'.repeat(32),'check',a.now);assert.equal(current.remaining,3);await a.redis(['HSET','experience:grant:'+g.id,'active','0']);assert.equal(await a.quota.reserve(a.request(1,{device:'e'.repeat(32),credit:current})),'experience_revoked');});
 await check('credit success is retained across weeks and has no expiry',async a=>{const g=await createCard(a,1),credit=await experience(a.redis,g.code,'d'.repeat(32),'redeem',a.now),r=a.request(1,{credit});await a.quota.reserve(r);await a.quota.finish(r.device,r.id,'success',a.now+1);assert.equal((await experience(a.redis,g.code,r.device,'check',a.now+15*86400000)).remaining,0);assert.equal(await a.redis(['TTL','quota-credit:'+g.id]),-1);});
 }finally{if(keys.size)await raw(['UNLINK',...keys]);}
 fs.mkdirSync(path.join(__dirname,'../.reports/v27'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../.reports/v27/weekly-card-redis.json'),JSON.stringify({kind:'real-cloud-redis',prefix,checks:results,cleaned_keys:keys.size,at:new Date().toISOString()},null,2));
})().catch(()=>{console.error('Cloud Redis verification failed; credentials and raw errors suppressed');process.exitCode=1;});
