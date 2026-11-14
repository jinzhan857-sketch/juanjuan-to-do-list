'use strict';
// Read committed deliveries into ignored isolated archives. Never switch the source checkout.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'), out=path.join(root,'.reports/review-deliveries');fs.mkdirSync(out,{recursive:true});
const rows=[];
const refs={issue2:'5d955e121006d85f3a3b5369faf07a5c8664b2a8',issue3:'be840a0b033eea1d5a46ab93d8551f5baa10c1b8',issue4:'c7feb84d39558e52bcf0acc65da1b671889f2c2c',issue5:'ee226db603665d74e158f3acb716fb9109e48c59',issue6:'be2b5929e7b8e4d7d7f6f3c703be298d06c3ace4'};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function run(cmd,args,cwd){return cp.spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:10*1024*1024});}
for(const [task,ref] of Object.entries(refs)){
  const dir=path.join(out,task);fs.mkdirSync(dir,{recursive:true});
  const tar=path.join(out,task+'.tar');
  for(const [cmd,args] of [['git',['archive',ref,'-o',tar]],['tar',['-xf',tar,'-C',dir]]]){const r=run(cmd,args,root);if(r.status!==0)throw Error(r.stderr);}
  const steps=task==='issue2'?[['node',['docs/audit/2026-11-14/check-baseline.cjs']],['node',['scripts/check-docs.cjs']]]:[['cmd.exe',['/d','/c','npm ci --ignore-scripts']],['cmd.exe',['/d','/c','npm run check']]];
  const row={task,ref,htmlSha256:sha(fs.readFileSync(path.join(dir,'index.html'))),apiSha256:sha(fs.readFileSync(path.join(dir,'api/ai.js'))),steps:[]};
  for(const [cmd,args] of steps){const r=run(cmd,args,dir);fs.writeFileSync(path.join(out,task+'-'+row.steps.length+'.log'),r.stdout+r.stderr);row.steps.push({command:[cmd,...args].join(' '),exit:r.status,tail:(r.stdout+r.stderr).split(/\r?\n/).slice(-11)});}
  if(task!=='issue2'){const info=JSON.parse(fs.readFileSync(path.join(dir,'dist/build-info.json')));row.build=info;row.outputEqualsSource=fs.readFileSync(path.join(dir,'dist/index.html')).equals(fs.readFileSync(path.join(dir,'index.html')));}
  rows.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(__dirname,'review-deliveries-results.json'),JSON.stringify({executedAt:new Date().toISOString(),node:process.version,method:'git archive of exact PR heads, no Git metadata, synthetic tests only',rows},null,2)+'\n');
process.exitCode=rows.some(r=>r.steps.some(s=>s.exit!==0))?1:0;
