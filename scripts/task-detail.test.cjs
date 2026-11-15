'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(status){
 const nodes=new Map();const el=k=>{if(!nodes.has(k))nodes.set(k,{innerHTML:'',open:false,focus(){this.focused=true},querySelector:el,querySelectorAll:()=>[]});return nodes.get(k)};
 const ctx=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone,document:{querySelector:el,querySelectorAll:()=>[]}});
 const html=fs.readFileSync(process.env.DETAIL_SOURCE||'index.html','utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,''),ctx);
 const run=s=>vm.runInContext(s,ctx);ctx.status=status;
 run(`t={id:'sample',title:'合成任务',execDate:'2026-11-15',timeType:'allday',category:'学业事务',createdAt:new Date(2026,10,15,9,50).getTime(),baseScore:5,aiReason:'常规处理，细分依据不足',aiAdvice:'<合成建议>',note:'备注\\n第二行',images:[{data:'data:image/png;base64,AA==',name:'合成图片'}],links:['https://example.com'],status,finalScore:1.7,statusEditCount:0};S.tasks=[t];S.pet=defaultPet();UI.mask=()=>{};DB.put=DB.batch=()=>{throw Error('unexpected write')};before=JSON.stringify(S);UI.openTaskDetail('sample')`);
 return {run,el,ctx,html:el('#task-detail-body').innerHTML};
}
test('detail orders fields, preserves old reasons and attachments without writes',()=>{
 const a=fixture(null),h=a.html;let last=-1;for(const v of ['执行日期：','创建时间：2026-11-15（周日）09.50','时间：','基础价值：','预估积分：','<div class="divider"></div>','📝 判定理由：','💡 AI建议：']){const i=h.indexOf(v,last+1);assert.ok(i>last,v);last=i;}
 assert.match(h,/常规处理，细分依据不足/);assert.match(h,/&lt;合成建议&gt;/);assert.match(h,/备注\n第二行/);assert.match(h,/alt="合成图片"/);assert.match(h,/href="https:\/\/example.com"/);assert.doesNotMatch(h,/基础价值分|评分建议|可兑换|按完成目标/);assert.equal(a.run('JSON.stringify(S)===before'),true);
});
for(const score of [0,0.1,3.8,10,13])test('estimated food follows existing conversion '+score,()=>{
 const a=fixture(null);a.ctx.score=score;a.run('ScoreEngine.estimate=()=>({full:score});UI.openTaskDetail(t.id)');const food=a.run("foodForScore(score).map(f=>f.emo).join('、')||'无食物'");assert.ok(a.el('#task-detail-body').innerHTML.includes('分（'+food+'）'));
});
for(const status of ['done','doing','failed','paused','skipped'])test('settled '+status+' preserves actual score and operation limits',()=>{
 const a=fixture(status);a.run("ScoreEngine.estimate=()=>{throw Error('settled must not estimate')};UI.openTaskDetail(t.id)");const h=a.el('#task-detail-body').innerHTML;
 assert.match(h,/>1.7<\/b> 分/);assert.doesNotMatch(h,/预估积分|id="td-status"|id="td-to-todo"/);assert.match(h,/id="td-edit"/);assert.match(h,/id="td-del"/);assert.equal(a.run('JSON.stringify(S)===before'),true);
});
test('status and edit buttons retain original target',()=>{const a=fixture(null);a.run('UI.openStatusSheet=id=>target=id');a.el('#td-status').onclick();assert.equal(a.run('target'),'sample');a.run('UI.startEdit=id=>target=id');a.el('#td-edit').onclick();assert.equal(a.run('target'),'sample')});
test('rules close and Escape return focus to disclosure',()=>{const a=fixture(null),rules=a.el('.task-edit-rules');rules.open=true;a.el('#td-rules-close').onclick();assert.equal(rules.open,false);assert.equal(a.el('summary').focused,true);rules.open=true;let handled=0;rules.onkeydown({key:'Escape',preventDefault(){handled++},stopPropagation(){handled++}});assert.equal(rules.open,false);assert.equal(handled,2)});
test('new routine reason is shared by normal and ambiguous rule paths without score changes',async()=>{const {quickScore}=await import('../src/rules/quick-score.mjs');for(const title of ['复习课程','买牛奶，然后撰写正式报告']){const r=quickScore({title});assert.equal(r.reason,'常规任务');assert.equal(r.base_score,3);assert.equal(r.ruleId,'routine')}});
test('freshly rendered close control works on every reopen without startup rebinding',()=>{
 const a=fixture(null),body=a.el('#task-detail-body');let children,visible=false;
 Object.defineProperty(body,'innerHTML',{set(){children=new Map()}});
 body.querySelector=key=>{if(!children.has(key))children.set(key,{querySelector:()=>({focus(){}})});return children.get(key)};
 a.ctx.mask=(id,show)=>{if(id==='mask-task')visible=show};a.run('UI.mask=mask');
 for(const status of [null,'done','skipped',null])for(let n=0;n<3;n++){
  a.ctx.nextStatus=status;a.run('t.status=nextStatus;UI.openTaskDetail(t.id)');assert.equal(visible,true);
  const close=body.querySelector('[data-close="mask-task"]');assert.equal(typeof close.onclick,'function');close.onclick();assert.equal(visible,false);
 }
 assert.equal(a.run('S.tasks.length'),1);assert.equal(a.run('t.finalScore'),1.7);
});
test('convert confirmation keeps attachments and cancellation never writes',async()=>{
 const a=fixture(null);
 a.run("UI.confirm=(title,body,ok)=>confirmed=ok;UI.switchPage=()=>{};toast=()=>{}");
 a.el('#td-to-todo').onclick();assert.equal(a.run('S.tasks.length'),1);assert.equal(a.run('S.todos.length'),0);
 const changes=[];a.ctx.changes=changes;a.run("commitDataChanges=async rows=>{changes.push(...rows)}");await a.run('confirmed()');
 assert.equal(changes.length,2);const converted=changes[0].value;
 assert.equal(converted.title,'合成任务');assert.equal(converted.note,'备注\n第二行');assert.equal(converted.baseScore,5);assert.equal(converted.aiReason,'常规处理，细分依据不足');assert.equal(converted.images[0].name,'合成图片');assert.equal(converted.links[0],'https://example.com');assert.equal(changes[1].key,'sample');assert.equal(changes[1].type,'delete');
});
