import type {AskArgs,MergeArgs,AssignRoleArgs} from '@harnessy/providers';
import type {Runtime,BridgeSendArgs,BridgeFailure} from '@harnessy/runtime';
import type {Reply} from './responses.ts';
import {json} from './responses.ts';
import {header} from './security.ts';
import {OWNER,integer,string,type Route} from './routes.ts';
export function bridgeReply(result:{ok:true}|BridgeFailure,denied:number):Reply{return json(result,result.ok?200:['token_invalid','turn_ended'].includes(result.code)?403:result.code==='write_failed'?500:['recovering','uncertain','merge_uncertain','project_changed','stale_session','ack_closed'].includes(result.code)?409:denied)}
export function bridgeRoutes(r:Runtime):Route[]{return [
 ...(['send','ask','merge','assign_role'] as const).map((name):Route=>({method:'POST',path:'/api/'+name,style:'J',handle:async({request,body})=>{
 const scope=r.validateBridge(string(body.from),header(request,'x-pane-token'));const {from:_,...args}=body;
 const result=name==='send'?await r.send(scope,args as unknown as BridgeSendArgs):name==='ask'?await r.ask(scope,args as unknown as AskArgs):name==='merge'?await r.merge(scope,args as unknown as MergeArgs):await r.assignRole(scope,args as unknown as AssignRoleArgs);
 return bridgeReply(result,name==='send'?400:name==='assign_role'?403:409)
 }})),
 {method:'POST',path:'/api/owner/merge',style:'J',handle:async({body})=>bridgeReply(await r.mergeOwner({sha:string(body.sha),...(body.message?{message:string(body.message)}:{})},OWNER),409)},
 {method:'GET',path:'/api/pane_transcript',style:'J',handle:async({request,query})=>{const scope=r.validateBridge(query.get('from')??'',header(request,'x-pane-token'));return bridgeReply(await r.readPane(scope,{pane:query.get('pane')??'',last_n:Math.max(1,Math.min(100,integer(query.get('last'),20)))}),403)}}
]}
