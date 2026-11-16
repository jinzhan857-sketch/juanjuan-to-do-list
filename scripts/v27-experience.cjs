'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {parseEnv}=require('node:util'),{digest}=require('../api/experience.cjs'),{weekStart}=require('../api/quota.cjs');
function newGrant({label,credits=500,days=0},now=Date.now()){
 if(typeof label!=='string'||!label.trim()||label.length>80||!Number.isInteger(credits)||credits<1||credits>1000000||!Number.isInteger(days)||days<0||days>365)throw Error('Invalid grant settings');
 const id=crypto.randomBytes(12).toString('hex'),secret=crypto.randomBytes(16).toString('hex');
 return {id,label:label.trim(),total:credits,expires:days?now+days*86400000:0,hash:digest(secret),code:`JJ-${id}-${secret}`};
}
async function run(argv=process.argv.slice(2)){
 if(!argv.includes('--apply'))throw Error('Use --apply to create, revoke or reset a grant');
 const remote=cp.execFileSync('git',['remote','get-url','origin'],{encoding:'utf8',cwd:path.join(__dirname,'..')});
 if(!remote.includes('jinzhan857-sketch/juanjuan-to-do-list'))throw Error('Wrong repository');
 const cfg=parseEnv(fs.readFileSync(path.join(os.homedir(),'.config/juanjuan/v27/cloud.env'),'utf8'));
 async function redis(command){const r=await fetch(cfg.KV_REST_API_URL,{method:'POST',headers:{Authorization:'Bearer '+cfg.KV_REST_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(10000)});const j=await r.json();if(!r.ok||j.error)throw Error('Private database command failed');return j.result;}
 const value=name=>argv.includes('--'+name)?argv[argv.indexOf('--'+name)+1]:undefined,action=argv[0];
 if(action==='create'){
  const g=newGrant({label:value('label'),credits:argv.includes('--credits')?Number(value('credits')):500,days:argv.includes('--days')?Number(value('days')):0});
  await redis(['HSET',`experience:grant:${g.id}`,'hash',g.hash,'label',g.label,'total',String(g.total),'expires',String(g.expires),'active','1']);
  // Retain grant and accounting records even after expiry for support/rebinding.
  // Explicit issuance prints the bearer code once. Never commit terminal output.
  return {id:g.id,code:g.code,total_credits:g.total,expires_at:g.expires};
 }
 if(action==='reset-public'){
  const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),week=weekStart(day),epoch=crypto.randomBytes(8).toString('hex');
  await redis(['SET',`quota-public-epoch:${week}`,epoch,'EX','777600']);
  return {week,reset:'public_week',daily_limits_unchanged:true,history_preserved:true};
 }
 const id=value('id');if(!/^[a-f0-9]{24}$/.test(id||''))throw Error('Valid grant ID required');
 if(!(await redis(['EXISTS',`experience:grant:${id}`])))throw Error('Grant not found');
 if(action==='revoke')await redis(['HSET',`experience:grant:${id}`,'active','0']);
 else if(action==='rebind'){
  const device=value('device');if(!/^[A-Za-z0-9]{24,64}$/.test(device||''))throw Error('Valid new device ID required');
  await redis(['HSET',`experience:grant:${id}`,'device',device]);
 }else if(action==='topup'){
  const amount=Number(value('credits'));if(!Number.isInteger(amount)||amount<1||amount>1000000)throw Error('Valid credit amount required');
  const result=await redis(['EVAL',"local n=tonumber(redis.call('HGET',KEYS[1],'total') or '0')+tonumber(ARGV[1]);if n>1000000 then return 0 end;redis.call('HSET',KEYS[1],'total',n);return n",1,`experience:grant:${id}`,String(amount)]);
  if(!result)throw Error('Credit maximum exceeded');
 }
 else throw Error('Unsupported grant action');
 return {id,action,history_preserved:true};
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Experience operation failed; private configuration and raw errors suppressed');process.exitCode=1;});
module.exports={newGrant,run};
