'use strict';
require('./publisher-time-browser.cjs')({port:4207,database:'juanjuan-recognition-failure-synthetic',extra:String.raw`
for(const kind of ['schedule','todo'])for(const failure of ['network','timeout','invalid','device','ip','global']){
 UI.resetCreate(kind);UI.switchPage('create');const input=document.querySelector('#c-title');input.value='明天下午三点复习课程\n带笔记本和讲义';input.dispatchEvent(new Event('input',{bubbles:true}));UI.cState.images=[{id:'failure-image',name:'合成',data:'data:image/png;base64,AA=='}];
 const before=await DB.snapshot(['tasks','todos','kv']);const expected=failure==='network'?'网络错误，请重试。':failure==='timeout'?'识别超时，请重试。':failure==='device'?'今日个人免费AI次数已达上限。':failure==='ip'?'今日当前网络免费AI次数已达上限。':failure==='global'?'今日公共免费AI次数已达上限。':'识别失败，请重试。';
 AIService.evaluate=async()=>{if(failure==='network')throw TypeError('offline');if(failure==='timeout')throw Object.assign(Error('timeout'),{code:'request_timeout'});if(['device','ip','global'].includes(failure))throw Object.assign(Error('quota'),{status:429,limit_scope:failure});throw SyntaxError('bad JSON')};
 await UI.onAIClick();if(JSON.stringify(await DB.snapshot(['tasks','todos','kv']))!==JSON.stringify(before))throw Error('failure saved');if(document.querySelector('#c-ai-status').textContent!==expected)throw Error('short message');if(UI.cState.images.length!==1||input.value!=='明天下午三点复习课程\n带笔记本和讲义')throw Error('draft lost');
 await UI.onSave();const after=await DB.snapshot(['tasks','todos','kv']),store=kind==='todo'?'todos':'tasks';const saved=after[store].filter(x=>!before[store].some(y=>y.id===x.id));if(saved.length!==1||saved[0].images.length!==1||saved[0].note!=='带笔记本和讲义'||saved[0].finalScore!==0)throw Error('manual save');if(JSON.stringify(S.pet)!==pet||JSON.stringify(S.dayStats)!=='{}')throw Error('reward');results.push({case:kind+' '+failure,pass:true});
}
`});
