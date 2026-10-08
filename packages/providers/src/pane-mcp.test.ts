import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../bin/pane-mcp.mjs',import.meta.url));
async function bridge(messages:unknown[],token:string|null='test-token'){
 const dir=await mkdtemp(join(tmpdir(),'providers-bridge-')),calls=join(dir,'calls.ndjson'),loader=join(dir,'fetch.mjs');
 await writeFile(loader,`import {appendFileSync} from 'node:fs';
globalThis.fetch=async(url,options={})=>{
 appendFileSync(process.env.TEST_CALLS,JSON.stringify({url:String(url),...options})+'\\n');
 return {ok:true,json:async()=>({ok:true,seq:1,to:['reviewer'],thread:'task',reply:'answer',sha:'123',mergeSha:'456',branch:'integration',pane:'new',label:'New',model:'m',mode:'read',mandate:1,text:'transcript'})};
};`);
 try{
 const env={...process.env,PANE_ID:'worker',APP_URL:'http://fake.invalid',SEATS:'worker:Worker;reviewer:Review',TEST_CALLS:calls};
 if(token!==null)Object.assign(env,{PANE_TOKEN:token});else delete (env as Record<string,string|undefined>).PANE_TOKEN;
 const child=spawn(process.execPath,['--import',loader,script],{env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',c=>{stdout+=String(c)});child.stderr.on('data',c=>{stderr+=String(c)});
 const exit=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
 child.stdin.end(messages.map(m=>JSON.stringify(m)).join('\n')+'\n');const code=await exit;
 assert.equal(code,0,stderr);const replies=stdout.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s) as Record<string,unknown>);
 let requests:Record<string,unknown>[]=[];try{requests=(await readFile(calls,'utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
 return {requests,replies,stderr}
 }finally{await rm(dir,{recursive:true,force:true})}
}
test('MCP bridge sends own identity and token on every route including GET; no network',async()=>{
 const tools:[string,unknown][]=[['send',{to:'reviewer',kind:'report',text:'x'}],['ask',{to:'reviewer',text:'x'}],['read_pane',{pane:'reviewer',last_n:2}],['merge',{sha:'abc'}],['assign_role',{role:'tester'}]];
 const result=await bridge(tools.map(([name,args],i)=>({id:i+1,method:'tools/call',params:{name,arguments:args}})));
 assert.equal(result.requests.length,5);for(const request of result.requests){
 assert.equal((request.headers as Record<string,string>)['X-Pane-Token'],'test-token');
 if(request.body)assert.equal(JSON.parse(String(request.body)).from,'worker');else assert.equal(new URL(String(request.url)).searchParams.get('from'),'worker');
 }
 assert.equal(result.stderr.includes('test-token'),false);
});
test('MCP bridge rejects sender spoof, invalid/missing args, unknown tool and notification call before HTTP',async()=>{
 const bad:[string,unknown][]=[['send',{to:'reviewer',kind:'report',text:'x',from:'owner'}],['send',{to:'reviewer',kind:'ack',text:'x'}],
 ['send',{to:'reviewer',kind:'report',text:1}],['send',{kind:'report',text:'x'}],['merge',{}],['ask',{to:'worker',text:'x'}],
 ['read_pane',{pane:'reviewer',last_n:101}],['assign_role',{role:'x',mode:'root'}],['__proto__',{}]];
 const result=await bridge([...bad.map(([name,args],i)=>({id:i+1,method:'tools/call',params:{name,arguments:args}})),{method:'tools/call',params:{name:'merge',arguments:{sha:'abc'}}}]);
 assert.equal(result.requests.length,0);assert.equal(result.replies.length,bad.length+1);
 for(const r of result.replies)assert.ok(r.error||(r.result as {isError:boolean}).isError);
});
test('MCP bridge missing token never falls back to anonymous request',async()=>{
 const result=await bridge([{id:1,method:'tools/call',params:{name:'send',arguments:{to:'reviewer',kind:'status',text:'x'}}}],null);
 assert.equal(result.requests.length,0);assert.equal((result.replies[0]?.result as {isError:boolean}).isError,true);
});
