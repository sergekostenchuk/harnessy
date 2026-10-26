import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,lstatSync,realpathSync,rmSync} from 'node:fs';
import {createServer} from 'node:net';
import type {AddressInfo} from 'node:net';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {fixture} from './test-helpers.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const program=join(root,'packages/api/tools/ts47-stand.ts');
const probe=process.env.HARNESS_TS47_PROBE??join(root,'packages/api/tools/latency-probe.ts');

async function availablePort(){
 const server=createServer();await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
 const port=(server.address() as AddressInfo).port;await new Promise<void>((ok,fail)=>server.close(e=>e?fail(e):ok()));return port;
}

test('TS-47.F: standalone marker and terminal safety integrate with the actual latency probe',{timeout:60000},async t=>{
 const port=await availablePort();
 const child=spawn(process.execPath,[program],{cwd:root,env:{...process.env,HARNESS_FAKE_PORT:String(port),HARNESS_FAKE_TTFT_MS:'0',HARNESS_FAKE_OUTCOME:'ok',HARNESS_FAKE_TOOLS:'2'},stdio:['ignore','pipe','pipe']});
 let output='',errors='',data='';
 child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{errors+=chunk});
 t.after(async()=>{
  if(child.exitCode===null&&child.signalCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
  // Only delete the unique temporary directory reported by this child, never a project or workspace.
  if(data&&dirname(data)===dirname(root)&&/^TS-47F-stand-[A-Za-z0-9]{6}$/.test(basename(data))&&
   existsSync(data)&&!lstatSync(data).isSymbolicLink()&&realpathSync(dirname(data))===realpathSync(dirname(root)))rmSync(data,{recursive:true,force:true});
 });
 const url=await new Promise<string>((ok,fail)=>{
  child.once('error',fail);child.once('exit',(code,signal)=>fail(Error('stand exited '+code+'/'+signal+': '+errors)));
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
   output+=chunk;
   const address=/TS-47\.F: (http:\/\/127\.0\.0\.1:\d+)\/sketches\/proto\/10-new-chat\.html/.exec(output);
   const directory=/Проект и настройки стенда: ([^\r\n]+)/.exec(output);
   if(address&&directory){data=directory[1]!;ok(address[1]!)}
  });
 });
 await t.test('marker only on real GET event streams; terminal launch is explicitly refused',async()=>{
  for(const pane of ['worker','all','owner']){
   const controller=new AbortController(),stream=await fetch(url+'/api/events/'+pane,{signal:controller.signal});
   assert.equal(stream.status,200);assert.equal(stream.headers.get('x-harnessy-test-double'),'1');controller.abort();await stream.body?.cancel().catch(()=>{});
  }
  for(const [path,method] of [['/api/status','GET'],['/api/events/missing','GET'],['/api/events/worker','HEAD'],['/api/events/worker','POST']] as const){
   const response=await fetch(url+path,{method});assert.equal(response.headers.get('x-harnessy-test-double'),null);
  }
  for(const vendor of ['claude','codex']){
   const response=await fetch(url+'/api/providers/'+vendor+'/login-terminal',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   assert.equal(response.status,503);const body=await response.json() as {code?:string;error?:string};
   assert.equal(body.code,'login_terminal_failed');assert.match(body.error??'',/отключён в тестовом стенде/);
  }
 });
 await t.test('worker 1 probe uses double mode against this stand, and refuses an unmarked engine',{skip:!existsSync(probe)?'TS-47.T probe is not in this tree; set HARNESS_TS47_PROBE to test it':false},async()=>{
  const {measure}=await import(pathToFileURL(probe).href) as {measure:(options:{url:string;pane:string;message:string;mode:'double';timeoutMs:number})=>Promise<{outcome:string;firstCharacter:unknown}>};
  const sample=await measure({url,pane:'worker',message:'Тест связи стенда и измерителя',mode:'double',timeoutMs:20000});
  assert.equal(sample.outcome,'done');assert.ok(sample.firstCharacter);
  const unmarked=await fixture(t),before=unmarked.runtime.journal.lastSeq;
  await assert.rejects(measure({url:unmarked.api.url,pane:'worker',message:'Не отправлять',mode:'double',timeoutMs:20000}),/test-double marker missing/);
  assert.equal(unmarked.runtime.journal.lastSeq,before);assert.equal(unmarked.provider.calls.length,0);
 });
});
