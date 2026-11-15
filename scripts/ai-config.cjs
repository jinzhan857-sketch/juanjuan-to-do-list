'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {parseEnv} = require('node:util');

function readConfig(filename) {
  try { return parseEnv(fs.readFileSync(filename, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    throw Error('Cannot read private AI configuration; no values were logged');
  }
}

function loadAIEnvironment({root = path.join(__dirname, '..'), env = process.env,
  sharedFile = path.join(os.homedir(), '.config', 'juanjuan', 'ai.env')} = {}) {
  const filled = value => typeof value === 'string' && value.trim().length > 0;
  let source = filled(env.DEEPSEEK_API_KEY) ? 'environment' : 'missing';
  const local = readConfig(path.join(root, '.env'));
  for (const [name, value] of Object.entries(local)) {
    if (!filled(env[name])) env[name] = value;
  }
  if (source === 'missing' && filled(env.DEEPSEEK_API_KEY)) source = 'workspace';
  if (source === 'missing') {
    // Only the model credential is shared. Workspace-specific services stay local.
    const shared = readConfig(sharedFile);
    if (filled(shared.DEEPSEEK_API_KEY)) {
      env.DEEPSEEK_API_KEY = shared.DEEPSEEK_API_KEY;
      source = 'machine';
    }
  }
  return {key_configured: source !== 'missing', key_source: source};
}

module.exports = {loadAIEnvironment};
