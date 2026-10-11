import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'smol-toml';
import {bridge} from '../bridge-test-support.ts';
import {codexHarness,fixture} from '../test-support.ts';
import {CodexProvider} from './provider.ts';
import {overrides} from './overrides.ts';

type Hints={readOnlyHint?:boolean;destructiveHint?:boolean;openWorldHint?:boolean};
type Approval='auto'|'prompt'|'writes'|'approve';
type CatalogTool={name:string;annotations?:Hints};
type BridgeResult={content:{text:string}[];isError?:boolean};
type ServerConfig={enabled?:boolean;default_tools_approval_mode?:Approval;tools?:Record<string,{approval_mode?:Approval}>;env?:{PANE_ID:string;PANE_TOKEN:string;SEATS:string}};
type Config={mcp_servers:Record<string,ServerConfig>;sandbox_workspace_write:{writable_roots:string[]}};
// External app-server rule, pinned to the installed Codex 0.160.0, not a Harnessy permission helper:
// https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/mcp_tool_call.rs
// requires_mcp_tool_approval_for_mode: approve bypasses MCP elicitation; auto uses conservative hint defaults.
// request_mcp_tool_approval rejects a required approval under Never BEFORE sending any elicitation to Harnessy.
function requiresApproval(mode:Approval,hints:Hints={}){
 if(mode==='approve')return false;if(mode==='prompt')return true;if(mode==='writes')return hints.readOnlyHint!==true;
 if(hints.destructiveHint===true)return true;if(hints.readOnlyHint===true)return false;
 return (hints.destructiveHint??true)||(hints.openWorldHint??true);
}
const calls=[
 {name:'propose_seats',arguments:{seats:[{kind:'worker',label:'Юрист',vendor:'codex',model:'w1',mode:'read',intro:'Проверь документы'}]}},
 {name:'create_seats',arguments:{proposalId:'p1',version:1}},
 {name:'send',arguments:{to:'owner',kind:'status',text:'Предложение готово'}},
 {name:'ask',arguments:{to:'reviewer',text:'Проверь состав'}},
 {name:'read_pane',arguments:{pane:'reviewer'}},
 {name:'merge',arguments:{sha:'abc'}},
 {name:'assign_role',arguments:{role:'tester'}}
];

test('224: Codex MCP auto defaults explain never rejection; honest tools/list hints do not mislabel writes',async()=>{
 assert.equal(requiresApproval('auto'),true);assert.equal(requiresApproval('auto',{readOnlyHint:false}),true);
 assert.equal(requiresApproval('auto',{readOnlyHint:true}),false);
 assert.equal(requiresApproval('auto',{destructiveHint:false,openWorldHint:false}),false);
 assert.equal(requiresApproval('auto',{readOnlyHint:true,destructiveHint:true}),true);
 assert.equal(requiresApproval('prompt',{readOnlyHint:true}),true);assert.equal(requiresApproval('writes',{}),true);
 assert.equal(requiresApproval('approve',{destructiveHint:true}),false);
 const result=await bridge([{id:1,method:'tools/list'}]),catalog=(result.replies[0]!.result as {tools:CatalogTool[]}).tools;
 assert.deepEqual(catalog.map(t=>t.name).sort(),calls.map(t=>t.name).sort());
 for(const tool of catalog)assert.deepEqual(tool.annotations,{readOnlyHint:tool.name==='read_pane',destructiveHint:tool.name==='merge',openWorldHint:false});
 assert.equal(result.requests.length,0);
});

for(const mode of ['read','ask'] as const)test('225/227: real MCP bridge through app-server double, '+mode+' preserves sandbox on start and resume',async()=>{
 const f=fixture();f.seat.mode=mode;f.ctx.appUrl='http://fake.invalid';let approvals=0,completed=0;
 f.ctx.askApproval=async()=>{approvals++;return false};
 const listed=await bridge([{id:1,method:'tools/list'}]),catalog=(listed.replies[0]!.result as {tools:CatalogTool[]}).tools;
 const h=codexHarness(t=>{const base=t.responder;t.responder=async(method,params,t)=>{
  if(method!=='turn/start')return base(method,params,t);
  const args=h.options[0]!.args,config=parse(args.filter((_,i)=>args[i-1]==='-c').join('\n')) as unknown as Config;
  const server=config.mcp_servers.panes!,env=server.env!,id='turn-'+(++t.turn);
  assert.equal(params.approvalPolicy,mode==='read'?'never':'on-request');
  assert.deepEqual(params.sandboxPolicy,mode==='read'?{type:'readOnly',networkAccess:false}:{type:'workspaceWrite',writableRoots:['/project/.harness/evidence'],networkAccess:false,excludeTmpdirEnvVar:false,excludeSlashTmp:false});
  assert.deepEqual(config.sandbox_workspace_write.writable_roots,['/project/.harness/evidence']);
  assert.equal(server.default_tools_approval_mode,undefined);assert.equal(config.mcp_servers.foreign!.enabled,false);
  assert.deepEqual(Object.keys(server.tools!).sort(),calls.map(c=>c.name).sort());
  for(const tool of catalog){
   // Per-tool CLI settings take precedence even over an inherited server-wide prompt policy.
   const policy=server.tools?.[tool.name]?.approval_mode??'prompt';
   assert.equal(requiresApproval(policy,tool.annotations),false,tool.name+' would be rejected before elicitation');
  }
  const response={ok:true,proposalId:'p1',version:1,seq:7,to:['owner'],reply:'Состав проверен',text:'История',sha:'abc',mergeSha:'def',branch:'integration'};
  const result=await bridge(calls.map((params,i)=>({id:i,method:'tools/call',params})),env.PANE_TOKEN,{PANE_ID:env.PANE_ID,APP_URL:'http://fake.invalid',SEATS:env.SEATS},response);
  assert.deepEqual(result.requests.map(r=>new URL(String(r.url)).pathname),['/api/seats/propose','/api/seats','/api/send','/api/ask','/api/pane_transcript','/api/merge','/api/assign_role']);
  for(const request of result.requests){
   assert.equal((request.headers as Record<string,string>)['X-Pane-Token'],f.tokens[0]);
   if(request.body)assert.equal(JSON.parse(String(request.body)).from,'worker');
  }
  const proposal=result.replies.find(r=>r.id===0)!.result as BridgeResult;
  assert.equal(proposal.isError,undefined);assert.deepEqual(JSON.parse(proposal.content[0]!.text),response);
  assert.match((result.replies.find(r=>r.id===2)!.result as BridgeResult).content[0]!.text,/#7/);
  assert.equal((result.replies.find(r=>r.id===3)!.result as BridgeResult).content[0]!.text,'Состав проверен');completed++;
  t.notify('item/completed',{threadId:'thread',turnId:id,item:{type:'agentMessage',text:proposal.content[0]!.text}});
  t.notify('turn/completed',{threadId:'thread',turn:{id,status:'completed'}});return {turn:{id}};
 }});
 const provider=new CodexProvider(h.deps);
 try{
  const first=await provider.runTurn(f.seat,'Предложи состав',f.ctx);assert.equal(JSON.parse(first.text).proposalId,'p1');
  f.seat.sessionId=first.sessionId;await provider.runTurn(f.seat,'Повтори',f.ctx);
  assert.equal(completed,2);assert.equal(approvals,0);assert.equal(h.transports.length,1);
  for(const method of ['thread/start','thread/resume']){
   const params=h.transports[0]!.requests.find(r=>r.method===method)!.params as Record<string,unknown>;
   assert.equal(params.sandbox,mode==='read'?'read-only':'workspace-write');assert.equal(params.approvalPolicy,mode==='read'?'never':'on-request');
  }
 }finally{await provider.close()}
});

test('224/227: old unannotated MCP call is rejected by never before bridge; no elicitation can rescue it',async()=>{
 const f=fixture();f.seat.mode='read';let approvals=0,bridgeCalls=0;f.ctx.askApproval=async()=>{approvals++;return true};
 const h=codexHarness(t=>{const base=t.responder;t.responder=(method,params,t)=>{
  if(method!=='turn/start')return base(method,params,t);
  const id='turn-'+(++t.turn);let text='';
  if(params.approvalPolicy==='never'&&requiresApproval('auto'))text='MCP tool call requires approval, but approval policy is never';
  else bridgeCalls++;
  t.notify('item/completed',{threadId:'thread',turnId:id,item:{type:'agentMessage',text}});
  t.notify('turn/completed',{threadId:'thread',turn:{id,status:'completed'}});return {turn:{id}};
 }}),provider=new CodexProvider(h.deps);
 try{assert.match((await provider.runTurn(f.seat,'x',f.ctx)).text,/requires approval/);assert.equal(bridgeCalls,0);assert.equal(approvals,0)}finally{await provider.close()}
});

test('225: approval exception is only panes catalog, engine still rejects unconfirmed creation and deprecated assignment',async()=>{
 const f=fixture(),config=parse(overrides(f.seat,f.ctx,'token',['foreign','sol-spark-router'],['/fake/python','/fake/router.py']).join('\n')) as unknown as Config;
 assert.equal(config.mcp_servers['sol-spark-router']!.tools,undefined);assert.equal(config.mcp_servers['sol-spark-router']!.default_tools_approval_mode,undefined);
 assert.equal(config.mcp_servers.foreign!.enabled,false);assert.equal(config.mcp_servers.panes!.tools!.unknown,undefined);
 for(const [name,error] of [['create_seats','proposal_unconfirmed'],['assign_role','proposal_required']] as const){
  const call=calls.find(c=>c.name===name)!;
  const result=await bridge([{id:1,method:'tools/call',params:call}],'test-token',{}, {ok:false,error});
  assert.equal(result.requests.length,1);assert.deepEqual(result.replies[0]!.result,{content:[{type:'text',text:error}],isError:true});
 }
});
