import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invokeTool,schemas,sdkServer} from './tools.ts';
import {fixture} from './test-support.ts';
test('report accepted, ack and spoofed sender rejected before kernel',async()=>{
 const f=fixture();let calls=0;f.ctx.tools.send=async()=>{calls++;return {ok:true,text:'sent'}};
 assert.equal((await invokeTool('send',{to:'owner',kind:'report',text:'evidence'},f.ctx)).ok,true);
 for(const args of [{to:'owner',kind:'ack',text:'x'},{to:'owner',kind:'report',text:'x',from:'owner'},{to:'owner',kind:'report',text:3}])
 await assert.rejects(invokeTool('send',args,f.ctx));
 assert.equal(calls,1);assert.equal(schemas.send.safeParse({kind:'report',text:'x'}).success,false);
 assert.equal(sdkServer(f.ctx).name,'panes');
});
test('all five tools use kernel-bound identity; optional undefined is removed',async()=>{
 const f=fixture();const seen:unknown[]=[];for(const key of ['send','ask','readPane','merge','assignRole'] as const)f.ctx.tools[key]=async a=>{seen.push(a);return {ok:true,text:'ok'}};
 const entries:[string,unknown][]=[['send',{to:'reviewer',kind:'status',text:'x',thread:undefined}],['ask',{to:'reviewer',text:'x'}],['read_pane',{pane:'reviewer'}],['merge',{sha:'abc'}],['assign_role',{role:'tester'}]];
 for(const [name,args] of entries)assert.equal((await invokeTool(name,args,f.ctx)).ok,true);
 assert.equal(seen.length,5);assert.ok(!Object.hasOwn(seen[0] as object,'thread'));
 f.controller.abort();assert.equal((await invokeTool('merge',{sha:'abc'},f.ctx)).ok,false);assert.equal(seen.length,5);
});
