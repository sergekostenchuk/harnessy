import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexProvider} from './codex/provider.ts';
import {codexHarness,fixture} from './test-support.ts';
import {CliProvider} from './cli/provider.ts';
import {cliFixture} from './cli/test-support.ts';
import {CopilotStream} from './copilot-stream.ts';
import {opencodeStream} from './opencode-stream.ts';
import {qwenStream} from './qwen-stream.ts';
const options={timeout:10000};
for(const kind of ['text','reasoning','summary','message','foreign'] as const)test('22d: Codex first output '+kind+' precedes terminal',options,async t=>{
 const f=fixture();let responded=0;f.ctx.modelResponded=()=>responded++;
 const h=codexHarness(transport=>{const base=transport.responder;transport.responder=(m,p,tr)=>{if(m!=='turn/start')return base(m,p,tr);const id='turn-'+(++tr.turn);queueMicrotask(()=>{
 const method=kind==='message'?'item/completed':kind==='reasoning'?'item/reasoning/textDelta':kind==='summary'?'item/reasoning/summaryTextDelta':'item/agentMessage/delta';
 tr.notify(method,{threadId:kind==='foreign'?'another-thread':'thread',turnId:id,delta:'first',item:{type:'agentMessage',text:'first'}});
 tr.notify('turn/completed',{threadId:'thread',turn:{id,status:'completed'}});
 });return {turn:{id}}}}),provider=new CodexProvider(h.deps);t.after(()=>provider.close());await provider.runTurn(f.seat,'test',f.ctx);assert.equal(responded,kind==='foreign'?0:1);
});
for(const type of ['response','delta','done','metadata'] as const)test('22d: CLI response signal before redaction buffering: '+type,options,async t=>{
 const f=await cliFixture(t);let responded=0;f.ctx.modelResponded=()=>responded++;
 const provider=new CliProvider(f.description,{env:{TEST_API_KEY:'a-long-private-fixture'},execute:async(req,_signal,hooks)=>{
 const action=req.args[1];if(action==='auth')return {code:0,signal:null,stdout:JSON.stringify({loggedIn:true}),stderr:''};if(action==='models')return {code:0,signal:null,stdout:JSON.stringify([{id:'test-model',label:'Test'}]),stderr:''};
 const event=type==='metadata'?{type:'session',id:'s'}:type==='response'?{type}:{type,text:'a'};hooks!.stdout!(JSON.stringify(event)+'\n');assert.equal(responded,type==='metadata'?0:1);throw new Error('fixture stops immediately after first event');
 }});t.after(()=>provider.close());await assert.rejects(provider.runTurn(f.seat,'test',f.ctx));
});
test('22d: CLI reasoning decoders signal output without exposing thinking',options,()=>{
 for(const kind of ['assistant.reasoning','assistant.reasoning_delta'])assert.deepEqual(new CopilotStream().push({type:kind,data:{}}),[{type:'response'}]);
 assert.deepEqual(opencodeStream()({type:'reasoning',sessionID:'s',part:{type:'reasoning',sessionID:'s'}}),[{type:'session',id:'s'},{type:'response'}]);
 const qwen=qwenStream();qwen({type:'system',subtype:'init',session_id:'s'});assert.deepEqual(qwen({type:'assistant',session_id:'s',message:{role:'assistant',content:[{type:'thinking',thinking:'private'}]}}),[{type:'response'}]);
 assert.deepEqual(qwen({type:'assistant',session_id:'s',parent_tool_use_id:'child',message:{role:'assistant',content:[{type:'thinking',thinking:'private'}]}}),[]);
});
