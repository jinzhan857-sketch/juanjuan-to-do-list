'use strict';
// Explicit deployment setup. Credentials only travel through child-process stdin.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const {parseEnv}=require('node:util');
const root=path.join(__dirname,'..'),privateFile=path.join(os.homedir(),'.config/juanjuan/v27/cloud.env');
if(!process.argv.includes('--apply'))throw Error('Use --apply for explicit cloud configuration');
const remote=cp.execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'});
if(!remote.includes('jinzhan857-sketch/juanjuan-to-do-list'))throw Error('Wrong repository');
const env=parseEnv(fs.readFileSync(privateFile,'utf8'));
if(!env.KV_REST_API_URL?.startsWith('https://')||!env.KV_REST_API_TOKEN)throw Error('Missing private database configuration');
if(!env.OWNER_STATS_TOKEN){env.OWNER_STATS_TOKEN=crypto.randomBytes(32).toString('hex');fs.appendFileSync(privateFile,'OWNER_STATS_TOKEN='+env.OWNER_STATS_TOKEN+'\n');}
require('./ai-config.cjs').loadAIEnvironment();
if(!process.env.DEEPSEEK_API_KEY)throw Error('Missing shared model configuration');
const values={...env,DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,AI_ENABLED:'1',AI_ALLOWED_ORIGINS:'https://jinzhan857-sketch.github.io,https://juanjuan-v27-ai.vercel.app,http://127.0.0.1:4297',AI_SOURCE_COMMIT:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
for(const [name,value]of Object.entries(values)){
 if(!['KV_REST_API_URL','KV_REST_API_TOKEN','OWNER_STATS_TOKEN','DEEPSEEK_API_KEY','AI_ENABLED','AI_ALLOWED_ORIGINS','AI_SOURCE_COMMIT'].includes(name))throw Error('Unexpected variable name');
 const result=cp.spawnSync('npx.cmd',['--yes','vercel@65.16.0','env','add',name,'production','--sensitive','--yes','--force','--scope','juanjuan-to-do-list'],{cwd:root,shell:true,input:value,encoding:'utf8',windowsHide:true});
 // Never forward CLI output: unexpected errors can echo supplied values.
 if(result.status!==0)throw Error('Cloud configuration failed for '+name+'; values and CLI output suppressed');
 console.log('Configured '+name);
}
