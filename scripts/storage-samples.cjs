'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n').replace(/^App\.init\(\);$/m,'');
const context=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,structuredClone});
vm.runInContext(source,context);vm.runInContext(require('./helpers/storage-fixture.cjs'),context);
// A real, self-contained image for visual file-import verification.
const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>').toString('base64');
context.syntheticImage=image;
vm.runInContext('S.tasks[0].images[0].data=syntheticImage;S.pet.lastDecayDay=todayStr();UI.captureAgentScope(action);',context);
const data=JSON.parse(vm.runInContext("JSON.stringify({app:'卷卷AI Todo',version:'2.2',...Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,S[key]])),appearance:{followSystem:true,lightTheme:'warm',darkTheme:'soft',fixedTheme:'warm'}})",context));
const output=path.join(root,'.reports/storage-samples');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'valid.json'),JSON.stringify(data,null,2));
const duplicate=structuredClone(data);duplicate.tasks.push(structuredClone(duplicate.tasks[0]));
fs.writeFileSync(path.join(output,'duplicate-id.json'),JSON.stringify(duplicate,null,2));
fs.writeFileSync(path.join(output,'damaged.json'),'{invalid JSON');
const status=structuredClone(data);Object.assign(status.tasks[0],{status:'invalid-status',finalScore:0,statusEditCount:0});
fs.writeFileSync(path.join(output,'invalid-status.json'),JSON.stringify(status,null,2));
console.log('Synthetic files only: '+output);
