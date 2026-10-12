import {keySlot} from '@harnessy/llm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {setImmediate as tick} from 'node:timers/promises';
import {dom} from './ui-dom-test-helpers.ts';
import {fixture,call,deferred} from './test-helpers.ts';
import {MemoryKeys,endpoint} from '../../llm/src/test-helpers.ts';
type Data=Record<string,any>;
const code=readFileSync(new URL('../../../ui/deploy/llm.js',import.meta.url),'utf8'),opts={timeout:15000};
function ui(fetch:(path:string,body?:Data)=>Promise<Data>){
 const d=dom('<div class="frame cur"><div class="main"><div><button id="addbtn">Программы</button></div><div id="v-list"><div class="wrap"></div></div></div></div>');Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.dataset.page='conn';d.html.setAttribute('data-page','conn');let generation=0;const H={project:'/one',on:true,confirmedProjectGeneration:0},events:((e:Data)=>void)[]=[],requests:Data[]=[];
 const esc=(s:unknown)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
 const L:Data={H,esc,apiRoutes:[],sendBinding:()=>({project:H.project,generation}),bindingCurrent:(b:Data)=>b.project===H.project&&b.generation===generation,api:async(path:string,body?:Data)=>{requests.push({path,body});return fetch(path,body)},toast(){},refreshStatus:async()=>{},subscribeLiveEvents:(cb:(e:Data)=>void)=>{events.push(cb);return {close(){}}}};
 const ctx:Data={document:d.document,location:{pathname:'/11-connections.html'},LIVE:L,addEventListener:d.window.addEventListener.bind(d.window),confirm:()=>true};ctx.window=ctx;runInContext(code,createContext(ctx));
 const find=(s:string)=>{const n=d.document.querySelector(s);assert.ok(n,s);return n};
 const click=(s:string)=>find(s).emit('click');const input=async(k:string,value:string)=>{const el=find('[data-llm-field="'+k+'"]');el.value=value;await el.emit('input')};
 return {...d,L,requests,find,click,input,flush:async()=>{await tick()},change:async()=>{generation++;H.project='/two';await d.window.emit('live:status')},event:()=>events.forEach(fn=>fn({data:JSON.stringify({type:'llm.routes'})}))};
}
test('connections draft discovers only on click, saves key plus selected models and exposes safe metadata',opts,async t=>{
 let network=0;const server=await endpoint(t,(_b,_req,res)=>{network++;res.end(JSON.stringify({data:[{id:'model-one',name:'First model'},{id:'model-two'}]}))}),keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});
 const stored=async()=>{const config=h.runtime.settings.llmProviders()['my-api'];return config?.keyRef?keys.resolveKey(keySlot(config.keyRef,config.keyGeneration)):null};
 const v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body);await v.L.loadLlmRoutes();await v.click('[data-llm-add]');assert.equal(network,0);
 await v.input('id','my-api');await v.input('name','Мой сервер');await v.input('url',server.url);await v.input('api','openai-completions');await v.input('secret','fixture-secret-5678');
 await v.click('[data-llm-action="discover"]');assert.equal(network,1);assert.equal((await call(h.api,'/api/llm/providers')).body.providers.length,0);
 const checkbox=v.find('[data-llm-model="model-one"]');(checkbox as any).checked=true;await checkbox.emit('change');await v.click('[data-llm-action="save"]');assert.equal(await stored(),'fixture-secret-5678');assert.equal(v.document.querySelector('.llm-dialog'),null);assert.equal(v.L.apiRoutes[0].id,'api:my-api');assert.deepEqual(JSON.parse(JSON.stringify(v.L.apiRoutes[0].models)),[{id:'model-one',label:'First model'}]);
 await v.click('[data-llm-edit="my-api"]');assert.equal(v.find('[data-llm-field="secret"]').value,'');assert.match(v.find('[data-llm-key-info]').textContent,/••••••••5678/);assert.doesNotMatch(v.document.innerHTML,/fixture-secret/);assert.equal(network,1);
 await v.input('url','');await v.click('[data-llm-action="delete-key"]');assert.equal(await stored(),null);assert.match(v.find('[data-llm-key-info]').textContent,/ключа нет/);
 await v.input('url',server.url);await v.input('secret','replacement-fixture');await v.click('[data-llm-action="save"]');assert.equal(await stored(),'replacement-fixture');await v.click('[data-llm-edit="my-api"]');await v.click('[data-llm-action="delete"]');assert.equal(await stored(),null);assert.equal(v.L.apiRoutes.length,0);assert.equal(keys.rows.size,0);
});
test('late discovery cannot overwrite edited form or new dialog; duplicate action and project switch are bounded',opts,async()=>{
 const pending=deferred<Data>();let finds=0;const v=ui(async(path)=>path.endsWith('/discover')?(finds++,await pending.promise):{ok:true,providers:[],catalog:[]});await v.flush();await v.click('[data-llm-add]');await v.input('id','mine');await v.input('url','https://example.test');await v.input('api','openai-completions');const reading=v.click('[data-llm-action="discover"]');await v.flush();await v.click('[data-llm-action="discover"]');assert.equal(finds,1);await v.input('url','https://new.test');pending.resolve({ok:true,models:[{id:'stale'}]});await reading;assert.equal(v.document.querySelector('[data-llm-model="stale"]'),null);assert.match(v.find('[data-llm-status]').textContent,/Форма изменилась/);
 const q=deferred<Data>();const w=ui(async path=>path.endsWith('/discover')?q.promise:{ok:true,providers:[],catalog:[]});await w.flush();await w.click('[data-llm-add]');await w.input('id','mine');await w.input('url','https://example.test');const job=w.click('[data-llm-action="discover"]');await w.change();q.resolve({ok:true,models:[{id:'foreign'}]});await job;assert.equal(w.document.querySelector('.llm-dialog'),null);
});
test('configuration errors are visible; stale save keeps draft and secret until explicit reread',opts,async()=>{
 const row={id:'saved',config:{api:'openai-completions',baseURL:'https://example.test',models:[{id:'m'}]},models:[{id:'m'}],revision:'one'};
 const v=ui(async path=>path.endsWith('/save')?{ok:false,code:'llm_conflict',error:'Настройки изменились; перечитайте'}:path.endsWith('/key')?{ok:true,key:{present:false}}:{ok:true,providers:[row],catalog:[]});await v.flush();await v.click('[data-llm-edit="saved"]');await v.input('secret','secret-fixture');await v.click('[data-llm-action="save"]');assert.match(v.find('[data-llm-status]').textContent,/llm_conflict/);assert.equal(v.find('[data-llm-field="secret"]').value,'secret-fixture');await v.click('[data-llm-action="reload"]');assert.equal(v.find('[data-llm-field="secret"]').value,'');
});
