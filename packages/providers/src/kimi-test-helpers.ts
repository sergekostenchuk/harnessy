import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {TestContext} from 'node:test';
import {cliEntry} from './catalog.ts';
import {KIMI} from './kimi.ts';
export function kimiFixture(t:TestContext){
 const dir=mkdtempSync(join(tmpdir(),'harnessy-kimi-')),binary=join(dir,'kimi fixture'),log=join(dir,'calls.ndjson');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(binary,'#!'+process.execPath+`\nimport {appendFileSync} from 'node:fs';
const args=process.argv.slice(2);appendFileSync(process.env.KIMI_FIXTURE_LOG,JSON.stringify({args,home:process.env.HOME,key:!!process.env.KIMI_API_KEY,moonshot:!!process.env.MOONSHOT_API_KEY,pane:!!process.env.PANE_TOKEN})+'\\n');
if(JSON.stringify(args)!=='["--version"]')process.exit(99);console.log(process.env.KIMI_FIXTURE_VERSION||'2.1.1');\n`,{mode:0o700});
 const description={...KIMI,binary},env={...process.env,KIMI_FIXTURE_LOG:log,KIMI_API_KEY:'FIXTURE-SECRET',MOONSHOT_API_KEY:'FIXTURE-SECRET',PANE_TOKEN:'FIXTURE-PANE'};
 return {dir,binary,description,env,entry:cliEntry(description,{env,cwd:dir}),capture:():any[]=>existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]};
}
