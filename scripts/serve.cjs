'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const built = process.argv.includes('--dist');
const directory = path.join(root, built ? 'dist' : '.');
const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']]]);
files.set('/quick-score.mjs', [built?'quick-score.mjs':'src/rules/quick-score.mjs','text/javascript; charset=utf-8']);
files.set('/assistant-workflow.js',[built?'assistant-workflow.js':'src/assistant/workflow.js','text/javascript; charset=utf-8']);
files.set('/assistant-materials.js',[built?'assistant-materials.js':'src/assistant/materials.js','text/javascript; charset=utf-8']);
if (built) files.set('/build-info.json', ['build-info.json', 'application/json; charset=utf-8']);
const server = http.createServer((req, res) => {
  const route = files.get((req.url || '').split('?')[0]);
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {Allow: 'GET, HEAD'}); return res.end('Method not allowed'); }
  if (!route) { res.writeHead(404); return res.end('Not found. Static preview does not run /api/ai.'); }
  try {
    const bytes = fs.readFileSync(path.join(directory, route[0]));
    res.writeHead(200, {'Content-Type': route[1], 'Content-Length': bytes.length});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(503); res.end('Preview file unavailable. Run npm run build for dist preview.'); }
});
server.on('error', error => { console.error(`Preview failed: ${error.message}`); process.exitCode = 1; });
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Serving ${built ? 'dist' : 'source'} at http://127.0.0.1:${server.address().port}/ (static only)`));
