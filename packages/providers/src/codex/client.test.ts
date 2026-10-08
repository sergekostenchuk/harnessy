import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RpcClient,spawnTransport} from './client.ts';
import {FakeTransport,HOLD,until} from '../test-support.ts';
import {ProviderError} from '../types.ts';
test('initialize handshake, correlated replies and malformed JSONL',async()=>{
 const t=new FakeTransport(),c=new RpcClient(t);await c.initialize();assert.deepEqual(t.requests.map(r=>r.method),['initialize','initialized']);
 t.responder=()=>HOLD;const pending=c.request('thread/read',{threadId:'t'});t.emit('broken json');
 await assert.rejects(pending,e=>e instanceof ProviderError&&e.code==='protocol');await c.close();
});
test('server request gets original id and unknown method gets -32601',async()=>{
 const t=new FakeTransport(),c=new RpcClient(t);c.setServerHandler(async()=>{throw new ProviderError('unknown_request','unknown')});
 t.emit({id:9,method:'unknown/new',params:{}});await until(()=>t.replies.length===1);
 assert.equal(t.replies[0]?.id,9);assert.equal((t.replies[0]?.error as {code:number}).code,-32601);await c.close();
});
test('cancelled request rejects before late response and EOF rejects pending',async()=>{
 const t=new FakeTransport(),c=new RpcClient(t);t.responder=()=>HOLD;
 const a=new AbortController(),p=c.request('thread/start',{},a.signal);a.abort();await assert.rejects(p,e=>e instanceof ProviderError&&e.code==='cancelled');
 t.emit({id:t.requests[0]?.id,result:{}});const second=c.request('thread/read',{});t.die();await assert.rejects(second,e=>e instanceof ProviderError&&e.code==='transport_lost');
});
test('response shape absence and masquerade are protocol failures',async()=>{
 for(const reply of [{result:{}},{result:{},error:{code:1,message:'x'}},{error:{message:'x'}}]){
 const t=new FakeTransport(),c=new RpcClient(t);t.responder=()=>HOLD;const p=c.request('x',{});
 t.emit({...reply,id:t.requests[0]?.id});if('result'in reply&&Object.keys(reply).length===1){assert.deepEqual(await p,{});await c.close();continue}
 await assert.rejects(p,e=>e instanceof ProviderError&&e.code==='protocol');await c.close();
 }
});

test('missing executable on real stdio transport is no_binary and close does not hang',{timeout:2000},async()=>{
 const client=new RpcClient(spawnTransport({cwd:'/private/tmp',args:['app-server'],env:{PATH:'/nonexistent-harnessy-ts01-bin'}}));
 await assert.rejects(client.initialize(),e=>e instanceof ProviderError&&e.code==='no_binary');
 await client.close();
});
