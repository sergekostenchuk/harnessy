import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AntigravityStream,AntigravityUsageState} from './antigravity-stream.ts';
import {ANTIGRAVITY} from './antigravity.ts';
import {CliProvider} from './cli/provider.ts';
import {fixture} from './test-support.ts';
const init=(id='session-1')=>({event:'init',conversation_id:id,init:{cwd:'/fixture',permission_mode:'request-review'}});
const step=(step_type:string,index:number,state='DONE',extra:Record<string,unknown>={})=>({event:'step_update',step_update:{conversation_id:'session-1',step_index:index,step_type,state,...extra}});
const result=(extra:Record<string,unknown>={})=>({event:'result',result:{conversation_id:'session-1',status:'SUCCESS',response:'Привет',...extra}});

test('260: agy stream parses init, incremental answer and exactly one tool call/result across ACTIVE updates',()=>{
 const d=new AntigravityStream(),events=[...d.push(init()),...d.push(step('user_input',0,'DONE',{text_delta:'not assistant text'})),...d.push(step('tool',1,'ACTIVE',{tool_name:'panes.send',tool_info:{parameters:{to:'reviewer',text:'готов'}}})),...d.push(step('tool',1,'ACTIVE',{tool_name:'panes.send',tool_info:{}})),...d.push(step('tool',1,'DONE',{tool_name:'panes.send',tool_info:{output:'accepted'}})),...d.push(step('agent_response',2,'ACTIVE',{text_delta:'При'})),...d.push(step('agent_response',2,'DONE',{text_delta:'вет'})),...d.push(result())];
 d.finish();assert.deepEqual(events.map(e=>e.type),['session','tool.call','tool.result','delta','delta','done']);
 assert.deepEqual(events[1],{type:'tool.call',id:'session-1:1',name:'panes.send',input:{to:'reviewer',text:'готов'}});assert.deepEqual(events[2],{type:'tool.result',id:'session-1:1',output:'accepted',outcome:'ok'});
});
test('260: a tool delivered only as DONE still has a paired failure, not a model terminal',()=>{
 const d=new AntigravityStream();d.push(init());const e=d.push(step('tool',1,'DONE',{tool_info:{name:'run_command',parameters:{CommandLine:'fixture'},error:{type:'permission',message:'denied'}}}));
 assert.equal(e.length,2);assert.equal(e[0]!.type,'tool.call');assert.deepEqual(e[1],{type:'tool.result',id:'session-1:1',outcome:'failed',reason:'denied'});
 assert.equal(d.push(result())[0]!.type,'done');d.finish();
});
test('TS-47.7: first turn uses the counters, the next turn reports only the difference',()=>{
 const state=new AntigravityUsageState();
 const read=(usage:Record<string,number>)=>{const d=new AntigravityStream(state);d.push(init());return d.push(result({duration_seconds:20000,usage}))[0]};
 assert.deepEqual(read({input_tokens:100,output_tokens:20,cache_read_tokens:30}),{type:'done',sessionId:'session-1',text:'Привет',usage:{input:100,output:20,cacheRead:30}});
 assert.deepEqual(read({input_tokens:140,output_tokens:27,cache_read_tokens:42}),{type:'done',sessionId:'session-1',text:'Привет',usage:{input:40,output:7,cacheRead:12}});
});
test('TS-47.7: a reset or missing counter is unknown, never negative or charged to the next turn',()=>{
 const state=new AntigravityUsageState();
 const read=(usage:unknown)=>{const d=new AntigravityStream(state);d.push(init());return (d.push(result({usage}))[0] as any).usage};
 assert.deepEqual(read({input_tokens:100,output_tokens:20,cache_read_tokens:30}),{input:100,output:20,cacheRead:30});
 assert.deepEqual(read({input_tokens:10,output_tokens:25,cache_read_tokens:5}),{input:null,output:5,cacheRead:null});
 assert.deepEqual(read({input_tokens:15,output_tokens:30}),{input:5,output:5,cacheRead:null});
 assert.deepEqual(read({input_tokens:20,output_tokens:NaN,cache_read_tokens:9}),{input:5,output:null,cacheRead:null});
 assert.deepEqual(read({input_tokens:23,output_tokens:40,cache_read_tokens:11}),{input:3,output:null,cacheRead:2});
});
test('TS-47.7: a resumed conversation without a known baseline is unknown on its first observed turn',()=>{
 const state=new AntigravityUsageState();state.resume('session-1');
 const d=new AntigravityStream(state);d.push(init());const e=d.push(result({num_turns:99,duration_seconds:20000,usage:{input_tokens:90000,output_tokens:4000,cache_read_tokens:20000}}));
 assert.deepEqual(e,[{type:'done',sessionId:'session-1',text:'Привет',usage:{input:null,output:null,cacheRead:null}}]);
 const next=new AntigravityStream(state);next.push(init());assert.deepEqual((next.push(result({usage:{input_tokens:90005,output_tokens:4002,cache_read_tokens:20001}}))[0] as any).usage,{input:5,output:2,cacheRead:1});
});
test('TS-47.7: failed and lost turns cannot be charged to a later turn',()=>{
 const state=new AntigravityUsageState(),usage=(input:number)=>({input_tokens:input,output_tokens:input,cache_read_tokens:input});
 const read=(n:number)=>{const d=new AntigravityStream(state);d.push(init());return (d.push(result({usage:usage(n)}))[0] as any).usage};
 const none={input:null,output:null,cacheRead:null};
 assert.deepEqual(read(100),{input:100,output:100,cacheRead:100});
 const failed=new AntigravityStream(state);failed.push(init());failed.push(result({status:'ERROR'}));
 assert.deepEqual(read(150),none);assert.deepEqual(read(170),{input:20,output:20,cacheRead:20});
 const lost=new AntigravityStream(state);lost.push(init());
 assert.throws(()=>lost.finish(),{code:'transport_lost'});
 assert.deepEqual(read(210),none);assert.deepEqual(read(220),{input:10,output:10,cacheRead:10});
});
test('TS-47.7: overlapping and distinct conversations do not mix cumulative totals',()=>{
 const state=new AntigravityUsageState(),usage=(input:number)=>({input_tokens:input,output_tokens:input,cache_read_tokens:input}),none={input:null,output:null,cacheRead:null};
 const a=new AntigravityStream(state),b=new AntigravityStream(state),other=new AntigravityStream(state);a.push(init());b.push(init());other.push(init('session-2'));
 assert.deepEqual((other.push({event:'result',result:{conversation_id:'session-2',status:'SUCCESS',response:'B',usage:usage(7)}})[0] as any).usage,{input:7,output:7,cacheRead:7});
 assert.deepEqual((b.push(result({usage:usage(100)}))[0] as any).usage,none);
 assert.deepEqual((a.push(result({usage:usage(110)}))[0] as any).usage,none);
 const next=new AntigravityStream(state);next.push(init());assert.deepEqual((next.push(result({usage:usage(120)}))[0] as any).usage,none);
});
test('TS-47.7: the real CLI provider shares counters between its turns but not between provider instances',async t=>{
 const h=fixture(),seat={...h.seat,vendor:'antigravity',mode:'all' as const,sessionId:null as string|null},values=[100,140,170,190];
 const description={...ANTIGRAVITY,auth:{command:{args:[]},parse:()=>({loggedIn:true})},models:{list:[{id:'model',label:'model'}],reason:'test'}};
 const execute=async(_request:unknown,_signal:AbortSignal,hooks?:{stdout?(text:string):void})=>{
  if(hooks?.stdout){const n=values.shift()!;hooks.stdout(JSON.stringify(init())+'\n'+JSON.stringify(result({usage:{input_tokens:n,output_tokens:n/10,cache_read_tokens:n/2}}))+'\n')}
  return {stdout:'{}',stderr:'',code:0,signal:null};
 };
 const first=new CliProvider(description,{execute,env:{},cwd:'/project'});t.after(()=>first.close());
 await first.runTurn(seat,'one',h.ctx);seat.sessionId='session-1';await first.runTurn(seat,'two',h.ctx);
 assert.deepEqual(h.events.filter(e=>e.type==='done').map(e=>e.usage),[{input:100,output:10,cacheRead:50},{input:40,output:4,cacheRead:20}]);
 const second=new CliProvider(description,{execute,env:{},cwd:'/project'});t.after(()=>second.close());
 await second.runTurn(seat,'resumed after restart',h.ctx);await second.runTurn(seat,'next',h.ctx);
 assert.deepEqual(h.events.filter(e=>e.type==='done').slice(-2).map(e=>e.usage),[{input:null,output:null,cacheRead:null},{input:20,output:2,cacheRead:10}]);
});
for(const failure of ['no-init-exit','invalid-json','cancel-before-init','result-then-exit'] as const)test('TS-47.7: '+failure+' invalidates the resumed baseline after a process starts',async t=>{
 const description={...ANTIGRAVITY,auth:{command:{args:[]},parse:()=>({loggedIn:true})},models:{list:[{id:'model',label:'model'}],reason:'test'}};
 let count=0,controller:AbortController|null=null;
 const provider=new CliProvider(description,{env:{},cwd:'/project',execute:async(_request,_signal,hooks)=>{
  if(!hooks?.stdout)return {stdout:'{}',stderr:'',code:0,signal:null};hooks.started?.();const n=++count;
  if(n===2){if(failure==='cancel-before-init'){controller!.abort();return {stdout:'',stderr:'',code:0,signal:null}}if(failure==='invalid-json')hooks.stdout('{invalid}\n');if(failure==='result-then-exit')hooks.stdout(JSON.stringify(init())+'\n'+JSON.stringify(result({usage:{input_tokens:120,output_tokens:120,cache_read_tokens:120}}))+'\n');return {stdout:'',stderr:'lost output',code:1,signal:null}}
  const value=n===1?100:150;hooks.stdout(JSON.stringify(init())+'\n'+JSON.stringify(result({usage:{input_tokens:value,output_tokens:value,cache_read_tokens:value}}))+'\n');return {stdout:'',stderr:'',code:0,signal:null};
 }});t.after(()=>provider.close());
 const first=fixture(),seat={...first.seat,vendor:'antigravity',mode:'all' as const,sessionId:null as string|null};await provider.runTurn(seat,'first',first.ctx);
 const failed=fixture();controller=failed.controller;seat.sessionId='session-1';await assert.rejects(provider.runTurn(seat,'lost',failed.ctx));
 const next=fixture();await provider.runTurn(seat,'next',next.ctx);
 assert.deepEqual(next.events.find(e=>e.type==='done')?.usage,{input:null,output:null,cacheRead:null});
});
test('TS-47.7: refusal before process start does not invalidate a known baseline',async t=>{
 const description={...ANTIGRAVITY,auth:{command:{args:[]},parse:()=>({loggedIn:true})},models:{list:[{id:'model',label:'model'}],reason:'test'}};let count=0;
 const provider=new CliProvider(description,{env:{},cwd:'/project',execute:async(_request,_signal,hooks)=>{if(hooks?.stdout){hooks.started?.();const value=++count===1?100:150;hooks.stdout(JSON.stringify(init())+'\n'+JSON.stringify(result({usage:{input_tokens:value,output_tokens:value,cache_read_tokens:value}}))+'\n')}return {stdout:'',stderr:'',code:0,signal:null}}});t.after(()=>provider.close());
 const h=fixture(),seat={...h.seat,vendor:'antigravity',mode:'all' as const,sessionId:null as string|null};await provider.runTurn(seat,'first',h.ctx);seat.sessionId='session-1';
 const stopped=fixture();await assert.rejects(provider.runTurn(seat,'refused',{...stopped.ctx,beforeModel:async()=>{throw Error('refused before launch')}}));assert.equal(count,1);
 const next=fixture();await provider.runTurn(seat,'next',next.ctx);assert.deepEqual(next.events.find(e=>e.type==='done')?.usage,{input:50,output:50,cacheRead:50});
});
test('TS-47.7: all overlapping processes stay registered until each actually finishes',async t=>{
 const description={...ANTIGRAVITY,auth:{command:{args:[]},parse:()=>({loggedIn:true})},models:{list:[{id:'model',label:'model'}],reason:'test'}};
 let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r}),held=new Promise<void>(r=>{release=r});let count=0;
 const provider=new CliProvider(description,{env:{},cwd:'/project',execute:async(_request,_signal,hooks)=>{
  if(!hooks?.stdout)return {stdout:'{}',stderr:'',code:0,signal:null};hooks.started?.();const n=++count;hooks.stdout(JSON.stringify(init())+'\n');
  if(n===2){enter();await held}const value=[0,100,220,150,170,190,230,240][n]!;hooks.stdout(JSON.stringify(result({usage:{input_tokens:value,output_tokens:value,cache_read_tokens:value}}))+'\n');return {stdout:'',stderr:'',code:0,signal:null};
 }});t.after(async()=>{release();await provider.close()});
 const run=async(id:string,sessionId:string|null)=>{const h=fixture();await provider.runTurn({...h.seat,id,vendor:'antigravity',mode:'all',sessionId},'test',h.ctx);return h.events.find(e=>e.type==='done')?.usage};
 assert.deepEqual(await run('first',null),{input:100,output:100,cacheRead:100});
 const old=run('old','session-1');await entered;
 const none={input:null,output:null,cacheRead:null};for(const id of ['new1','new2','new3'])assert.deepEqual(await run(id,'session-1'),none);
 release();assert.deepEqual(await old,none);assert.deepEqual(await run('resync','session-1'),none);assert.deepEqual(await run('after','session-1'),{input:10,output:10,cacheRead:10});
});
test('TS-47.7: a process launch is registered before its asynchronous started callback',async t=>{
 const description={...ANTIGRAVITY,auth:{command:{args:[]},parse:()=>({loggedIn:true})},models:{list:[{id:'model',label:'model'}],reason:'test'}};
 let aEntered!:()=>void,bEntered!:()=>void,releaseA!:()=>void,releaseB!:()=>void;
 const aReady=new Promise<void>(r=>{aEntered=r}),bReady=new Promise<void>(r=>{bEntered=r});
 const aGate=new Promise<void>(r=>{releaseA=r}),bGate=new Promise<void>(r=>{releaseB=r});let count=0;
 const provider=new CliProvider(description,{env:{},cwd:'/project',execute:async(_request,_signal,hooks)=>{
  if(!hooks?.stdout)return {stdout:'{}',stderr:'',code:0,signal:null};
  const n=++count;if(n===3){bEntered();await bGate}hooks.started?.();hooks.stdout(JSON.stringify(init())+'\n');
  if(n===2){aEntered();await aGate}const value=[0,100,120,150][n]!;
  hooks.stdout(JSON.stringify(result({usage:{input_tokens:value,output_tokens:value,cache_read_tokens:value}}))+'\n');return {stdout:'',stderr:'',code:0,signal:null};
 }});t.after(async()=>{releaseA();releaseB();await provider.close()});
 const run=async(id:string,sessionId:string|null)=>{const h=fixture();await provider.runTurn({...h.seat,id,vendor:'antigravity',mode:'all',sessionId},'test',h.ctx);return h.events.find(e=>e.type==='done')?.usage};
 assert.deepEqual(await run('first',null),{input:100,output:100,cacheRead:100});
 const a=run('a','session-1');await aReady;const b=run('b','session-1');await bReady;
 const none={input:null,output:null,cacheRead:null};releaseA();assert.deepEqual(await a,none);releaseB();assert.deepEqual(await b,none);
});
for(const status of ['ERROR','CANCELED','INTERRUPTED'])test('260: provider terminal '+status+' stays a failure',()=>{
 const d=new AntigravityStream();d.push(init());assert.deepEqual(d.push(result({status,error:'fixture failure'})),[{type:'error',code:status==='ERROR'?'turn_failed':'cancelled',text:'fixture failure'}]);d.finish();
});
test('260: incomplete, foreign, malformed or replayed streams cannot produce success',()=>{
 assert.throws(()=>new AntigravityStream().push(result()),{code:'protocol'});
 const d=new AntigravityStream();d.push(init());assert.throws(()=>d.finish(),{code:'transport_lost'});
 for(const value of [result({conversation_id:'other'}),result({status:'WAITING'}),step('tool',1,'ACTIVE',{}),step('agent_response',-1),step('agent_response',1,'ACTIVE',{text_delta:42}),init()])assert.throws(()=>d.push(value),{code:'protocol'});
 d.push(step('tool',2,'ACTIVE',{tool_info:{name:'panes.send'}}));assert.throws(()=>d.push(result()),{code:'protocol'});
 d.push(step('tool',2,'DONE',{tool_info:{name:'panes.send'}}));assert.throws(()=>d.push(step('tool',2,'DONE',{tool_info:{name:'panes.send'}})),{code:'protocol'});
 d.push(result());assert.throws(()=>d.push(result()),{code:'protocol'});
});
test('260: concurrent decoder instances never mix conversation identities or tool steps',()=>{
 const a=new AntigravityStream(),b=new AntigravityStream();a.push(init());b.push(init('session-2'));
 a.push(step('agent_response',0,'ACTIVE',{text_delta:'A'}));assert.equal(b.push({event:'result',result:{conversation_id:'session-2',status:'SUCCESS',response:'B'}})[0]!.type,'done');
 assert.equal(a.push(result())[0]!.type,'done');
});


// agy stream-json captured on 2026-10-27 by two permitted calls to
// gemini-3.8-flash-high. Only conversation_id and the local cwd were replaced.
// The resumed turn contains a DONE system_message before the assistant answer.
const recorded=(name:string)=>readFileSync(new URL('./fixtures/antigravity-'+name+'.ndjson',import.meta.url),'utf8');
test('TS-47.10: the recorded resumed stream accepts system_message without emitting it as an answer',()=>{
 const d=new AntigravityStream(new AntigravityUsageState(),'recorded-session');
 const events=recorded('resumed').trim().split('\n').flatMap(line=>d.push(JSON.parse(line)));
 d.finish();
 assert.deepEqual(events.map(e=>e.type),['session','delta','delta','done']);
 assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'готов\n');
 assert.equal(events.find(e=>e.type==='done')?.text,'готов\n');
});
test('TS-47.10: unknown service events cannot supply a session, answer or terminal confirmation',()=>{
 const d=new AntigravityStream();
 assert.deepEqual(d.push({event:'future',conversation_id:'other',response:'fake',status:'SUCCESS'}),[]);
 assert.throws(()=>d.push(result()),{code:'protocol'});
 d.push(init());
 assert.deepEqual(d.push({event:'future',result:{conversation_id:'other',status:'SUCCESS',response:'fake'}}),[]);
 assert.throws(()=>d.finish(),{code:'transport_lost'});
 assert.equal(d.push(result())[0]!.type,'done');d.finish();
 assert.deepEqual(d.push({event:'future'}),[]);
 assert.throws(()=>d.push(result()),{code:'protocol'});
});
test('TS-47.10: service steps preserve session, state, shape and replay validation',()=>{
 assert.throws(()=>new AntigravityStream().push(step('system_message',1)),{code:'protocol'});
 assert.throws(()=>new AntigravityStream(new AntigravityUsageState(),'other').push(init()),{code:'protocol'});
 for(const value of [null,[],{}, {event:''},{event:42},{event:'bad\nname'}])assert.throws(()=>new AntigravityStream().push(value),{code:'protocol'});
 for(const value of [
  {...step('system_message',1),step_update:{...step('system_message',1).step_update,conversation_id:'other'}},
  step('system_message',1,'WAITING'),step('system_message',-1),
  step('system_message',1,'DONE',{text_delta:42}),step('unknown_type',1),
  {event:'step_update'},{event:'result'},{event:'init'},
 ]){
  const d=new AntigravityStream();d.push(init());assert.throws(()=>d.push(value),{code:'protocol'});
 }
 const d=new AntigravityStream();d.push(init());
 assert.deepEqual(d.push(step('system_message',1,'DONE',{text_delta:'service-only'})),[]);
 assert.throws(()=>d.push(step('system_message',1)),{code:'protocol'});
 assert.throws(()=>d.push(result({conversation_id:'other'})),{code:'protocol'});
 assert.throws(()=>d.push(result({status:'WAITING'})),{code:'protocol'});
 assert.equal(d.push(result())[0]!.type,'done');
});
const recordedModels=['gemini-3.8-flash-high','gemini-3.8-flash-medium','gemini-3.8-flash-low','claude-sonnet-4-6','claude-opus-4-6-thinking','gpt-oss-120b-medium'];
for(const model of recordedModels)test('TS-47.10: CLI fixture fresh/resumed turns for '+model,{timeout:5000},async t=>{
 const h=fixture(),description={...ANTIGRAVITY,auth:{command:{args:[]},parse:()=>({loggedIn:true})},models:{list:recordedModels.map(id=>({id,label:id})),reason:'recorded stream test'}};
 let count=0;
 const provider=new CliProvider(description,{env:{},cwd:'/fixture/project',execute:async(request,_signal,hooks)=>{
  if(!hooks?.stdout)return {stdout:'{}',stderr:'',code:0,signal:null};
  assert.equal(request.args[request.args.indexOf('--model')+1],model);
  assert.ok(request.args.includes('--dangerously-skip-permissions'));
  const resumed=++count===2;
  assert.equal(request.args.includes('--conversation'),resumed);
  if(resumed)assert.equal(request.args[request.args.indexOf('--conversation')+1],'recorded-session');
  const raw=recorded(resumed?'resumed':'fresh');hooks.started?.();
  for(let at=0;at<raw.length;at+=13)hooks.stdout(raw.slice(at,at+13));
  return {stdout:raw,stderr:'',code:0,signal:null};
 }});t.after(()=>provider.close());
 const seat={...h.seat,vendor:'antigravity',model,mode:'all' as const,sessionId:null as string|null};
 assert.equal((await provider.runTurn(seat,'Ответь одним словом: готов. Инструменты и файлы не использовать.',h.ctx)).text,'готов\n');
 seat.sessionId='recorded-session';
 assert.equal((await provider.runTurn(seat,'Ответь одним словом: готов. Инструменты и файлы не использовать.',h.ctx)).text,'готов\n');
 assert.equal(count,2);
 assert.deepEqual(h.events.filter(e=>e.type==='done').map(e=>e.usage),[{input:2188,output:974,cacheRead:22344},{input:2106,output:445,cacheRead:24141}]);
 assert.equal(h.events.some(e=>e.type==='tool'||e.type==='toolError'||e.type==='error'),false);
});
