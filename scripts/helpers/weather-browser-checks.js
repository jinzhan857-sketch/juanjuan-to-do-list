'use strict';
document.querySelector('#run').onclick=async()=>{
  const output=document.querySelector('#result'), lines=[];
  const assert=(condition,label)=>{if(!condition)throw new Error(label);};
  const data={current:{weather_code:0,temperature_2m:28,apparent_temperature:30,wind_speed_10m:8},daily:{weather_code:[0,63,3],temperature_2m_max:[30,29,28],temperature_2m_min:[24,23,22],precipitation_probability_max:[10,70,20]}};
  const response=value=>({ok:true,json:async()=>value});
  const fixture=()=>{
    S.messages=[];S.chats=[{id:'synthetic',title:'合成聊天'}];S.tasks=[];S.todos=[];S.pet={memoryEnabled:true};S.memories=[{id:'synthetic-memory',content:'我住在香港。'}];
    UI.agentChatId='synthetic';UI.agentThinking=false;UI.agentRequestSerial=0;UI.agentSelectedRole='auto';
    UI.currentAgentChat=()=>S.chats[0];UI.resizeAgentInput=()=>{};UI.renderAgent=()=>{};
    DB.put=async()=>{};
    DB.db=null;DB.init=()=>{throw new Error('Database access prohibited');};
    DB.request=()=>{throw new Error('Database access prohibited');};
  };
  const send=async text=>{document.querySelector('#agent-input').value=text;await UI.sendAgentMessage();return S.messages.at(-1);};
  const mock=()=>{window.fetch=async url=>response(String(url).includes('/search')?{results:[{name:'合成城市',latitude:1.3,longitude:103.8}]}:data);};
  try{
    fixture();mock();
    let message=await send('我在新加坡，明天天气怎么样？');
    assert(message.meta.weather.location.name==='新加坡'&&message.meta.weather.day===1,'Current city/day');
    assert(message.content.includes('明天')&&!message.content.includes('香港'),'Saved weather reply');
    lines.push('PASS 发送流程保存本次新加坡与明天，旧香港记忆不覆盖');
    message=await send('那上海呢？');assert(message.meta.weather.location.name==='上海'&&message.meta.weather.day===1,'City followup');
    message=await send('那后天呢？');assert(message.meta.weather.location.name==='上海'&&message.meta.weather.day===2,'Day followup');
    lines.push('PASS 不同城市与日期续答经实际消息上下文传递');
    message=await send('请帮我查新加坡天气');assert(message.meta.weather.location.name==='新加坡','Polite query');
    message=await send('新加坡要不要带伞');assert(message.meta.weather.location.name==='新加坡','Weather predicate');
    assert(['讲个笑话','聊聊学习','推荐电影'].every(text=>!AIService.isWeatherFollowup(text,UI.agentContext('synthetic',text,'chat'))),'Normal chat misrouted');
    lines.push('PASS 礼貌查询与带伞表达不污染城市，普通聊天不走天气续答');
    fixture();S.pet.memoryEnabled=false;mock();
    message=await send('明天天气怎么样？');assert(message.type==='clarify','No authorized location');
    message=await send('新加坡');assert(message.meta.weather.location.name==='新加坡'&&message.meta.weather.day===1,'Clarification day');
    lines.push('PASS 关闭记忆后追问，城市续答保留原日期');
    fixture();window.fetch=async()=>{throw new TypeError('synthetic offline');};
    message=await send('新加坡天气');assert(message.content.includes('服务暂时不可用'),'Network feedback');
    lines.push('PASS 网络失败保存明确错误反馈');
    window.fetch=async()=>response({error:true,reason:'synthetic service failure'});
    message=await send('新加坡天气');assert(message.content.includes('服务暂时不可用'),'Service error misreported');
    lines.push('PASS 服务错误对象显示服务不可用，不误报地点不存在');
    fixture();let release,entered;const ready=new Promise(resolve=>entered=resolve);
    window.fetch=async()=>new Promise(resolve=>{release=()=>resolve(response(data));entered();});
    const pending=send('香港天气');await ready;await UI.cancelAgentMessage();mock();
    await send('我在新加坡，天气怎么样？');const count=S.messages.length;release();await pending;
    assert(S.messages.length===count&&S.messages.at(-1).meta.weather.location.name==='新加坡','Stale response persisted');
    assert(!UI.agentThinking&&AIService.activeAgentController===null,'Request cleanup');
    lines.push('PASS 取消后立即重发，旧响应不写入消息也不覆盖新结果');
    output.textContent=lines.join('\n')+'\n7 项通过，0 失败。真实模型调用 0，数据库访问 0。';
  }catch(error){output.textContent=lines.join('\n')+'\nFAIL '+error.stack;}
};
