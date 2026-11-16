'use strict';
const crypto=require('node:crypto');
const digest=secret=>crypto.createHash('sha256').update(secret).digest('hex');
function parseCode(code){const m=/^JJ-([a-f0-9]{24})-([a-f0-9]{32})$/i.exec(String(code||'').trim());return m?{id:m[1].toLowerCase(),hash:digest(m[2].toLowerCase())}:null;}
const REDEEM=`
local v=redis.call('HMGET',KEYS[1],'hash','active','expires','total','device')
if not v[1] or v[1]~=ARGV[1] then return {'invalid'} end
if v[2]~='1' then return {'revoked'} end
if tonumber(v[3])>0 and tonumber(v[3])<=tonumber(ARGV[3]) then return {'expired'} end
if v[5] and v[5]~=ARGV[2] then return {'bound'} end
if ARGV[4]=='redeem' then redis.call('HSET',KEYS[1],'device',ARGV[2]) elseif not v[5] then return {'unredeemed'} end
return {'ok',v[3],v[4]}
`;
const errors={invalid:'体验码不正确，请检查后重试',revoked:'体验码已停用，请联系提供者',expired:'体验码已过期，请联系提供者',bound:'体验码已在其他浏览器兑换，请联系提供者',unredeemed:'请先在大模型配置中兑换体验码'};
async function experience(redis,code,device,operation='check',now=Date.now()){
 const parsed=parseCode(code);if(!parsed)return {ok:false,error:errors.invalid,code:'experience_invalid'};
 const value=await redis(['EVAL',REDEEM,1,`experience:grant:${parsed.id}`,parsed.hash,device,String(now),operation]);
 if(!Array.isArray(value)||!['ok',...Object.keys(errors)].includes(value[0]))throw Error('体验码服务返回无效结果');
 if(value[0]!=='ok')return {ok:false,error:errors[value[0]],code:'experience_'+value[0]};
 const total=Number(value[2]),expires=Number(value[1]);
 if(!Number.isInteger(total)||total<1||total>1000000||!Number.isSafeInteger(expires)||expires<0)throw Error('体验码配置无效');
 const used=Number(await redis(['ZCOUNT',`quota-credit:${parsed.id}`,String(now),'+inf']));
 if(!Number.isInteger(used)||used<0)throw Error('体验卡余额返回无效结果');
 return {ok:true,id:parsed.id,hash:parsed.hash,total,remaining:Math.max(0,total-used),expires};
}
module.exports={experience,parseCode,digest,REDEEM,errors};
