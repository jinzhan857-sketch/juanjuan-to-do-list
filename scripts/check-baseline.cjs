'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.reports'), {recursive: true});
const reportPath = '.reports/baseline.json';
const run = cp.spawnSync(process.execPath, ['docs/audit/2026-11-14/check-baseline.cjs', reportPath], {cwd: root, stdio: 'inherit'});
if (run.status !== 0) process.exit(run.status || 1);
const report = JSON.parse(fs.readFileSync(path.join(root, reportPath), 'utf8'));
assert.equal(report.checks.length, 26, 'Baseline assertion count changed; review coverage explicitly');
assert.equal(report.failed, 0);
assert.deepEqual(report.observations, {
  hostedContextDropsSeriesId: true,
  explicitDateRoutedToBatch: 'update_schedule',
  rememberedLocationOverridesExplicitCity: '香港'
}, 'Known issue observations changed; inspect results rather than silently skipping them');
console.log('26 stable assertions passed. Single-day probe now returns update_schedule (#4); two known issues remain (#5, #7).');
