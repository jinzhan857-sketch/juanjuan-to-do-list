'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
async function setup(t){const a=await fixture(t);a.run("NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[2026,10,15,10,0]))}static now(){return new NativeDate(2026,10,15,10,0).getTime()}};S.tasks=[];S.todos=[];S.messages=[];S.operations=[];S.chats=[{id:'chat',title:'合成'}];UI.currentAgentChat=()=>S.chats[0];UI.agentChatId='chat';UI.agentSelectedRole='task';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};");return a;}
test('explicit query date range is preserved instead of treated as mutation ambiguity',async t=>{
 const a=await setup(t);const q=a.json("UI.resolveAgentQuery({entity:'schedule',date_from:'2025-01-01',date_to:'2025-01-02',keyword:'',status:'all'},'查询2026年11月15日到2026年11月22日的日程')");assert.ok(q);assert.equal(q.date_from,'2026-11-15');assert.equal(q.date_to,'2026-11-22');
});
test('explicit date outranks accidentally matching generic record title in bounded context',async t=>{
 const a=await setup(t);a.run("S.tasks=Array.from({length:140},(_,i)=>({id:'old'+i,title:'今天',execDate:addDays('2025-01-01',i),timeType:'allday',baseScore:3}));S.tasks.push({id:'today',title:'真正的今日事项',execDate:todayStr(),timeType:'allday',baseScore:3})");assert.ok(a.json("UI.agentContext('chat','查询今天日程','task').tasks").some(x=>x.id==='today'));
});
test('unfiltered date query does not inherit a record named after a date or entity',async t=>{
 const a=await setup(t);a.run("S.tasks=[{id:'a',title:'今天',execDate:todayStr(),timeType:'allday',baseScore:3},{id:'b',title:'课程甲',execDate:todayStr(),timeType:'allday',baseScore:3}];AIService.agent=async()=>({type:'query',query:{entity:'schedule',date_from:todayStr(),date_to:todayStr(),keyword:'',status:'all'}})");await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");a.element('#agent-input').value='查询今天日程';await a.run('UI.sendAgentMessage()');assert.equal(a.json('S.messages.at(-1).meta.total'),2);
});
for(const [suffix,expected]of [
 ['教室：A101，带电脑\n教授：老师甲','教室：A101，带电脑\n教授：老师甲'],
 ['教室：A101；带电脑。\n教授：老师甲，带讲义！','教室：A101；带电脑。\n教授：老师甲，带讲义！'],
 ['教授：Dr. 老师甲\n教室：A101','教授：Dr. 老师甲\n教室：A101'],
 ['教授：老师甲 去A101教室\n地点：教学楼','教授：老师甲 去A101教室\n地点：教学楼'],
])test('course note span retains original value: '+suffix,async t=>{const a=await setup(t);a.ctx.text='创建11到11月每周日10:00到11:00 IDAT9001\n'+suffix;const result=a.json("AIService._localAgent(text,{tasks:[],todos:[]},'task')");assert.equal(result.action.rule.note,expected)});
for(const text of ['查询今天或明天的日程','查询今天日程，不是明天','查询2026年11月22日到2026年11月15日的日程'])test('ambiguous or reversed query still asks: '+text,async t=>{const a=await setup(t);a.ctx.text=text;assert.equal(a.run("UI.resolveAgentQuery({entity:'schedule',keyword:'',status:'all'},text)"),null)});
test('date-range query checks the database, includes interior dates and changes no business data',async t=>{
 const a=await setup(t);a.run("S.tasks=Array.from({length:140},(_,i)=>({id:'old'+i,title:'背景',execDate:addDays('2025-01-01',i),timeType:'allday',baseScore:3}));for(const date of ['2026-11-14','2026-11-15','2026-11-18','2026-11-22','2026-11-23'])S.tasks.push({id:date,title:'课程',execDate:date,timeType:'allday',baseScore:3});AIService.agent=async()=>({type:'query',reply:'模拟错误数量',query:{entity:'schedule',date_from:'2025-01-01',date_to:'2025-01-02',keyword:'',status:'all'}})");await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");const before=await a.snapshot();a.element('#agent-input').value='查询2026年11月15日到2026年11月22日的日程';await a.run('UI.sendAgentMessage()');assert.deepEqual(a.json('S.messages.at(-1).meta.results.map(x=>x.id)'),['2026-11-15','2026-11-18','2026-11-22']);assert.equal(a.json('S.messages.at(-1).meta.total'),3);assert.deepEqual(await a.snapshot(),before);
 const wire=a.json("UI.agentContext('chat','查询2026年11月15日到2026年11月22日的日程','task')");assert.ok(['2026-11-15','2026-11-18','2026-11-22'].every(id=>wire.tasks.slice(0,3).some(x=>x.id===id)));assert.ok(wire.tasks.length<=100);
});
test('query range acceptance does not relax schedule mutation scope',async t=>{const a=await setup(t);a.run("S.tasks=[{id:'a',title:'课程甲',execDate:'2026-11-15'},{id:'b',title:'课程甲',execDate:'2026-11-22'}]");a.ctx.action={kind:'update_schedule',target_id:'a',item:{note:'新备注'}};assert.equal(a.run("UI.validateAgentRequest(action,'只把2026年11月15日到2026年11月22日的课程甲备注改成新备注').ok"),false)});
test('new course creation preserves freeform note prefix, punctuation, repeats and links in database',async t=>{
 const a=await setup(t);a.ctx.text='创建11到11月每周日10:00到11:00 IDAT9001\n带电脑\n教室：A101，带讲义！\n教授：Dr. 老师甲\n教授：Dr. 老师甲\nhttps://example.com';const expected='带电脑\n教室：A101，带讲义！\n教授：Dr. 老师甲\n教授：Dr. 老师甲\nhttps://example.com';a.run("action=AIService._localAgent(text,{tasks:[],todos:[]},'task').action");assert.equal(a.run('action.rule.title'),'IDAT9001');assert.equal(a.run('action.rule.note'),expected);const before=await a.snapshot();await a.run("UI.executeAgentAction(action,{id:'m',chatId:'chat'})");const after=await a.snapshot();assert.equal(after.tasks.length,5);assert.ok(after.tasks.every(x=>x.note===expected));assert.deepEqual(after.kv,before.kv);assert.deepEqual(after.todos,before.todos);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),after);
});
test('postfixed classroom belongs to note without leaking into course title',async t=>{const a=await setup(t);a.ctx.text='创建11到11月每周日10:00到11:00 IDAT9001 A101教室 教授Dr. Example';const result=a.json("AIService._localAgent(text,{tasks:[],todos:[]},'task')");assert.equal(result.action.rule.title,'IDAT9001');assert.equal(result.action.rule.note,'教室：A101\n教授：Dr. Example')});
