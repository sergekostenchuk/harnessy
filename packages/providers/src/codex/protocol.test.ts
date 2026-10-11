import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serverRequest} from './protocol.ts';
import {fixture} from '../test-support.ts';
import {ProviderError} from '../types.ts';
test('command/file approvals allow and timeout decline with exact shape',async()=>{
 for(const method of ['item/commandExecution/requestApproval','item/fileChange/requestApproval'])for(const allow of [true,false]){
 const f=fixture();f.ctx.askApproval=async()=>allow;
 assert.deepEqual(await serverRequest(method,{threadId:'t',turnId:'v',command:'pwd',changes:[{path:'x'}]},f.ctx,'t','v'),{decision:allow?'accept':'decline'});
 }
});
test('permission grants are requested subset, turn scoped, absence refuses',async()=>{
 const f=fixture();const requested={network:{enabled:true},fileSystem:{read:['/a'],write:['/b']}};
 assert.deepEqual(await serverRequest('item/permissions/requestApproval',{threadId:'t',turnId:'v',permissions:requested},f.ctx,'t','v'),{permissions:requested,scope:'turn'});
 for(const permissions of [undefined,'all',{unknown:{enabled:true}},{network:{enabled:'yes'}},{fileSystem:{write:'/all'}},{fileSystem:{read:[123]}},{network:{enabled:true,admin:true}}])assert.deepEqual(await serverRequest('item/permissions/requestApproval',{threadId:'t',turnId:'v',permissions},f.ctx,'t','v'),{permissions:{},scope:'turn'});
 f.ctx.askApproval=async()=>false;assert.deepEqual(await serverRequest('item/permissions/requestApproval',{threadId:'t',turnId:'v',permissions:requested},f.ctx,'t','v'),{permissions:{},scope:'turn'});
});
test('panes elicitation masquerades ask owner; exact own bridge does not',async()=>{
 const f=fixture();let asks=0;f.ctx.askApproval=async()=>{asks++;return false};
 const base={threadId:'t',turnId:'v',mode:'form',serverName:'panes',message:'tool',requestedSchema:{type:'object'},_meta:{codex_approval_kind:'mcp_tool_call'}};
 assert.deepEqual(await serverRequest('mcpServer/elicitation/request',base,f.ctx,'t','v'),{action:'accept',content:{},_meta:null});
 for(const args of [{...base,serverName:'other'},{...base,_meta:null},{...base,_meta:{codex_approval_kind:'other'}}]){
 assert.deepEqual(await serverRequest('mcpServer/elicitation/request',args,f.ctx,'t','v'),{action:'decline',content:null,_meta:null})
 }
 assert.equal(asks,3);await assert.rejects(serverRequest('mcpServer/elicitation/request',{...base,turnId:'old'},f.ctx,'t','v'),e=>e instanceof ProviderError&&e.code==='protocol');assert.equal(asks,3);
});
test('unknown request is typed failure without owner question',async()=>{
 const f=fixture();let asked=false;f.ctx.askApproval=async()=>{asked=true;return true};
 await assert.rejects(serverRequest('unknown/action',{},f.ctx,'t','v'),e=>e instanceof ProviderError&&e.code==='unknown_request');assert.equal(asked,false);assert.equal(f.events[0]?.type,'toolError');
});

test('elicitation cannot invent required form fields after owner approval',async()=>{
 const f=fixture();
 assert.deepEqual(await serverRequest('mcpServer/elicitation/request',{threadId:'t',turnId:'v',serverName:'other',mode:'form',requestedSchema:{type:'object',required:['name']}},f.ctx,'t','v'),{action:'decline',content:null,_meta:null});
 assert.deepEqual(await serverRequest('mcpServer/elicitation/request',{threadId:'t',turnId:'v',serverName:'other',mode:'url'},f.ctx,'t','v'),{action:'accept',content:null,_meta:null});
});

test('234: declined and invalid Codex permissions are rejected tool results, including refusal before MCP execution',async()=>{
 const f=fixture(),traces:any[]=[];f.ctx.traceEvent=e=>traces.push(e);f.ctx.askApproval=async()=>false;
 await serverRequest('item/commandExecution/requestApproval',{threadId:'t',turnId:'v',command:'fixture'},f.ctx,'t','v');await serverRequest('item/permissions/requestApproval',{threadId:'t',turnId:'v',permissions:{bad:true}},f.ctx,'t','v');await serverRequest('mcpServer/elicitation/request',{threadId:'t',turnId:'v',serverName:'other'},f.ctx,'t','v');assert.equal(traces.filter(e=>e.phase==='result').length,3);assert.ok(traces.filter(e=>e.phase==='result').every(e=>e.outcome==='rejected'&&e.reason==='approval_policy'));
 const before=traces.length;await assert.rejects(serverRequest('item/commandExecution/requestApproval',{threadId:'foreign',turnId:'v'},f.ctx,'t','v'));assert.equal(traces.length,before);
});
