'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./publisher-fixture.cjs');
const materials=require('../src/assistant/materials.js');
const {openBudget}=require('./helpers/issue119-budget.cjs');
const picture=id=>({id,name:'notice.png',data:'data:image/png;base64,AA=='});
async function setup(t){
 const a=await fixture(t);
 a.run("S.chats=[{id:'chat',title:'合成聊天'}];S.messages=[];S.operations=[];UI.agentChatId='chat';UI.renderAgent=()=>{};UI.resizeAgentInput=()=>{};AIService.source=()=> 'custom';AIService.setDegraded=()=>{};");
 a.ctx.config={endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'synthetic'};
 a.run('AIService.customConfig=()=>config;AIService.customRequest=async()=>({type:"chat",reply:"已回答"})');
 await a.run("DB.put('chats',S.chats[0])");return a;
}
test('sent text draft does not reappear after successful reply and reopening',async t=>{
 const a=await setup(t);a.element('#agent-input').value='已发送的文字';await a.run('UI.saveMaterialDraft();UI.sendAgentMessage()');
 assert.equal(await a.run("DB.get('kv','assistant-draft:chat')"),undefined);
 await a.run('UI.restoreMaterialDraft()');assert.equal(a.element('#agent-input').value,'');
});
test('image reading blocks send until the selected pixels are ready',async t=>{
 const a=await setup(t);a.run('UI.agentPictureRead={}');a.element('#agent-input').value='等待图片';await a.run('UI.sendAgentMessage()');
 assert.equal(a.run('S.messages.length'),0);assert.equal(a.element('#agent-input').value,'等待图片');
});
test('delayed draft restore does not overwrite newer input',async t=>{
 const a=await setup(t);let release;a.ctx.read=()=>new Promise(resolve=>{release=resolve;});a.run('DB.get=read');
 const restoring=a.run('UI.restoreMaterialDraft()');a.element('#agent-input').value='newer';release({text:'old',images:[]});await restoring;
 assert.equal(a.element('#agent-input').value,'newer');assert.equal(a.element('#agent-input').disabled,false);
});
test('sending during draft restoration creates no message',async t=>{
 const a=await setup(t);a.run('UI.agentDraftRead={}');a.element('#agent-input').value='waiting';await a.run('UI.sendAgentMessage()');
 assert.equal(a.run('S.messages.length'),0);assert.equal(a.element('#agent-input').value,'waiting');
});
test('source metadata survives proposal conversion to the unified candidate flow',async t=>{
 const a=await setup(t);a.ctx.JuanjuanMaterials={...materials,collect:async()=>({content:'page text',evidence:[{kind:'link',title:'source',url:'https://example.com/'}]})};
 a.run("AIService.customRequest=async()=>({type:'proposal',reply:'请确认',action:{kind:'create_todo',item:{title:'整理资料',base_score:3}}})");a.element('#agent-input').value='阅读 https://example.com/ 后创建待办整理资料';await a.run('UI.sendAgentMessage()');
 assert.equal(a.run('S.messages.filter(m=>m.meta?.materials).length'),1);assert.equal(a.run('S.todos.length'),0);
});
test('deleting a chat also removes its private draft but preserves other chat drafts',async t=>{
 const a=await setup(t);await a.run("DB.put('kv',{text:'private',images:[]},'assistant-draft:chat');DB.put('kv',{text:'other',images:[]},'assistant-draft:other');removeChatData('chat')");
 assert.equal(await a.run("DB.get('kv','assistant-draft:chat')"),undefined);assert.equal((await a.run("DB.get('kv','assistant-draft:other')")).text,'other');
});
test('combined search and image results share one aggregate bound',()=>{
 assert.throws(()=>materials.combine({content:'a'.repeat(40000),evidence:[]},{content:'b'.repeat(40000),evidence:[]}),/过长|超限/);
});
test('a new topic containing an incidental reference word does not reuse material',()=>{
 assert.equal(materials.selectPrevious('学代数时其中有哪些逻辑需要注意',[{content:'old webpage',evidence:[{kind:'link'}]}]),null);
});
test('an explicit webpage follow-up selects the webpage even after a newer image',()=>{
 const result=materials.selectPrevious('刚才那个网页说明了什么',[{content:'PAGE',evidence:[{kind:'link'}]},{content:'IMAGE',evidence:[{kind:'image'}]}]);
 assert.equal(result.content,'PAGE');assert.equal(result.evidence[0].reused,true);
});
test('assistant persistence failure keeps original text and selected image draft',async t=>{
 const a=await setup(t);a.ctx.pics=[picture('original')];a.run('UI.agentPictures=pics');a.element('#agent-input').value='保留图片原文';
 a.ctx.JuanjuanMaterials={...materials,collect:async()=>({content:'pixels read',evidence:[]})};
 a.run("originalPut=DB.put.bind(DB);DB.put=async(store,value,key)=>{if(store==='messages'&&value.role==='assistant')throw Error('synthetic write failure');return originalPut(store,value,key)}");
 await a.run('UI.sendAgentMessage()');const draft=await a.run("DB.get('kv','assistant-draft:chat')");
 assert.equal(draft?.images[0].id,'original');assert.equal(a.run('UI.agentPictures[0]?.id'),'original');assert.equal(a.element('#agent-input').value,'保留图片原文');
});
test('old retry cannot mutate current input or pictures during an active send',async t=>{
 const a=await setup(t);a.run("S.messages=[{id:'u',chatId:'chat',role:'user',content:'old',createdAt:1},{id:'e',chatId:'chat',role:'assistant',type:'error',createdAt:2}];UI.agentThinking=true");
 a.ctx.pics=[picture('current')];a.run('UI.agentPictures=pics');a.element('#agent-input').value='current';await a.run("UI.retryAgentMessage('e')");
 assert.equal(a.element('#agent-input').value,'current');assert.equal(a.run('UI.agentPictures[0].id'),'current');
});

test('a rejected candidate result retains the original text and picture draft',async t=>{
 const a=await setup(t);a.ctx.pics=[picture('original')];a.run('UI.agentPictures=pics');a.element('#agent-input').value='核对这张图的事项';
 a.ctx.JuanjuanMaterials={...materials,collect:async()=>({content:'read pixels',evidence:[]})};
 a.run("AIService.customRequest=async()=>({type:'workflow',intent:'propose',reply:'请确认',entries:[]});UI.applyAssistantWorkflow=async()=>({type:'clarify',reply:'需要补充信息'})");
 await a.run('UI.sendAgentMessage()');
 assert.equal(a.element('#agent-input').value,'核对这张图的事项');assert.equal(a.run('UI.agentPictures[0].id'),'original');
 assert.equal((await a.run("DB.get('kv','assistant-draft:chat')")).images[0].id,'original');
});
test('concurrent image decodes cannot exceed the three-image limit',async t=>{
 const a=await setup(t),pending=[];a.ctx.pics=[picture('one'),picture('two')];a.run('UI.agentPictures=pics');
 a.ctx.JuanjuanMaterials={...materials,readImage:f=>new Promise(resolve=>pending.push(()=>resolve(picture(f))))};
 const first=a.run("UI.addMaterialImages(['three'])");while(!pending.length)await new Promise(setImmediate);
 const second=a.run("UI.addMaterialImages(['four'])");await new Promise(setImmediate);pending.forEach(release=>release());await Promise.all([first,second]);
 assert.equal(a.run('UI.agentPictures.length'),3);
});
test('all legitimate mixed sources survive backup validation',async t=>{
 const a=await setup(t);a.ctx.evidence=Array.from({length:10},(_,i)=>({kind:i<3?'image':'search',title:'source '+i,...(i<3?{imageId:'i'+i}:{url:'https://example.com/'+i})}));
 a.run("S.messages=[{id:'m',chatId:'chat',role:'assistant',content:'合成回答',meta:{materials:{content:'synthetic',evidence}}}];backup={app:'卷卷AI Todo',version:'2.2',...Object.fromEntries([...DATA_STORES,...DATA_KV].map(k=>[k,S[k]])),appearance:{followSystem:true,lightTheme:'warm',darkTheme:'soft',fixedTheme:'warm'}}");
 assert.doesNotThrow(()=>a.run('validateBackup(backup)'));
});
test('combined webpage and image interpretation obey one aggregate content limit',async()=>{
 const config={endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'synthetic'};
 await assert.rejects(materials.collect({text:'https://example.com',pictures:[picture('p')]},config,null,async url=>({ok:true,json:async()=>url.endsWith('/fetch')?{content:'x'.repeat(65000)}:{choices:[{finish_reason:'stop',message:{content:'y'.repeat(1000)}}]}})),/过长|超限/);
});
test('valid JSON with corrupt budget amounts is rejected before any reservation',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'issue119-review-')),b=openBudget(root,{initialize:true});b.close();
 const file=path.join(root,'budget.json'),s=JSON.parse(fs.readFileSync(file));s.attempts=[{id:'bad',kind:'model',reservedMicroCny:-200000,status:'unknown'}];fs.writeFileSync(file,JSON.stringify(s));
 assert.throws(()=>{const invalid=openBudget(root);invalid.close();},/Invalid|budget/i);
});
for(const url of ['http://0.0.0.0','http://100.64.0.1','http://198.18.0.1','http://224.0.0.1'])test('nonpublic destination rejected '+url,()=>assert.equal(materials.publicURL(url),null));
