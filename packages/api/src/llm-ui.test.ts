import {keySlot,LlmError} from '@harnessy/llm';
import {builtinProviders} from '@earendil-works/pi-ai/providers/all';
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
test('API provider picker uses pi-ai names, sorts by name and keeps the catalog id for discovery',opts,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys()}}),v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body);
 await v.L.loadLlmRoutes();const response=(await call(h.api,'/api/llm/providers')).body,official=new Map(builtinProviders().map(p=>[p.id,p.name]));
 await v.click('[data-llm-add]');const select=v.find('[data-llm-field="provider"]'),options=select.querySelectorAll('option');
 assert.equal(options[0]!.textContent,'Свой адрес');assert.equal(options[0]!.getAttribute('value'),'');assert.equal(options.length,response.catalog.length+response.presets.length+1);
 const labels=options.slice(1).map(o=>o.textContent);assert.deepEqual(labels,[...labels].sort((a,b)=>a.localeCompare(b,'ru',{sensitivity:'base'})));
 for(const o of options.slice(1)){const id=o.getAttribute('value')!;if(id==='preset:ollama-cloud'){assert.equal(o.textContent,'Ollama Cloud');continue;}assert.equal(o.textContent,official.get(id)||id);assert.equal(o.title,id);assert.equal(response.catalogNames[id],o.textContent)}
 for(const [id,name] of [['deepseek','DeepSeek'],['moonshotai','Moonshot AI'],['zai','Z.AI'],['qwen-token-plan','Qwen Token Plan']])assert.equal(select.querySelector('option[value="'+id+'"]')!.textContent,name);
 assert.equal(v.requests.some(r=>r.path.endsWith('/discover')),false);select.value='moonshotai';await select.emit('change');assert.equal(select.title,'moonshotai');await v.click('[data-llm-action="discover"]');assert.equal(v.requests.at(-1)!.body.config.catalog,'moonshotai');
});
test('provider names fall back to id and remain text, including catalogs without name metadata',opts,async()=>{
 const v=ui(async()=>({ok:true,providers:[],catalog:['z-last','no-name','a-first','markup'],catalogNames:{'z-last':'Alpha','a-first':'Zulu','no-name':'',markup:'<img src=x onerror=alert(1)>'}}));
 await v.flush();await v.click('[data-llm-add]');const select=v.find('[data-llm-field="provider"]'),options=select.querySelectorAll('option');
 assert.deepEqual(options.map(o=>o.textContent),['Свой адрес','<img src=x onerror=alert(1)>','Alpha','no-name','Zulu']);assert.equal(select.querySelector('img'),null);assert.equal(options.length,5);
 const legacy=ui(async()=>({ok:true,providers:[],catalog:['zebra','alpha']}));await legacy.flush();await legacy.click('[data-llm-add]');assert.deepEqual(legacy.find('[data-llm-field="provider"]').querySelectorAll('option').map(o=>o.textContent),['Свой адрес','alpha','zebra']);
});
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
 const v=ui(async path=>path.endsWith('/save')?{ok:false,code:'llm_conflict',error:'Настройки изменились; перечитайте'}:path.endsWith('/key')?{ok:true,key:{present:false}}:{ok:true,providers:[row],catalog:[]});await v.flush();await v.click('[data-llm-edit="saved"]');await v.input('secret','secret-fixture');await v.click('[data-llm-action="save"]');assert.match(v.find('[data-llm-status]').textContent,/Подключение не сохранено.*llm_conflict/);assert.equal(v.find('[data-llm-status]').getAttribute('role'),'alert');assert.equal(v.find('[data-llm-status]').classList.contains('is-error'),true);assert.equal(v.find('[data-llm-field="secret"]').getAttribute('type'),'password');assert.equal(v.find('[data-llm-field="secret"]').value,'secret-fixture');await v.click('[data-llm-action="reload"]');assert.equal(v.find('[data-llm-field="secret"]').value,'');
});

test('21c.2: HTTP 409 on key storage keeps an open masked draft and an error beside Save; retry saves the same fields',opts,async t=>{
 const keys=new MemoryKeys(),put=keys.put.bind(keys);let unavailable=true;
 keys.put=async(id,secret)=>{if(unavailable)throw new LlmError('credential_unavailable');await put(id,secret)};
 const h=await fixture(t,{deps:{llmKeys:keys}}),replies:number[]=[],toasts:string[]=[],v=ui(async(path,body)=>{const r=await call(h.api,path,body?{body}:{});if(path.endsWith('/save'))replies.push(r.status);return r.body});v.L.toast=(text:string)=>toasts.push(text);
 await v.L.loadLlmRoutes();await v.click('[data-llm-add]');
 const values={id:'glm-route',name:'GLM по API',api:'openai-completions',url:'https://example.test/v1',secret:'fixture-hidden-key-0001'};
 for(const [name,value]of Object.entries(values))await v.input(name,value);
 await v.input('manual','glm-fixture');await v.click('[data-llm-action="manual"]');
 const dialog=v.find('.llm-dialog'),checkbox=v.find('[data-llm-model="glm-fixture"]');await v.click('[data-llm-action="save"]');
 assert.deepEqual(replies,[409]);assert.equal(v.find('.llm-dialog'),dialog);assert.equal(dialog.hasAttribute('open'),true);
 const message=v.find('[data-llm-status]'),save=v.find('[data-llm-action="save"]');
 assert.match(message.textContent,/Подключение не сохранено\. Хранилище ключей недоступно/);assert.equal(message.getAttribute('role'),'alert');assert.equal(message.getAttribute('aria-live'),'assertive');assert.equal(message.classList.contains('is-error'),true);assert.equal(v.document.activeElement,message);
 assert.equal(save.getAttribute('aria-describedby'),message.id);assert.equal(save.parentElement!.previousElementSibling,message);assert.equal(save.disabled,false);
 for(const [name,value]of Object.entries(values)){const input=v.find('[data-llm-field="'+name+'"]');assert.equal(input.value,value);assert.equal(input.disabled,false)}
 assert.equal(v.find('[data-llm-field="secret"]').getAttribute('type'),'password');assert.doesNotMatch(dialog.textContent,/fixture-hidden-key/);assert.doesNotMatch(dialog.innerHTML,/fixture-hidden-key/);assert.equal(v.find('[data-llm-model="glm-fixture"]'),checkbox);assert.equal(checkbox.hasAttribute('checked'),true);assert.equal(toasts.length,0);assert.equal(keys.rows.size,0);assert.equal((await call(h.api,'/api/llm/providers')).body.providers.length,0);
 unavailable=false;await v.click('[data-llm-action="save"]');assert.deepEqual(replies,[409,200]);assert.equal(v.document.querySelector('.llm-dialog'),null);assert.equal(toasts.length,1);
 const saved=(await call(h.api,'/api/llm/providers')).body.providers[0];assert.equal(saved.id,values.id);assert.equal(saved.config.displayName,values.name);assert.equal(saved.config.baseURL,values.url);assert.equal(saved.models[0].id,'glm-fixture');assert.equal(await keys.resolveKey(keySlot(saved.config.keyRef,saved.config.keyGeneration)),values.secret);
});

test('21c.2: client validation keeps the form open and announces that the connection was not saved',opts,async()=>{
 const v=ui(async()=>({ok:true,providers:[],catalog:[]}));await v.flush();await v.click('[data-llm-add]');await v.input('id','draft');await v.input('secret','fixture-hidden-key-0001');await v.click('[data-llm-action="save"]');
 assert.equal(v.find('.llm-dialog').hasAttribute('open'),true);assert.match(v.find('[data-llm-status]').textContent,/Подключение не сохранено\. Введите базовый адрес/);assert.equal(v.find('[data-llm-status]').getAttribute('role'),'alert');assert.equal(v.find('[data-llm-field="secret"]').getAttribute('type'),'password');assert.equal(v.requests.some(r=>r.path.endsWith('/save')),false);
});

test('21g: Ollama Cloud preset discovers with draft key, saves to Keychain and runs through the shared API agent',opts,async t=>{
 const {ollamaAnswer}=await import('../../providers/src/ollama-test-helpers.ts'),{join}=await import('node:path'),{readFileSync}=await import('node:fs');
 const secret='cloud-dummy-0001',network:{url:string;auth:string|null}[]=[],server=await endpoint(t,(body,req,res)=>{if(req.url==='/api/tags')res.end(JSON.stringify({models:[{name:'gemma4:31b'}]}));else{assert.equal(req.url,'/v1/chat/completions');assert.equal(body.model,'gemma4:31b');ollamaAnswer(res,'cloud fixture response')}}),keys=new MemoryKeys();
 const h=await fixture(t,{deps:{llmKeys:keys,llmFetch:async(url,init)=>{const address=String(url);assert.ok(['https://ollama.com/api/tags','https://ollama.com/v1/chat/completions'].includes(address));const auth=new Headers(init?.headers).get('authorization');assert.equal(auth,'Bearer '+secret);network.push({url:address,auth});return fetch(address.replace('https://ollama.com',server.url),init)}}}),v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body);
 await v.L.loadLlmRoutes();await v.click('[data-llm-add]');const select=v.find('[data-llm-field="provider"]');select.value='preset:ollama-cloud';await select.emit('change');assert.equal(v.find('[data-llm-field="url"]').value,'https://ollama.com/v1');assert.equal(v.find('[data-llm-field="api"]').value,'openai-completions');assert.equal(v.find('[data-llm-field="id"]').value,'ollama-cloud');assert.equal(v.find('[data-llm-field="name"]').value,'Ollama Cloud');assert.equal(network.length,0);
 await v.click('[data-llm-action="discover"]');assert.match(v.find('[data-llm-status]').textContent,/missing_credential/);assert.equal(network.length,0);const absent=await call(h.api,'/api/llm/providers/ollama-cloud/save',{body:{revision:null,config:{api:'openai-completions',baseURL:'https://ollama.com/v1',models:[{id:'gemma4:31b'}]}}});assert.equal(absent.body.code,'missing_credential');assert.equal(h.runtime.settings.llmProviders()['ollama-cloud'],undefined);assert.equal(keys.rows.size,0);await v.input('secret',secret);await v.click('[data-llm-action="discover"]');assert.equal(network.length,1);const model=v.find('[data-llm-model="gemma4:31b"]');(model as any).checked=true;await model.emit('change');await v.click('[data-llm-action="save"]');assert.equal(v.document.querySelector('.llm-dialog'),null);
 const route=h.runtime.settings.llmProviders()['ollama-cloud']!;assert.equal(route.catalog,undefined);assert.equal(route.baseURL,'https://ollama.com/v1');assert.equal(await keys.resolveKey(keySlot(route.keyRef!,route.keyGeneration)),secret);assert.equal(v.L.apiRoutes[0].title,'Ollama Cloud');
 await v.click('[data-llm-edit="ollama-cloud"]');assert.equal(v.find('[data-llm-field="provider"]').value,'preset:ollama-cloud');assert.equal(v.find('[data-llm-field="secret"]').value,'');await v.click('[data-llm-action="discover"]');assert.equal(network.length,2);await v.click('[data-llm-close]');
 const selectSeat=await call(h.api,'/api/panes/worker',{body:{vendor:'api:ollama-cloud',model:'gemma4:31b',mode:'read'}});assert.equal(selectSeat.status,200,selectSeat.text);await h.runtime.runTurn('worker','local fixture only');assert.equal(network.length,3);assert.equal(h.runtime.registry.get('worker')!.transcript.at(-1)!.text,'cloud fixture response');assert.equal(h.provider.calls.length+h.codex.calls.length,0);
 for(const output of [(await call(h.api,'/api/llm/providers')).text,(await call(h.api,'/api/trace')).text,readFileSync(join(h.dir,'.harness/state/chats.json'),'utf8'),v.body.innerHTML])assert.equal(output.includes(secret),false);
});

test('21g: cloud recovery button opens a prefilled API draft without sending a key or calling a model',opts,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys()}}),v=ui(async(path,body)=>(await call(h.api,path,body?{body}:{})).body);await v.L.loadLlmRoutes();
 const live=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8'),start=live.indexOf('  function finish('),end=live.indexOf('  function transferHTML(',start),state:{chat:any[]}={chat:[]},ctx={H:{cur:null},S:state,mdFiles:new Map(),window:{},esc:v.L.esc,save(){},render(){},setTimeout(){},now:()=>0};runInContext(live.slice(start,end)+`finish({type:'error',code:'cloud_api_required',message:'облачные модели — через Ollama Cloud по API'})`,createContext(ctx));const html=state.chat[0].html;v.body.insertAdjacentHTML('beforeend',html);
 await v.click('[data-llm-ollama-cloud]');assert.equal(v.find('[data-llm-field="url"]').value,'https://ollama.com/v1');assert.equal(v.find('[data-llm-field="api"]').value,'openai-completions');assert.equal(v.find('[data-llm-field="name"]').value,'Ollama Cloud');assert.equal(v.find('[data-llm-field="secret"]').getAttribute('type'),'password');assert.equal(v.requests.some(r=>r.body),false);
});
