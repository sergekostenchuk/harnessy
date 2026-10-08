import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CodexProvider} from './codex/provider.ts';
import {ClaudeProvider,claudeOptions} from './claude.ts';
import {query,type Query} from '@anthropic-ai/claude-agent-sdk';
import {ProviderError,snapshot} from './types.ts';
import {fixture,codexHarness,HOLD,until,terminals} from './test-support.ts';

test('reset during Codex configuration prevents process and token creation',async()=>{
 const f=fixture(),h=codexHarness();let read!:()=>void,entered=false;
 const wait=new Promise<void>(r=>{read=r});
 const provider=new CodexProvider({...h.deps,servers:async()=>{entered=true;await wait;return []}});
 const run=provider.runTurn(f.seat,'x',f.ctx);
 await until(()=>entered);await provider.reset();read();
 await assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(h.transports.length,0);assert.equal(f.tokens.length,0);assert.equal(f.handle,null);
 assert.equal(terminals(f.events).length,1);
});

test('reset and abort during Codex initialize revoke token exactly once',async()=>{
 for(const reset of [true,false]){
 const f=fixture(),h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m==='initialize'?HOLD:base(m,p,t)}),provider=new CodexProvider(h.deps);
 const run=provider.runTurn(f.seat,'x',f.ctx);
 await until(()=>h.transports[0]?.requests.some(r=>r.method==='initialize')===true);
 if(reset)await provider.reset();else f.controller.abort();
 await assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(f.tokens.length,1);assert.deepEqual(f.revoked,f.tokens);assert.equal(h.transports[0]?.closed,true);
 assert.equal(h.transports[0]?.requests.some(r=>r.method==='thread/start'),false);
 assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);await provider.close();
 assert.deepEqual(f.revoked,f.tokens);
 }
});

test('Codex absent binary fails with no retained bridge authority',async()=>{
 const f=fixture(),h=codexHarness(),provider=new CodexProvider({...h.deps,transportFactory:()=>{throw new ProviderError('no_binary','codex not found')}});
 await assert.rejects(provider.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='no_binary');
 assert.deepEqual(f.revoked,f.tokens);assert.equal(f.tokens.length,1);assert.equal(f.handle,null);
 assert.equal(terminals(f.events).length,1);await provider.close();assert.deepEqual(f.revoked,f.tokens);
});

test('Claude reset during authentication prevents query start',async()=>{
 const f=fixture('claude');let complete!:(v:unknown)=>void,entered=false,queries=0;
 const provider=new ClaudeProvider({findBinary:async()=>'/fake/claude',authStatus:()=>{entered=true;return new Promise(r=>{complete=r})},
 queryFn:(()=>{queries++;throw Error('must not launch')}) as typeof query});
 const run=provider.runTurn(f.seat,'x',f.ctx);await until(()=>entered);await provider.reset();complete({loggedIn:true});
 await assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(queries,0);assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);
});

test('Claude SDK permission cancellation denies even while kernel turn remains active',async()=>{
 const f=fixture('claude'),sdk=new AbortController();let late!:(allow:boolean)=>void;
 f.ctx.askApproval=()=>new Promise(r=>{late=r});
 const pending=claudeOptions(f.seat,f.ctx,'/fake',{}).canUseTool!('Bash',{}, {signal:sdk.signal,toolUseID:'tool',requestId:'request'});
 await until(()=>!!late);sdk.abort();const result=await pending;late(true);
 assert.equal(f.ctx.signal.aborted,false);assert.equal(result?.behavior,'deny');
});

test('Claude abort awaiting owner denies and interrupts current query',async()=>{
 const f=fixture('claude');let late!:(allow:boolean)=>void,interrupts=0,closed=0;
 f.ctx.askApproval=()=>new Promise(r=>{late=r});
 const queryFn=((args:Parameters<typeof query>[0])=>{
 const gen=(async function*(){
 yield {type:'system',subtype:'init',session_id:'s'};
 const reply=await args.options!.canUseTool!('Bash',{}, {signal:args.options!.abortController!.signal,toolUseID:'tool',requestId:'request'});
 assert.equal(reply?.behavior,'deny');
 throw Error('query cancelled');
 })();
 return Object.assign(gen,{interrupt:async()=>{interrupts++},close:()=>{closed++}}) as unknown as Query
 }) as typeof query;
 const provider=new ClaudeProvider({findBinary:async()=>'/fake',authStatus:async()=>({loggedIn:true}),queryFn});
 const run=provider.runTurn(f.seat,'x',f.ctx);await until(()=>!!late);f.controller.abort();
 await assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled'&&e.sessionId==='s');
 late(true);assert.equal(interrupts,1);assert.equal(closed,1);assert.equal(terminals(f.events).length,1);assert.equal(f.handle,null);
});

test('Seat identities cannot masquerade as truthy non-string values',()=>{
 const f=fixture();for(const key of ['id','cwd'] as const)for(const value of [123,{},true]){
 assert.throws(()=>snapshot({...f.seat,[key]:value} as never,f.ctx),e=>e instanceof ProviderError&&e.code==='protocol');
 }
});

test('completed Codex turn declines pending approval and rejects retained handle',async()=>{
 const f=fixture(),h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m==='turn/start'?{turn:{id:'turn-'+(++t.turn)}}:base(m,p,t)});
 let late!:(allow:boolean)=>void;f.ctx.askApproval=()=>new Promise(r=>{late=r});
 const provider=new CodexProvider(h.deps),run=provider.runTurn(f.seat,'x',f.ctx);
 await until(()=>h.transports[0]?.requests.some(r=>r.method==='turn/start')===true);
 const saved=f.handle!,transport=h.transports[0]!;
 transport.emit({id:88,method:'item/fileChange/requestApproval',params:{threadId:'thread',turnId:'turn-1',changes:[{path:'x'}]}});
 await until(()=>!!late);transport.notify('turn/completed',{threadId:'thread',turn:{id:'turn-1',status:'completed'}});
 await run;late(true);await until(()=>transport.replies.some(r=>r.id===88));
 assert.deepEqual(transport.replies.find(r=>r.id===88)?.result,{decision:'decline'});
 await assert.rejects(saved.steer('late'),e=>e instanceof ProviderError&&e.code==='cancelled');
 await assert.rejects(saved.interrupt(),e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(terminals(f.events).length,1);await provider.close();
});

test('completed Claude turn declines pending permission and rejects retained handle',async()=>{
 const f=fixture('claude'),sdkSignal=new AbortController();let late!:(allow:boolean)=>void,permission!:Promise<unknown>,saved!:NonNullable<typeof f.handle>;
 f.ctx.askApproval=()=>new Promise(r=>{late=r});
 const queryFn=((args:Parameters<typeof query>[0])=>{
 const gen=(async function*(){
 yield {type:'system',subtype:'init',session_id:'s'};
 saved=f.handle!;permission=Promise.resolve(args.options!.canUseTool!('Bash',{}, {signal:sdkSignal.signal,toolUseID:'tool',requestId:'request'}));
 await until(()=>!!late);
 yield {type:'result',subtype:'success',is_error:false,session_id:'s',result:'done',usage:{}};
 })();
 return Object.assign(gen,{interrupt:async()=>{},close:()=>{}}) as unknown as Query
 }) as typeof query;
 const provider=new ClaudeProvider({findBinary:async()=>'/fake',authStatus:async()=>({loggedIn:true}),queryFn});
 await provider.runTurn(f.seat,'x',f.ctx);late(true);
 assert.equal((await permission as {behavior:string}).behavior,'deny');
 await assert.rejects(saved.steer('late'),e=>e instanceof ProviderError&&e.code==='cancelled');
 await assert.rejects(saved.interrupt(),e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(terminals(f.events).length,1);assert.equal(f.ctx.signal.aborted,false);
});

test('Codex required notification IDs cannot silently join another turn',async()=>{
 for(const [method,params] of [
 ['turn/completed',{turn:{id:'turn-1',status:'completed'}}],
 ['turn/completed',{threadId:'thread',turn:{status:'completed'}}],
 ['item/agentMessage/delta',{threadId:'thread',delta:'forged'}],
 ['item/completed',{threadId:'thread',item:{type:'agentMessage',text:'forged'}}],
 ['thread/tokenUsage/updated',{threadId:'thread',tokenUsage:{last:{inputTokens:999}}}]
 ] as const){
 const f=fixture(),h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m==='turn/start'){queueMicrotask(()=>t.notify(method,params));return {turn:{id:'turn-1'}}}return base(m,p,t)}});
 const provider=new CodexProvider(h.deps);
 await assert.rejects(provider.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='protocol');
 assert.equal(terminals(f.events).length,1);assert.equal(f.events.some(e=>e.type==='delta'),false);await provider.close();
 }
});

test('unrelated notifications without turn context are ignored',async()=>{
 const f=fixture(),h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m==='turn/start')t.notify('future/notification',null);return base(m,p,t)}});
 const provider=new CodexProvider(h.deps);await provider.runTurn(f.seat,'x',f.ctx);
 assert.equal(f.events.at(-1)?.type,'done');await provider.close();
});
