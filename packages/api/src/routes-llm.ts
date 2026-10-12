import {LlmError,validRoute,catalogProviders,catalogModels,modelInfo,validateResolvedRoutes} from '@harnessy/llm';
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
 return [
 {method:'GET',path:'/api/llm/providers',style:'J',handle:ctx=>{owner(ctx);return json({ok:true,providers:Object.keys(r.settings.llmProviders()).map(item),catalog:catalogProviders()})}},
 {method:'GET',path:'/api/llm/providers/catalog/:id',style:'J',handle:ctx=>{owner(ctx);return json({ok:true,models:catalogModels(ctx.params.id!).map(modelInfo)})}},
 {method:'GET',path:'/api/llm/providers/:id',style:'J',handle:ctx=>{owner(ctx);return json({ok:true,...item(ctx.params.id!)})}},
 {method:'POST',path:'/api/llm/providers/:id',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['config','revision']);const id=ctx.params.id!,config=validateResolvedRoutes({[id]:ctx.body.config})[id]!;await r.settings.changeLlmProvider(id,config,ctx.body.revision??null);return json({ok:true,...item(id)})}},
 {method:'POST',path:'/api/llm/providers/:id/delete',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['revision']);const id=ctx.params.id!;selected(id);await r.settings.changeLlmProvider(id,undefined,ctx.body.revision??null,()=>r.llmKeys.delete(id));return json({ok:true})}},
 {method:'POST',path:'/api/llm/providers/:id/check',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,[]);const id=ctx.params.id!,config=selected(id);const key=config.keyRef?await r.llmKeys.describe(config.keyRef):{present:false,mask:null,updatedAt:null};if(config.keyRef&&!key.present)throw new LlmError('missing_credential');return json({ok:true,...item(id),key,checked:'configuration'})}},
 {method:'POST',path:'/api/llm/providers/:id/discover',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,[]);const service=r.llm,id=ctx.params.id!;return json({ok:true,models:await service.discover(id)})}},
 {method:'GET',path:'/api/llm/providers/:id/key',style:'J',handle:async ctx=>{owner(ctx);const id=ctx.params.id!;selected(id);return json({ok:true,key:await r.llmKeys.describe(id)})}},
 {method:'POST',path:'/api/llm/providers/:id/key',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['secret','revision']);const id=ctx.params.id!,config=selected(id);if(typeof ctx.body.secret!=='string')throw new LlmError('config_invalid');const secret=ctx.body.secret;await r.settings.changeLlmProvider(id,{...config,keyRef:id},ctx.body.revision??null,()=>r.llmKeys.put(id,secret));return json({ok:true,...item(id),key:await r.llmKeys.describe(id)})}},
 {method:'POST',path:'/api/llm/providers/:id/key/delete',style:'J',handle:async ctx=>{owner(ctx);fields(ctx.body,['revision']);const id=ctx.params.id!,config=selected(id);await r.settings.changeLlmProvider(id,config,ctx.body.revision??null,()=>r.llmKeys.delete(id));return json({ok:true,key:{present:false,mask:null,updatedAt:null}})}}
 ];
}
