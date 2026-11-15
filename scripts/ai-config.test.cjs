'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {loadAIEnvironment} = require('./ai-config.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'juanjuan-config-'));
  const sharedFile = path.join(dir, '.config', 'juanjuan', 'ai.env');
  fs.mkdirSync(path.dirname(sharedFile), {recursive: true});
  fs.writeFileSync(sharedFile, 'DEEPSEEK_API_KEY=synthetic-machine-key\n');
  const roots = ['workspace-a', 'workspace-b'].map(name => {
    const root = path.join(dir, name); fs.mkdirSync(root); return root;
  });
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.join(os.tmpdir(), 'juanjuan-config-')));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  return {dir, sharedFile, roots};
}

test('two fresh workspaces reuse one private machine file without creating local secrets', t => {
  const f = fixture(t);
  for (const root of f.roots) {
    const env = {}, report = loadAIEnvironment({root, env, sharedFile: f.sharedFile});
    assert.deepEqual(report, {key_configured: true, key_source: 'machine'});
    assert.equal(env.DEEPSEEK_API_KEY, 'synthetic-machine-key');
    assert.equal(fs.existsSync(path.join(root, '.env')), false);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-machine-key/);
  }
});

test('explicit process environment wins over workspace and machine credentials', t => {
  const f = fixture(t), root = f.roots[0], env = {DEEPSEEK_API_KEY: 'synthetic-process-key'};
  fs.writeFileSync(path.join(root, '.env'), 'DEEPSEEK_API_KEY=synthetic-workspace-key\n');
  const report = loadAIEnvironment({root, env, sharedFile: path.dirname(f.sharedFile)});
  assert.equal(env.DEEPSEEK_API_KEY, 'synthetic-process-key'); assert.equal(report.key_source, 'environment');
});

test('workspace override wins and avoids reading the machine file', t => {
  const f = fixture(t), root = f.roots[0], env = {};
  fs.writeFileSync(path.join(root, '.env'), 'DEEPSEEK_API_KEY=synthetic-workspace-key\nAI_LOCAL_PORT=12345\n');
  const report = loadAIEnvironment({root, env, sharedFile: path.dirname(f.sharedFile)});
  assert.equal(env.DEEPSEEK_API_KEY, 'synthetic-workspace-key'); assert.equal(report.key_source, 'workspace');
  assert.equal(env.AI_LOCAL_PORT, '12345');
});

test('empty example key does not mask the shared model credential', t => {
  const f = fixture(t), root = f.roots[0], env = {DEEPSEEK_API_KEY: ''};
  fs.writeFileSync(path.join(root, '.env'), 'DEEPSEEK_API_KEY=\nKV_REST_API_TOKEN=synthetic-local-quota\n');
  assert.equal(loadAIEnvironment({root, env, sharedFile: f.sharedFile}).key_source, 'machine');
  assert.equal(env.DEEPSEEK_API_KEY, 'synthetic-machine-key'); assert.equal(env.KV_REST_API_TOKEN, 'synthetic-local-quota');
});

test('machine sharing imports only the model key and no service or Node configuration', t => {
  const f = fixture(t), env = {};
  fs.appendFileSync(f.sharedFile, 'KV_REST_API_TOKEN=synthetic-global-quota\nNODE_OPTIONS=unexpected\n');
  loadAIEnvironment({root: f.roots[0], env, sharedFile: f.sharedFile});
  assert.deepEqual(env, {DEEPSEEK_API_KEY: 'synthetic-machine-key'});
});

test('missing private files report configuration missing without printing a path or value', t => {
  const f = fixture(t), env = {};
  assert.deepEqual(loadAIEnvironment({root: f.roots[0], env, sharedFile: path.join(f.dir, 'absent')}), {key_configured: false, key_source: 'missing'});
});

test('unreadable shared configuration fails with a redacted error', t => {
  const f = fixture(t);
  assert.throws(() => loadAIEnvironment({root: f.roots[0], env: {}, sharedFile: path.dirname(f.sharedFile)}), error => {
    assert.doesNotMatch(error.message, /synthetic|juanjuan-config/); return /Cannot read private/.test(error.message);
  });
});

test('new processes can pick up a rotated machine key without changing workspaces', t => {
  const f = fixture(t), first = {}, second = {};
  loadAIEnvironment({root: f.roots[0], env: first, sharedFile: f.sharedFile});
  fs.writeFileSync(f.sharedFile, 'DEEPSEEK_API_KEY=synthetic-rotated-key\n');
  loadAIEnvironment({root: f.roots[1], env: second, sharedFile: f.sharedFile});
  assert.equal(first.DEEPSEEK_API_KEY, 'synthetic-machine-key'); assert.equal(second.DEEPSEEK_API_KEY, 'synthetic-rotated-key');
});

test('fresh CLI processes in two workspaces find the shared key and perform no model requests', t => {
  const f = fixture(t);
  for (const root of f.roots) {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const name of ['ai-config.cjs', 'ai-live-check.cjs', 'ai-local.cjs', 'ai-simulation.cjs']) {
      fs.copyFileSync(path.join(__dirname, name), path.join(root, 'scripts', name));
    }
    fs.writeFileSync(path.join(root, 'network-guard.cjs'), 'globalThis.fetch=()=>{throw Error("External requests are forbidden in this check")};');
    const env = {...process.env, USERPROFILE: f.dir, HOME: f.dir};
    delete env.DEEPSEEK_API_KEY;
    const output = execFileSync(process.execPath, ['--require', './network-guard.cjs', 'scripts/ai-live-check.cjs', '--check'], {cwd: root, env, encoding: 'utf8', windowsHide: true});
    const report = JSON.parse(output);
    assert.equal(report.key_configured, true); assert.equal(report.key_source, 'machine');
    assert.doesNotMatch(output, /synthetic-machine-key/); assert.equal(fs.existsSync(path.join(root, '.env')), false);
    assert.equal(fs.existsSync(path.join(root, '.reports')), false);
  }
});

test('Node env-file can supply the same private key to an existing entry point', t => {
  const f = fixture(t), env = {...process.env}; delete env.DEEPSEEK_API_KEY;
  const output = execFileSync(process.execPath, ['--env-file=' + f.sharedFile, '-e', 'console.log(JSON.stringify({configured:process.env.DEEPSEEK_API_KEY === "synthetic-machine-key"}))'], {cwd: f.roots[0], env, encoding: 'utf8', windowsHide: true});
  assert.deepEqual(JSON.parse(output), {configured: true}); assert.doesNotMatch(output, /synthetic-machine-key/);
});
