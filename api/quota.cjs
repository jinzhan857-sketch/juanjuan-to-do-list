'use strict';
// Each admitted request is a unique expiring member of device and global budgets.
// Pending leases expire even if a handler is lost; success and release are idempotent.
const RESERVE = `
local state=redis.call('HGET',KEYS[1],'state')
if state then return state end
local now=tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now)
redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now)
local blocked=nil
if redis.call('ZCARD',KEYS[2])>=tonumber(ARGV[3]) then blocked='device' end
if not blocked and redis.call('ZCARD',KEYS[3])>=tonumber(ARGV[4]) then blocked='global' end
if blocked then
 redis.call('HSET',KEYS[1],'state','blocked','reason',blocked)
 redis.call('EXPIRE',KEYS[1],172800)
 if redis.call('INCR',KEYS[5])==1 then redis.call('EXPIRE',KEYS[5],86400) end
 return blocked
end
redis.call('HSET',KEYS[1],'state','pending','device',KEYS[2],'global',KEYS[3],'day',ARGV[2])
redis.call('EXPIRE',KEYS[1],172800)
for k=2,3 do
 local fresh=redis.call('EXISTS',KEYS[k])==0
 redis.call('ZADD',KEYS[k],now+60000,KEYS[1])
 if fresh then redis.call('EXPIRE',KEYS[k],86400) end
end
if redis.call('INCR',KEYS[4])==1 then redis.call('EXPIRE',KEYS[4],86400) end
return 'reserved'
`;
const FINISH = `
local state=redis.call('HGET',KEYS[1],'state')
local mode=ARGV[1]
if not state then
 if mode~='success' then redis.call('HSET',KEYS[1],'state',mode);redis.call('EXPIRE',KEYS[1],172800) end
 return 'released'
end
if state~='pending' and state~='success' then return 'released' end
if redis.call('HGET',KEYS[1],'device')~=KEYS[2] or redis.call('HGET',KEYS[1],'global')~=KEYS[3] then return 'retry' end
if mode=='success' then
 if state=='success' then return 'success' end
 local now=tonumber(ARGV[2])
 local d=tonumber(redis.call('ZSCORE',KEYS[2],KEYS[1]) or '0')
 local g=tonumber(redis.call('ZSCORE',KEYS[3],KEYS[1]) or '0')
 if d<=now or g<=now then
  redis.call('ZREM',KEYS[2],KEYS[1]);redis.call('ZREM',KEYS[3],KEYS[1])
  redis.call('HSET',KEYS[1],'state','expired')
  return 'expired'
 end
 redis.call('ZADD',KEYS[2],now+172800000,KEYS[1]);redis.call('ZADD',KEYS[3],now+172800000,KEYS[1])
 redis.call('HSET',KEYS[1],'state','success')
 if redis.call('INCR',KEYS[4])==1 then redis.call('EXPIRE',KEYS[4],86400) end
 return 'success'
end
redis.call('ZREM',KEYS[2],KEYS[1]);redis.call('ZREM',KEYS[3],KEYS[1])
redis.call('HSET',KEYS[1],'state',mode)
if redis.call('INCR',KEYS[4])==1 then redis.call('EXPIRE',KEYS[4],86400) end
return 'released'
`;
function createQuota(redis){
 const key=(device,id)=>`quota-request:${device}:${id}`;
 return {
  async reserve({device,id,day,deviceLimit,globalLimit,now=Date.now()}){
   if(!Number.isInteger(deviceLimit)||deviceLimit<1||!Number.isInteger(globalLimit)||globalLimit<1)throw new Error('额度上限无效');
   const request=key(device,id),d=`quota:${day}:device:${device}`;
   const result=await redis(['EVAL',RESERVE,5,request,d,`quota:${day}:global`,`metric:${day}:calls`,`metric:${day}:blocked`,String(now),day,String(deviceLimit),String(globalLimit)]);
   if(!['reserved','device','global','pending','success','cancelled','failed','expired','blocked'].includes(result))throw new Error('额度服务返回无效结果');
   return result;
  },
  async finish(device,id,mode,now=Date.now()){
   if(!['success','failed','cancelled'].includes(mode))throw new Error('额度状态无效');
   const request=key(device,id);
   for(let attempt=0;attempt<2;attempt++){
   const values=await redis(['HMGET',request,'device','global','day']);
   if(!Array.isArray(values)||values.length!==3)throw new Error('额度服务返回无效结果');
   const [d,g,day]=values;
   const metric=mode==='success'?'success':mode==='failed'?'failures':'cancelled';
   const result=await redis(['EVAL',FINISH,4,request,d||request+':none',g||request+':none',`metric:${day||'unreserved'}:${metric}`,mode,String(now)]);
   if(result==='retry')continue;
   if(!['success','released','expired'].includes(result))throw new Error('额度服务返回无效结果');
   return result;
   }
   throw new Error('额度状态变化，请重试退回');
  },
 };
}
module.exports={createQuota,RESERVE,FINISH};
