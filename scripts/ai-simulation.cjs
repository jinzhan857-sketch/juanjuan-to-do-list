'use strict';
// Default fixture has no network. The separate model check supplies an explicit bounded transport.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const syntheticEnv = Object.freeze({
  DEEPSEEK_API_KEY: 'synthetic-model-key',
  KV_REST_API_URL: 'https://quota.synthetic.invalid',
  KV_REST_API_TOKEN: 'synthetic-quota-key',
  RATE_LIMIT_SALT: 'synthetic-salt',
  OWNER_STATS_TOKEN: 'synthetic-owner-token',
});

function createHarness({modelFailure = false, quotaFailure = false, liveModel = null} = {}) {
  const now = Date.parse('2026-11-15T04:00:00Z');
  class SyntheticDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const values = new Map(), expiry = new Map();
  const quota = require('./helpers/quota-oracle.cjs').quotaOracle({values, expiry});
  let modelCalls = 0, quotaCalls = 0;
  function expire(key) {
    if (expiry.has(key) && expiry.get(key) <= Date.now()) {
      values.delete(key); expiry.delete(key);
    }
  }
  const response = data => new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
  const simulatedFetch = async (url, options) => {
    if (String(url) === syntheticEnv.KV_REST_API_URL) {
      quotaCalls++;
      if (quotaFailure) throw Error('Synthetic quota failure');
      const [command, key, value] = JSON.parse(options.body);
      expire(key);
      let result;
      switch (command) {
        case 'INCR': result = Number(values.get(key) || 0) + 1; values.set(key, result); break;
        case 'GET': result = values.get(key) ?? null; break;
        case 'EXPIRE': result = values.has(key) ? 1 : 0; if (result) expiry.set(key, Date.now() + Number(value) * 1000); break;
        case 'PFADD': {
          const set = values.get(key) || new Set();
          result = set.has(value) ? 0 : 1; set.add(value); values.set(key, set); break;
        }
        case 'PFCOUNT': result = values.get(key)?.size || 0; break;
        default: throw Error('Unsupported synthetic quota command');
      }
      return response({result});
    }
    if (String(url) === 'https://api.deepseek.com/chat/completions') {
      modelCalls++;
      if (liveModel) return liveModel.request(url, options);
      if (modelFailure) throw Error('Synthetic model failure');
      const body = JSON.parse(options.body);
      const result = body.max_tokens === 300
        ? {task: '合成测试事务', note: '这是固定模拟结果', base_score: 6, vague: false, category: '日常生活', reason: '合成评分', advice: '仅供本地测试'}
        : {type: 'chat', reply: '这是本地模拟回复，没有调用真实模型。'};
      return response({choices: [{message: {content: JSON.stringify(result)}}]});
    }
    throw Error('Network access is disabled in simulation');
  };
  const context = vm.createContext({
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name === './quota.cjs') return {createQuota: () => ({
        reserve(...args) {quotaCalls++; if (quotaFailure) throw Error('Synthetic quota failure'); return quota.reserve(...args);},
        finish(...args) {quotaCalls++; if (quotaFailure) throw Error('Synthetic quota failure'); return quota.finish(...args);},
      })};
      throw Error('Unexpected simulation dependency');
    },
    module: {exports: {}}, process: {env: {...syntheticEnv, ...(liveModel ? {DEEPSEEK_API_KEY: liveModel.key} : {})}},
    fetch: simulatedFetch, Date: SyntheticDate, Buffer, AbortController, DOMException, setTimeout, clearTimeout,
  });
  const filename = path.join(__dirname, '../api/ai.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename, timeout: 1000});
  return {handler: context.module.exports, inspect: () => ({modelCalls, quotaCalls}), env: {...syntheticEnv, ...(liveModel ? {DEEPSEEK_API_KEY: liveModel.key} : {})}};
}
function createSimulation({modelFailure = false, quotaFailure = false} = {}) {
  return createHarness({modelFailure, quotaFailure});
}
function createModelCheck({key, request}) {
  if (typeof key !== 'string' || !key.trim() || typeof request !== 'function') throw Error('Model check requires explicit credentials and transport');
  return createHarness({liveModel: {key, request}});
}
module.exports = {createSimulation, createModelCheck};
