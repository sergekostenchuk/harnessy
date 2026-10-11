import {isAbsolute,join,basename} from 'node:path';
import {MODE_IDS,pyTruthy,type Mode,type Vendor} from '@harnessy/team';
import {initProject,uniqueProject,projectsRoot,projectNameFrom,expandUser} from '@harnessy/projects';
import {transcriptText} from '@harnessy/context';
import {pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError,message} from './errors.ts';
import {Pane,validDir} from './pane.ts';
import {owner,free,reserve,same} from './operations.ts';
import {chatSnapshot,assignConversation,roomWithoutProject,type CreateSeatInput} from './roles.ts';
import {jsonClone,conversationHistory,type Chat} from './state.ts';
import {meta} from './chats.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';

export function vendorOf(p:Pick<ProjectState,'registry'>,model:string):Vendor|null {
 return (['claude','codex'] as const).find(v=>p.registry.providers.has(v)&&p.registry.models[v]?.some(m=>m.id===model))??null;
}
export function makeRoomIn(p:Pick<ProjectState,'registry'|'dir'|'bus'>,runtime:Runtime,model:string|null,mode:string,vendor?:Vendor):Pane|null {
 const selected=vendor??(model?vendorOf(p,model):p.registry.providers.has('claude')?'claude':p.registry.providers.has('codex')?'codex':'claude');if(!selected||!MODE_IDS.includes(mode as Mode))return null;
 const old=p.registry.get('room'),room=new Pane({id:'room',vendor:selected,label:'без роли',role:'room',model:model||'',mode:mode as Mode,cwd:p.dir},p.bus,runtime.clock);
 if(old){room.transcript=old.transcript;room.carry=old.carry;if(old.vendor===selected&&old.model===model)room.sessionId=old.sessionId;room.revision=old.revision+1}
 p.registry.panes.set('room',room);return room;
}
export function makeRoom(runtime:Runtime,model:string,mode:string,initiator:Initiator) {
 const p=owner(runtime,initiator),old=p.registry.get('room');if(old)free(p,old,'разговор без роли сейчас отвечает');
 const room=makeRoomIn(p,runtime,model,mode);if(!room)throw new RuntimeError('model_unknown','не удалось создать разговор без роли',400);
 p.state.savePanes(p.registry,p.journal);void runtime.kick('room');return room.settings();
}
export function roomSet(runtime:Runtime,input:{model?:unknown;folder?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),model=pythonTrim(String(input.model||''));if(!model||!vendorOf(p,model))throw new RuntimeError('model_unknown','модель не из каталога',400);
 return {ok:true as const,pane:makeRoom(runtime,model,input.folder===undefined||pyTruthy(input.folder)?'read':'chat',initiator)};
}
function moveInput(p:ProjectState,source:Chat):Chat {
 const text=transcriptText(source.transcript),carry=text&&!source.carry.endsWith(text)?(source.carry?source.carry+'\n\n':'')+text:source.carry;
 return jsonClone({...source,cwd:p.dir,sessionId:null,carry});
}
function transferRoom(runtime:Runtime,p:ProjectState,source:Chat,mode:string,failure:string):Pane {
 const room=p.registry.get('room')??makeRoomIn(p,runtime,source.model,mode,source.vendor as Vendor);if(!room)throw new RuntimeError('room_missing',failure,400);
 const moved=source.cwd!==p.dir,copy=moved?moveInput(p,source):source;
 // The active chat of the destination folder is independent of the source chat.
 p.state.newChat(room);room.transcript=conversationHistory(copy.transcript);room.carry=copy.carry;room.sessionId=!moved&&source.vendor===room.vendor?source.sessionId:null;
 p.state.savePanes(p.registry,p.journal);return room;
}
function initDeps(runtime:Runtime,p:ProjectState,room:Pane){return {...(runtime.deps.gitops?{gitops:runtime.deps.gitops}:{}),catalog:p.registry.models,roomModel:room.model,settings:runtime.settings.effective(),vendorOf:(model:string)=>vendorOf(p,model)}}
export async function roomMove(runtime:Runtime,input:{path?:unknown;create?:unknown;git?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),room=p.registry.get('room');if(!room?.model)throw new RuntimeError('room_missing','нет разговора без роли',400);
 const requested=expandUser(pythonTrim(String(input.path||'')));if(pyTruthy(input.create)&&(!requested||!isAbsolute(requested)))throw new RuntimeError('path_invalid','нужен абсолютный путь папки',400);
 if(!requested)throw new RuntimeError('path_invalid','папки нет: '+requested,400);
 const path=runtime.projectPath(requested),hold=reserve(p,[...p.registry.panes.values()],'идёт ход: переезд, когда все окна свободны',true),source=chatSnapshot(p,room);
 try {
  if(pyTruthy(input.create)){
   try{await initProject(path,{git:input.git===undefined||pyTruthy(input.git),model:room.model,orchestrator:false},initDeps(runtime,p,room))}catch(e){throw new RuntimeError('project_failed','проект не создан: '+message(e),400,{cause:e})}
  }
  same(runtime,p);if(!validDir(path))throw new RuntimeError('path_invalid','папки нет: '+path,400);
  await runtime.openProject(path,{expected:p,initialize:next=>{transferRoom(runtime,next,source,'read','разговор без роли не создан в новой папке')}});
  const next=runtime.project,newRoom=next.registry.get('room')!;return {ok:true as const,project:next.dir,pane:newRoom.settings(),carried:!!source.transcript.length};
 }finally{hold.release()}
}
export async function assignRoomRole(runtime:Runtime,input:CreateSeatInput,initiator:Initiator) {
 const p=owner(runtime,initiator),role=String(input.role||'');
 if(role!=='orchestrator')throw new RuntimeError('proposal_required','участников создаёт оркестратор по подтверждённому предложению',409);
 const room=p.registry.get('room');if(!room?.model)throw new RuntimeError('room_missing','нет разговора без роли — назначать нечему',400);
 free(p,room,'разговор сейчас отвечает — назначьте роль после ответа',roomWithoutProject(runtime,p));
 const source=chatSnapshot(p,room);let how='владельцем из разговора без роли (разговор продолжается в этой роли)';
 if(roomWithoutProject(runtime,p)){
  if(role!=='orchestrator')throw new RuntimeError('no_project','без проекта доступен только оркестратор — он создаст проект по разговору',400);
  const hold=reserve(p,[...p.registry.panes.values()],'идёт ход: создать проект можно, когда все окна свободны',true);
  try{
   let path:string;
   try{const root=projectsRoot(runtime.settings.effective()),name=projectNameFrom(source.transcript,()=>new Date(runtime.clock.now()));path=(await uniqueProject(root,name,{git:true,model:room.model,orchestrator:false},initDeps(runtime,p,room))).path}
   catch(e){throw new RuntimeError('project_failed','проект не создан: '+message(e),400,{cause:e})}
   same(runtime,p);how='из разговора без проекта — проект «'+basename(path)+'» создан по этому разговору: git, .harness (команда, политика, журнал), память MEMORY.md';
   let result!:Awaited<ReturnType<typeof assignConversation>>;
   await runtime.openProject(path,{expected:p,initialize:async next=>{
    const nextRoom=transferRoom(runtime,next,source,String(runtime.settings.effective().defaultMode||'read'),'разговор не перенесён в новый проект');
    result=await assignConversation(runtime,next,input,chatSnapshot(next,nextRoom),how);
   }});
   const next=runtime.project;return {ok:true as const,pane:result.result.pane.settings(),chat:meta(next,result.result.chat),team:join(next.dir,'.harness','team.yaml'),project:next.dir,created:true,replaced:result.replaced};
  }finally{hold.release()}
 }
 // Reserve the source while the project lock is queued. The locked operation rechecks the target.
 const hold=reserve(p,[room]);try{
  const result=await assignConversation(runtime,p,input,source,how);same(runtime,p);
  return {ok:true as const,pane:result.result.pane.settings(),chat:meta(p,result.result.chat),team:join(p.dir,'.harness','team.yaml'),project:p.dir,created:false,replaced:result.replaced};
 }finally{hold.release()}
}
