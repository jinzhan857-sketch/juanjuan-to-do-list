'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./publisher-fixture.cjs');
async function keyboard(t){
 const f=await fixture(t),classes=new Set(),pages=new Set(['active']);
 const input=f.element('#agent-input'),page=f.element('#page-agent'),other=f.element('#other'),nav=f.element('#nav');input.tagName='TEXTAREA';other.tagName='BUTTON';page.scrollHeight=0;page.clientHeight=0;
 f.ctx.document.body={classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k)},contains:k=>classes.has(k)}};
 page.classList.contains=k=>pages.has(k);f.ctx.document.activeElement=other;
 f.ctx.window={innerHeight:800,screen:{height:900},scrollTo(){this.clearedScroll=true;},visualViewport:{height:800,pageTop:0,offsetTop:0,scale:1}};
 const sync=()=>f.run('UI.syncAgentViewport()');sync();f.ctx.document.activeElement=input;
 return {...f,input,page,nav,other,pages,classes,viewport:f.ctx.window.visualViewport,sync};
}
for(const [name,height,visual,scale,focused,active,touch,expected] of [
 ['desktop focus',800,800,1,true,true,false,false],
 ['desktop resize with focus',400,400,1,true,true,false,false],
 ['address bar change',800,745,1,true,true,true,false],
 ['visual viewport keyboard',800,470,1,true,true,true,true],
 ['whole window keyboard',470,470,1,true,true,true,true],
 ['viewport change without input',800,470,1,false,true,true,false],
 ['zoom is not a keyboard',800,400,2,true,true,true,false],
 ['hidden agent page',800,470,1,true,false,true,false],
])test(name,async t=>{
 const f=await keyboard(t);f.ctx.window.innerHeight=height;f.viewport.height=visual;f.viewport.scale=scale;f.run('UI.agentTouchInput='+touch);
 if(!focused)f.ctx.document.activeElement=f.other;if(!active)f.pages.clear();const before=await f.snapshot();f.sync();
 assert.equal(f.classes.has('agent-keyboard-open'),expected);assert.equal(f.page.style.height,expected?(height===470?370:visual)+'px':'');
 assert.equal(f.nav.style.bottom,expected?Math.min(0,height-800)+'px':'');assert.deepEqual(await f.snapshot(),before);
});
test('repeated opening, blur during closing, restore and leaving clear height and navigation offsets',async t=>{
 const f=await keyboard(t);f.run('UI.agentTouchInput=true');
 for(let i=0;i<4;i++){
  f.ctx.document.activeElement=f.input;f.ctx.window.innerHeight=420;f.viewport.height=420;f.viewport.pageTop=60;f.sync();
  assert.equal(f.page.style.height,'320px');assert.equal(f.nav.style.bottom,'-380px');
  f.ctx.document.activeElement=f.other;f.sync();assert.ok(f.classes.has('agent-keyboard-open'));
  f.ctx.window.innerHeight=800;f.viewport.height=800;f.viewport.pageTop=0;f.sync();
  assert.equal(f.page.style.height,'');assert.equal(f.page.style.top,'');assert.equal(f.nav.style.bottom,'');assert.equal(f.classes.size,0);assert.equal(f.ctx.window.clearedScroll,true);
 }
 f.ctx.document.activeElement=f.input;f.viewport.height=420;f.sync();f.pages.clear();f.sync();
 assert.equal(f.page.style.height,'');assert.equal(f.nav.style.bottom,'');assert.equal(f.classes.size,0);
 f.pages.add('active');f.ctx.document.activeElement=f.other;f.sync();assert.equal(f.classes.size,0);
});
test('screen rotation recalculates the resting navigation position',async t=>{
 const f=await keyboard(t);f.run('UI.agentTouchInput=true');f.ctx.window.screen.height=500;f.ctx.window.innerHeight=220;f.viewport.height=220;f.sync();
 assert.equal(f.page.style.height,'120px');assert.equal(f.nav.style.bottom,'-180px');
 f.ctx.window.innerHeight=400;f.viewport.height=400;f.sync();assert.equal(f.page.style.height,'');assert.equal(f.nav.style.bottom,'');
});
test('replay the measured phone window shrink and restore',async t=>{
 const f=await keyboard(t),record=require('../docs/audit/2026-11-15/issue33-evidence/window-phone.json');
 const first=record.events[0];f.ctx.window.screen.height=first.screenHeight;f.ctx.window.innerHeight=first.innerHeight;f.viewport.height=first.visual.height;f.ctx.document.activeElement=f.other;f.sync();
 f.run('UI.agentTouchInput=true');
 for(const e of record.events.filter(e=>e.label==='settled')){
  f.ctx.window.screen.height=e.screenHeight;f.ctx.window.innerHeight=e.innerHeight;f.viewport.height=e.visual.height;f.viewport.pageTop=e.visual.pageTop;f.ctx.document.activeElement=e.focus==='agent-input'?f.input:f.other;f.sync();
  if(e.visual.height<700){assert.ok(f.classes.has('agent-keyboard-open'));assert.ok(Math.abs(e.nav.top-parseFloat(f.nav.style.bottom)-first.nav.top)<1);}
  else{assert.equal(f.classes.size,0);assert.equal(f.nav.style.bottom,'');}
 }
});
test('phone evidence rejects the failed navigation lift',()=>{
 const {check}=require('./check-keyboard-evidence.cjs');assert.throws(()=>check(require('../docs/audit/2026-11-15/issue33-evidence/attempt-visual-policy-phone.json'),'phone'),/Navigation rose/);
});

test('reported geometry rejects the pre-fix short landscape clipping',()=>{
 const {check}=require('./check-keyboard-evidence.cjs');assert.throws(()=>check(require('../docs/audit/2026-11-15/issue33-evidence/mi-rotation-failure-b794d035ce.json'),'phone'),/Input is outside/);
});

test('short keyboard scroll is restored on close without changing stored records',async t=>{
 const f=await keyboard(t);f.run('UI.agentTouchInput=true');f.page.scrollHeight=310;f.page.clientHeight=220;f.viewport.height=220;
 const before=await f.snapshot();f.sync();assert.equal(f.page.scrollTop,90);
 f.viewport.height=800;f.sync();assert.equal(f.page.scrollTop,0);assert.deepEqual(await f.snapshot(),before);
});

test('browser panning cannot enlarge the chat viewport during keyboard animation',async t=>{
 const f=await keyboard(t);f.run('UI.agentTouchInput=true');f.viewport.height=470;f.sync();
 const height=f.page.style.height;
 for(const offset of [3,26,96,193,344,400]){f.viewport.offsetTop=offset;f.viewport.pageTop=offset+56;f.sync();assert.equal(f.page.style.height,height,'Panning is a position, not additional visible height');assert.equal(f.page.style.top,offset+'px','Chat must follow the visible viewport position');assert.equal(f.nav.style.bottom,-offset+'px','Navigation must stay below the panned viewport');}
});

test('reported geometry rejects the saved Chrome appearance panning failure',()=>{
 const {check}=require('./check-keyboard-evidence.cjs');assert.throws(()=>check(require('../docs/audit/2026-11-15/issue33-evidence/chrome-theme-pan-failure-bbdbda9209.json'),'phone'),/Panning enlarged/);
});

test('reported geometry rejects height-only correction with stale viewport position',()=>{
 const {check}=require('./check-keyboard-evidence.cjs');assert.throws(()=>check(require('../docs/audit/2026-11-15/issue33-evidence/chrome-theme-position-failure-a78460e136.json'),'phone'),/Chat is not anchored/);
});

test('measured correction preserves the accepted Mi and Chrome geometry',async t=>{
 for(const name of ['mi','chrome']){
  const record=require('../docs/audit/2026-11-15/issue33-evidence/'+name+'-capabilities-d470e0c159.json');
  const f=await keyboard(t);
  f.ctx.document.activeElement=f.other;const first=record.events[0];
  f.ctx.window.screen.height=first.screenHeight;f.ctx.window.innerHeight=first.innerHeight;f.viewport.height=first.visual.height;f.sync();f.run('UI.agentTouchInput=true');
  const before=await f.snapshot();
  for(const e of record.events.filter(e=>e.label==='settled')){
   f.ctx.window.innerHeight=e.innerHeight;f.viewport.height=e.visual.height;f.viewport.pageTop=e.visual.pageTop;f.ctx.document.activeElement=e.focus==='agent-input'?f.input:f.other;f.sync();
   if(e.keyboardClass){
    const correction=e.visual.height-parseFloat(f.page.style.height);
    if(name==='mi')assert.ok(correction>48&&correction<50,'Measured Mi band should be removed');
    else assert.ok(correction<1,'Chrome must retain its accepted composer position');
    assert.ok(Math.abs(e.navInlineBottom.replace('px','')-parseFloat(f.nav.style.bottom))<1,'Navigation remains anchored');
   }else{assert.equal(f.page.style.height,'');assert.equal(f.nav.style.bottom,'');}
  }
  assert.deepEqual(await f.snapshot(),before);
 }
});
