'use strict';
require('./publisher-time-browser.cjs')({port:4195,database:'juanjuan-request-synthetic',extra:String.raw`for(const action of ['cancel','replace','clarify','save-fail','render-fail']){
 UI.resetCreate('schedule');UI.switchPage('create');const input=document.querySelector('#c-title');input.value='明天下午三点复习课程\n带笔记本和讲义';input.dispatchEvent(new Event('input',{bubbles:true}));UI.cState.images=[{id:'request-pic',name:'合成',data:'data:image/png;base64,AA=='}];const before=await DB.snapshot(['tasks','todos','kv']);
 if(action==='cancel'||action==='replace'){let resolve;AIService.evaluate=()=>new Promise(r=>resolve=r);const pending=UI.onAIClick();if(action==='cancel')UI.cancelRecognition();else UI.resetCreate('todo');resolve({base_score:8.4,source:'ai'});await pending;}
 if(action==='clarify'){AIService.evaluate=async()=>({vague:true,reason:'请补充'});await UI.onAIClick();}
 if(action==='save-fail'){const batch=DB.batch;DB.batch=async()=>{throw Error('synthetic quota')};await UI.onSave();DB.batch=batch;if(JSON.stringify(await DB.snapshot(['tasks','todos','kv']))!==JSON.stringify(before)||UI.cState.images.length!==1)throw Error('failed save changed data');await UI.onSave();}
 if(action==='render-fail'){const change=UI.switchPage;UI.switchPage=()=>{throw Error('synthetic render')};await UI.onSave();UI.switchPage=change;}
 const after=await DB.snapshot(['tasks','todos','kv']);if(after.tasks.length-before.tasks.length!==(['save-fail','render-fail'].includes(action)?1:0))throw Error('request count '+action);if(JSON.stringify(S.pet)!==pet||JSON.stringify(S.dayStats)!=='{}')throw Error('reward '+action);results.push({case:'request '+action,pass:true});
}
`});
