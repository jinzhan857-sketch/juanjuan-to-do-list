'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
for(const kind of ['schedule','todo'])for(const failure of ['network','timeout','json','http','invalid'])test(kind+' '+failure+' only shows short error and never saves',async t=>{
 const a=await fixture(t,kind);const before=await a.snapshot();
 const errors={network:"TypeError('offline')",timeout:"Object.assign(Error('timeout'),{code:'request_timeout'})",json:"SyntaxError('bad JSON')",http:"Object.assign(Error('provider error'),{status:503})",invalid:"Error('invalid result')"};
 a.run(`AIService.evaluate=async()=>{throw ${errors[failure]}}`);
 await a.run('UI.onAIClick()');assert.deepEqual(await a.snapshot(),before);assert.equal(a.run('UI.cState.images.length'),1);
 const expected=failure==='network'?'网络错误，请重试。':failure==='timeout'?'识别超时，请重试。':'识别失败，请重试。';
 assert.equal(a.notices.at(-1),expected);assert.equal(a.run('UI.cState.aiFailureReason'),expected);
 await a.run('UI.onSave()');assert.equal((await a.snapshot())[kind==='todo'?'todos':'tasks'].length,1);assert.equal(a.run('S.dayStats[todayStr()]'),undefined);
});
test('failure preserves manual fields, attachment and draft on reopen',async t=>{const a=await fixture(t);a.element('#c-title').value='明天复习\n带讲义';a.run("UI.syncPublishContent(document.querySelector('#c-title').value);UI.cState.resultTitle='手写标题';UI.cState.resultNote='手写备注';UI.cState.date='2026-12-03';UI.cState.timeType='exact';UI.cState.start='10:00';UI.cState.end='11:00';UI.cState.userFields={title:true,note:true,date:true,time:true};AIService.evaluate=async()=>{throw TypeError('offline')}");await a.run('UI.onAIClick()');a.run("UI.resetCreate('schedule');UI.restoreCreateDraft()");assert.equal(a.run('UI.cState.resultTitle'),'手写标题');assert.equal(a.run('UI.cState.resultNote'),'手写备注');assert.equal(a.run('UI.cState.date'),'2026-12-03');assert.equal(a.run('UI.cState.start'),'10:00');assert.equal(a.run('UI.cState.images.length'),1);assert.equal((await a.snapshot()).tasks.length,0)});

test('cancel and normal clarification do not become error notices or writes',async t=>{for(const cancel of [true,false]){const a=await fixture(t);const before=await a.snapshot();if(cancel){a.run('AIService.evaluate=()=>new Promise(resolve=>late=resolve);pending=UI.onAIClick();UI.cancelRecognition();late({base_score:8.4,source:"ai"})');await a.run('pending')}else{a.run('AIService.evaluate=async()=>({vague:true,reason:"补充信息"})');await a.run('UI.onAIClick()')}assert.deepEqual(await a.snapshot(),before);assert.equal(a.notices.length,0)}});
test('failure and manual retry do not auto retry or duplicate business data',async t=>{const a=await fixture(t);a.run("calls=0;AIService.evaluate=async()=>{calls++;throw Error('synthetic')}");await a.run('UI.onAIClick()');assert.equal(a.run('calls'),1);assert.equal((await a.snapshot()).tasks.length,0);await a.run('UI.onAIClick()');assert.equal(a.run('calls'),2);assert.equal((await a.snapshot()).tasks.length,0);await a.run('Promise.all([UI.onSave(),UI.onSave()])');assert.equal((await a.snapshot()).tasks.length,1)});
