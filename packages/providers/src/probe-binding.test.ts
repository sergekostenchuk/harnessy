import test from 'node:test';
import assert from 'node:assert/strict';
import type {Query,query} from '@anthropic-ai/claude-agent-sdk';
import {ClaudeProvider} from './claude.ts';
import {CodexProvider} from './codex/provider.ts';
import {ProviderError} from './types.ts';
import {fixture,codexHarness} from './test-support.ts';
import {cliFixture} from './cli/test-support.ts';

for(const vendor of ['claude','codex'] as const)for(const state of ['absent','allow','deny'] as const)test('278: '+vendor+' final binding callback '+state,async t=>{
 const f=fixture(vendor),order:string[]=[];let modelCalls=0,checked=0;
 f.ctx.modelStarted=()=>order.push('modelStarted');
 if(state!=='absent')f.ctx.beforeModel=async run=>{checked++;assert.deepEqual(run,{provider:vendor,model:f.seat.model});order.push('binding');if(state==='deny')throw new ProviderError('login_changed','Вход изменился')};
 const h=codexHarness(transport=>{const base=transport.responder;transport.responder=(m,p,t)=>{order.push(m);if(m==='turn/start')modelCalls++;return base(m,p,t)}});
 const queryFn=((_args:Parameters<typeof query>[0])=>{modelCalls++;order.push('query');return Object.assign((async function*(){yield {type:'result',subtype:'success',is_error:false,session_id:'s',result:'ok',duration_ms:1,usage:{}}})(),{close(){}}) as unknown as Query}) as typeof query;
 const provider=vendor==='claude'?new ClaudeProvider({findBinary:async()=>{order.push('binary');return '/fake/claude'},authStatus:async()=>{order.push('auth');return {loggedIn:true}},queryFn,env:{}}):new CodexProvider(h.deps);t.after(()=>provider.close());
 if(state==='deny'){await assert.rejects(provider.runTurn(f.seat,'hi',f.ctx),{code:'login_changed'});assert.equal(modelCalls,0);assert.equal(order.includes('modelStarted'),false);assert.equal(f.events.at(-1)?.type,'error')}
 else {await provider.runTurn(f.seat,'hi',f.ctx);assert.equal(modelCalls,1);assert.equal(f.events.at(-1)?.type,'done')}
 assert.equal(checked,state==='absent'?0:1);
 if(state==='allow')assert.deepEqual(order.slice(-3),['binding','modelStarted',vendor==='claude'?'query':'turn/start']);
 if(state==='deny')assert.equal(order.at(-1),'binding');
});
test('277: generic CLI guard failure happens after preparation and before spawning, then revokes MCP',async t=>{
 const f=await cliFixture(t,'probe');let checks=0;
 f.ctx.beforeModel=async run=>{checks++;assert.deepEqual(run,{provider:f.seat.vendor,model:f.seat.model});assert.equal(f.registered.length,1);assert.equal(f.capture().at(-1)?.action,'models');throw new ProviderError('login_changed','Вход изменился')};
 await assert.rejects(f.provider.runTurn(f.seat,'hello',f.ctx),{code:'login_changed'});
 assert.equal(checks,1);assert.equal(f.starts,0);assert.equal(f.capture().some(e=>e.action==='turn'),false);assert.deepEqual(f.registered,f.revoked);assert.equal(f.handle,null);
});
