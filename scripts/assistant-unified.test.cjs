'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
const {createModelCheck}=require('./ai-simulation.cjs');
const wf=require('../src/assistant/workflow.js');
test('persona notes persist independently, reset only the selected profile and reach hosted requests',async t=>{
 const a=await fixture(t),before=await a.snapshot();
 assert.deepEqual(a.json('UI.currentPersonaSetting()'),{id:'perfect',note:''});
 a.run("UI.persistPersonaPreferences({selected:'perfect',notes:{perfect:'不要颜文字',default:'简短',custom:'理性管家'}},'saved')");
 a.run("UI.persistPersonaPreferences({...UI.personaPreferences(),selected:'custom'},'switched')");
 assert.deepEqual(a.json('UI.currentPersonaSetting()'),{id:'custom',note:'理性管家'});
 a.run("document.querySelector('#persona-reset').onclick()");
 assert.deepEqual(a.json('UI.personaPreferences()'),{selected:'custom',notes:{perfect:'不要颜文字',default:'简短',custom:''}});
 a.run("UI.persistPersonaPreferences({...UI.personaPreferences(),selected:'perfect'},'switched');sent=[];AIService.source=()=> 'hosted';AIService.hostedRequest=async body=>{sent.push(body);return {type:'chat',reply:'收到'}}");
 await a.run("AIService.agent('合成测试',{},'chat')");
 assert.deepEqual(a.json('sent[0].context.persona'),{id:'perfect',note:'不要颜文字'});
 assert.deepEqual(await a.snapshot(),before);
});
for(const id of ['perfect','default','custom'])test('hosted model receives selected persona and its note: '+id,async()=>{
 let sent;const check=createModelCheck({key:'synthetic',request:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({type:'chat',reply:'合成回复'})}}]})}}});
 let code;await check.handler({method:'POST',headers:{},body:{mode:'agent',request_id:'2'.repeat(32),device_id:'syntheticdevice0123456789abcd',message:'聊聊',context:{persona:{id,note:'不要颜文字，简短回答'}}}},{status(n){code=n;return this},json(v){return v}});
 assert.equal(code,200);assert.ok(sent.messages[0].content.includes(wf.personaPrompt(wf.personas[id],[],'不要颜文字，简短回答')));
});
async function setup(t){
 const a=await fixture(t);a.run("S.chats=[{id:'chat',title:'合成聊天',createdAt:1}];S.messages=[];S.operations=[];S.memories=[];UI.agentChatId='chat';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};UI.agentThinking=false;UI.agentSending=null;AIService.source=()=> 'hosted';AIService.setDegraded=()=>{};");
 await a.run("DB.put('chats',S.chats[0])");return a;
}
for(const preference of ['auto','chat','planning','task'])test('real send entry preserves '+preference+' as a hint and corrects previous candidate without writes',async t=>{
 const a=await setup(t);a.ctx.preference=preference;
 a.ctx.first={type:'workflow',intent:'propose',entries:[{action:{kind:'create_schedule',item:{title:'复习',exec_date:'2026-12-25',time_type:'exact',start_time:'15:00',end_time:'16:00',base_score:7}}}]};
 a.run("sent=[];AIService.hostedRequest=async body=>{sent.push(body);return first}");a.element('#agent-input').value='帮我创建12月25日15点到16点复习';await a.run('UI.sendAgentMessage()');
 const c=a.json('UI.assistantCandidateContext()[0]');
 a.ctx.next={type:'workflow',intent:'propose',entries:[{card_id:c.card_id,version:c.version,patch:{start_time:'16:00',end_time:'17:00',time_type:'exact'}}]};
 a.run('UI.agentSelectedRole=preference;AIService.hostedRequest=async body=>{sent.push(body);return next}');a.element('#agent-input').value='不，是16点到17点';await a.run('UI.sendAgentMessage()');
 assert.equal(a.run('sent.at(-1).agent_role'),preference);assert.equal(a.run('sent.at(-1).context.candidate_cards.length'),1);
 assert.equal(a.run('UI.assistantCurrentCards()[0].meta.action.item.start_time'),'16:00');assert.equal(a.run('S.tasks.length'),0);
 const card=a.json('UI.assistantCurrentCards()[0]');a.ctx.refs=[{id:card.id,version:card.meta.workflow.version}];await a.run('UI.confirmAgentSelection(refs)');
 assert.equal((await a.snapshot()).tasks.length,1);assert.equal(a.run('S.tasks[0].startTime'),'16:00');assert.equal(a.run('UI.agentSelectedRole'),'auto');
});
for(const preference of ['auto','chat','planning','task'])test('hosted '+preference+' has the same full contract, with a bounded preference hint',async()=>{
 let sent;const check=createModelCheck({key:'synthetic',request:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({type:'chat',reply:'先讨论方案。'})}}]})}}});
 let result,code;await check.handler({method:'POST',headers:{},body:{mode:'agent',agent_role:preference,request_id:'1'.repeat(32),device_id:'syntheticdevice0123456789abcd',message:'先聊聊，不要创建',context:{candidate_cards:[]}}},{status(n){code=n;return this},json(value){result=value;return value}});
 assert.equal(code,200);assert.equal(result.type,'chat');assert.equal(sent.max_tokens,6000);assert.equal(sent.messages[0].content.startsWith(wf.assistantPrompt(preference)),true);
 assert.ok(!/提醒可以交给卷卷事务|格式只能是/.test(sent.messages[0].content));
});
test('every hint receives selected records and only authorized memory',async t=>{
 const a=await setup(t);a.run("S.tasks=[{id:'past',title:'历史课程',execDate:'2025-01-01',timeType:'allday'}];S.memories=[{id:'m',status:'confirmed',category:'个人基本信息',content:'合成偏好'}];");
 for(const role of ['auto','chat','planning','task']){a.ctx.hint=role;a.run('S.pet.memoryEnabled=false');const c=a.json("UI.agentContext('chat','2025年1月1日历史课程',hint)");assert.ok(c.tasks.some(t=>t.id==='past'));assert.equal(c.memories.length,0);assert.equal(c.selection.partial,true);}
});
test('card actions share styles and clearly distinguish selection, confirmation and conversation',async t=>{
 const a=await setup(t);a.run("m={id:'card',role:'assistant',type:'proposal',content:'请核对',createdAt:1,meta:{agentRole:'task',status:'pending',action:{kind:'create_todo',item:{title:'合成待办',base_score:2}},workflow:{cardId:'c',version:1}}};");const html=a.run('UI.agentMessageHtml(m)');
 assert.match(html,/assistant-card-tools/);assert.match(html,/assistant-card-select/);assert.match(html,/继续沟通/);assert.doesNotMatch(html,/重新沟通|卷卷事务/);assert.match(html,/class="secondary" data-assistant-talk/);
});
test('message timestamps follow the last displayed minute across both speakers',async t=>{
 const a=await setup(t);
 a.run("timeline=[40,40,41,42,43,44].map((minute,i)=>({id:String(i),role:i%2?'assistant':'user',content:'合成消息'+i,createdAt:new Date(2027,0,1,16,minute,i===3?0:59).getTime()}))");
 const html=a.run('UI.agentMessagesHtml(timeline)');
 assert.deepEqual([...html.matchAll(/class="agent-message-time">(.*?)<\/div>/g)].map(m=>m[1]),['16:40','16:42','16:44']);
 assert.equal((html.match(/class="agent-bubble"/g)||[]).length,6);
 assert.equal(a.run('UI.agentMessagesHtml(timeline)'),html);
 assert.match(a.run('UI.agentMessagesHtml(timeline.slice(2,3))'),/agent-message-time">16:41/);
});
test('timestamps restart on a new calendar day even within two minutes',async t=>{
 const a=await setup(t);
 a.run("timeline=[new Date(2027,0,1,23,59),new Date(2027,0,2,0,0),new Date(2027,0,2,0,1),new Date(2027,0,2,0,2)].map((date,i)=>({role:'assistant',content:'合成消息'+i,createdAt:date.getTime()}))");
 const html=a.run('UI.agentMessagesHtml(timeline)');
 assert.deepEqual([...html.matchAll(/class="agent-message-time">(.*?)<\/div>/g)].map(m=>m[1]),['23:59','00:00','00:02']);
});
test('plain replies stay compact while candidate cards retain their layout after confirmation',async t=>{
 const a=await setup(t);
 a.run("m={id:'card',role:'assistant',type:'proposal',content:'请核对',createdAt:1,meta:{status:'pending',action:{kind:'create_todo',item:{title:'合成待办',base_score:2}},workflow:{cardId:'c',version:1}}}");
 assert.match(a.run('UI.agentMessageHtml(m)'),/class="agent-bubble has-details"/);
 a.run("m.type='action_result';m.meta.status='done'");
 assert.match(a.run('UI.agentMessageHtml(m)'),/class="agent-bubble has-details"/);
 const html=a.run("UI.agentMessageHtml({role:'assistant',type:'chat',content:'好的。',createdAt:1},false)");
 assert.match(html,/class="agent-avatar"/);assert.match(html,/class="agent-bubble">好的。/);
 assert.doesNotMatch(html,/has-details|agent-message-time/);
 assert.match(html,/data-open-persona aria-label="查看卷卷信息与人设"/);
});
test('candidate revisions retain card identity and saved records retain database identity',async t=>{
 const a=await setup(t);a.run("S.tasks=Array.from({length:23},(_,i)=>({id:'background'+i,title:'其他事项'+i,execDate:'2026-12-10',timeType:'allday',baseScore:3}));");await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");
 a.ctx.answer={type:'workflow',intent:'propose',entries:[{action:{kind:'create_schedule',item:{title:'检查投影仪',exec_date:'2026-12-30',time_type:'exact',start_time:'15:00',end_time:'16:00',base_score:3}}},{action:{kind:'create_todo',item:{title:'归档发票',base_score:3}}}]};
 await a.run("UI.applyAssistantWorkflow(answer,'chat','创建这两项。')");await a.run('UI.confirmAgentSelection(UI.assistantCurrentCards().map(m=>({id:m.id,version:1})))');
 const context=a.json("UI.agentContext('chat','地点在C楼，补充备注。','auto')"),ids=a.json('S.messages.flatMap(m=>m.meta?.recordIds||[])');
 assert.equal(context.candidate_cards.length,2);assert.equal(context.tasks.length,24);assert.equal(context.todos.length,1);
 assert.ok(context.tasks.some(t=>ids.includes(t.id)));assert.equal(context.selection.tasks_total,24);assert.equal(context.selection.partial,true);
 const c=context.candidate_cards[0];a.ctx.wrong={type:'workflow',intent:'propose',entries:[{card_id:ids[0],version:1,append_note:'错误引用'}]};
 await assert.rejects(a.run("UI.applyAssistantWorkflow(wrong,'chat','补充备注')"),/范围或版本/);
 a.ctx.right={type:'workflow',intent:'propose',entries:[{card_id:c.card_id,version:1,append_note:'地点：C楼'}]};await a.run("UI.applyAssistantWorkflow(right,'chat','地点在C楼，补充备注。')");
 const revised=a.json("UI.agentContext('chat','再加一个备注','auto')");assert.equal(revised.candidate_cards[0].action.target_id,undefined);assert.ok(revised.tasks.some(t=>ids.includes(t.id)));
});
