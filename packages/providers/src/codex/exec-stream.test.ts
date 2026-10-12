import test from 'node:test';
import assert from 'node:assert/strict';
import {codexExecStream} from './exec-stream.ts';
import {CliProvider} from '../cli/provider.ts';
import {cliFixture} from '../cli/test-support.ts';
const thread={type:'thread.started',thread_id:'fixture-session'};
const notice={type:'item.completed',item:{id:'item_0',type:'error',message:'Model metadata not found; using fallback metadata'}};
test('349: native metadata ErrorItem is nonterminal before a turn; existing failures still end it',()=>{
 const decode=codexExecStream();decode(thread);assert.equal(decode(notice)[0]!.type,'warning');decode({type:'turn.started'});assert.deepEqual(decode({type:'item.completed',item:{id:'answer',type:'agent_message',text:'ready'}}),[{type:'delta',text:'ready'}]);assert.equal(decode({type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1}})[0]!.type,'done');assert.throws(()=>decode(notice),{code:'protocol'});
 const during=codexExecStream();during(thread);during({type:'turn.started'});assert.throws(()=>during(notice),{code:'protocol'});
 for(const type of ['error','turn.failed']){const decoder=codexExecStream();decoder(thread);decoder(notice);assert.equal(decoder(type==='error'?{type,message:'401 unauthorized'}:{type,error:{message:'401 unauthorized'}})[0]!.type,'error');assert.throws(()=>decoder({type:'turn.started'}),{code:'protocol'})}
});
test('349: malformed or unbound ErrorItem cannot masquerade as a valid provider notice',()=>{
 for(const item of [{type:'error',message:'no id'},{id:'x',type:'error'},{id:'x',type:'error',message:42},{id:'x',type:'error',message:''},{id:'<script>',type:'error',message:'bad id'}]){const decode=codexExecStream();decode(thread);assert.throws(()=>decode({type:'item.completed',item}),{code:'protocol'})}
 assert.throws(()=>codexExecStream()(notice),{code:'protocol'});
});
test('349: Responses API-key profile carries pre-turn notices through the shared adapter without exposing credentials',async t=>{
 const h=await cliFixture(t,'probe'),fakeKey='FAKE-API-KEY-DO-NOT-USE',requests:unknown[]=[];
 class KeyProfile extends CliProvider {override async auth(){return {loggedIn:true}}override async models(){return [{id:'deepseek-chat',label:'deepseek-chat'}]}}
 const provider=new KeyProfile({...h.description,id:'deepseek-api',turn:{format:'stream-json',decoder:codexExecStream,command:i=>({args:['exec','--json','-c','model_providers.deepseek-api.env_key="TEST_API_KEY"','-m',i.seat.model],input:i.message})}},{env:{TEST_API_KEY:fakeKey},temporaryDirectory:h.dir,execute:async(req,_signal,hooks)=>{
  requests.push(req.args);const stdout=[thread,{...notice,item:{...notice.item,message:notice.item.message+' '+fakeKey}},{type:'turn.started'},{type:'item.completed',item:{id:'answer',type:'agent_message',text:'ready'}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1}}].map(e=>JSON.stringify(e)).join('\n')+'\n';hooks?.started?.();for(let i=0;i<stdout.length;i+=9)hooks?.stdout?.(stdout.slice(i,i+9));return {stdout,stderr:'',code:0,signal:null};
 }});t.after(()=>provider.close());const answer=await provider.runTurn({...h.seat,vendor:'deepseek-api',model:'deepseek-chat'},'fixture only',h.ctx);assert.equal(requests.length,1);assert.equal(answer.text,'ready');assert.equal(h.events.some(e=>e.type==='error'),false);assert.deepEqual(h.traces.filter(e=>e.phase==='warning'),[{id:'item_0',name:'provider',phase:'warning',reason:'codex_notice',error:notice.item.message+' [redacted]'}]);assert.equal(JSON.stringify([...h.events,...h.traces]).includes(fakeKey),false);
});
