import {RuntimeError,type Runtime} from '@harnessy/runtime';
import {OWNER,type RequestContext,type Route} from './routes.ts';
import {json} from './responses.ts';
export function providerOwner(request:RequestContext['request']){if(request.headers['x-pane-token']!==undefined||request.headers['x-harness-pane']!==undefined)throw new RuntimeError('owner_only','Действие доступно только владельцу',403)}
export function providerRoutes(r:Runtime):Route[]{return [
 {method:'GET',path:'/api/providers/catalog',style:'J',handle:async({request})=>{providerOwner(request);return json(await r.providerOperations.list(OWNER))}},
 {method:'POST',path:'/api/providers/:id/check',style:'J',handle:async({request,params})=>{providerOwner(request);return json(await r.providerOperations.check(params.id!,OWNER))}},
 {method:'POST',path:'/api/providers/:id/login-terminal',style:'J',statuses:{platform_unsupported:501,login_terminal_failed:503},handle:async({request,params})=>{providerOwner(request);return json(await r.providerOperations.login(params.id!,OWNER))}},
 {method:'POST',path:'/api/providers/:id/probe',style:'J',handle:async({request,params,body})=>{providerOwner(request);if(Object.keys(body).some(k=>k!=='model'))throw new RuntimeError('probe_invalid','Ожидается только выбранная модель; разрешение — через карточку владельца',400);return json(await r.providerOperations.probe(params.id!,body.model,OWNER))}}
]}
