import {test} from 'node:test';
import assert from 'node:assert/strict';
import {query,type Query,type SDKUserMessage} from '@anthropic-ai/claude-agent-sdk';
import {ClaudeProvider,claudeOptions,type ClaudeDependencies} from './claude.ts';
import {ProviderError} from './types.ts';
import {fixture,terminals,until} from './test-support.ts';
const init={type:'system',subtype:'init',session_id:'session'};
const done={type:'result',subtype:'success',is_error:false,session_id:'session',result:'fallback',duration_ms:12,usage:{input_tokens:10,output_tokens:3,cache_read_input_tokens:2}};
function harness(messages:unknown[]|(()=>AsyncGenerator<unknown>)){
 const options:Parameters<typeof query>[0][]=[],steering:SDKUserMessage[]=[];let interrupts=0,closed=0;
 const queryFn=((args:Parameters<typeof query>[0])=>{
 options.push(args);const gen=typeof messages==='function'?messages():(async function*(){yield* messages})();
 return Object.assign(gen,{interrupt:async()=>{interrupts++},streamInput:async(s:AsyncIterable<SDKUserMessage>)=>{for await(const m of s)steering.push(m)},close:()=>{closed++}}) as unknown as Query
 }) as typeof query;
 const deps:Partial<ClaudeDependencies>={queryFn,findBinary:async()=>'/fake/claude',authStatus:async()=>({loggedIn:true}),env:{ANTHROPIC_API_KEY:'not-real',CLAUDECODE:'nested'}};
 return {deps,options,steering,get interrupts(){return interrupts},get closed(){return closed}};
}
test('Claude stream, tool error, usage and early session without duplicate text',async()=>{
 const f=fixture('claude'),h=harness([init,{type:'stream_event',session_id:'session',event:{type:'content_block_delta',delta:{type:'text_delta',text:'hello'}}},
 {type:'assistant',session_id:'session',message:{content:[{type:'text',text:'hello'},{type:'tool_use',name:'Read',input:{file_path:'x'}}]}},
 {type:'user',session_id:'session',message:{content:[{type:'tool_result',is_error:true,content:'bad tool'}]}},done,done]);
 const result=await new ClaudeProvider(h.deps).runTurn(f.seat,'hi',f.ctx);
 assert.equal(result.text,'hello');assert.deepEqual(f.sessions,['session']);assert.equal(terminals(f.events).length,1);
 assert.equal(f.events.filter(e=>e.type==='delta').length,1);assert.ok(f.events.some(e=>e.type==='toolError'));
 const last=f.events.at(-1);assert.ok(last?.type==='done');assert.deepEqual(last.usage,{input:10,output:3,cacheRead:2});
 assert.equal(f.handle,null);assert.equal(h.closed,1);assert.equal(h.options[0]?.options?.env?.ANTHROPIC_API_KEY,undefined);
});
test('Claude fallback uses assistant text, result text when assistant absent',async()=>{
 for(const messages of [[init,{type:'assistant',session_id:'session',message:{content:[{type:'text',text:'answer'}]}},done],[init,done]]){
 const f=fixture('claude');const result=await new ClaudeProvider(harness(messages).deps).runTurn(f.seat,'x',f.ctx);
 assert.equal(result.text,messages.length===3?'answer':'fallback');assert.equal(f.events.filter(e=>e.type==='delta').length,1)
 }
});
test('Claude EOF and foreign terminal cannot advance work',async()=>{
 for(const messages of [[init,{type:'assistant',session_id:'session',message:{content:[{type:'text',text:'partial'}]}}],[init,{...done,session_id:'foreign'}]]){
 const f=fixture('claude');await assert.rejects(new ClaudeProvider(harness(messages).deps).runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='transport_lost');
 assert.equal(terminals(f.events).length,1);assert.equal(f.events.at(-1)?.type,'error');assert.deepEqual(f.sessions,['session']);
 }
});
test('Claude error retains session and exact vendor text',async()=>{
 const f=fixture('claude'),h=harness([init,{...done,is_error:true,result:'No conversation found with session ID: x'}]);
 await assert.rejects(new ClaudeProvider(h.deps).runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='session_missing'&&e.sessionId==='session'&&e.vendorText==='No conversation found with session ID: x');
 assert.deepEqual(f.sessions,['session']);assert.equal(terminals(f.events).length,1);
});
test('Claude cancellation before spawn, absent binary and absent login',async()=>{
 const f=fixture('claude');f.controller.abort();const h=harness([done]);let binaries=0;
 await assert.rejects(new ClaudeProvider({...h.deps,findBinary:async()=>{binaries++;return '/fake'}}).runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(binaries,0);assert.equal(h.options.length,0);
 for(const [deps,code] of [[{findBinary:async()=>null},'no_binary'],[{authStatus:async()=>({loggedIn:false})},'not_logged_in']] as const){
 const g=fixture('claude');await assert.rejects(new ClaudeProvider({...h.deps,...deps}).runTurn(g.seat,'x',g.ctx),e=>e instanceof ProviderError&&e.code===code)
 }
});
test('Claude approval allow, deny, timeout and abort never returns null',async()=>{
 for(const allow of [true,false]){
 const f=fixture('claude');f.ctx.askApproval=async()=>allow;const options=claudeOptions(f.seat,f.ctx,'/fake',{});
 const result=await options.canUseTool!('Bash',{command:'x'},{signal:f.ctx.signal,toolUseID:'tool',requestId:'request'});
 assert.ok(result);assert.equal(result.behavior,allow?'allow':'deny');
 }
 const f=fixture('claude');let late!:(allow:boolean)=>void;f.ctx.askApproval=()=>new Promise(r=>{late=r});
 const call=claudeOptions(f.seat,f.ctx,'/fake',{}).canUseTool!('Bash',{}, {signal:f.ctx.signal,toolUseID:'tool',requestId:'request'});
 await until(()=>!!late);f.controller.abort();const result=await call;assert.equal(result?.behavior,'deny');late(true);
});
test('Claude busy, steer and interrupt are bound to active query; snapshot survives edit',async()=>{
 let finish!:()=>void;const waiting=new Promise<void>(r=>{finish=r});
 const h=harness(async function*(){yield init;await waiting;yield done}),f=fixture('claude'),p=new ClaudeProvider(h.deps);
 const run=p.runTurn(f.seat,'x',f.ctx);await until(()=>h.options.length===1);
 await assert.rejects(p.runTurn(f.seat,'second',f.ctx),e=>e instanceof ProviderError&&e.code==='busy');
 f.seat.cwd='/changed';await f.handle!.steer('correction');await f.handle!.interrupt();finish();await run;
 assert.equal(h.interrupts,1);assert.equal(h.steering[0]?.priority,'now');assert.deepEqual(h.steering[0]?.origin,{kind:'human'});assert.equal(h.options[0]?.options?.cwd,'/project');
 assert.equal(terminals(f.events).length,1);assert.equal(f.handle,null);
});
test('Claude sessions strip digest and merge consecutive assistant messages',async()=>{
 const f=fixture('claude'),h=harness([]);let dir='';
 const provider=new ClaudeProvider({...h.deps,listSessionsFn:async options=>{dir=options?.dir??'';return [{sessionId:'s',summary:'title',lastModified:2000,fileSize:1}]},
 getSessionMessagesFn:async()=>[
 {type:'user',uuid:'1',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:'digest\n---\nСообщение тебе:\nhi'}},
 {type:'assistant',uuid:'2',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:[{type:'text',text:'one'}]}},
 {type:'assistant',uuid:'3',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:[{type:'text',text:'two'}]}},
 {type:'user',uuid:'4',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:[{type:'tool_result',content:'omit'}]}}
 ]});
 assert.equal((await provider.listSessions('/project'))[0]?.updated,2);assert.equal(dir,'/project');
 assert.deepEqual(await provider.sessionMessages('/project','s'),[{role:'me',text:'hi'},{role:'ai',text:'one\ntwo'}]);
 assert.deepEqual(await provider.models(),[]);assert.equal((await provider.auth()).loggedIn,true);
});
