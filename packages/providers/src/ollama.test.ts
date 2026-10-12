import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderCatalog} from './catalog.ts';
import {OllamaProvider,OLLAMA_LOGIN_UNKNOWN,ollamaVersion} from './ollama.ts';
import {ollamaFixture} from './ollama-test-helpers.ts';
import {MODES} from './modes.ts';

test('334/21d: Ollama discovery retains installed version, daemon, local models and login without inference',async t=>{
 const f=await ollamaFixture(t),catalog=new ProviderCatalog([f.entry]),row=(await catalog.read('ollama')).row;assert.equal(row.title,'Ollama');assert.equal(row.subtitle,'локально');assert.equal(row.version,'0.40.2');assert.equal(row.service?.ok,true);assert.equal(row.login.state,'unknown');assert.equal(row.login.reason,OLLAMA_LOGIN_UNKNOWN);assert.deepEqual(row.models.map(m=>m.label),['gemma4:latest · локально']);assert.equal(catalog.limitsEntries().length,0);for(const mode of Object.keys(MODES))assert.equal(row.capabilities.turn![mode as 'read']!.ok,true);assert.equal(row.capabilities.turn!.web!.note,'только загрузка страниц по адресу');assert.equal(f.capture().length,0);
 f.setOffline(true);const down=(await catalog.read('ollama')).row;assert.equal(down.installed,true);assert.equal(down.service?.ok,false);assert.match(down.service!.reason!,/демон не запущен/);assert.equal(down.service!.command,'ollama serve');assert.equal(down.models.length,0);assert.equal(down.capabilities.probe?.ok,false);for(const mode of Object.keys(MODES))assert.equal(down.capabilities.turn![mode as 'read']!.ok,false);
 f.setOffline(false);assert.equal((await catalog.read('ollama')).row.models.length,1);assert.equal(f.capture().length,0);assert.ok(f.commands.every(c=>c.binary===f.options.binary));
});
test('334: forged/missing models and bounded HTTP are typed refusals without model calls',async t=>{
 const f=await ollamaFixture(t),p=new OllamaProvider(f.options);for(const tags of [{},{models:[{name:'--host=evil'}]},{models:[{name:'valid',remote_model:'<img>'}]},{models:[{name:'same'},{name:'same'}]}]){f.setTags(tags);await assert.rejects(p.models(),{code:'models_unavailable'})}
 const slow=new OllamaProvider({...f.options,httpTimeoutMs:10,fetch:()=>new Promise(()=>{})});await assert.rejects(slow.models(),{code:'transport_lost'});assert.equal(f.capture().length,0);
});
test('334: installed CLI version survives a missing daemon or client/server mismatch',()=>{assert.equal(ollamaVersion('Warning: could not connect to a running Ollama instance\nWarning: client version is 0.40.2\n'),'0.40.2');assert.equal(ollamaVersion('ollama version is 0.39.1\nWarning: client version is 0.40.2\n'),'0.40.2');assert.throws(()=>ollamaVersion('login token: SECRET'),{code:'protocol'})});
test('334: malformed, oversized and cancelled daemon responses stay bounded and never echo bodies',async t=>{
 const f=await ollamaFixture(t);for(const response of [new Response('bad JSON SECRET'),new Response('x'.repeat(1_048_577)),Response.json({version:'spoofed-version SECRET'})]){const p=new OllamaProvider({...f.options,fetch:async()=>response});await assert.rejects(p.auth(),(e:any)=>e.code==='protocol'&&!e.message.includes('SECRET'))}
 const p=new OllamaProvider({...f.options,fetch:()=>new Promise(()=>{})}),abort=new AbortController();abort.abort();await assert.rejects(p.models(abort.signal),{code:'cancelled'});assert.equal(f.capture().length,0);
});
