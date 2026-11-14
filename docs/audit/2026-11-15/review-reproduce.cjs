'use strict';
// Audit only. App.init is disabled and every database is synthetic.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const root=process.env.REVIEW_SOURCE_ROOT||path.resolve(__dirname,'../../..');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[2026,10,15,12,0,0]));}static now(){return new FixedDate().getTime();}}
async function setup(){
  const ctx=vm.createContext({console,URL,AbortController,structuredClone,setTimeout,clearTimeout,Date:FixedDate,indexedDB:new IDBFactory()});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
  const run=s=>vm.runInContext(s,ctx,{timeout:3000});
  run(require(path.resolve(__dirname,'../../../scripts/helpers/storage-fixture.cjs')));
  run('UI.agentChatId="chat"; UI.renderAgent=()=>{}; toast=()=>{}');
  await run('DB.open()');
  await run("DB.batch([...DATA_STORES.flatMap(store=>S[store].map(value=>({store,value}))),...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))])");
  return {ctx,run,json:s=>JSON.parse(run('JSON.stringify('+s+')')),close:()=>run('DB._db.close()')};
}
const results=[];
async function check(name,work){const a=await setup();try{await work(a);results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}finally{a.close();}}
(async()=>{
  for(const request of ['11月9日不要改，只改11月16日同名课程备注改成带电脑','11月9日保持不变，只改11月16日同名课程备注改成带电脑']){
    await check('single-day exclusion: '+request,async a=>{
      a.ctx.request=request;
      a.run("action=AIService._localAgent(request,UI.agentContext('chat',request,'task'),'task').action");
      const selected=a.json('action');
      assert.ok(selected,'must propose a uniquely specified day');
      const accepted=a.run('UI.validateAgentRequest(action,request).ok');
      assert.equal(accepted,true);
      a.run("UI.captureAgentScope(action);S.messages[0].meta.action=action");
      await a.run("DB.put('messages',S.messages[0])");
      await a.run('UI.executeAgentAction(action,S.messages[0])');
      const disk=await a.run("DB.all('tasks')");
      const changed=disk.filter(x=>x.note==='带电脑').map(x=>x.id);
      console.log(JSON.stringify({request,selected:selected.target_id,accepted,changed}));
      assert.deepEqual(changed,['b'],'only November 16 may change');
    });
  }
  await check('import rejects invalid schedule status before replacing data',async a=>{
    a.run("data={app:'卷卷AI Todo',version:'2.2',...Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,copyData(S[key])])),appearance:{followSystem:true,lightTheme:'warm',darkTheme:'soft',fixedTheme:'warm'}};data.tasks[0].status='invalid-status';");
    let rejected=false;
    try{await a.run('replaceBackup(data)');}catch(e){rejected=true;}
    console.log(JSON.stringify({invalidStatusPersisted:await a.run("DB.get('tasks','a')").then(t=>t.status)}));
    a.ctx.document={querySelector:()=>({})};
    try{a.run("UI.openTaskDetail('a')");}catch(error){console.log(JSON.stringify({detailError:error.message}));}
    assert.equal(rejected,true,'invalid status must not enter the database');
  });
  await check('explicit city after weather keyword overrides old memory',async a=>{
    const location=a.json("AIService.weatherLocation('天气查上海',{memories:[{content:'我住在香港。'}]})");
    console.log(JSON.stringify({request:'天气查上海',location}));
    assert.equal(location?.name,'上海');
  });
  console.log(JSON.stringify({source:root,results},null,2));
  process.exitCode=results.some(x=>!x.pass)?1:0;
})();
