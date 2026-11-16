'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.reports'), {recursive: true});
const reportPath = '.reports/baseline.json';
const run = cp.spawnSync(process.execPath, ['docs/audit/2026-11-14/check-baseline.cjs', reportPath], {cwd: root, stdio: 'inherit'});
// The unchanged historical assertion rejects all-day repeats; #115 explicitly authorizes them.
if (![0,1].includes(run.status)) process.exit(run.status || 1);
const report = JSON.parse(fs.readFileSync(path.join(root, reportPath), 'utf8'));
assert.equal(report.checks.length, 26, 'Baseline assertion count changed; review coverage explicitly');
assert.deepEqual(report.checks.filter(c=>!c.passed).map(c=>c.name), ['Batch exact-time guard','Role routing'], 'Only explicitly replaced all-day and keyword-routing rules may differ from the original baseline');
assert.equal(report.failed, 2);
console.log('Historical all-day rejection and keyword routing remain unchanged in the archive; #115 workflow and #133 unified-entry tests verify their authorized replacements.');
assert.deepEqual(report.observations, {
  hostedContextDropsSeriesId: false,
  explicitDateRoutedToBatch: 'update_schedule',
  rememberedLocationOverridesExplicitCity: '新加坡'
}, 'Known issue observations changed; inspect results rather than silently skipping them');
console.log('24 unchanged stable assertions passed; two historical rules replaced by explicit #115 and #133 acceptance. Single-day scope (#4), hosted series identity (#5), and current weather city (#7) probes pass.');
