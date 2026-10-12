import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call} from './test-helpers.ts';
import {config,endpoint,MemoryKeys} from '../../llm/src/test-helpers.ts';
import {collect} from '../../runtime/src/test-helpers.ts';

for(const response of ['success','error','tool'])test('21b HTTP secrets: reflected route key never reaches events, project files or HTTP history/trace: '+response,async t=>{
 const secret='fixture-reflected-route-key-890123',keys=new MemoryKeys();let step=0;
 const remote=await endpoint(t,(_body,req,res)=>{
  const echoed=String(req.headers.authorization).slice('Bearer '.length);assert.equal(echoed,secret);
  if(response==='error'){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'rejected '+echoed}}));return}
  res.writeHead(200,{'Content-Type':'text/event-stream'});const event=(delta:any,finish:any=null,usage?:any)=>res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',model:'test-model',created:1,choices:[{index:0,delta,finish_reason:finish}],...(usage?{usage}:{})})+'\n\n');event({role:'assistant'});
  if(response==='tool'&&step++===0)event({tool_calls:[{index:0,id:'call-fixture',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'reflected.txt',text:echoed})}}]},'tool_calls');
  else{for(const content of echoed)event({content});event({content:' done'},'stop')}
  event({},null,{prompt_tokens:12,completion_tokens:4,total_tokens:16});res.end('data: [DONE]\n\n');
 });
 const h=await fixture(t,{deps:{llmKeys:keys}}),route=await call(h.api,'/api/llm/providers/local/save',{body:{secret,config:{...config(remote.url),retryPolicy:{mode:'normal',maxRetries:0}}}});assert.equal(route.status,200,route.text);
 const selected=await call(h.api,'/api/panes/worker',{body:{vendor:'api:local',model:'test-model',mode:'edit'}});assert.equal(selected.status,200,selected.text);
 const events=collect(h.runtime);t.after(()=>events.sub.close());if(response==='error')await assert.rejects(h.runtime.runTurn('worker','fixture request'));else assert.equal(await h.runtime.runTurn('worker','fixture request'),'[ключ скрыт] done');
 if(response==='tool')assert.equal(readFileSync(join(h.dir,'reflected.txt'),'utf8'),'[ключ скрыт]');
 const trace=await call(h.api,'/api/trace'),chat=h.runtime.paneBinding('worker').chat,history=await call(h.api,'/api/chats/'+chat);assert.equal(history.status,200,history.text);assert.equal(JSON.stringify([trace.body,history.body,events.events]).includes(secret),false);
 function inspect(dir:string){for(const file of readdirSync(dir,{withFileTypes:true})){const path=join(dir,file.name);if(file.isDirectory())inspect(path);else if(file.isFile())assert.equal(readFileSync(path).includes(Buffer.from(secret)),false,'credential leaked into '+file.name)}}inspect(h.dir);
});
