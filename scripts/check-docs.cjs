/* Validate local Markdown links without network or browser data access. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir,e.name)) : e.name.endsWith('.md') ? [path.join(dir,e.name)] : []);
const files = [path.join(root,'README.md'), path.join(root,'AGENTS.md'), path.join(root,'diagrams/README.md'), ...walk(path.join(root,'docs'))];
const failures=[];
let links=0, anchors=0;
const anchorSet = file => {
  const counts=new Map(), result=new Set();
  for(const match of fs.readFileSync(file,'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)){
    const slug=match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu,'').replace(/ /g,'-');
    const count=counts.get(slug)||0;
    result.add(count?slug+'-'+count:slug);
    counts.set(slug,count+1);
  }
  return result;
};
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
    const href=match[1].replace(/^<|>$/g,'');
    if(/^(https?:|mailto:)/i.test(href)) continue;
    links++;
    const [name,hash]=href.split('#');
    const target=name?path.resolve(path.dirname(file),decodeURIComponent(name)):file;
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target)) failures.push({file:path.relative(root,file),href});
    else if(hash&&target.endsWith('.md')){
      anchors++;
      if(!anchorSet(target).has(decodeURIComponent(hash)))failures.push({file:path.relative(root,file),href,reason:'heading anchor missing'});
    }
  }
}
console.log(JSON.stringify({markdownFiles:files.length,localLinks:links,headingAnchors:anchors,failures},null,2));
process.exitCode=failures.length?1:0;
