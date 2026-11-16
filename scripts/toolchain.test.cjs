'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {once} = require('node:events');
const root = path.resolve(__dirname, '..');
function fixture(t, beforeCleanup = async () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'juanjuan-toolchain-'));
  t.after(async () => {
    await beforeCleanup();
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'juanjuan-toolchain-'));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  for (const file of ['src/assistant/materials.js', 'src/assistant/workflow.js', 'src/rules/quick-score.mjs', 'scripts/build.cjs', 'scripts/serve.cjs', 'index.html', 'api/ai.js', 'api/quota.cjs', 'package.json', 'package-lock.json', '.node-version']) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  fs.writeFileSync(path.join(dir, '.source-revision'), 'a'.repeat(40));
  return dir;
}
const build = dir => cp.spawnSync(process.execPath, ['scripts/build.cjs'], {cwd: dir, encoding: 'utf8'});
test('build preserves bytes, records archive provenance, and repeats deterministically', t => {
  const dir = fixture(t);
  assert.equal(build(dir).status, 0);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist/index.html')), fs.readFileSync(path.join(dir, 'index.html')));
  const first = fs.readFileSync(path.join(dir, 'dist/build-info.json'), 'utf8');
  assert.equal(JSON.parse(first).sourceCommit, 'a'.repeat(40));
  assert.equal(JSON.parse(first).dirty, null);
  assert.match(JSON.parse(first).inputs['api/quota.cjs'], /^[a-f0-9]{64}$/);
  assert.equal(build(dir).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'dist/build-info.json'), 'utf8'), first);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dist')).sort(), ['assistant-materials.js','assistant-workflow.js', 'build-info.json', 'index.html', 'quick-score.mjs']);
});
test('syntax failure returns nonzero and preserves previous output', t => {
  const dir = fixture(t);
  assert.equal(build(dir).status, 0);
  const previous = fs.readFileSync(path.join(dir, 'dist/index.html'));
  fs.appendFileSync(path.join(dir, 'index.html'), '<script>const = broken;</script>');
  const result = build(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Build failed:/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist/index.html')), previous);
});
test('missing input fails without producing an output', t => {
  const dir = fixture(t);
  fs.unlinkSync(path.join(dir, 'api/ai.js'));
  assert.equal(build(dir).status, 1);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});
test('unknown source revision cannot masquerade as a traced build', t => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, '.source-revision'), '$Format:%H$');
  assert.equal(build(dir).status, 1);
});
test('unexpected output files are preserved and block the build', t => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'dist'));
  fs.writeFileSync(path.join(dir, 'dist/private.json'), 'synthetic');
  assert.equal(build(dir).status, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'dist/private.json'), 'utf8'), 'synthetic');
});
for (const built of [false, true]) test(`${built ? 'dist' : 'source'} preview serves exact HTML and denies repository, private and API paths`, async t => {
  let child;
  const dir = fixture(t, async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  });
  if (built) assert.equal(build(dir).status, 0);
  child = cp.spawn(process.execPath, ['scripts/serve.cjs', ...(built ? ['--dist'] : [])], {
    cwd: dir, env: {...process.env, PORT: '0'}, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Preview startup timed out')), 5000);
    child.stdout.on('data', data => { output += data; const m = output.match(/127\.0\.0\.1:(\d+)/); if (m) {clearTimeout(timer); resolve(m[1]);} });
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('exit', () => {clearTimeout(timer); reject(Error('Preview exited before startup'));});
  });
  const origin = `http://127.0.0.1:${port}`;
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(dir, 'index.html')));
  assert.equal((await fetch(origin+'/quick-score.mjs')).status,200);
  for (const url of ['/api/ai', '/api/ai.js', '/.env', '/.git/config', '/private/backup.json', '/docs/', '/%2e%2e/package.json']) {
    assert.equal((await fetch(origin + url)).status, 404, url);
  }
  assert.equal((await fetch(origin, {method: 'POST', body: 'synthetic'})).status, 405);
  assert.equal((await fetch(origin, {method: 'HEAD'})).status, 200);
  assert.equal((await fetch(origin + '/build-info.json')).status, built ? 200 : 404);
});
