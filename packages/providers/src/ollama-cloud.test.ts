import test from 'node:test';
import assert from 'node:assert/strict';
import {OllamaProvider,OLLAMA_CLOUD_URL,OLLAMA_URL} from './ollama.ts';
import {ollamaCloudName,OLLAMA_MODELS_TTL_MS} from './ollama-models.ts';
import {ollamaFixture,ollamaTurnProvider} from './ollama-test-helpers.ts';
import {cliFixture} from './cli/test-support.ts';
import {ProviderCatalog} from './catalog.ts';
const budget={timeout:8000};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve}};

test('344: service names preserve tagged variants and refuse foreign/argument-shaped names',budget,()=>{
 for(const [remote,local] of [['minimax-m3','minimax-m3:cloud'],['gemma4:31b','gemma4:31b-cloud'],['gpt-oss:120b','gpt-oss:120b-cloud'],['deepseek-v4-pro:0813','deepseek-v4-pro:0813-cloud'],['model:latest','model:cloud']])assert.equal(ollamaCloudName(remote!),local);
 for(const remote of ['--host=evil','https://evil/model','registry.invalid/model','model:','model:a:b','<script>'])assert.throws(()=>ollamaCloudName(remote),{code:'models_unavailable'});
});

test('344: union, aliases, TTL and cloud failure preserve local models with a public reason',budget,async t=>{
 const f=await ollamaFixture(t);let now=0;f.setCloud({models:[{name:'glm-5.3'},{name:'gpt-oss:20b'},{name:'gpt-oss:120b'},{name:'gemma4:31b'}]});
 const options={...f.options,now:()=>now},p=new OllamaProvider(options);t.after(()=>p.close());
 const list=await p.models();assert.equal(list.length,5);assert.equal(new Set(list.map(m=>m.id)).size,5);assert.match(list.find(m=>m.id==='gpt-oss:20b-cloud')!.label,/облако · добавится при первом ходе/);assert.doesNotMatch(list[0]!.label,/добавится/);assert.match(list[1]!.label,/локально/);await p.models();assert.equal(f.cloudReads,1);
 now+=OLLAMA_MODELS_TTL_MS;f.setCloudStatus(503);const stale=await p.models();assert.deepEqual(stale,list);assert.match(p.modelsReason!,/облачный каталог.*HTTP 503/);assert.doesNotMatch(p.modelsReason!,/SECRET/);
 const cold=new OllamaProvider(options);t.after(()=>cold.close());assert.equal((await cold.models()).length,2);assert.match(cold.modelsReason!,/HTTP 503/);
 now+=OLLAMA_MODELS_TTL_MS;f.setCloudStatus(200);f.setCloud({models:[{name:'gemma4:31b'}]});f.setTags({models:[{name:'gemma4:cloud',remote_model:'gemma4:31b'}]});assert.deepEqual(await p.models(),[{id:'gemma4:cloud',label:'gemma4:cloud · облако'}]);assert.equal(p.modelsReason,undefined);
});

test('344: dynamic failure reason reaches catalog even with available local models, then clears',budget,async t=>{
 const f=await ollamaFixture(t);f.setCloudStatus(503);const catalog=new ProviderCatalog([f.entry]);t.after(()=>catalog.close());const row=(await catalog.read('ollama')).row;assert.equal(row.models.length,2);assert.equal(row.service?.ok,true);assert.match(row.modelsReason!,/HTTP 503/);f.setCloudStatus(200);f.setCloud({models:[{name:'gpt-oss:20b'}]});const fresh=(await catalog.read('ollama')).row;assert.equal(fresh.models.length,3);assert.equal(fresh.modelsReason,undefined);
});

test('344: public metadata is credential-free, bounded and cannot redirect; invalid responses leave local models',budget,async t=>{
 const f=await ollamaFixture(t);
 for(const response of [Response.json({models:[{name:'../foreign'}]}),Response.json({models:[{name:'same'},{name:'same'}]}),new Response('SECRET-invalid'),new Response('x'.repeat(1_048_577)),new Response(null,{status:302,headers:{Location:'https://foreign.invalid'}})]){
  const p=new OllamaProvider({...f.options,fetch:async(url,init)=>{if(String(url)!==OLLAMA_CLOUD_URL)return f.options.fetch!(url,init);assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');assert.equal(init?.headers,undefined);assert.equal(init?.body,undefined);return response}});t.after(()=>p.close());assert.equal((await p.models()).length,2);assert.match(p.modelsReason!,/облачный каталог/);assert.doesNotMatch(p.modelsReason!,/SECRET|foreign/);
 }
 const slow=new OllamaProvider({...f.options,httpTimeoutMs:10,fetch:(url,init)=>String(url)===OLLAMA_CLOUD_URL?new Promise(()=>{}):f.options.fetch!(url,init)});t.after(()=>slow.close());assert.equal((await slow.models()).length,2);assert.match(slow.modelsReason!,/срок ожидания/);
});

test('344: pull completes before inference, selected input is frozen and subsequent turns do not pull again',budget,async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe');f.setCloud({models:[{name:'gpt-oss:20b'}]});const entered=deferred(),release=deferred();t.after(()=>release.resolve());let started=0;
 const p=ollamaTurnProvider(new OllamaProvider({...f.options,fetch:async(url,init)=>{if(String(url)===OLLAMA_URL+'/api/pull'){assert.deepEqual(JSON.parse(init!.body as string),{model:'gpt-oss:20b-cloud',stream:false});entered.resolve();await release.promise}return f.options.fetch!(url,init)} }),f.fetch);t.after(()=>p.close());
 const seat={...h.seat,vendor:'ollama',model:'gpt-oss:20b-cloud',cwd:f.dir},turn=p.runTurn(seat,'one',{...h.ctx,modelStarted:()=>{started++}});await entered.promise;assert.equal(started,0);assert.equal(f.capture().length,0);seat.model='--evil';release.resolve();const result=await turn;assert.equal(started,1);assert.equal(f.capture()[0].model,'gpt-oss:20b-cloud');assert.deepEqual(f.pulls,['gpt-oss:20b-cloud']);
 await p.runTurn({...seat,model:'gpt-oss:20b-cloud',sessionId:result.sessionId},'two',h.ctx);assert.deepEqual(f.pulls,['gpt-oss:20b-cloud']);assert.equal(f.capture().length,2);assert.doesNotMatch((await p.models()).find(m=>m.id==='gpt-oss:20b-cloud')!.label,/добавится/);
});

for(const failure of ['http','timeout','cancel','invalid','missing','binding'] as const)test('344: '+failure+' during preparation never starts inference or replaces the existing session',budget,async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe');f.setCloud({models:[{name:'gpt-oss:20b'}]});const abort=new AbortController();let calls=0;
 const p=ollamaTurnProvider(new OllamaProvider({...f.options,pullTimeoutMs:20,fetch:async(url,init)=>{if(String(url)===OLLAMA_URL+'/api/pull'){calls++;if(failure==='http')return new Response('SECRET',{status:503});if(failure==='cancel')abort.abort();if(failure==='timeout'||failure==='cancel')return new Promise(()=>{});if(failure==='invalid')return Response.json({status:'success',error:'SECRET'});if(failure==='missing')return Response.json({status:'success'})}return f.options.fetch!(url,init)} }),f.fetch);t.after(()=>p.close());
 const seat={...h.seat,vendor:'ollama',model:'gpt-oss:20b-cloud',cwd:f.dir,sessionId:'previous-session'},before=structuredClone(seat);const {ProviderError}=await import('./types.ts');
 await assert.rejects(p.runTurn(seat,'never',{...h.ctx,signal:abort.signal,...(failure==='binding'?{beforeModel:async()=>{throw new ProviderError('login_changed','changed')}}:{})}),(e:any)=>typeof e.code==='string'&&!e.vendorText.includes('SECRET'));
 assert.equal(calls,1);assert.equal(f.capture().length,0);assert.deepEqual(seat,before);assert.equal(h.events.some((e:any)=>e.type==='delta'),false);
});

test('344: close cancels a blocked pull; an unsupported model cannot request a download',budget,async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe');f.setCloud({models:[{name:'gpt-oss:20b'}]});const entered=deferred();let requests=0;
 const p=ollamaTurnProvider(new OllamaProvider({...f.options,fetch:async(url,init)=>{if(String(url)===OLLAMA_URL+'/api/pull'){requests++;entered.resolve();return new Promise(()=>{})}return f.options.fetch!(url,init)} }),f.fetch);t.after(()=>p.close());const seat={...h.seat,vendor:'ollama',cwd:f.dir,model:'unlisted:cloud',sessionId:'old'};
 await assert.rejects(p.runTurn(seat,'never',h.ctx),{code:'model_unsupported'});assert.equal(requests,0);const pending=assert.rejects(p.runTurn({...seat,model:'gpt-oss:20b-cloud'},'never',h.ctx),{code:'cancelled'});await entered.promise;await p.close();await pending;assert.equal(requests,1);assert.equal(f.capture().length,0);
});

test('343/344: restart serves persisted cloud union immediately; catalog cancellation reaches the public fetch without overwriting cache',budget,async t=>{
 const {readFileSync}=await import('node:fs'),{ollamaEntry}=await import('./ollama.ts');const f=await ollamaFixture(t);f.setCloud({models:[{name:'gpt-oss:20b'}]});const cacheDir=f.dir+'/catalog',warm=new ProviderCatalog([f.entry],Date.now,{cacheDir});const saved=(await warm.read('ollama')).row;await warm.close();const bytes=readFileSync(cacheDir+'/ollama.json','utf8');
 const entered=deferred();let cancelled=false;const entry=ollamaEntry({...f.options,fetch:async(url,init)=>{if(String(url)!==OLLAMA_CLOUD_URL)return f.options.fetch!(url,init);entered.resolve();return new Promise((_resolve,reject)=>{const stop=()=>{cancelled=true;reject(new Error('cancelled fixture'))};if(init?.signal?.aborted)stop();else init?.signal?.addEventListener('abort',stop,{once:true})})}});entry.version=async()=> '0.40.2';
 const restored=new ProviderCatalog([entry],Date.now,{cacheDir});t.after(()=>restored.close());assert.deepEqual(restored.peek('ollama').models,saved.models);assert.equal(restored.peek('ollama').checking,true);assert.match(restored.peek('ollama').login.reason!,/проверяется/);
 const reading=restored.read('ollama');await entered.promise;await restored.close();await reading.catch(()=>{});assert.equal(cancelled,true);assert.equal(readFileSync(cacheDir+'/ollama.json','utf8'),bytes);assert.equal(f.capture().length,0);
});
