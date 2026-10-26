import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAutopilotApproval} from './autopilot-stops.ts';
import {AUTOPILOT_STOP_CASES} from '@harnessy/projects';
import type {ToolApprovalRequest} from '@harnessy/providers';
import {autopilotApprovalSource,RuntimeAutopilotSafety} from './autopilot-runtime.ts';
import {harness} from './test-helpers.ts';
const claude=(operation:string,parameters:Record<string,unknown>):ToolApprovalRequest=>({provider:'claude',operation,parameters});
const codex=(operation:string,parameters:Record<string,unknown>):ToolApprovalRequest=>({provider:'codex',operation,parameters});
for(const code of AUTOPILOT_STOP_CASES)test('38.5 arbitrary execution cannot grant '+code,()=>{
 for(const request of [claude('Bash',{command:'echo "safe"',description:'no effects',checked:[],blocked:[]}),codex('item/commandExecution/requestApproval',{command:['echo','safe'],reason:'read-only'})]){
  const result=classifyAutopilotApproval(request);assert.ok(result.blocked.includes(code));assert.deepEqual(result.checked,[...AUTOPILOT_STOP_CASES]);
 }
});
const cases:[ToolApprovalRequest,string[]][]=[
 [claude('WebFetch',{url:'https://fixture.invalid/upload',prompt:'only read'}),['external_network']],
 [claude('WebSearch',{query:'local only'}),['external_network']],
 [claude('Write',{file_path:'/data',content:''}),['data_delete']],
 [claude('Edit',{file_path:'/data',old_string:'all',new_string:''}),['data_delete']],
 [claude('MultiEdit',{file_path:'/data',edits:[{old_string:'all',new_string:''}]}),['data_delete']],
 [codex('item/fileChange/requestApproval',{changes:[{path:'/data',kind:'delete'}]}),['data_delete']],
 [codex('item/permissions/requestApproval',{permissions:{network:{enabled:true},fileSystem:{write:['/data']}}}),['external_network','data_delete']],
 [claude('Read',{file_path:'/data'}),[]], [claude('Glob',{pattern:'*'}),[]], [claude('Grep',{pattern:'foo'}),[]],
 [codex('item/permissions/requestApproval',{permissions:{network:{enabled:false},fileSystem:{read:['/data'],write:[]}}}),[]]
];
for(const [request,expected]of cases)test('38.5 native permission '+request.provider+' '+request.operation,()=>{
 const result=classifyAutopilotApproval(request);assert.deepEqual(result.blocked,expected);assert.deepEqual(result.checked,[...AUTOPILOT_STOP_CASES]);
});
test('38.5 absent, malformed and unknown operations fail closed; descriptions cannot supply a rule',()=>{
 for(const request of [undefined,claude('Bash',{}),claude('Read',{}),claude('WebFetch',{url:'file:///data'}),claude('MultiEdit',{file_path:'x',edits:[]}),claude('mcp__pay',{checked:[...AUTOPILOT_STOP_CASES],blocked:[]}),codex('item/fileChange/requestApproval',{changes:[]}),codex('item/permissions/requestApproval',{permissions:{network:{enabled:'yes'}}}),codex('item/permissions/requestApproval',{permissions:{fileSystem:{write:'/data'}}}),codex('item/permissions/requestApproval',{permissions:{admin:true}})])assert.throws(()=>classifyAutopilotApproval(request),{code:'stop_checks_missing'});
});
test('38.5 approval freezes actual input, binds its hash, keeps parameters off UI events and still refuses unbounded read continuation',async t=>{
 const h=await harness(t),pane=h.runtime.registry.get('worker')!,request=claude('Read',{file_path:'/data',secret:'private value'});
 const future=pane.askApproval('Read','safe',undefined,request),approval=[...pane.approvals.values()][0]!;
 const source=autopilotApprovalSource(pane.id,approval);request.parameters.file_path='/other';
 assert.equal(approval.request!.parameters.file_path,'/data');assert.ok(Object.isFrozen(approval.request!.parameters));
 assert.equal(autopilotApprovalSource(pane.id,approval).id,source.id);
 assert.notEqual(autopilotApprovalSource(pane.id,{...approval,request:claude('Read',{file_path:'/other'})}).id,source.id);
 assert.equal(JSON.stringify(approval.event()).includes('private value'),false);
 const safety=new RuntimeAutopilotSafety(h.runtime),input={issue:{source},capability:{operation:'approve',parameters:{pane:pane.id,approvalId:approval.id}},proposal:{reason:'safe'}} as any;
 assert.throws(()=>safety.check(input),{code:'stop_checks_missing'});
 assert.throws(()=>safety.check({...input,issue:{source:{...source,id:'forged'}}}),{code:'source_changed'});
 pane.denyApprovals();assert.equal(await future,false);
});
