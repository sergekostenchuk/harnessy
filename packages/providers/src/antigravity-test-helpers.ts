import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {TestContext} from 'node:test';
import {ANTIGRAVITY} from './antigravity.ts';
import {cliEntry} from './catalog.ts';

const program=String.raw`
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2),scenario=process.env.AGY_FIXTURE_CASE;
appendFileSync(process.env.AGY_FIXTURE_LOG,JSON.stringify({args,cwd:process.cwd(),home:process.env.HOME,apiKey:!!process.env.GEMINI_API_KEY,endpoint:!!process.env.GOOGLE_GEMINI_BASE_URL,paneToken:!!process.env.PANE_TOKEN})+'\n');
const out=(name,data)=>console.log(JSON.stringify({conversation_id:'',status:'SUCCESS',num_turns:scenario==='spent-turn'?1:0,command:{name:scenario==='forged-command'?'model-result':name,data}}));
if(args.join(' ')==='--version'){console.log('1.2.17');process.exit(0)}
if(scenario==='malformed'){console.log('{incomplete');process.exit(0)}
if(scenario==='error'){console.error('secret=FIXTURE-SECRET');process.exit(1)}
if(args.join(' ')==='--output-format json -p /usage'){
 if(scenario==='logged-out'){console.error('authentication required');process.exit(1)}
 out('usage',scenario==='missing-groups'?{}:{groups:[{name:'Gemini Models',buckets:[]}]});
}else if(args.join(' ')==='--output-format json models'){
 const model={id:'gemini-3.8-flash-high',label:'Gemini 3.8 Flash (High)'};
 out('models',{models:scenario==='duplicate-model'?[model,model]:[model]});
}else if(args.includes('stream-json')&&args.includes('--dangerously-skip-permissions')){console.log(JSON.stringify({event:'init',conversation_id:'agy-session',init:{}}));console.log(JSON.stringify({event:'result',result:{conversation_id:'agy-session',status:'SUCCESS',response:'готов'}}));
}else {console.error('Unexpected inference or login invocation');process.exit(91)}
`;
export function antigravityFixture(t:TestContext,scenario='ok'){
 const dir=mkdtempSync(join(tmpdir(),'agy metadata ')),binary=join(dir,'agy fixture.mjs'),log=join(dir,'calls.ndjson');
 writeFileSync(binary,'#!'+process.execPath+'\n'+program,{mode:0o700});t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const description={...ANTIGRAVITY,binary},env={...process.env,AGY_FIXTURE_CASE:scenario,AGY_FIXTURE_LOG:log,GEMINI_API_KEY:'FIXTURE-SECRET',GOOGLE_GEMINI_BASE_URL:'https://fixture.invalid',PANE_TOKEN:'FIXTURE-TOKEN'};
 return {dir,description,env,entry:cliEntry(description,{env,cwd:dir,probeTimeoutMs:5000}),capture:()=>existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[]};
}
