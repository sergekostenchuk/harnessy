import {pyTruthy} from '@harnessy/team';
import {RuntimeError,type Runtime} from '@harnessy/runtime';
import type {Route} from './routes.ts';
import {OWNER,string} from './routes.ts';
import {json,slice,text} from './responses.ts';
const roles={role_taken:409,seat_exists:409};
export function ownerRoutes(r:Runtime):Route[]{return [
 {method:'POST',path:'/api/project',handle:async({body})=>json(await r.projectSet(string(body.path),{reload:pyTruthy(body.reload)},OWNER))},
 {method:'POST',path:'/api/project/create',handle:async({body})=>json(await r.projectCreate(body,OWNER))},
 {method:'POST',path:'/api/panes/:id',style:'E',handle:({params,body})=>json(r.paneSet(params.id!,body,OWNER))},
 {method:'GET',path:'/api/chats',handle:()=>json(r.chatsList(OWNER))},
 {method:'POST',path:'/api/chats/new',handle:async({body})=>json(await r.chatsNew(body,OWNER))},
 {method:'POST',path:'/api/chats/open',handle:async({body})=>json(await r.chatsOpen(body,OWNER))},
 {method:'GET',path:'/api/chats/:id',style:'E',handle:({params})=>json(r.chatGet(params.id!,OWNER))},
 {method:'GET',path:'/api/pins',handle:()=>json(r.pinsGet(OWNER))},
 {method:'POST',path:'/api/pins',handle:async({body})=>json(await r.pinSet(body,OWNER))},
 {method:'GET',path:'/api/settings',handle:()=>json(r.settingsGet(OWNER))},
 {method:'POST',path:'/api/settings',handle:async({body})=>json(await r.settingsPatch(body.scope,body.patch,OWNER))},
 {method:'GET',path:'/api/context/:id',handle:({params})=>r.registry.get(params.id!)?json(r.context(params.id!)):json({ok:false,error:'нет такого места'},404)},
 {method:'POST',path:'/api/halt',handle:async({body})=>json(await r.halt(body.on===undefined||pyTruthy(body.on),OWNER))},
 {method:'POST',path:'/api/room',handle:async({body})=>json(await r.roomSet(body,OWNER))},
 {method:'POST',path:'/api/room/move',handle:async({body})=>json(await r.roomMove(body,OWNER))},
 {method:'POST',path:'/api/assign',statuses:roles,handle:async({body})=>{const a=await r.assignRoomRole(body,OWNER);return json(a.replaced?{ok:true,pane:a.pane,chat:a.chat,replaced:true}:{ok:true,pane:a.pane,team:a.team,project:a.project,created:a.created})}},
 {method:'POST',path:'/api/seats',statuses:roles,handle:async({body})=>json(await r.createSeat(body,OWNER))},
 {method:'POST',path:'/api/onboard',handle:async({body})=>json(await r.onboard(string(body.pane),OWNER))},
 {method:'POST',path:'/api/handoff',handle:async({body})=>json(await r.handoff(body,OWNER))},
 {method:'POST',path:'/api/chat',style:'E',handle:({body})=>json(r.chat(body,OWNER))},
 {method:'POST',path:'/api/steer',style:'E',handle:async({body})=>json(await r.steer(string(body.pane),string(body.message),OWNER))},
 {method:'POST',path:'/api/approve',style:'E',handle:({body})=>json(r.approve(string(body.pane),string(body.id),body.decision==='allow'?'allow':'deny',OWNER))},
 {method:'POST',path:'/api/interrupt',style:'E',handle:({body})=>json(r.interrupt(string(body.pane),OWNER))},
 {method:'GET',path:'/api/sessions',style:'E',handle:async({query})=>{const id=query.get('pane')??'';if(!r.registry.get(id))throw new RuntimeError('pane_unknown','нет окна',400);try{return json({sessions:await r.listSessions(id)})}catch(e){return json({sessions:[],error:slice(text(e),300)})}}},
 {method:'POST',path:'/api/sessions/open',style:'E',statuses:{pane_unknown:400},handle:async({body})=>{try{return json(await r.openSession(string(body.pane),string(body.id),OWNER))}catch(e){if(e instanceof RuntimeError)throw e;return json({error:slice(text(e),300)},404)}}}
]}
