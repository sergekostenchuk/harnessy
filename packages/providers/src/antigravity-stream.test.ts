import test from 'node:test';
import assert from 'node:assert/strict';
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
 assert.deepEqual(read(210),none);assert.deepEqual(read(220),none);assert.deepEqual(read(230),{input:10,output:10,cacheRead:10});
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
for(const status of ['ERROR','CANCELED','INTERRUPTED'])test('260: provider terminal '+status+' stays a failure',()=>{
 const d=new AntigravityStream();d.push(init());assert.deepEqual(d.push(result({status,error:'fixture failure'})),[{type:'error',code:status==='ERROR'?'turn_failed':'cancelled',text:'fixture failure'}]);d.finish();
});
test('260: incomplete, foreign, malformed or replayed streams cannot produce success',()=>{
 assert.throws(()=>new AntigravityStream().push(result()),{code:'protocol'});
 const d=new AntigravityStream();d.push(init());assert.throws(()=>d.finish(),{code:'transport_lost'});
 for(const value of [result({conversation_id:'other'}),result({status:'WAITING'}),step('tool',1,'ACTIVE',{}),step('agent_response',-1),step('agent_response',1,'ACTIVE',{text_delta:42}),{event:'future'},init()])assert.throws(()=>d.push(value),{code:'protocol'});
 d.push(step('tool',2,'ACTIVE',{tool_info:{name:'panes.send'}}));assert.throws(()=>d.push(result()),{code:'protocol'});
 d.push(step('tool',2,'DONE',{tool_info:{name:'panes.send'}}));assert.throws(()=>d.push(step('tool',2,'DONE',{tool_info:{name:'panes.send'}})),{code:'protocol'});
 d.push(result());assert.throws(()=>d.push(result()),{code:'protocol'});
});
test('260: concurrent decoder instances never mix conversation identities or tool steps',()=>{
 const a=new AntigravityStream(),b=new AntigravityStream();a.push(init());b.push(init('session-2'));
 a.push(step('agent_response',0,'ACTIVE',{text_delta:'A'}));assert.equal(b.push({event:'result',result:{conversation_id:'session-2',status:'SUCCESS',response:'B'}})[0]!.type,'done');
 assert.equal(a.push(result())[0]!.type,'done');
});
