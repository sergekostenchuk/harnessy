import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createApi} from '../../api/src/server.ts';
import {harness,OWNER} from './test-helpers.ts';
// Synthetic histories; metadata and envelope keys captured from Python App._chat_meta/api_context AST.
const golden=JSON.parse(readFileSync(new URL('./fixtures/context-python.json',import.meta.url),'utf8'));
const places=['assistant','researcher','executor3','room'];
const seats='  assistant: {role: assistant, label: ассистент, vendor: claude, model: w1, mode: read}\n  researcher: {role: researcher, label: ресёрчер, vendor: claude, model: w1, mode: read}\n  executor3: {role: executor, label: воркер 3, vendor: claude, model: w1, mode: read}';
async function serve(t:Parameters<typeof harness>[0],h:Awaited<ReturnType<typeof harness>>){
 const api=createApi({runtime:h.runtime,siteDir:h.dir,indexFile:join(h.dir,'unused.html'),port:0});await api.listen();t.after(()=>api.close());h.deps.appUrl=api.url;return api;
}
async function card(url:string,id:string){const res=await fetch(url+'/api/context/'+id);assert.equal(res.status,200);const body=await res.json();assert.deepEqual(Object.keys(body),golden.rootKeys);assert.equal(body.pane,id);assert.equal(body.busy,false);return body}

test('TS-06.1: /api/context has Python golden from chat=null to a first delivered turn at every place',async t=>{
 let nextId=0;const h=await harness(t,{seats,deps:{id:()=> (++nextId).toString(16).padStart(4,'0')}});h.runtime.makeRoom('w1','chat',OWNER);await h.runtime.idle();const api=await serve(t,h);assert.deepEqual(h.runtime.registry.ids,places);
 for(const id of places){assert.equal(h.runtime.context(id).chat,null);assert.equal((await card(api.url,id)).chat,null)}
 assert.deepEqual(h.runtime.project.state.chats.active,{});assert.equal(h.provider.calls.length,0);
 for(const id of places){assert.equal((await card(api.url,id)).chat,null);const res=await fetch(api.url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pane:id,message:'Новая задача: '+id,direct:true})});assert.equal(res.status,200);await h.runtime.idle();assert.deepEqual(h.runtime.context(id).chat,golden.firstTurn[id]);assert.equal(JSON.stringify((await card(api.url,id)).chat),JSON.stringify(golden.firstTurn[id]))}
 assert.equal(h.provider.calls.length,places.length)
});

test('TS-06.1: /api/context chat metadata matches Python golden for all places before and after a delivered turn',async t=>{
 const h=await harness(t,{seats,before:dir=>{writeFileSync(join(dir,'.harness/state/chats.json'),JSON.stringify(golden.saved));writeFileSync(join(dir,'.harness/state/panes.json'),JSON.stringify(golden.panes))}}),api=await serve(t,h);assert.deepEqual(h.runtime.registry.ids,places);
 for(const id of places){const expected=golden.before[id];assert.deepEqual(h.runtime.context(id).chat,expected);assert.equal(JSON.stringify((await card(api.url,id)).chat),JSON.stringify(expected))}
 for(const id of places){const res=await fetch(api.url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pane:id,message:'Новая задача: '+id,direct:true})});assert.equal(res.status,200);await h.runtime.idle()}
 for(const id of places){const expected=golden.after[id];assert.deepEqual(h.runtime.context(id).chat,expected);assert.equal(JSON.stringify((await card(api.url,id)).chat),JSON.stringify(expected));assert.equal(h.provider.calls.filter(c=>c.seat.id===id).length,1)}
});
