import {test} from 'node:test';
import assert from 'node:assert/strict';
import {query} from '@anthropic-ai/claude-agent-sdk';
import {parse} from 'smol-toml';
import {ClaudeProvider} from './claude.ts';
import {CodexProvider} from './codex/provider.ts';
import {ProviderError,record} from './types.ts';
import {fixture,codexHarness,HOLD,until,terminals} from './test-support.ts';
import {bridge} from './bridge-test-support.ts';

for(const stage of ['binary','auth'] as const)test('early Claude interrupt during '+stage+' cancels without query',async()=>{
 const f=fixture('claude');let finish!:()=>void,entered=false,queries=0,auths=0;
 const provider=new ClaudeProvider({
 findBinary:()=>stage==='binary'?new Promise(r=>{entered=true;finish=()=>r('/fake/claude')}):Promise.resolve('/fake/claude'),
 authStatus:(_binary,_env,signal)=>{auths++;assert.equal(signal?.aborted,false);return stage==='auth'?new Promise(r=>{entered=true;finish=()=>r({loggedIn:true})}):Promise.resolve({loggedIn:true})},
 queryFn:(()=>{queries++;throw Error('must not launch')}) as typeof query
 });
 const run=provider.runTurn(f.seat,'x',f.ctx),cancelled=assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled');
 await until(()=>entered);await f.handle!.interrupt();await cancelled;
 assert.equal(f.controller.signal.aborted,false);assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);
 finish();await new Promise<void>(r=>setImmediate(r));assert.equal(queries,0);assert.equal(auths,stage==='binary'?0:1);await provider.close();
});

for(const stage of ['servers','router'] as const)test('early Codex interrupt during '+stage+' cancels without process',async()=>{
 const f=fixture(),h=codexHarness();let finish!:()=>void,entered=false;
 const provider=new CodexProvider({...h.deps,
 servers:()=>stage==='servers'?new Promise(r=>{entered=true;finish=()=>r([])}):Promise.resolve([]),
 router:()=>stage==='router'?new Promise(r=>{entered=true;finish=()=>r(null)}):Promise.resolve(null)
 });
 const run=provider.runTurn(f.seat,'x',f.ctx),cancelled=assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled');
 await until(()=>entered);await f.handle!.interrupt();await cancelled;
 finish();await new Promise<void>(r=>setImmediate(r));
 assert.equal(h.transports.length,0);assert.equal(f.tokens.length,0);assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);await provider.close();
});

for(const vendor of ['claude','codex'] as const)test('early '+vendor+' interrupt wins synchronous discovery failure without unhandled rejection',async()=>{
 const f=fixture(vendor),h=codexHarness();
 const fail=()=>{void f.handle!.interrupt();throw Error('late discovery failure')};
 const provider=vendor==='claude'?new ClaudeProvider({findBinary:fail,queryFn:(()=>{throw Error('must not launch')}) as typeof query}):new CodexProvider({...h.deps,servers:fail});
 await assert.rejects(provider.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(h.transports.length,0);assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);await provider.close();
});

for(const method of ['initialize','account/read','thread/start','thread/resume'])test('early Codex interrupt awaiting '+method+' closes process without turn/start',async()=>{
 const f=fixture();if(method==='thread/resume')f.seat.sessionId='thread';
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m===method?HOLD:base(m,p,t)}),provider=new CodexProvider(h.deps);
 const run=provider.runTurn(f.seat,'x',f.ctx),cancelled=assert.rejects(run,e=>e instanceof ProviderError&&e.code==='cancelled');
 await until(()=>h.transports[0]?.requests.some(r=>r.method===method)===true);
 await f.handle!.interrupt();await cancelled;
 const t=h.transports[0]!;assert.equal(t.closed,true);assert.equal(t.requests.some(r=>r.method==='turn/start'),false);
 assert.equal(t.requests.some(r=>r.method==='turn/interrupt'),false);assert.deepEqual(f.revoked,f.tokens);assert.equal(f.tokens.length,1);
 const request=t.requests.find(r=>r.method===method)!;t.emit({id:request.id,result:method==='initialize'?{}:{thread:{id:'thread'}}});
 await new Promise<void>(r=>setImmediate(r));assert.equal(t.requests.some(r=>r.method==='turn/start'),false);
 assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);await provider.close();assert.deepEqual(f.revoked,f.tokens);
});

test('early Codex interrupt after thread/resume response prevents turn/start',async()=>{
 const f=fixture(),h=codexHarness(),provider=new CodexProvider(h.deps);f.seat.sessionId='thread';
 const session=f.ctx.session;f.ctx.session=id=>{session(id);void f.handle!.interrupt()};
 await assert.rejects(provider.runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='cancelled'&&e.sessionId==='thread');
 const t=h.transports[0]!;assert.ok(t.requests.some(r=>r.method==='thread/resume'));
 assert.equal(t.requests.some(r=>r.method==='turn/start'),false);assert.equal(t.closed,true);assert.deepEqual(f.revoked,f.tokens);
 assert.deepEqual(f.sessions,['thread']);assert.equal(f.handle,null);assert.equal(terminals(f.events).length,1);await provider.close();
});

for(const method of ['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval'])test(method+' rejects absent/null/foreign and malformed thread/turn IDs before owner card',async()=>{
 const f=fixture(),h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m==='turn/start'?{turn:{id:'turn-'+(++t.turn)}}:base(m,p,t)});
 let asks=0;f.ctx.askApproval=async()=>{asks++;return true};
 const provider=new CodexProvider(h.deps),run=provider.runTurn(f.seat,'x',f.ctx);
 await until(()=>h.transports[0]?.requests.some(r=>r.method==='turn/start')===true);const t=h.transports[0]!;
 let count=0;
 for(const key of ['turnId','threadId'])for(const value of [undefined,null,'foreign',123,'']){
 const params:Record<string,unknown>={threadId:'thread',turnId:'turn-1',command:'pwd',changes:[{path:'x'}],permissions:{network:{enabled:true}}};
 if(value===undefined)delete params[key];else params[key]=value;
 const id=count++%2===0?'invalid-'+count:count;t.emit({id,method,params});
 await until(()=>t.replies.some(r=>r.id===id));const reply=t.replies.find(r=>r.id===id)!;
 assert.equal('result'in reply,false);assert.ok(record(reply.error));assert.equal(reply.error.code,-32602);
 assert.match(String(reply.error.message),/^protocol:/);assert.equal(asks,0);
 }
 assert.equal(f.events.filter(e=>e.type==='toolError').length,count);
 t.emit({id:'valid',method,params:{threadId:'thread',turnId:'turn-1',command:'pwd',changes:[{path:'x'}],permissions:{network:{enabled:true}}}});
 await until(()=>t.replies.some(r=>r.id==='valid'));assert.equal(asks,1);
 assert.deepEqual(t.replies.find(r=>r.id==='valid')?.result,method==='item/permissions/requestApproval'?{permissions:{network:{enabled:true}},scope:'turn'}:{decision:'accept'});
 t.notify('turn/completed',{threadId:'thread',turn:{id:'turn-1',status:'completed'}});await run;await provider.close();
});

test('elicitation accepts null turnId but rejects missing/foreign IDs with original RPC id',async()=>{
 const f=fixture(),h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m==='turn/start'?{turn:{id:'turn-'+(++t.turn)}}:base(m,p,t)});
 let asks=0;f.ctx.askApproval=async()=>{asks++;return true};
 const provider=new CodexProvider(h.deps),run=provider.runTurn(f.seat,'x',f.ctx);
 await until(()=>h.transports[0]?.requests.some(r=>r.method==='turn/start')===true);const t=h.transports[0]!;
 const base={threadId:'thread',turnId:null,serverName:'panes',mode:'form',requestedSchema:{type:'object'},_meta:{codex_approval_kind:'mcp_tool_call'}};
 for(const turnId of [null,'turn-1']){
 const id='valid-'+String(turnId);t.emit({id,method:'mcpServer/elicitation/request',params:{...base,turnId}});
 await until(()=>t.replies.some(r=>r.id===id));assert.deepEqual(t.replies.find(r=>r.id===id)?.result,{action:'accept',content:{},_meta:null});
 }
 for(const [index,params] of [{...base,turnId:undefined},{...base,turnId:'old'},{...base,threadId:undefined},{...base,threadId:null},{...base,threadId:'other'}].entries()){
 const id='bad-'+index;t.emit({id,method:'mcpServer/elicitation/request',params});await until(()=>t.replies.some(r=>r.id===id));
 assert.equal((t.replies.find(r=>r.id===id)?.error as {code:number}).code,-32602);
 }
 assert.equal(asks,0);assert.equal(f.events.filter(e=>e.type==='toolError').length,5);
 t.notify('turn/completed',{threadId:'thread',turn:{id:'turn-1',status:'completed'}});await run;await provider.close();
});

for(const failure of ['exit','protocol'] as const)test('idle Codex '+failure+' revokes only dead seat and recreates process/token',async()=>{
 const f=fixture(),other=fixture(),h=codexHarness(),provider=new CodexProvider(h.deps);other.seat.id='other';
 f.seat.sessionId=(await provider.runTurn(f.seat,'one',f.ctx)).sessionId;
 other.seat.sessionId=(await provider.runTurn(other.seat,'one',other.ctx)).sessionId;
 const old=h.transports[0]!;
 if(failure==='exit')old.die();else old.emit('{invalid');
 assert.deepEqual(f.revoked,f.tokens);assert.equal(other.revoked.length,0);
 await provider.runTurn(other.seat,'two',other.ctx);assert.equal(h.transports.length,2);
 await provider.runTurn(f.seat,'two',f.ctx);assert.equal(h.transports.length,3);assert.equal(f.tokens.length,2);assert.notEqual(f.tokens[0],f.tokens[1]);
 assert.ok(h.transports[2]!.requests.some(r=>r.method==='thread/resume'));
 old.die();await provider.runTurn(f.seat,'three',f.ctx);assert.equal(h.transports.length,3);assert.equal(f.revoked.length,1);
 await provider.close();assert.deepEqual(f.revoked,f.tokens);assert.deepEqual(other.revoked,other.tokens);
});

for(const operation of ['auth','models','listSessions','sessionMessages'] as const)test('idle metadata death recreates client for '+operation+' without losing other cwd cache',async()=>{
 const h=codexHarness(),provider=new CodexProvider(h.deps);
 await provider.models();await provider.listSessions('/other');const old=h.transports[0]!;old.die();
 await provider.listSessions('/other');assert.equal(h.transports.length,2);
 if(operation==='auth')assert.equal((await provider.auth()).loggedIn,true);
 else if(operation==='models')assert.deepEqual(await provider.models(),[{id:'wire-model',label:'Model'}]);
 else if(operation==='listSessions')assert.deepEqual(await provider.listSessions('/project'),[]);
 else assert.deepEqual(await provider.sessionMessages('/project','thread'),[]);
 assert.equal(h.transports.length,3);assert.ok(h.transports[2]!.requests.some(r=>r.method==='initialize'));
 await provider.models();assert.ok(h.transports[2]!.requests.some(r=>r.method==='model/list'));
 old.die();await provider.auth();assert.equal(h.transports.length,3);await provider.close();
});

test('metadata initialize remains shared while concurrent calls wait for handshake',async()=>{
 const h=codexHarness(t=>{const base=t.responder;t.responder=(m,p,t)=>m==='initialize'?HOLD:base(m,p,t)}),provider=new CodexProvider(h.deps);
 const auth=provider.auth();await until(()=>h.transports[0]?.requests.some(r=>r.method==='initialize')===true);
 const sessions=provider.listSessions('/project');await new Promise<void>(r=>setImmediate(r));const t=h.transports[0]!;
 assert.deepEqual(t.requests.map(r=>r.method),['initialize']);t.emit({id:t.requests[0]!.id,result:{}});
 assert.equal((await auth).loggedIn,true);assert.deepEqual(await sessions,[]);assert.equal(h.transports.length,1);await provider.close();
});

test('metadata death after model response cannot repopulate models cache',async()=>{
 let first=true;const h=codexHarness(t=>{
 if(!first)return;first=false;const emit=t.emit.bind(t);
 t.emit=v=>{emit(v);if(record(v)&&record(v.result)&&Array.isArray(v.result.data))t.die()};
 }),provider=new CodexProvider(h.deps);
 assert.deepEqual(await provider.models(),[{id:'wire-model',label:'Model'}]);assert.equal(h.transports[0]!.closed,true);
 await provider.models();assert.equal(h.transports.length,2);await provider.close();
});

function bridgeEnv(args:string[]){
 const config=parse(args.filter((_,i)=>i>0&&i%2===0).join('\n')) as {mcp_servers:{panes:{env:Record<string,string>}}};
 return config.mcp_servers.panes.env;
}

test('new peer restarts Codex with fresh token and resumed session; bridge schema/routes include peer',async()=>{
 const f=fixture(),h=codexHarness(),provider=new CodexProvider(h.deps);
 f.seat.sessionId=(await provider.runTurn(f.seat,'one',f.ctx)).sessionId;
 f.ctx.peers.push({id:'new-peer',label:'New peer',vendor:'claude'});
 await provider.runTurn(f.seat,'two',f.ctx);assert.equal(h.transports.length,2);assert.equal(h.transports[0]!.closed,true);
 assert.deepEqual(f.revoked,[f.tokens[0]]);assert.notEqual(f.tokens[0],f.tokens[1]);assert.ok(h.transports[1]!.requests.some(r=>r.method==='thread/resume'));
 const env=bridgeEnv(h.options[1]!.args);assert.equal(env.PANE_TOKEN,f.tokens[1]);assert.match(env.SEATS!,/new-peer:New peer/);
 const result=await bridge([{id:1,method:'tools/list'},
 {id:2,method:'tools/call',params:{name:'ask',arguments:{to:'new-peer',text:'question'}}},
 {id:3,method:'tools/call',params:{name:'read_pane',arguments:{pane:'new-peer',last_n:2}}}],env.PANE_TOKEN!,{PANE_ID:env.PANE_ID!,APP_URL:env.APP_URL!,SEATS:env.SEATS!});
 const tools=(result.replies.find(r=>r.id===1)!.result as {tools:{name:string;inputSchema:{properties:Record<string,{enum?:string[]}>}}[]}).tools;
 assert.ok(tools.find(t=>t.name==='ask')!.inputSchema.properties.to!.enum!.includes('new-peer'));
 assert.ok(tools.find(t=>t.name==='read_pane')!.inputSchema.properties.pane!.enum!.includes('new-peer'));
 assert.equal(result.requests.length,2);const ask=result.requests.find(r=>new URL(String(r.url)).pathname==='/api/ask')!;
 assert.deepEqual(JSON.parse(String(ask.body)),{to:'new-peer',text:'question',from:'worker'});
 const read=result.requests.find(r=>new URL(String(r.url)).pathname==='/api/pane_transcript')!;
 assert.equal(new URL(String(read.url)).searchParams.get('pane'),'new-peer');
 for(const request of result.requests)assert.equal((request.headers as Record<string,string>)['X-Pane-Token'],f.tokens[1]);
 for(const reply of result.replies){assert.ok(record(reply.result));assert.notEqual(reply.result.isError,true)}
 await provider.close();assert.deepEqual(f.revoked,f.tokens);
});

test('Codex peer label/vendor changes replace client; peer order alone preserves it',async()=>{
 const f=fixture(),h=codexHarness(),provider=new CodexProvider(h.deps);
 f.seat.sessionId=(await provider.runTurn(f.seat,'one',f.ctx)).sessionId;
 f.ctx.peers.reverse();await provider.runTurn(f.seat,'two',f.ctx);assert.equal(h.transports.length,1);
 f.ctx.peers[0]!.label='Renamed';await provider.runTurn(f.seat,'three',f.ctx);assert.equal(h.transports.length,2);
 f.ctx.peers[0]!.vendor='claude';await provider.runTurn(f.seat,'four',f.ctx);assert.equal(h.transports.length,3);
 assert.equal(f.revoked.length,2);await provider.close();assert.deepEqual(f.revoked,f.tokens);
});

test('Codex peer snapshot keeps cache signature and spawned SEATS consistent during config wait',async()=>{
 const f=fixture(),h=codexHarness();let finish!:()=>void,entered=false;
 const provider=new CodexProvider({...h.deps,servers:()=>new Promise(r=>{entered=true;finish=()=>r([])})});
 const run=provider.runTurn(f.seat,'one',f.ctx);await until(()=>entered);
 f.ctx.peers.push({id:'new-peer',label:'New',vendor:'claude'});finish();f.seat.sessionId=(await run).sessionId;
 assert.equal(bridgeEnv(h.options[0]!.args).SEATS!.includes('new-peer'),false);
 entered=false;const second=provider.runTurn(f.seat,'two',f.ctx);await until(()=>entered);finish();await second;
 assert.equal(h.transports.length,2);assert.ok(bridgeEnv(h.options[1]!.args).SEATS!.includes('new-peer'));await provider.close();
});

test('interrupt after turn/start RPC resolves but before await continuation interrupts the actual turn',async()=>{
 const f=fixture();let stopped=false,interrupt:Promise<void>|null=null;
 const h=codexHarness(t=>{
 const base=t.responder;t.responder=(method,params,transport)=>method==='turn/start'?{turn:{id:'turn-'+(++transport.turn)}}:base(method,params,transport);
 const emit=t.emit.bind(t);t.emit=message=>{
 emit(message);
 if(record(message)&&record(message.result)&&record(message.result.turn)&&message.result.turn.id==='turn-1'){
 stopped=true;interrupt=f.handle!.interrupt();
 // RPC resolution already happened, but runTurn has not assigned active.turnId.
 assert.equal(t.requests.some(r=>r.method==='turn/interrupt'),false)
 }
 }
 });
 const provider=new CodexProvider(h.deps),run=provider.runTurn(f.seat,'x',f.ctx);void run.catch(()=>{});
 try{
 await until(()=>h.transports[0]?.requests.some(r=>r.method==='turn/interrupt')===true);
 await interrupt;await run;
 const transport=h.transports[0]!;assert.equal(stopped,true);assert.equal(f.controller.signal.aborted,false);
 const requests=transport.requests.filter(r=>r.method==='turn/interrupt');assert.equal(requests.length,1);
 assert.deepEqual(requests[0]!.params,{threadId:'thread',turnId:'turn-1'});
 assert.equal(terminals(f.events).length,1);assert.equal(f.events.at(-1)?.type,'done');assert.equal(f.handle,null)
 }finally{await provider.close()}
});
