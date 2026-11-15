'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./publisher-fixture.cjs');
const note='教授：老师甲\n教室：A101';
async function setup(t){const a=await fixture(t);a.ctx.setInterval=()=>0;a.run("NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[2026,10,15,10,0]))}static now(){return new NativeDate(2026,10,15,10,0).getTime()}};PetView.startBehaviorLoop=PetView.moveCat=PetView.startWander=PetSystem.tickDecay=()=>{};App.bind();UI.renderAgent=()=>{};UI.agentChatId='chat';S.chats=[{id:'chat',title:'合成课程'}];S.messages=[];S.operations=[];");await a.run("DB.batch([{store:'chats',value:S.chats[0]},...DATA_KV.map(key=>({store:'kv',key,value:S[key]}))])");return a;}
test('clean course survives form, stubbed assistant, batch, conversion and backup roundtrip',async t=>{
 const a=await setup(t);a.ctx.note=note;a.element('#c-title').value='IDAT9001合成课程\n'+note;a.element('#c-title').listeners.input();await a.run('UI.onSave()');let row=(await a.snapshot()).tasks[0];assert.equal(row.note,note);a.ctx.id=row.id;
 a.run('UI.startEdit(id)');await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks[0].note,note);
 a.run("S.tasks[0].seriesId='course';S.tasks.push({...copyData(S.tasks[0]),id:'second',execDate:'2026-11-22'});");await a.run("DB.batch(S.tasks.map(value=>({store:'tasks',value})))");
 for(const kind of ['update_schedule','update_schedule_batch']){
 a.ctx.kind=kind;a.run("action=AIService.normalizeAgent({type:kind.endsWith('_batch')?'batch_proposal':'proposal',action:kind.endsWith('_batch')?{kind,rule:{series_id:'course',match_title:'IDAT9001合成课程',date_from:'2026-11-15',date_to:'2026-11-22',weekdays:[7]},item:{note}}:{kind,target_id:id,item:{note}}}).action;UI.captureAgentScope(action)");await a.run("message={id:uid(),chatId:'chat',role:'assistant',type:'proposal',content:'合成',createdAt:Date.now(),meta:{action,status:'pending'}};S.messages.push(message);DB.put('messages',message).then(()=>UI.executeAgentAction(action,message))");assert.ok((await a.snapshot()).tasks.every(x=>x.note===note));
 }
 a.run("action={kind:'convert_schedule_to_todo',target_id:id,item:{}};UI.captureAgentScope(action)");await a.run("message={id:uid(),chatId:'chat',role:'assistant',type:'proposal',content:'合成',createdAt:Date.now(),meta:{action,status:'pending'}};S.messages.push(message);DB.put('messages',message).then(()=>UI.executeAgentAction(action,message))");assert.equal((await a.snapshot()).todos[0].note,note);
 a.run("backup={app:'卷卷AI Todo',version:'2.2',...Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,copyData(S[key])])),appearance:{followSystem:true,lightTheme:'warm',darkTheme:'soft',fixedTheme:'warm'}}");const before=await a.snapshot();await a.run("DB.snapshot([...DATA_STORES,'kv']).then(expected=>replaceBackup(JSON.parse(JSON.stringify(backup)),expected))");assert.deepEqual(await a.snapshot(),before);a.run('DB._db.close()');await a.run('DB.open()');assert.deepEqual(await a.snapshot(),before);
});
for(const input of ['创建11到11月每周日10:00到11:00 IDAT9001 教室：A101 教授：老师甲','创建11到11月每周日10:00到11:00 IDAT9001\n教室：A101\n教授：老师甲'])test('local assistant metadata extracts each input span once '+JSON.stringify(input),async t=>{
 const a=await setup(t);a.ctx.input=input;const result=a.json("AIService._localAgent(input,{tasks:[],todos:[]},'task')");assert.equal(result.action.rule.note,'教室：A101\n教授：老师甲');
});
for(const [suffix,expected]of [
 ['教授：老师甲\n教室：A101','教授：老师甲\n教室：A101'],
 ['教授：老师甲\n教授：老师甲\n教室：A101','教授：老师甲\n教授：老师甲\n教室：A101'],
 ['教室：A101\n带电脑\n\n教授：Dr. A. Example','教室：A101\n带电脑\n\n教授：Dr. A. Example'],
 ['A101教室 教授Dr. A. Example','教室：A101\n教授：Dr. A. Example'],
 ['地点：教学楼 教室：A101 老师是老师甲','地点：教学楼\n教室：A101\n教授：老师甲'],
 ['教室 A101 教授 老师甲','教室：A101\n教授：老师甲'],
 ['教室是A101 教授为老师甲','教室：A101\n教授：老师甲'],
])test('metadata retains order and deliberate duplicate: '+suffix,async t=>{const a=await setup(t);a.ctx.input='创建11到11月每周日10:00到11:00 IDAT9001 '+suffix;assert.equal(a.json("AIService._localAgent(input,{tasks:[],todos:[]},'task')").action.rule.note,expected)});
test('preexisting repeated lines survive repeated form editing and failed recognition',async t=>{
 const a=await setup(t),repeated='教室：A101\n教授：老师甲\n\n教授：老师甲\nhttps://example.com';a.element('#c-title').value='历史合成课程\n'+repeated;a.element('#c-title').listeners.input();await a.run('UI.onSave()');const original=(await a.snapshot()).tasks[0];a.ctx.id=original.id;
 for(let i=0;i<3;i++){a.run("UI.startEdit(id);AIService.evaluate=async()=>{throw Error('synthetic offline')}");await a.run('UI.onAIClick()');await a.run('UI.onSave()');const row=(await a.snapshot()).tasks[0];assert.equal(row.note,repeated);assert.equal(row.id,original.id);assert.deepEqual(row.images,original.images);assert.deepEqual(row.links,original.links);}
});
test('hosted and custom model result sanitizers preserve intentional lines and order',async t=>{
 const a=await setup(t),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const api=vm.createContext({require,module:{exports:{}},process:{env:{}},console,URL,AbortController,DOMException,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/ai.js'),'utf8'),api);
 const data={type:'proposal',action:{kind:'create_schedule',item:{title:'IDAT9001',note:'教授：老师甲\n教室：A101\n教授：老师甲',exec_date:'2026-11-15',time_type:'allday',base_score:7}}};api.data=data;a.ctx.data=data;
 assert.equal(JSON.parse(vm.runInContext('JSON.stringify(parseAgentResult(JSON.stringify(data),{}))',api)).action.item.note,data.action.item.note);assert.equal(a.json('AIService.normalizeAgent(data)').action.item.note,data.action.item.note);
});
