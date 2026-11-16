'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'.reports/v27/deploy');
const info=JSON.parse(fs.readFileSync(path.join(root,'dist/build-info.json'),'utf8'));
const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(info.sourceCommit!==head||info.dirty!==false)throw Error('Build must match a clean committed source');
const files=['api/ai.js','api/quota.cjs','api/cloud.cjs','src/assistant/workflow.js','src/assistant/materials.js','package.json','package-lock.json','vercel.json','.vercel/project.json','dist/index.html','dist/build-info.json','dist/quick-score.mjs','dist/assistant-workflow.js','dist/assistant-materials.js'];
if(fs.existsSync(dest))for(const name of fs.readdirSync(dest,{recursive:true})){const p=path.join(dest,name);if(fs.statSync(p).isFile()&&!files.includes(name.replaceAll('\\','/')))throw Error('Unexpected deployment file; preserve and inspect it');}
for(const file of files){const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
console.log(JSON.stringify({sourceCommit:head,files:files.length,directory:dest,environment_files:false}));
