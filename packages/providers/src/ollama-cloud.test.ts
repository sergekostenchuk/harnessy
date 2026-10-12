import test from 'node:test';
import assert from 'node:assert/strict';
import {OllamaProvider} from './ollama.ts';
import {OLLAMA_CLOUD_REASON} from './ollama-models.ts';
import {ollamaFixture,ollamaTurnProvider} from './ollama-test-helpers.ts';
import {cliFixture} from './cli/test-support.ts';
import {ProviderCatalog} from './catalog.ts';
import {CatalogCache} from './catalog-cache.ts';

test('21g: daemon catalogue hides cloud suffixes and remote aliases, without any cloud discovery',async t=>{
 const f=await ollamaFixture(t);f.setTags({models:[{name:'glm:cloud'},{name:'gpt-oss:20b-cloud'},{name:'my-alias',remote_model:'gemma4:31b'},{name:'gemma4:latest'}]});
 const p=new OllamaProvider(f.options);assert.deepEqual(await p.models(),[{id:'gemma4:latest',label:'gemma4:latest · локально'}]);assert.equal(p.modelsReason,OLLAMA_CLOUD_REASON);assert.equal(f.cloudReads,0);assert.equal(f.capture().length,0);
 await assert.rejects(p.prepareModel('my-alias',t.signal),{code:'cloud_api_required'});assert.equal(f.capture().length,0);assert.equal(f.pulls.length,0);
});
for(const model of ['glm:cloud','ollama/glm:cloud','gpt-oss:20b-cloud'])test('21g: saved '+model+' fails before daemon/model calls and keeps its seat',async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe'),p=ollamaTurnProvider(new OllamaProvider(f.options),f.fetch),seat={...h.seat,vendor:'ollama',model,cwd:f.dir},before=structuredClone(seat);
 await assert.rejects(p.runTurn(seat,'fixture',h.ctx),{code:'cloud_api_required'});assert.deepEqual(seat,before);assert.equal(f.network.length,0);assert.equal(f.cloudReads,0);assert.equal(f.commands.length,0);assert.equal(f.capture().length,0);
});
test('21g: restored old catalogue drops cloud models before its first async refresh',async t=>{
 const f=await ollamaFixture(t),cacheDir=f.dir+'/cache',catalog=new ProviderCatalog([f.entry]),row=(await catalog.read('ollama')).row;row.models.push({id:'old:cloud',label:'old · облако'},{id:'alias',label:'alias · облако'});new CatalogCache(cacheDir,Date.now).save(row);await catalog.close();
 const restored=new ProviderCatalog([f.entry],Date.now,{cacheDir});t.after(()=>restored.close());assert.deepEqual(restored.peek('ollama').models.map(m=>m.id),['gemma4:latest']);
});
