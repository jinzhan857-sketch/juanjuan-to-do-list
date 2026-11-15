'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function check(record,mode='desktop'){
 assert.equal(record.protectedDatabaseUnchanged,true,'Keyboard interactions changed stored data');
 if(mode==='desktop'){
  assert.ok(record.cases?.length>=9,'Missing desktop cases');
  assert.ok(record.cases.every(x=>x.pass),'Desktop focus, creation, role or return regression');
  return {cases:record.cases.length,mode};
 }
 const heights=new Map();for(const e of record.events)heights.set(e.innerWidth,Math.max(heights.get(e.innerWidth)||0,e.visual.height));
 const settled=record.events.filter(e=>e.label==='settled'||e.label==='manual');
 let opened=false,opens=0,closes=0,checked=0;
 for(const e of settled){
  if(e.page!=='page-agent'){assert.equal(e.keyboardClass,false,'Keyboard state leaked to another page');continue;}
  const occluded=heights.get(e.innerWidth)-e.visual.height>150;
  if(occluded&&e.focus==='agent-input'){
   if(!opened)opens++;opened=true;checked++;
   const reportedBottom=e.visual.top+e.visual.height;
   const bottom=Math.min(reportedBottom,e.pageRect?.bottom??reportedBottom);
   assert.equal(e.navVisibility,'visible','Navigation should be naturally occluded');
   if(e.pageRect)assert.ok(e.pageRect.height<=e.visual.height+1,'Panning enlarged the chat height');
   if(e.pageRect)assert.ok(Math.abs(e.pageRect.top-e.visual.top)<=1,'Chat is not anchored to the visible viewport');
   assert.ok(e.nav.top>=reportedBottom-1,'Navigation rose above the keyboard');
   assert.ok(e.input.top>=e.visual.top-1&&e.input.bottom<=bottom+1,'Input is outside the visible viewport');
   assert.ok(bottom-e.input.bottom<=48,'Excessive gap above the keyboard');
  }else if(!occluded){
   if(opened)closes++;opened=false;
   assert.equal(e.keyboardClass,false,'State remained after keyboard closed');
   assert.ok(!e.inlineHeight,'Input height remained after keyboard closed');
   assert.ok(!e.navInlineBottom,'Navigation offset remained after keyboard closed');
   if(e.pageScrollTop!==undefined)assert.equal(e.pageScrollTop,0,'Chat scroll remained after keyboard closed');
   assert.equal(e.navVisibility,'visible');
  }
 }
 assert.ok(opens>=2&&closes>=2&&checked>=2,'Need two actual keyboard opening and closing cycles');
 return {mode,opens,closes,checked,geometryOnly:true};
}
module.exports={check};
if(require.main===module){const [mode,file]=process.argv.slice(2);console.log(JSON.stringify({file,...check(JSON.parse(fs.readFileSync(file,'utf8')),mode)}));}
