import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {quickScore,shortCopy,version} from '../src/rules/quick-score.mjs';
const cases=JSON.parse(await readFile(new URL('./fixtures/quick-score.json',import.meta.url)));
for(const [title,score,id] of cases)test(title,()=>{const r=quickScore({title});assert.equal(r.base_score,score);assert.equal(r.ruleId,id);assert.ok(r.reason);assert.equal(r.version,version);assert.equal(r.source,'rule');assert.deepEqual(r,quickScore({title,category:'重大投入'}));});
test('invalid content and punctuation boundaries',()=>{for(const title of ['', '做事'])assert.throws(()=>quickScore({title}));assert.equal(shortCopy('一二三四五六七。'),'一二三四五六七');assert.equal(shortCopy('一二三四五六七八。'),'一二三四五六七八。');assert.equal(shortCopy('https://a.b.'),'https://a.b.');});
