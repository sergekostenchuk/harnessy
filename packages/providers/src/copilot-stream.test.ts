import test from 'node:test';
import assert from 'node:assert/strict';
import {CopilotStream} from './copilot-stream.ts';
import {MetadataRpc} from './cli/rpc.ts';
const event=(type:string,data:unknown)=>({type,data}),sid='ab123456-1234-1234-1234-123456789abc';
test('261: JSONL deltas and final message yield one answer, session result does not double-charge history',()=>{
 const s=new CopilotStream();assert.deepEqual(s.push(event('session.start',{sessionId:sid})),[{type:'session',id:sid}]);
 assert.deepEqual(s.push(event('assistant.message_delta',{messageId:'a',deltaContent:'При'})),[{type:'delta',text:'При'}]);
 assert.deepEqual(s.push(event('assistant.message',{messageId:'a',content:'Привет'})),[{type:'delta',text:'вет'}]);
 assert.deepEqual(s.push({type:'result',sessionId:sid,exitCode:0,usage:{premiumRequests:444}}),[{type:'done',sessionId:sid,usage:{input:null,output:null,cacheRead:null}}]);
 assert.throws(()=>s.push(event('assistant.message',{messageId:'x',content:'late'})),{code:'protocol'});
});
test('261: tools preserve call/result IDs, rejection and error classes',()=>{
 const s=new CopilotStream();assert.deepEqual(s.push(event('tool.execution_start',{toolCallId:'t',toolName:'harnessy.send',arguments:{to:'owner'}})),[{type:'tool.call',id:'t',name:'harnessy.send',input:{to:'owner'}}]);
 assert.deepEqual(s.push(event('tool.execution_complete',{toolCallId:'t',success:false,error:{code:'permission_denied',message:'denied'}})),[{type:'tool.result',id:'t',outcome:'rejected',reason:'denied'}]);
 assert.equal(s.push(event('session.error',{errorType:'authentication',message:'login'}))[0]!.type,'error');
});
test('261: missing, replayed or foreign stream fields are not success',()=>{
 for(const bad of [null,{},event('assistant.message_delta',{messageId:'a'}),event('tool.execution_complete',{toolCallId:'x',success:false}),{type:'result',sessionId:sid},event('unknown',{})])assert.throws(()=>new CopilotStream().push(bad),{code:'protocol'});
 const s=new CopilotStream();s.push(event('session.start',{sessionId:sid}));assert.throws(()=>s.push({type:'result',sessionId:'other',exitCode:0}),{code:'protocol'});
 const a=new CopilotStream(),b=new CopilotStream();a.push(event('assistant.message',{messageId:'one',content:'A'}));assert.throws(()=>a.push(event('assistant.message',{messageId:'one',content:'A'})),{code:'protocol'});assert.equal(b.push(event('assistant.message',{messageId:'one',content:'B'}))[0]!.type,'delta');
});
test('261: RPC framing counts UTF-8 bytes and rejects mismatched/error/truncated replies',()=>{
 const raw=JSON.stringify({jsonrpc:'2.0',id:1,result:{models:[{id:'русский'}]}}),bytes=Buffer.from('Content-Length: '+Buffer.byteLength(raw)+'\r\n\r\n'+raw),rpc=new MetadataRpc();let value:string|undefined;
 for(const byte of bytes){const r=rpc.push(Buffer.from([byte]));if(r!==undefined)value=r}rpc.finish();assert.deepEqual(JSON.parse(value!),{models:[{id:'русский'}]});
 for(const v of [{jsonrpc:'2.0',id:2,result:{}},{jsonrpc:'2.0',id:1,error:{message:'secret'}},{jsonrpc:'2.0',id:1,result:null}]){const text=JSON.stringify(v);assert.throws(()=>new MetadataRpc().push(Buffer.from('Content-Length: '+Buffer.byteLength(text)+'\r\n\r\n'+text)),{code:'protocol'})}
 const incomplete=new MetadataRpc();incomplete.push(Buffer.from('Content-Length: 12\r\n\r\n{'));assert.throws(()=>incomplete.finish(),{code:'protocol'});
});
