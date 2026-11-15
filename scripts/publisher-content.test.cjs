'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
const samples=require('./fixtures/publisher-content.json');
const fieldEvidence=[];
after(()=>{if(!process.env.PUBLISH_SOURCE){const fs=require('node:fs');fs.mkdirSync('.reports',{recursive:true});fs.writeFileSync('.reports/issue60-fields.json',JSON.stringify(fieldEvidence,null,2)+'\n')}});
async function setup(t,kind='schedule'){
 const a=await fixture(t,kind);a.ctx.kind=kind;a.ctx.setInterval=()=>0;
 a.run(`NativeDate=Date;Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[2026,10,15,10,0]))}static now(){return new NativeDate(2026,10,15,10,0).getTime()}};UI.resetCreate(kind);PetView.startBehaviorLoop=PetView.moveCat=PetView.startWander=PetSystem.tickDecay=()=>{};App.bind();UI.cState.date='2026-11-22';UI.cState.calMonth='2026-11';UI.cState.timeType='exact';UI.cState.start='10:00';UI.cState.end='11:00';UI.cState.tag='个人项目';UI.cState.userFields={date:true,time:true,tag:true};UI.cState.images=[{id:'sample-image',name:'合成图片',data:'data:image/png;base64,AA=='}]`);
 const input=raw=>{a.element('#c-title').value=raw;a.element('#c-title').listeners.input()};
 return {...a,input};
}
for(const sample of samples)for(const kind of ['schedule','todo'])for(const mode of ['quick','success','failure'])test(sample.id+' '+kind+' '+mode+' content and persisted fields',async t=>{
 const a=await setup(t,kind),pet=a.json('S.pet');a.input(sample.raw);
 if(sample.manual){a.element('#c-result-title').listeners.input({target:{value:sample.title}});a.element('#c-note').listeners.input({target:{value:sample.note}})}
 if(mode==='success')a.run("AIService.evaluate=async()=>({task:'模型改写，不应采用',note:'模型编造，不应采用',base_score:8.4,source:'ai',detected_date:'2026-12-05',detected_time:'15:00-16:00'})");
 if(mode==='failure')a.run("AIService.evaluate=async()=>{throw Error('synthetic offline')}");
 if(mode!=='quick')await a.run('UI.onAIClick()');
 if(mode!=='failure')await a.run('UI.onSave()');
 const snapshot=await a.snapshot(),rows=snapshot[kind==='todo'?'todos':'tasks'];
 assert.equal(rows.length,sample.invalid?0:1);assert.deepEqual(a.json('S.pet'),pet);assert.deepEqual(a.json('S.dayStats'),{});
 if(sample.invalid)return;
 const row=rows[0];fieldEvidence.push({id:sample.id,kind,mode,input:sample.raw,expected:{title:sample.title,note:sample.note,date:kind==='schedule'?'2026-11-22':null,time:kind==='schedule'?'10:00至11:00':null,category:'个人项目'},actual:row});assert.equal(row.title,sample.title);assert.equal(row.note,sample.note);assert.equal(row.images[0].name,'合成图片');assert.equal(row.category,'个人项目');assert.equal(row.baseScore,mode==='success'?8.4:sample.id==='N06'?2:3);assert.equal(row.aiSource,mode==='success'?'ai':'rule');
 assert.equal(snapshot[kind==='todo'?'tasks':'todos'].length,0);
 if(kind==='schedule'){assert.equal(row.execDate,'2026-11-22');assert.equal(row.timeType,'exact');assert.equal(row.startTime,'10:00');assert.equal(row.endTime,'11:00');assert.equal(row.status,null)}else{assert.equal(row.period,'week');assert.equal(row.done,false)}
 assert.equal(row.links.includes('https://example.com'),sample.id==='N07');
 const before=await a.snapshot();await a.run('UI.onSave()');assert.deepEqual(await a.snapshot(),before);
});
for(const raw of ['买牛奶，然后取快递','不买电脑，明天维修旧电脑','阅读Chapter3 2023年笔记','比较电脑价格1800元','整理书桌，先收书再擦桌','下午整理书桌。','任务 https://example.com/a'])test('conservative first line '+raw,async t=>{const a=await setup(t);a.ctx.raw=raw;assert.deepEqual(a.json('localPublishContent(raw)'),{title:raw,note:''})});
test('blank normalization preserves interior blank, indented and repeated note lines',async t=>{const a=await setup(t);a.input(' \r\n整理书桌\r\n先收书\r\n\r\n  再擦桌\r\n再擦桌\r\n ');assert.equal(a.run('UI.cState.resultTitle'),'整理书桌');assert.equal(a.run('UI.cState.resultNote'),'先收书\n\n  再擦桌\n再擦桌')});
for(const [raw,title,note] of [['整'.repeat(301),'',''],['标题\n'+'备'.repeat(1500),'',''],['整理书桌','整'.repeat(301),''],['整理书桌','整理书桌','备'.repeat(1501)]])test('oversized content is retained with zero writes '+raw.length+'/'+title.length+'/'+note.length,async t=>{const a=await setup(t);a.input(raw);if(title){a.run('UI.cState.userFields.title=UI.cState.userFields.note=true');a.ctx.title=title;a.ctx.note=note;a.run('UI.cState.resultTitle=title;UI.cState.resultNote=note')}const before=a.json('UI.cState');await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('UI.cState.resultTitle'),before.resultTitle);assert.equal(a.run('UI.cState.resultNote'),before.resultNote);assert.match(a.notices.at(-1),/超过.*未截断/) });
test('late AI preserves manual fields, punctuation and score after repeat recognition',async t=>{const a=await setup(t);a.input('明天下午整理书桌。\n带抹布');a.run('AIService.evaluate=()=>new Promise(resolve=>late=resolve);pending=UI.onAIClick()');a.element('#c-result-title').listeners.input({target:{value:'手写定义。'}});a.element('#c-note').listeners.input({target:{value:'手写备注\n原样'}});a.run("late({task:'错误',note:'错误',base_score:8.4,source:'ai'})");await a.run('pending');a.run("AIService.evaluate=async()=>({task:'错误',note:'错误',base_score:8.4,source:'ai'})");await a.run('UI.onAIClick()');assert.equal(a.run('UI.cState.resultTitle'),'手写定义。');assert.equal(a.run('UI.cState.resultNote'),'手写备注\n原样');await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks[0].baseScore,8.4);
});
for(const change of ['cancel','replace-raw','new-draft'])test('late recognition never publishes or replaces '+change,async t=>{
 const a=await setup(t);a.input('明天复习课程\n带讲义');a.run('AIService.evaluate=()=>new Promise(resolve=>late=resolve);pending=UI.onAIClick()');
 if(change==='cancel')a.run('UI.cancelRecognition()');
 if(change==='replace-raw')a.input('整理书桌。\n带抹布');
 if(change==='new-draft'){a.run("UI.resetCreate('schedule')");a.input('整理书桌。\n带抹布')}
 a.run("late({task:'旧结果',note:'错误',base_score:9.9,source:'ai'})");await a.run('pending');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('UI.cState.resultTitle'),change==='cancel'?'明天复习课程':'整理书桌。');assert.equal(a.run('UI.cState.resultNote'),change==='cancel'?'带讲义':'带抹布');
});
test('draft restore and storage failure preserve text, media and single retry',async t=>{
 const a=await setup(t);a.input('明天复习课程。\n带讲义\nhttps://example.com');a.run("UI.saveCreateDraft();UI.resetCreate('schedule');UI.restoreCreateDraft();savedBatch=DB.batch;DB.batch=async()=>{throw Error('synthetic failure')}");
 await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,0);assert.equal(a.run('UI.cState.resultNote'),'带讲义\nhttps://example.com');assert.equal(a.run('UI.cState.images.length'),1);a.run('DB.batch=savedBatch');await a.run('UI.onSave()');assert.equal((await a.snapshot()).tasks.length,1);
 a.run("DB._db.close()");await a.run('DB.open()');assert.equal((await a.snapshot()).tasks[0].title,'明天复习课程。');
});
test('links from manually edited definition remain attached',async t=>{const a=await setup(t);a.input('整理书桌');a.element('#c-result-title').listeners.input({target:{value:'整理书桌 https://example.com/new'}});await a.run('UI.onSave()');assert.deepEqual((await a.snapshot()).tasks[0].links,['https://example.com/new'])});
for(const kind of ['schedule','todo'])test('edit and failed recognition preserve original identity, repeated notes and links '+kind,async t=>{
 const a=await setup(t,kind);a.input('明天复习课程。\n带讲义\n带讲义\nhttps://example.com');await a.run('UI.onSave()');const store=kind==='todo'?'todos':'tasks',before=(await a.snapshot())[store][0];a.ctx.id=before.id;
 a.run(kind==='todo'?'UI.openTodoEditor(id)':'UI.startEdit(id)');assert.equal(a.run('UI.cState.rawText'),'明天复习课程。\n带讲义\n带讲义\nhttps://example.com');
 a.run("AIService.evaluate=async()=>{throw Error('offline')}");await a.run('UI.onAIClick()');assert.deepEqual((await a.snapshot())[store][0],before);
 a.element('#c-result-title').listeners.input({target:{value:'手改定义。'}});await a.run('UI.onSave()');const after=(await a.snapshot())[store];assert.equal(after.length,1);assert.equal(after[0].id,before.id);assert.equal(after[0].note,before.note);assert.deepEqual(after[0].images,before.images);assert.deepEqual(after[0].links,before.links);
});
test('edit input appends only links missing from existing text',async t=>{const a=await setup(t);a.ctx.row={title:'整理书桌',note:'重复\n重复\nhttps://example.com/a',links:['https://example.com/a','https://example.com/b']};assert.equal(a.run('publishEditText(row)'),'整理书桌\n重复\n重复\nhttps://example.com/a\nhttps://example.com/b')});
test('earliest supported inline boundary precedes later labelled metadata',async t=>{const a=await setup(t);a.input('维修旧电脑 联想y9000 2023年 地点是维修站\n带电源');assert.equal(a.run('UI.cState.resultTitle'),'维修旧电脑');assert.equal(a.run('UI.cState.resultNote'),'联想y9000 2023年 地点是维修站\n带电源')});
