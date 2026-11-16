'use strict';
const RETENTION=9*86400;
function weekStart(day){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function creditKey(id){return `quota-credit:${id}`;}
function quotaKeys({day,device,pool='public-0',credit}){if(credit)return [creditKey(credit.id)];const base=`quota:${pool}:${weekStart(day)}`;return [`quota:${day}:device:${device}`,`${base}:device:${device}`,`${base}:global`];}
// The same atomic receipt engine handles public day/week constraints and one
// lifetime credit balance. Pending leases expire; confirmed credits persist.
const RESERVE=`
local state=redis.call('HGET',KEYS[1],'state')
if state then return state end
local now=tonumber(ARGV[1])
local n=tonumber(ARGV[3])
local scopes=cjson.decode(ARGV[4])
local limits=cjson.decode(ARGV[5])
local credit=ARGV[6]=='1'
if credit then
 local g=redis.call('HMGET',KEYS[n+4],'active','expires','device','hash')
 if not g[1] or g[4]~=ARGV[8] then return 'experience_invalid' end
 if g[1]~='1' then return 'experience_revoked' end
 if tonumber(g[2])>0 and tonumber(g[2])<=now then return 'experience_expired' end
 if g[3]~=ARGV[7] then return 'experience_bound' end
end
local blocked=nil
for k=2,n+1 do
 redis.call('ZREMRANGEBYSCORE',KEYS[k],'-inf',now)
 if not blocked and redis.call('ZCARD',KEYS[k])>=limits[k-1] then blocked=scopes[k-1] end
end
if blocked then
 redis.call('HSET',KEYS[1],'state','blocked','reason',blocked)
 redis.call('EXPIRE',KEYS[1],777600)
 if redis.call('INCR',KEYS[n+3])==1 then redis.call('EXPIRE',KEYS[n+3],86400) end
 return blocked
end
local buckets={}
for k=2,n+1 do
 buckets[k-1]=KEYS[k]
 local fresh=redis.call('EXISTS',KEYS[k])==0
 redis.call('ZADD',KEYS[k],now+60000,KEYS[1])
 if not credit and fresh then redis.call('EXPIRE',KEYS[k],777600) end
end
redis.call('HSET',KEYS[1],'state','pending','buckets',cjson.encode(buckets),'day',ARGV[2],'credit',ARGV[6])
if credit then redis.call('PERSIST',KEYS[1]) else redis.call('EXPIRE',KEYS[1],777600) end
if redis.call('INCR',KEYS[n+2])==1 then redis.call('EXPIRE',KEYS[n+2],86400) end
return 'reserved'
`;
const FINISH=`
local state=redis.call('HGET',KEYS[1],'state')
local mode=ARGV[1]
if not state then
 if mode~='success' then redis.call('HSET',KEYS[1],'state',mode);redis.call('EXPIRE',KEYS[1],777600) end
 return 'released'
end
if state~='pending' and state~='success' then return 'released' end
local n=tonumber(ARGV[3])
local stored=cjson.decode(redis.call('HGET',KEYS[1],'buckets') or '[]')
if #stored~=n then return 'retry' end
for k=2,n+1 do if stored[k-1]~=KEYS[k] then return 'retry' end end
if mode=='success' then
 if state=='success' then return 'success' end
 local now=tonumber(ARGV[2])
 local expired=false
 for k=2,n+1 do if tonumber(redis.call('ZSCORE',KEYS[k],KEYS[1]) or '0')<=now then expired=true end end
 if expired then
  for k=2,n+1 do redis.call('ZREM',KEYS[k],KEYS[1]) end
  redis.call('HSET',KEYS[1],'state','expired');redis.call('EXPIRE',KEYS[1],777600)
  return 'expired'
 end
 local untilScore=now+777600000
 if redis.call('HGET',KEYS[1],'credit')=='1' then untilScore=9007199254740991 end
 for k=2,n+1 do redis.call('ZADD',KEYS[k],untilScore,KEYS[1]) end
 redis.call('HSET',KEYS[1],'state','success')
 if redis.call('INCR',KEYS[n+2])==1 then redis.call('EXPIRE',KEYS[n+2],86400) end
 return 'success'
end
for k=2,n+1 do redis.call('ZREM',KEYS[k],KEYS[1]) end
redis.call('HSET',KEYS[1],'state',mode);redis.call('EXPIRE',KEYS[1],777600)
if redis.call('INCR',KEYS[n+2])==1 then redis.call('EXPIRE',KEYS[n+2],86400) end
return 'released'
`;
function createQuota(redis){
 const key=(device,id)=>`quota-request:${device}:${id}`;
 return {
  async reserve(r){
   const {device,id,day,deviceLimit,globalLimit,dailyLimit=deviceLimit,credit,now=Date.now()}=r;
   const limits=credit?[credit.total]:[dailyLimit,deviceLimit,globalLimit],scopes=credit?['credit']:['device','device_week','global'];
   if(limits.some(n=>!Number.isInteger(n)||n<1)||credit&&!/^[a-f0-9]{24}$/.test(credit.id))throw Error('额度上限无效');
   const buckets=quotaKeys(r),extra=credit?[`experience:grant:${credit.id}`]:[];
   const result=await redis(['EVAL',RESERVE,buckets.length+3+extra.length,key(device,id),...buckets,`metric:${day}:calls`,`metric:${day}:blocked`,...extra,String(now),day,String(buckets.length),JSON.stringify(scopes),JSON.stringify(limits),credit?'1':'0',device,credit?.hash||'']);
   if(!['reserved','device','device_week','global','credit','pending','success','cancelled','failed','expired','blocked','experience_invalid','experience_revoked','experience_expired','experience_bound'].includes(result))throw Error('额度服务返回无效结果');
   return result;
  },
  async finish(device,id,mode,now=Date.now()){
   if(!['success','failed','cancelled'].includes(mode))throw Error('额度状态无效');
   const request=key(device,id);
   for(let attempt=0;attempt<2;attempt++){
    const values=await redis(['HMGET',request,'buckets','day']);
    if(!Array.isArray(values)||values.length!==2)throw Error('额度服务返回无效结果');
    const [raw,day]=values,buckets=raw?JSON.parse(raw):[];
    if(!Array.isArray(buckets)||![0,1,3].includes(buckets.length)||buckets.some(k=>typeof k!=='string'||!k||k.length>300))throw Error('额度服务返回无效结果');
    const metric=mode==='success'?'success':mode==='failed'?'failures':'cancelled';
    const result=await redis(['EVAL',FINISH,buckets.length+2,request,...buckets,`metric:${day||'unreserved'}:${metric}`,mode,String(now),String(buckets.length)]);
    if(result==='retry')continue;
    if(!['success','released','expired'].includes(result))throw Error('额度服务返回无效结果');
    return result;
   }
   throw Error('额度状态变化，请重试退回');
  },
 };
}
module.exports={createQuota,RESERVE,FINISH,quotaKeys,weekStart,creditKey,RETENTION};
