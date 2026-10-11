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

test('assign_role specialization crosses Claude tool layer intact; strict bounds reject before kernel',async()=>{
 const f=fixture('claude'),seen:unknown[]=[];f.ctx.tools.assignRole=async a=>{seen.push(a);return {ok:true,text:'assigned'}};
 const specialization={title:'Юрист по договорам',text:'Проверяй условия договора.'};
 const args={role:'reviewer',mode:'read' as const,specialization};
 assert.equal((await invokeTool('assign_role',args,f.ctx)).ok,true);assert.deepEqual(seen,[args]);
 const boundary={role:'reviewer',specialization:{title:'x'.repeat(60),text:'x'.repeat(20000)}};
 assert.equal((await invokeTool('assign_role',boundary,f.ctx)).ok,true);assert.deepEqual(seen[1],boundary);
 for(const bad of [
  {...args,from:'owner'}, {...args,specialization:{...specialization,mode:'all'}},
  {...args,specialization:{title:'x'.repeat(61),text:'x'}}, {...args,specialization:{title:'x',text:'x'.repeat(20001)}},
  {...args,specialization:{title:'x'}}, {...args,specialization:{title:1,text:'x'}}, {...args,specialization:null}
 ])await assert.rejects(invokeTool('assign_role',bad,f.ctx));
 assert.equal(seen.length,2);
});

test('156: Claude proposal/create tools preserve version and reject missing fields, spoofing and UTF-8 overflow',async()=>{
 const f=fixture('claude'),seen:unknown[]=[];f.ctx.tools.proposeSeats=async a=>{seen.push(a);return {ok:true,text:'proposal'}};f.ctx.tools.createSeats=async a=>{seen.push(a);return {ok:true,text:'created'}};
 const seat={kind:'worker',label:'Юрист',vendor:'claude',model:'w1',mode:'read',intro:'я'.repeat(4096)},proposal={seats:[seat]};assert.equal((await invokeTool('propose_seats',proposal,f.ctx)).ok,true);assert.deepEqual(seen[0],proposal);assert.equal((await invokeTool('create_seats',{proposalId:'p1',version:2},f.ctx)).ok,true);
 for(const value of [{seats:[{...seat,mode:undefined}]},{seats:[{...seat,model:undefined}]},{...proposal,from:'owner'},{seats:[{...seat,intro:'я'.repeat(4097)}]}])await assert.rejects(invokeTool('propose_seats',value,f.ctx));
 await assert.rejects(invokeTool('create_seats',{proposalId:'p1'},f.ctx));assert.equal(seen.length,2);
});
