'use strict';
// Handler-only oracle. Redis Lua itself is tested against an actual isolated Redis.
function quotaOracle({commands=[],values=new Map(),expiry=new Map(),now=Date.now}={}){
 const receipts=new Map();
 const expire=(k,ms)=>{expiry.set(k,now()+ms);commands.push(['EXPIRE',k,String(ms/1000)]);};
 const metric=(day,name)=>{const k=`metric:${day}:${name}`;if(expiry.get(k)<=now())values.delete(k);values.set(k,(values.get(k)||0)+1);commands.push(['INCR',k]);if(values.get(k)===1)expire(k,86400000);};
 return {
  async reserve(r){
   const rk=r.device+':'+r.id;if(receipts.has(rk))return receipts.get(rk).state;
   const keys=[`quota:${r.day}:device:${r.device}`,`quota:${r.day}:ip:${r.ip}`,`quota:${r.day}:global`],limits=[r.deviceLimit,r.ipLimit,r.globalLimit];
   for(const k of keys)if(expiry.get(k)<=now())values.delete(k);
   const scope=['device','ip','global'].find((_,i)=>(values.get(keys[i])||0)>=limits[i]);
   if(scope){receipts.set(rk,{state:'blocked'});metric(r.day,'blocked');return scope;}
   for(const k of keys){commands.push(['QUOTA_RESERVE',k]);if(!values.has(k))expire(k,86400000);values.set(k,(values.get(k)||0)+1);}
   receipts.set(rk,{state:'pending',keys,day:r.day});metric(r.day,'calls');return 'reserved';
  },
  async finish(device,id,mode){
   const k=device+':'+id,r=receipts.get(k);if(!r){if(mode==='cancelled')receipts.set(k,{state:'cancelled'});return 'released';}
   if(!['pending','success'].includes(r.state))return 'released';
   if(mode==='success'){if(r.state==='pending')metric(r.day,'success');r.state='success';return 'success';}
   for(const key of r.keys)values.set(key,(values.get(key)||0)-1);
   r.state=mode;metric(r.day,mode==='failed'?'failures':'cancelled');return 'released';
  },
 };
}
module.exports={quotaOracle};
