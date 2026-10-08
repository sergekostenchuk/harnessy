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
