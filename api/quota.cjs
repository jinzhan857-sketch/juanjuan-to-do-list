'use strict';
// Each admitted request is a unique expiring member of both daily budgets.
// Pending leases expire even if a handler is lost; success and release are idempotent.
const RESERVE = `
local state=redis.call('HGET',KEYS[1],'state')
if state then return state end
local now=tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE',KEYS[2],'-inf',now)
redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now)
local blocked=nil
if redis.call('ZCARD',KEYS[2])>=tonumber(ARGV[3]) then blocked='device' end
if not blocked and redis.call('ZCARD',KEYS[3])>=tonumber(ARGV[4]) then blocked='ip' end
if blocked then
 redis.call('HSET',KEYS[1],'state','blocked','reason',blocked)
 redis.call('EXPIRE',KEYS[1],172800)
 redis.call('INCR',KEYS[5]);redis.call('EXPIRE',KEYS[5],86400)
 return blocked
end
redis.call('HSET',KEYS[1],'state','pending','device',KEYS[2],'ip',KEYS[3],'day',ARGV[2])
redis.call('EXPIRE',KEYS[1],172800)
for k=2,3 do
 local fresh=redis.call('EXISTS',KEYS[k])==0
 redis.call('ZADD',KEYS[k],now+60000,KEYS[1])
 if fresh then redis.call('EXPIRE',KEYS[k],86400) end
end
redis.call('INCR',KEYS[4]);redis.call('EXPIRE',KEYS[4],86400)
return 'reserved'
`;
const FINISH = `
local state=redis.call('HGET',KEYS[1],'state')
local mode=ARGV[1]
if not state then
 if mode=='cancelled' then redis.call('HSET',KEYS[1],'state','cancelled');redis.call('EXPIRE',KEYS[1],172800) end
 return 'released'
end
if redis.call('HGET',KEYS[1],'device')~=KEYS[2] or redis.call('HGET',KEYS[1],'ip')~=KEYS[3] then return 'released' end
if state~='pending' and state~='success' then return 'released' end
if mode=='success' then
 if state=='success' then return 'success' end
 local now=tonumber(ARGV[2])
 local d=tonumber(redis.call('ZSCORE',KEYS[2],KEYS[1]) or '0')
 local i=tonumber(redis.call('ZSCORE',KEYS[3],KEYS[1]) or '0')
 if d<=now or i<=now then
  redis.call('ZREM',KEYS[2],KEYS[1]);redis.call('ZREM',KEYS[3],KEYS[1])
  redis.call('HSET',KEYS[1],'state','expired')
  return 'expired'
 end
 redis.call('ZADD',KEYS[2],now+172800000,KEYS[1]);redis.call('ZADD',KEYS[3],now+172800000,KEYS[1])
 redis.call('HSET',KEYS[1],'state','success')
 redis.call('INCR',KEYS[4]);redis.call('EXPIRE',KEYS[4],86400)
 return 'success'
end
redis.call('ZREM',KEYS[2],KEYS[1]);redis.call('ZREM',KEYS[3],KEYS[1])
redis.call('HSET',KEYS[1],'state',mode)
redis.call('INCR',KEYS[4]);redis.call('EXPIRE',KEYS[4],86400)
return 'released'
`;
function createQuota(redis){
 const key=(device,id)=>`quota-request:${device}:${id}`;
 return {
  async reserve({device,id,day,ip,deviceLimit,ipLimit,now=Date.now()}){
   if(!Number.isInteger(deviceLimit)||deviceLimit<1||!Number.isInteger(ipLimit)||ipLimit<1)throw new Error('额度上限无效');
   const request=key(device,id),d=`quota:${day}:device:${device}`,i=`quota:${day}:ip:${ip}`;
   const result=await redis(['EVAL',RESERVE,5,request,d,i,`metric:${day}:calls`,`metric:${day}:blocked`,String(now),day,String(deviceLimit),String(ipLimit)]);
   if(!['reserved','device','ip','pending','success','cancelled','failed','expired','blocked'].includes(result))throw new Error('额度服务返回无效结果');
   return result;
  },
  async finish(device,id,mode,now=Date.now()){
   if(!['success','failed','cancelled'].includes(mode))throw new Error('额度状态无效');
   const request=key(device,id);
   const values=await redis(['HMGET',request,'device','ip','day']);
   if(!Array.isArray(values)||values.length!==3)throw new Error('额度服务返回无效结果');
   const [d,i,day]=values;
   const metric=mode==='success'?'success':mode==='failed'?'failures':'cancelled';
   const result=await redis(['EVAL',FINISH,4,request,d||request+':none',i||request+':none',`metric:${day||'unreserved'}:${metric}`,mode,String(now)]);
   if(!['success','released','expired'].includes(result))throw new Error('额度服务返回无效结果');
   return result;
  },
 };
}
module.exports={createQuota,RESERVE,FINISH};
