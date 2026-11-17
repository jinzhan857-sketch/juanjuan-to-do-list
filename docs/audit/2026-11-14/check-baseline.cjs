// Read-only audit. No application initialization, browser storage or network access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const git = (...args) => {
  const result = cp.spawnSync('git', args, {cwd:root, encoding:'utf8'});
  return result.status === 0 ? result.stdout.trim() : null;
};
const files = ['index.html','dist/index.html','api/ai.js'].map(p => {
  const b=fs.readFileSync(path.join(root,p));
  return {path:p, bytes:b.length, lines:b.toString().trimEnd().split(/\r?\n/).length,
    sha256:crypto.createHash('sha256').update(b).digest('hex')};
});
const checks=[];
const check=(name, expression, context) => {
  try { const ok=vm.runInContext(expression,context,{timeout:2000})===true;
    checks.push({name,passed:ok});
  } catch(e) {checks.push({name,passed:false,error:e.message});}
};
function frontend(p) {
  const html=read(p);
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  scripts.forEach((s,i)=>new vm.Script(s,{filename:p+':script'+i}));
  checks.push({name:p+' JavaScript syntax',passed:true});
  const context=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout});
  // Only suppress the single startup call; production functions stay unchanged.
  const script=scripts.join('\n');
  if((script.match(/^App\.init\(\);$/gm)||[]).length!==1) throw Error('Unexpected startup structure');
  vm.runInContext(script.replace(/^App\.init\(\);$/m,''),context,{timeout:2000});
  vm.runInContext('S.pet=defaultPet();',context);
  return context;
}
const app=frontend('index.html');
frontend('dist/index.html');
const tests=[
 ['Invalid calendar date rejected', "validDateStr('2026-02-30')===false"],
 ['Relative date conversion', "parseNaturalDate('明天晚上','2026-11-14')==='2026-11-15'"],
 ['Chinese exact time range', "parseExactTime('早上10点到1点').start==='10:00'&&parseExactTime('早上10点到1点').end==='13:00'"],
 ['Todo score', 'todoScore(10)===7'],
 ['Link protocol filter', "normalizeTodoLinks(['example.com','javascript:alert(1)','https://openai.com'].join(String.fromCharCode(10))).length===2"],
 ['Incomplete exact schedule rejected', "!UI.validateAgentAction({kind:'create_schedule',item:{title:'Synthetic',exec_date:'2026-11-14',time_type:'exact',start_time:'10:00',end_time:null}}).ok"],
 ['Missing deletion target rejected', "!UI.validateAgentAction({kind:'delete_schedule',target_id:'synthetic-missing',item:{}}).ok"],
 ['Seven-day recurring expansion', "UI.expandBatchSchedule({rule:{date_from:'2026-11-09',date_to:'2026-11-15',weekdays:[1,2,3,4,5,6,7],title:'Synthetic',time_type:'exact',start_time:'10:00',end_time:'11:00'}}).length===7"],
 ['Batch exact-time guard', "!UI.validateAgentAction({kind:'create_schedule_batch',rule:{date_from:'2026-11-09',date_to:'2026-11-15',weekdays:[1],title:'Synthetic',time_type:'allday'}}).ok"],
 ['Role routing', "UI.resolveAgentRole('建立多个日程，每周五晚上上课')==='task'&&UI.resolveAgentRole('我想减肥，帮我规划并排进日历')==='planning'&&UI.resolveAgentRole('给我讲个笑话')==='chat'"],
 ['Weather asks for unknown location', "AIService.weatherLocation('今天天气怎么样？',{memories:[]})===null"],
 ['Weather explicit location', "AIService.weatherLocation('我在新加坡，今天天气怎么样。',{}).name==='新加坡'"],
 ['Plain HTTP endpoint rejected', "!AIService.validEndpoint('http://example.com/v1/chat/completions')"],
 ['Planning conflict calculation', "UI.planningInsights([{title:'A',execDate:'2026-11-14',timeType:'exact',startTime:'10:00',endTime:'12:00'},{title:'B',execDate:'2026-11-14',timeType:'exact',startTime:'11:00',endTime:'13:00'}],[]).conflict_count===1"],
 ['Series ID target selection', "(()=>{S.tasks=[{id:'a',seriesId:'synthetic-series',title:'A',execDate:'2026-11-09'},{id:'b',seriesId:'synthetic-series',title:'B',execDate:'2026-11-16'},{id:'c',seriesId:'other',title:'A',execDate:'2026-11-09'}];return UI.resolveBatchUpdateTargets({rule:{series_id:'synthetic-series',date_from:'2026-11-09',date_to:'2026-11-16',weekdays:[1]}}).length===2})()"],
];
tests.forEach(([name,expr])=>check(name,expr,app));
// Baseline coverage for the preserved local additions; no persistence or network.
[
 ['User cancellation aborts request', "(()=>{const c=new AbortController();AIService.activeAgentController=c;AIService.cancelAgentRequest();AIService.activeAgentController=null;return c.signal.aborted&&c.userCancelled===true})()"],
 ['Weather city follow-up', "AIService.isWeatherFollowup('香港',{history:[{role:'assistant',content:'你想查哪个城市或地区的天气？'}]})===true"],
 ['Planning evidence filters invalid kinds', "(()=>{const e=AIService.cleanPlanningEvidence([{kind:'schedule',id:'synthetic'},{kind:'unknown',id:'bad'}]);return e.length===1&&e[0].id==='synthetic'})()"],
 ['Custom profile group retained', "UI.normalizeMemoryGroups([{id:'synthetic-group',name:'合成资料',preset:false}]).some(g=>g.id==='synthetic-group'&&g.name==='合成资料')"],
 ['Frontend batch deletion preserves identity', "AIService.normalizeAgent({type:'batch_proposal',action:{kind:'delete_schedule_batch',rule:{series_id:'synthetic-series'}}}).action.rule.series_id==='synthetic-series'"],
].forEach(([name,expr])=>check(name,expr,app));
const api=vm.createContext({require:require('node:module').createRequire(path.join(root,'api/ai.js')),module:{exports:{}},process:{env:{}},console,URL});
new vm.Script(read('api/ai.js'),{filename:'api/ai.js'}).runInContext(api);
checks.push({name:'api/ai.js JavaScript syntax',passed:true});
check('API invalid date rejected',"validDate('2026-02-30')===null",api);
check('API invalid time rejected',"validTime('25:00')===null",api);
check('API batch delete format',"parseAgentResult(JSON.stringify({type:'batch_proposal',action:{kind:'delete_schedule_batch',rule:{series_id:'s'}}})).action.rule.series_id==='s'",api);
const observations={
  hostedContextDropsSeriesId:vm.runInContext("!('series_id' in compactAgentContext({tasks:[{id:'a',title:'Synthetic',series_id:'s'}]}).tasks[0])",api),
  explicitDateRoutedToBatch:vm.runInContext("AIService._localAgent('只把11月9日的IDAT7215备注改成带电脑',{tasks:[{id:'a',title:'IDAT7215',exec_date:'2026-11-09',start_time:'19:00',end_time:'21:30',series_id:'s'},{id:'b',title:'IDAT7215',exec_date:'2026-11-16',start_time:'19:00',end_time:'21:30',series_id:'s'}],todos:[]},'task').action?.kind",app),
  rememberedLocationOverridesExplicitCity:vm.runInContext("AIService.weatherLocation('我在新加坡，今天天气怎么样。',{memories:[{content:'我住在香港。'}]}).name",app),
};
const report={auditDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),executedAt:new Date().toISOString(),timeZone:'Asia/Shanghai',runtime:process.version,headAtRun:git('rev-parse','HEAD'),worktreeStatus:git('status','--short'),
  method:'Node VM, App.init suppressed, isolated synthetic state, no DOM/browser storage/model/network calls. Existing browser selfTest not executed by this runner.',
  files,checks,observations,
  passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length};
const output=process.argv[2];
if(output)fs.writeFileSync(path.resolve(root,output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,checks,observations,files},null,2));
process.exitCode=report.failed?1:0;
