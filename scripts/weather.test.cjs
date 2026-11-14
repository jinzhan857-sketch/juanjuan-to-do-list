'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function load(options={}){
  const calls=[], timers=[];
  const app=vm.createContext({console,URL,URLSearchParams,AbortController,DOMException,structuredClone,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},
    fetch:async(url,init)=>{calls.push({url:new URL(url),signal:init.signal});if(options.fetch)return options.fetch(url,init);return response(String(url).includes('/search')?{results:[{name:'合成城市',latitude:1.3,longitude:103.8}]}:forecast());}});
  const html=fs.readFileSync(path.join(process.env.ISSUE7_SOURCE_ROOT||path.join(__dirname,'..'),'index.html'),'utf8');
  vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),app);
  const run=code=>vm.runInContext(code,app,{timeout:2000});
  return {app,calls,timers,run,json:code=>JSON.parse(run('JSON.stringify('+code+')'))};
}
const response=data=>({ok:true,json:async()=>data});
const forecast=()=>({current:{weather_code:0,temperature_2m:28,apparent_temperature:30,wind_speed_10m:8},daily:{weather_code:[0,63,3],temperature_2m_max:[30,29,28],temperature_2m_min:[24,23,22],precipitation_probability_max:[10,70,20]}});
const memory={memories:[{content:'我住在香港。'}]};
for(const city of ['新加坡','北京','上海','广州','Singapore','New York']){
  test('current city overrides old Hong Kong memory: '+city,()=>{
    const a=load();a.app.context=memory;a.app.message=`我在${city}，今天天气怎么样？`;
    assert.equal(a.json('AIService.weatherLocation(message,context)').name,city);
  });
}
for(const message of ['新加坡天气','查一下新加坡明天的天气','请查询新加坡的天气','新加坡会下雨吗？','今天新加坡天气怎么样','查一下明天新加坡天气','我在新加坡今天天气怎么样','我现在在新加坡，天气如何']){
  test('weather expression extracts only current city: '+message,()=>{const a=load();a.app.message=message;a.app.context=memory;assert.equal(a.json('AIService.weatherLocation(message,context)').name,'新加坡');});
}
test('no evidence asks without network; authorized residence memory works; unrelated or conflicting memory does not guess',async()=>{
  const a=load();for(const message of ['今天天气怎么样？','帮我看看天气','查一下天气','请查询明天天气']){a.app.message=message;assert.equal((await a.run("AIService.agent(message,{},'chat')")).type,'clarify');}assert.equal(a.calls.length,0);
  a.app.context=memory;assert.equal(a.json("AIService.weatherLocation('今天天气怎么样？',context)").name,'香港');
  for(const memories of [[{content:'想去香港旅游。'}],[{content:'我住在北京。'},{content:'我住在上海。'}]]){a.app.context={memories};assert.equal(a.run("AIService.weatherLocation('今天天气怎么样？',context)"),null);}
});
test('city-only clarification retains requested day and beats memory',async()=>{
  const a=load();a.app.context={...memory,history:[{role:'user',content:'明天天气怎么样？'},{role:'assistant',content:'你想查哪个城市或地区的天气？'},{role:'user',content:'新加坡'}]};
  assert.equal(a.run("AIService.isWeatherFollowup('新加坡',context)"),true);
  const r=await a.run("AIService.agent('新加坡',context,'chat')");assert.equal(r.weather.location.name,'新加坡');assert.equal(r.weather.day,1);assert.match(r.reply,/明天.*23 至 29℃/);
  assert.equal(a.calls[0].url.searchParams.get('name'),'新加坡');
});
test('structured weather context survives city and day followups; unrelated reply ends the topic',async()=>{
  const a=load();a.app.context={...memory,history:[{role:'assistant',content:'合成天气',weather:{location:{name:'北京'},day:1}}]};
  const r=await a.run("AIService.agent('那上海呢？',context,'chat')");assert.equal(r.weather.location.name,'上海');assert.equal(r.weather.day,1);
  a.app.context.history.push({role:'assistant',content:r.reply,weather:r.weather});
  const next=await a.run("AIService.agent('那后天呢？',context,'chat')");assert.equal(next.weather.location.name,'上海');assert.equal(next.weather.day,2);assert.match(next.reply,/后天.*22 至 28℃/);
  a.app.context.history.push({role:'assistant',content:'我们聊学习吧。'});assert.equal(a.run("AIService.isWeatherFollowup('上海',context)"),false);
});
test('generic tomorrow weather query uses latest conversation city instead of memory',async()=>{
  const a=load();a.app.context={...memory,history:[{role:'assistant',weather:{location:{name:'新加坡'},day:0}}]};
  const r=await a.run("AIService.agent('明天天气呢？',context,'chat')");assert.equal(r.weather.location.name,'新加坡');assert.equal(r.weather.day,1);
});
test('UI context includes only current chat weather state and respects disabled memory',()=>{
  const a=load();a.run("S.pet={memoryEnabled:false};S.tasks=[];S.todos=[];S.messages=[{chatId:'other',role:'assistant',createdAt:1,meta:{weather:{location:{name:'香港'}}}},{chatId:'test',role:'assistant',content:'合成天气',createdAt:2,meta:{weather:{location:{name:'新加坡'},day:1}}}]");
  const context=a.json("UI.agentContext('test','','chat')");assert.equal(context.history.length,1);assert.equal(context.history[0].weather.location.name,'新加坡');assert.deepEqual(context.memories,[]);
});
test('empty geocoding result clarifies without requesting a forecast',async()=>{
  const a=load({fetch:async()=>response({results:[]})});const r=await a.run("AIService.agent('未知城市天气',{},'chat')");assert.equal(r.type,'clarify');assert.match(r.reply,/没有找到/);assert.equal(a.calls.length,1);
});
for(const bad of [{ok:false,json:async()=>({})},response({results:'invalid'}),response({results:[{name:'假城市',latitude:null,longitude:10}]}),response({results:[{name:'假城市',latitude:200,longitude:10}]}),{ok:true,json:async()=>{throw new SyntaxError('invalid');}}]){
  test('invalid geocoding is a service error, never an unknown place or forecast',async()=>{const a=load({fetch:async()=>bad});const r=await a.run("AIService.agent('新加坡天气',{},'chat')");assert.match(r.reply,/服务暂时不可用/);assert.equal(a.calls.length,1);});
}
for(const data of [{},null,{current:{},daily:{}},{...forecast(),current:{temperature_2m:null}}]){
  test('incomplete forecast never prints fabricated or undefined weather',async()=>{const a=load({fetch:async()=>response(data)});const r=await a.run("AIService.agent('香港天气',{},'chat')");assert.match(r.reply,/服务暂时不可用/);assert.doesNotMatch(r.reply,/undefined|NaN|null/);});
}
test('network rejection and timeout have distinct feedback',async()=>{
  const a=load({fetch:async()=>{throw new TypeError('offline');}});assert.match((await a.run("AIService.agent('香港天气',{},'chat')")).reply,/服务暂时不可用/);
  const b=load({fetch:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))))});const pending=b.run("AIService.agent('香港天气',{},'chat')");b.timers[0]();assert.match((await pending).reply,/超时/);assert.equal(b.run('AIService.activeAgentController'),null);
});
for(const stage of ['geocoding','forecast','json']){
  test('cancel during '+stage+' suppresses late response even if transport ignores abort',async()=>{
    let release,entered;const ready=new Promise(resolve=>entered=resolve);
    const a=load({fetch:async(url)=>{
      if(stage==='geocoding'||stage==='forecast'&&String(url).includes('/forecast'))return new Promise(resolve=>{release=()=>resolve(response(stage==='geocoding'?{results:[{name:'合成城市',latitude:1,longitude:2}]}:forecast()));entered();});
      if(stage==='json')return {ok:true,json:()=>new Promise(resolve=>{release=()=>resolve(forecast());entered();})};
      return response({results:[{name:'合成城市',latitude:1,longitude:2}]});
    }});
    const pending=a.run(`AIService.agent('${stage==='json'?'香港':'新加坡'}天气',{},'chat')`);await ready;a.run('AIService.cancelAgentRequest()');release();const r=await pending;
    assert.equal(r.type,'cancelled');assert.equal(r.reply,'');assert.equal(a.run('AIService.activeAgentController'),null);assert.ok(a.calls.every(call=>call.signal.aborted));
  });
}
test('older cancelled request cannot clear the active controller of a newer request',async()=>{
  const releases=[];const a=load({fetch:async()=>new Promise(resolve=>releases.push(()=>resolve(response(forecast()))))});
  const first=a.run("AIService.agent('香港天气',{},'chat')");a.run('AIService.cancelAgentRequest()');const second=a.run("AIService.agent('香港天气',{},'chat')");
  releases[0]();assert.equal((await first).type,'cancelled');assert.notEqual(a.run('AIService.activeAgentController'),null);releases[1]();assert.equal((await second).type,'chat');assert.equal(a.run('AIService.activeAgentController'),null);
});
