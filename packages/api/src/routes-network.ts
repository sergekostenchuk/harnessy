import type {Runtime} from '@harnessy/runtime';
import {RuntimeError} from '@harnessy/runtime';
import {networkFields} from '@harnessy/projects';
import type {RequestContext,Route} from './routes.ts';
import {providerOwner} from './routes-providers.ts';
import {json} from './responses.ts';
function owner(ctx:RequestContext){providerOwner(ctx.request);if(ctx.body.from!==undefined||ctx.body.pane!==undefined)throw new RuntimeError('owner_only','Действие доступно только владельцу',403)}
export function networkRoutes(r:Runtime):Route[]{return [
 {method:'GET',path:'/api/network/exits',style:'J',handle:async ctx=>{owner(ctx);return json({ok:true,exits:await r.network.list()})}},
 {method:'POST',path:'/api/network/exits/:id/save',style:'J',handle:async ctx=>{owner(ctx);networkFields(ctx.body,['config','revision','password']);return json({ok:true,...await r.network.save(ctx.params.id!,ctx.body.config,ctx.body.revision,ctx.body.password)})}},
 {method:'POST',path:'/api/network/exits/:id/delete',style:'J',handle:async ctx=>{owner(ctx);networkFields(ctx.body,['revision']);await r.network.delete(ctx.params.id!,ctx.body.revision);return json({ok:true})}},
 {method:'GET',path:'/api/network/providers/:id',style:'J',handle:async ctx=>{owner(ctx);return json({ok:true,...await r.network.chain(ctx.params.id!)})}},
 {method:'POST',path:'/api/network/providers/:id',style:'J',handle:async ctx=>{owner(ctx);networkFields(ctx.body,['exits','revision']);return json({ok:true,...await r.network.saveChain(ctx.params.id!,ctx.body.exits,ctx.body.revision)})}},
 ]}
