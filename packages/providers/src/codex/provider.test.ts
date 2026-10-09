import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CodexProvider} from './provider.ts';
import {ProviderError} from '../types.ts';
import {fixture,codexHarness,HOLD,until,terminals} from '../test-support.ts';
test('Codex stream, tools, usage and duplicate/foreign terminals',async()=>{
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{
 if(m!=='turn/start')return base(m,p,t);const id='turn-'+(++t.turn);
 queueMicrotask(()=>{
 t.notify('item/agentMessage/delta',{threadId:'thread',turnId:id,delta:'hello'});
 t.notify('item/started',{threadId:'thread',turnId:id,item:{type:'commandExecution',command:'pwd'}});
 t.notify('item/completed',{threadId:'thread',turnId:id,item:{type:'commandExecution',status:'failed',exitCode:1,aggregatedOutput:'bad'}});
 t.notify('item/completed',{threadId:'thread',turnId:id,item:{type:'agentMessage',text:'hello'}});
 t.notify('thread/tokenUsage/updated',{threadId:'thread',turnId:id,tokenUsage:{last:{inputTokens:8,outputTokens:2,cachedInputTokens:3}}});
 t.notify('turn/completed',{threadId:'foreign',turn:{id,status:'completed'}});
 t.notify('turn/completed',{threadId:'thread',turn:{id:'old',status:'completed'}});
 t.notify('turn/completed',{threadId:'thread',turn:{id,status:'completed'}});
 t.notify('turn/completed',{threadId:'thread',turn:{id,status:'completed'}});
 });return {turn:{id}}
 }});
 const f=fixture(),p=new CodexProvider(h.deps),result=await p.runTurn(f.seat,'x',f.ctx);
 assert.equal(result.text,'hello');assert.deepEqual(f.sessions,['thread']);assert.equal(terminals(f.events).length,1);assert.equal(f.events.filter(e=>e.type==='delta').length,1);
 assert.ok(f.events.some(e=>e.type==='toolError'));const done=f.events.at(-1);assert.ok(done?.type==='done');assert.deepEqual(done.usage,{input:8,output:2,cacheRead:3});
 const start=h.transports[0]!.requests.find(r=>r.method==='thread/start')!.params as Record<string,unknown>;assert.equal(typeof start.developerInstructions,'string');assert.equal(start.sandbox,'workspace-write');
 const turn=h.transports[0]!.requests.find(r=>r.method==='turn/start')!.params as Record<string,unknown>;assert.equal((turn.sandboxPolicy as {type:string}).type,'workspaceWrite');assert.equal(f.handle,null);await p.close();
});
test('Codex fallback and failure preserve session and vendor text',async()=>{
 for(const failure of [false,true]){
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m!=='turn/start')return base(m,p,t);
 const id='turn-'+(++t.turn);queueMicrotask(()=>{
 t.notify('item/completed',{threadId:'thread',turnId:id,item:{type:'agentMessage',text:'fallback'}});
 t.notify('turn/completed',{threadId:'thread',turn:{id,status:failure?'failed':'completed',error:failure?{message:'model is not supported when using Codex with a ChatGPT account',codexErrorInfo:'badRequest'}:null}});
 });return {turn:{id}}}});
 const f=fixture(),p=new CodexProvider(h.deps);
 if(failure)await assert.rejects(p.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='model_unsupported'&&e.sessionId==='thread');
 else assert.equal((await p.runTurn(f.seat,'x',f.ctx)).text,'fallback');
 assert.equal(terminals(f.events).length,1);assert.deepEqual(f.sessions,['thread']);await p.close();
 }
});
test('Codex EOF does not report done and revokes process authority',async()=>{
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m==='turn/start'){queueMicrotask(()=>t.die());return HOLD}return base(m,p,t)}});
 const f=fixture(),p=new CodexProvider(h.deps);await assert.rejects(p.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='transport_lost'&&e.sessionId==='thread');
 assert.equal(f.events.at(-1)?.type,'error');assert.equal(terminals(f.events).length,1);assert.equal(f.revoked.length,1);await p.close();assert.equal(f.revoked.length,1);
});
test('Codex abort before process, not logged in, resume failure, missing fields',async()=>{
 const f=fixture(),h=codexHarness(),p=new CodexProvider(h.deps);f.controller.abort();
 await assert.rejects(p.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='cancelled');assert.equal(h.transports.length,0);
 for(const [method,response,code] of [['account/read',{account:null},'not_logged_in'],['thread/start',{thread:{}},'protocol'],['turn/start',{turn:{}},'protocol']] as const){
 const g=fixture(),x=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m===method?response:base(m,p,t)}),provider=new CodexProvider(x.deps);
 await assert.rejects(provider.runTurn(g.seat,'x',g.ctx),e=>e instanceof ProviderError&&e.code===code);await provider.close();
 }
 const g=fixture();g.seat.sessionId='missing';const x=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m==='thread/resume')throw Error('unknown thread');return base(m,p,t)}});
 const provider=new CodexProvider(x.deps);await assert.rejects(provider.runTurn(g.seat,'x',g.ctx),e=>e instanceof ProviderError&&e.code==='session_missing');await provider.close();
});
test('Codex two turns share token; cwd/reset revoke it and lists use another process',async()=>{
 const f=fixture(),h=codexHarness(),p=new CodexProvider(h.deps);
 const first=await p.runTurn(f.seat,'one',f.ctx);f.seat.sessionId=first.sessionId;await p.runTurn(f.seat,'two',f.ctx);
 assert.equal(h.transports.length,1);assert.equal(f.tokens.length,1);assert.equal(f.revoked.length,0);assert.equal(h.options[0]?.env.PANE_TOKEN,undefined);assert.equal(h.options[0]?.env.OPENAI_API_KEY,undefined);
 assert.ok(h.options[0]?.args.some(s=>s.includes('PANE_TOKEN')&&s.includes(f.tokens[0]!)));
 await Promise.all([p.auth(),p.models()]);assert.equal(h.transports.length,2);
 f.seat.cwd='/other';await p.runTurn(f.seat,'three',f.ctx);assert.equal(f.revoked.length,1);assert.equal(f.tokens.length,2);assert.ok(f.tokens[0]!==f.tokens[1]);
 await p.reset();assert.equal(f.revoked.length,2);await p.close();assert.equal(f.revoked.length,2);
});
test('Codex abort waiting approval denies, interrupts; late allow has no effect',async()=>{
 let allow!:(value:boolean)=>void;
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{
 if(m==='turn/start'){const id='turn-'+(++t.turn);return {turn:{id}}}return base(m,p,t)
 }});
 const f=fixture();f.ctx.askApproval=()=>new Promise(r=>{allow=r});
 const p=new CodexProvider(h.deps),run=p.runTurn(f.seat,'x',f.ctx);await until(()=>h.transports[0]?.requests.some(r=>r.method==='turn/start')===true);
 const t=h.transports[0]!;t.emit({id:71,method:'item/commandExecution/requestApproval',params:{threadId:'thread',turnId:'turn-1',command:'rm'}});
 await until(()=>!!allow);f.controller.abort();await run;await until(()=>t.replies.some(r=>r.id===71));
 assert.deepEqual(t.replies.find(r=>r.id===71)?.result,{decision:'decline'});allow(true);assert.equal(terminals(f.events).length,1);assert.ok(t.requests.some(r=>r.method==='turn/interrupt'));await p.close();
});
test('Codex snapshot, busy and steer preserve active turn identity',async()=>{
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m==='turn/start'?{turn:{id:'turn-'+(++t.turn)}}:base(m,p,t)});
 const f=fixture(),p=new CodexProvider(h.deps),run=p.runTurn(f.seat,'x',f.ctx);await until(()=>h.transports[0]?.requests.some(r=>r.method==='turn/start')===true);
 await assert.rejects(p.runTurn(f.seat,'again',f.ctx),e=>e instanceof ProviderError&&e.code==='busy');
 f.seat.cwd='/changed';await assert.rejects(p.runTurn(f.seat,'again',f.ctx),e=>e instanceof ProviderError&&e.code==='cwd_changed');
 await f.handle!.steer('correction');const t=h.transports[0]!,steer=t.requests.find(r=>r.method==='turn/steer')!.params as Record<string,unknown>;
 assert.equal(steer.expectedTurnId,'turn-1');assert.equal(h.options[0]?.cwd,'/project');await f.handle!.interrupt();await run;await p.close();
});
test('models pagination and failure are independent of account; history strips digest',async()=>{
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{
 if(m==='model/list')return p.cursor?{data:[{model:'second',displayName:'Second'}],nextCursor:null}:{data:[{model:'first',displayName:'First'}],nextCursor:'page'};
 if(m==='thread/read')return {thread:{turns:[{items:[{type:'userMessage',content:[{type:'text',text:'digest\n---\nСообщение тебе:\nhello'}]},{type:'agentMessage',text:'one'},{type:'agentMessage',text:'two'}]}]}};
 if(m==='thread/list')return {data:[{id:'s',name:'',updatedAt:4}],nextCursor:null};return base(m,p,t)
 }});
 const p=new CodexProvider(h.deps);assert.deepEqual(await p.models(),[{id:'first',label:'First'},{id:'second',label:'Second'}]);
 assert.deepEqual(await p.sessionMessages('/project','s'),[{role:'me',text:'hello'},{role:'ai',text:'one\ntwo'}]);assert.equal((await p.listSessions('/project'))[0]?.title,'hello');await p.reset();
 const fail=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m==='model/list')throw Error('catalog unavailable');return base(m,p,t)}});
 const q=new CodexProvider(fail.deps);await assert.rejects(q.models(),e=>e instanceof ProviderError&&e.code==='models_unavailable');assert.equal((await q.auth()).loggedIn,true);await q.close();
});

for(const status of ['completed','interrupted'] as const)test('[TS-04a:47] Codex modelStarted precedes turn/start and result carries '+status,async()=>{
 const f=fixture(),order:string[]=[];let started=0;
 f.ctx.modelStarted=()=>{started++;order.push('started')};
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>{if(m!=='turn/start'){assert.equal(started,0);return base(m,p,t)}
 assert.equal(started,1);order.push('turn/start');const id='turn-'+(++t.turn);queueMicrotask(()=>t.notify('turn/completed',{threadId:'thread',turn:{id,status}}));return {turn:{id}}
 }}),provider=new CodexProvider(h.deps);
 const result=await provider.runTurn(f.seat,'x',f.ctx);assert.equal(result.interrupted,status==='interrupted'?true:undefined);assert.deepEqual(order,['started','turn/start']);assert.equal(started,1);assert.equal(terminals(f.events).length,1);await provider.close()
});
