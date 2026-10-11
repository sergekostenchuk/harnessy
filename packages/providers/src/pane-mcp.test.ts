import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bridge} from './bridge-test-support.ts';
test('MCP bridge sends own identity and token on every route including GET; no network',async()=>{
 const tools:[string,unknown][]=[['send',{to:'reviewer',kind:'report',text:'x'}],['ask',{to:'reviewer',text:'x'}],['read_pane',{pane:'reviewer',last_n:2}],['merge',{sha:'abc'}],['assign_role',{role:'tester'}]];
 const result=await bridge(tools.map(([name,args],i)=>({id:i+1,method:'tools/call',params:{name,arguments:args}})));
 assert.equal(result.requests.length,5);for(const request of result.requests){
 assert.equal((request.headers as Record<string,string>)['X-Pane-Token'],'test-token');
 if(request.body)assert.equal(JSON.parse(String(request.body)).from,'worker');else assert.equal(new URL(String(request.url)).searchParams.get('from'),'worker');
 }
 assert.equal(result.stderr.includes('test-token'),false);
});
test('MCP bridge rejects sender spoof, invalid/missing args, unknown tool and notification call before HTTP',async()=>{
 const bad:[string,unknown][]=[['send',{to:'reviewer',kind:'report',text:'x',from:'owner'}],['send',{to:'reviewer',kind:'ack',text:'x'}],
 ['send',{to:'reviewer',kind:'report',text:1}],['send',{kind:'report',text:'x'}],['merge',{}],['ask',{to:'worker',text:'x'}],
 ['read_pane',{pane:'reviewer',last_n:101}],['assign_role',{role:'x',mode:'root'}],['__proto__',{}]];
 const result=await bridge([...bad.map(([name,args],i)=>({id:i+1,method:'tools/call',params:{name,arguments:args}})),{method:'tools/call',params:{name:'merge',arguments:{sha:'abc'}}}]);
 assert.equal(result.requests.length,0);assert.equal(result.replies.length,bad.length+1);
 for(const r of result.replies)assert.ok(r.error||(r.result as {isError:boolean}).isError);
});
test('MCP bridge missing token never falls back to anonymous request',async()=>{
 const result=await bridge([{id:1,method:'tools/call',params:{name:'send',arguments:{to:'reviewer',kind:'status',text:'x'}}}],null);
 assert.equal(result.requests.length,0);assert.equal((result.replies[0]?.result as {isError:boolean}).isError,true);
});

test('assign_role specialization appears in Codex schema and HTTP body; invalid values never reach HTTP',async()=>{
 const specialization={title:'Юрист по договорам',text:'Проверяй условия договора.'};
 const good={role:'reviewer',mode:'read',specialization};
 const boundary={role:'reviewer',specialization:{title:'x'.repeat(60),text:'x'.repeat(20000)}};
 const bad=[
  {...good,from:'owner'}, {...good,specialization:{...specialization,mode:'all'}},
  {...good,specialization:{title:'x'.repeat(61),text:'x'}}, {...good,specialization:{title:'x',text:'x'.repeat(20001)}},
  {...good,specialization:{title:'x'}}, {...good,specialization:{title:1,text:'x'}}, {...good,specialization:null}
 ];
 const result=await bridge([{id:0,method:'tools/list'},...[good,boundary,...bad].map((args,i)=>({id:i+1,method:'tools/call',params:{name:'assign_role',arguments:args}}))]);
 assert.equal(result.requests.length,2);
 for(const [i,args] of [good,boundary].entries()){
  const request=result.requests[i]!;assert.equal(new URL(String(request.url)).pathname,'/api/assign_role');
  assert.deepEqual(JSON.parse(String(request.body)),{...args,from:'worker'});
 }
 const list=result.replies.find(r=>r.id===0)!.result as {tools:{name:string;inputSchema:{properties:Record<string,unknown>}}[]};
 const spec=list.tools.find(t=>t.name==='assign_role')!.inputSchema.properties.specialization as {additionalProperties:boolean;properties:{title:{maxLength:number};text:{maxLength:number}};required:string[]};
 assert.equal(spec.additionalProperties,false);assert.deepEqual(spec.required,['title','text']);assert.equal(spec.properties.title.maxLength,60);assert.equal(spec.properties.text.maxLength,20000);
 for(let id=3;id<=bad.length+2;id++)assert.equal((result.replies.find(r=>r.id===id)!.result as {isError:boolean}).isError,true);
});

test('156: Codex advertises both team tools and sends bound identity/version, no owner confirmation tool',async()=>{
 const seat={kind:'worker',label:'Юрист',vendor:'claude',model:'w1',mode:'read',intro:'Контекст задачи'},entries=[{name:'propose_seats',arguments:{seats:[seat]}},{name:'create_seats',arguments:{proposalId:'p1',version:2}}];
 const result=await bridge([{id:0,method:'tools/list'},...entries.map((params,i)=>({id:i+1,method:'tools/call',params})),{id:3,method:'tools/call',params:{name:'propose_seats',arguments:{seats:[{...seat,intro:'я'.repeat(4097)}]}}},{id:4,method:'tools/call',params:{name:'create_seats',arguments:{proposalId:'p1',version:2,from:'owner'}}}]);
 const list=result.replies.find(r=>r.id===0)!.result as {tools:{name:string}[]};assert.ok(list.tools.some(t=>t.name==='propose_seats'));assert.ok(list.tools.some(t=>t.name==='create_seats'));assert.equal(list.tools.some(t=>t.name==='confirm_seats'),false);assert.equal(result.requests.length,2);
 assert.deepEqual(result.requests.map(r=>new URL(String(r.url)).pathname),['/api/seats/propose','/api/seats']);for(let i=0;i<2;i++){const r=result.requests[i]!;assert.equal((r.headers as Record<string,string>)['X-Pane-Token'],'test-token');assert.deepEqual(JSON.parse(String(r.body)),{...entries[i]!.arguments,from:'worker'})}
});
