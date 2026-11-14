'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'juanjuan-archive-'));
function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, {cwd, stdio: 'inherit'});
  if (result.status !== 0) throw Error(`${command} failed with exit ${result.status}: ${result.error?.message || args.join(' ')}`);
}
try {
  const archive = path.join(temporary, 'source.tar');
  const source = path.join(temporary, 'source');
  fs.mkdirSync(source);
  run('git', ['archive', 'HEAD', '-o', archive], root);
  run('tar', ['-xf', archive, '-C', source], root);
  assert.ok(!fs.existsSync(path.join(source, '.git')));
  run(process.execPath, [process.env.npm_execpath, 'ci', '--ignore-scripts'], source);
  run(process.execPath, [process.env.npm_execpath, 'run', 'check'], source);
  const expected = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const info = JSON.parse(fs.readFileSync(path.join(source, 'dist/build-info.json')));
  assert.equal(info.sourceCommit, expected);
  assert.equal(info.sourceKind, 'archive');
  assert.equal(info.dirty, null);
  assert.deepEqual(fs.readFileSync(path.join(source, 'index.html')), fs.readFileSync(path.join(source, 'dist/index.html')));
  console.log(`Archive checks passed for ${expected}`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep + 'juanjuan-archive-'));
  fs.rmSync(temporary, {recursive: true, force: true});
}
