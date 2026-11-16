'use strict';
// Use the fixed multi-turn stability suite through the shared budgeted evaluator.
if(!process.argv.some(x=>x.startsWith('--partition=')))process.argv.push('--partition=stability');
require('./assistant-workflow-evaluate.cjs');
