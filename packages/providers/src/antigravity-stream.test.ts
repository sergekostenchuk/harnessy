import test from 'node:test';
import assert from 'node:assert/strict';
import {AntigravityStream} from './antigravity-stream.ts';
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
test('260: resumed session cumulative usage is never charged again as current-turn usage',()=>{
 const d=new AntigravityStream();d.push(init());const e=d.push(result({num_turns:99,duration_seconds:20000,usage:{input_tokens:90000,output_tokens:4000,cache_read_tokens:20000}}));
 assert.deepEqual(e,[{type:'done',sessionId:'session-1',text:'Привет',usage:{input:null,output:null,cacheRead:null}}]);
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
