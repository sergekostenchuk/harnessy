import {randomUUID} from 'node:crypto';
import {apiPresets,isOllamaCloudRoute,keySlot,type ProviderConfig,discoverDraft,validateDiscoveryDraft,LlmError,validRoute,catalogProviders,catalogProviderNames,catalogModels,modelInfo,validateResolvedRoutes} from '@harnessy/llm';
import type {Runtime} from '@harnessy/runtime';
import {RuntimeError} from '@harnessy/runtime';
import type {Route,RequestContext} from './routes.ts';
import {providerOwner} from './routes-providers.ts';
import {json} from './responses.ts';
function owner(ctx:RequestContext){providerOwner(ctx.request);if(ctx.body.from!==undefined||ctx.body.pane!==undefined)throw new RuntimeError('owner_only','Действие доступно только владельцу',403)}
function fields(body:Record<string,unknown>,keys:string[]){if(Object.keys(body).some(k=>!keys.includes(k)))throw new LlmError('config_invalid')}
export function llmRoutes(r:Runtime):Route[]{
 const selected=(id:string)=>{const rows=r.settings.llmProviders();if(!validRoute(id)||!Object.hasOwn(rows,id))throw new LlmError('provider_unknown');return rows[id]!};
 const item=(id:string)=>{const config=selected(id);return {id,config,revision:r.settings.llmRevision(config),models:r.llm.models(id)}};
 const secretValue=(value:unknown)=>{if(typeof value!=='string'||!/^[\x21-\x7e]{8,4096}$/.test(value))throw new LlmError('config_invalid');return value};
 const absent={present:false,mask:null,updatedAt:null};
 const slot=(config:ProviderConfig|undefined)=>config?.keyRef?keySlot(config.keyRef,config.keyGeneration):null;
 const describe=async(config:ProviderConfig)=>{const ref=slot(config);return ref?await r.llmKeys.describe(ref):absent};
 const receipt=async(id:string)=>{const row=item(id);return {ok:true,...row,key:await describe(row.config)}};
 async function publish(id:string,raw:unknown,revision:unknown,secret?:string,removeKey=false){
  const previous=r.settings.llmProviders()[id],before=slot(previous);
  if(revision!==r.settings.llmRevision(previous))throw new RuntimeError('llm_conflict','Настройки маршрута изменились; перечитайте их',409);
  let config=raw===undefined?undefined:validateResolvedRoutes({[id]:raw})[id]!;
  // A client may echo its captured generation, but cannot select another secret version.
  if(config?.keyGeneration!==undefined&&config.keyGeneration!==previous?.keyGeneration)throw new LlmError('config_invalid');
  if(config){config={...config};if(secret!==undefined||removeKey&&config.keyRef){config.keyRef=id;config.keyGeneration=randomUUID()}
   else if(config.keyRef){if(previous?.keyRef){if(previous.keyGeneration)config.keyGeneration=previous.keyGeneration;else delete config.keyGeneration}else config.keyGeneration=randomUUID()}}
  if(config&&isOllamaCloudRoute(config)&&secret===undefined&&!removeKey&&!(await describe(config)).present)throw new LlmError('missing_credential');
  const after=slot(config),discard=async()=>{if(after)try{await r.llmKeys.delete(after)}catch{throw new LlmError('credential_unavailable')}};
  await r.settings.changeLlmProvider(id,config,revision,secret===undefined?undefined:async()=>{
   // This slot is unpublished. No reader of the old config can obtain the new key.
   try{await r.llmKeys.put(after!,secret)}catch{await discard();throw new LlmError('credential_unavailable')}return discard;
  });
  // Publication is complete. Old readers may now miss the old key, but can never read the new one.
  if(before&&before!==after)try{await r.llmKeys.delete(before)}catch{throw new RuntimeError('credential_cleanup_failed','Маршрут сохранён, но прежняя версия ключа не удалена; перечитайте подключение',500)}
 }
 return [
 {method:'POST',path:'/api/llm/providers/discover',style:'J',handle:async ctx=>{
  owner(ctx);fields(ctx.body,['id','config','secret']);const id=ctx.body.id;if(typeof id!=='string'||!validRoute(id))throw new LlmError('config_invalid');
  const config=validateDiscoveryDraft(id,ctx.body.config),secret=ctx.body.secret===undefined?undefined:secretValue(ctx.body.secret),saved=r.settings.llmProviders()[id],revision=r.settings.llmRevision(saved);
  const sameTarget=saved&&saved.catalog===config.catalog&&saved.api===config.api&&saved.baseURL===config.baseURL;
  if(secret===undefined&&saved?.keyRef&&!sameTarget)throw new RuntimeError('credential_target_changed','Адрес или протокол изменён: введите ключ для нового адреса',409);
  const draft={...config,...(secret!==undefined||sameTarget&&saved?.keyRef?{keyRef:id}:{})};if(saved?.keyGeneration)draft.keyGeneration=saved.keyGeneration;else delete draft.keyGeneration;
  const models=await discoverDraft(id,draft,{resolveKey:async()=>{if(secret!==undefined)return secret;if(!sameTarget||!saved?.keyRef)return null;const key=await r.llmKeys.resolveKey(keySlot(id,saved!.keyGeneration));if(revision!==r.settings.llmRevision(r.settings.llmProviders()[id]))throw new LlmError('route_changed');return key},fetch:r.routedFetch('api:'+id)});
  return json({ok:true,models});
 }},
 {method:'POST',path:'/api/llm/providers/:id/save',style:'J',handle:async ctx=>{
  owner(ctx);fields(ctx.body,['config','revision','secret']);const id=ctx.params.id!,secret=ctx.body.secret===undefined?undefined:secretValue(ctx.body.secret);
  const raw=ctx.body.config;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new LlmError('config_invalid');
  await publish(id,raw,ctx.body.revision??null,secret);
  return json(await receipt(id));
 }},
 {method:'GET',path:'/api/llm/providers',style:'J',handle:ctx=>{owner(ctx);return json({ok:true,providers:Object.keys(r.settings.llmProviders()).map(item),catalog:catalogProviders(),catalogNames:catalogProviderNames(),presets:apiPresets})}},
 {method:'GET',path:'/api/llm/providers/catalog/:id',style:'J',handle:ctx=>{owner(ctx);return json({ok:true,models:catalogModels(ctx.params.id!).map(modelInfo)})}},
 {method:'GET',path:'/api/llm/providers/:id',style:'J',handle:ctx=>{owner(ctx);return json({ok:true,...item(ctx.params.id!)})}},
 {method:'POST',path:'/api/llm/providers/:id',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['config','revision']);const id=ctx.params.id!,config=validateResolvedRoutes({[id]:ctx.body.config})[id]!;await publish(id,config,ctx.body.revision??null);return json({ok:true,...item(id)})}},
 {method:'POST',path:'/api/llm/providers/:id/delete',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['revision']);const id=ctx.params.id!;selected(id);await publish(id,undefined,ctx.body.revision??null);return json({ok:true})}},
 {method:'POST',path:'/api/llm/providers/:id/check',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,[]);const id=ctx.params.id!,config=selected(id);const row=item(id),key=await describe(config);if(config.keyRef&&!key.present)throw new LlmError('missing_credential');return json({ok:true,...row,key,checked:'configuration'})}},
 {method:'POST',path:'/api/llm/providers/:id/discover',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,[]);const service=r.llm,id=ctx.params.id!;return json({ok:true,models:await service.discover(id)})}},
 {method:'GET',path:'/api/llm/providers/:id/key',style:'J',handle:async ctx=>{owner(ctx);const id=ctx.params.id!;const config=selected(id);return json({ok:true,key:await describe(config)})}},
 {method:'POST',path:'/api/llm/providers/:id/key',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['secret','revision']);const id=ctx.params.id!,config=selected(id);const secret=secretValue(ctx.body.secret);await publish(id,config,ctx.body.revision??null,secret);return json(await receipt(id))}},
 {method:'POST',path:'/api/llm/providers/:id/key/delete',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['revision']);const id=ctx.params.id!,config=selected(id);await publish(id,config,ctx.body.revision??null,undefined,true);return json(await receipt(id))}}
 ];
}
