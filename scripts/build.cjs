'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
function git(...args) {
  const r = cp.spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  return r.status === 0 ? r.stdout.trim() : null;
}
function build() {
  const html = fs.readFileSync(path.join(root, 'index.html'));
  const scripts = [...html.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) throw Error('No application scripts found');
  scripts.forEach((m, i) => new vm.Script(m[1], {filename: `index.html:script${i}`}));
  new vm.Script(fs.readFileSync(path.join(root, 'api/ai.js'), 'utf8'), {filename: 'api/ai.js'});
  new vm.Script(fs.readFileSync(path.join(root, 'api/quota.cjs'), 'utf8'), {filename: 'api/quota.cjs'});
  new vm.Script(fs.readFileSync(path.join(root,'src/assistant/materials.js'),'utf8'),{filename:'src/assistant/materials.js'});
  // Do not infer a parent repository's commit for an extracted ZIP.
  const hasGit = fs.existsSync(path.join(root, '.git'));
  const sourceCommit = hasGit ? git('rev-parse', 'HEAD') : fs.readFileSync(path.join(root, '.source-revision'), 'utf8').trim();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw Error('Source commit unavailable. Use a Git clone or GitHub source ZIP with .source-revision.');
  const status = hasGit ? git('status', '--porcelain=v1', '--untracked-files=normal') : null;
  if (hasGit && status === null) throw Error('Cannot inspect Git worktree');
  const inputs = ['index.html', 'api/ai.js', 'api/quota.cjs', 'package.json', 'package-lock.json', '.node-version', 'scripts/build.cjs', 'src/rules/quick-score.mjs', 'src/assistant/workflow.js', 'src/assistant/materials.js'];
  const manifest = {
    appVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    sourceCommit, dirty: hasGit ? status !== '' : null, sourceKind: hasGit ? 'git' : 'archive',
    node: process.version,
    inputs: Object.fromEntries(inputs.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))])),
    output: {path: 'index.html', sha256: sha256(html)}
  };
  const dist = path.join(root, 'dist');
  if (fs.existsSync(dist)) {
    if (fs.lstatSync(dist).isSymbolicLink()) throw Error('dist must not be a symlink');
    for (const name of fs.readdirSync(dist)) {
      if (!['index.html', 'build-info.json', 'quick-score.mjs', 'assistant-workflow.js', 'assistant-materials.js'].includes(name)) throw Error(`Unexpected dist entry: ${name}; preserve and inspect it before building`);
      if (!fs.lstatSync(path.join(dist, name)).isFile()) throw Error(`Output is not a regular file: ${name}`);
    }
  }
  fs.mkdirSync(dist, {recursive: true});
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.copyFileSync(path.join(root,'src/rules/quick-score.mjs'),path.join(dist,'quick-score.mjs'));
  fs.copyFileSync(path.join(root,'src/assistant/workflow.js'),path.join(dist,'assistant-workflow.js'));
  fs.copyFileSync(path.join(root,'src/assistant/materials.js'),path.join(dist,'assistant-materials.js'));
  fs.writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built dist/index.html from ${sourceCommit}; dirty=${manifest.dirty}; sha256=${manifest.output.sha256}`);
}
try { build(); } catch (error) { console.error(`Build failed: ${error.message}`); process.exitCode = 1; }
