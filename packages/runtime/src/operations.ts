import {turnFailure} from './turn-failure.ts';
import {withPathLock} from '@harnessy/team';
import type {Initiator} from '@harnessy/journal';
import {RuntimeError} from './errors.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState,Waiting} from './types.ts';
import type {Pane} from './pane.ts';

export function owner(runtime:Runtime,initiator:Initiator):ProjectState {
 if(initiator?.seat!=='owner'||initiator.trust!=='owner')throw new RuntimeError('policy_denied','действие доступно только владельцу',403);
 return runtime.project;
}
export function same(runtime:Runtime,p:ProjectState):void {
 if(p.closed)throw new RuntimeError('project_changed','проект сменился',409);
 if(runtime.project!==p)throw new RuntimeError('project_changed','проект сменился',409);
}
export function place(p:ProjectState,id:string,text='нет такого места'):Pane {
 const pane=p.registry.get(id);if(!pane)throw new RuntimeError('pane_unknown',text,404);return pane;
}
export function waiting(p:ProjectState,pane:Pane):Waiting|null {
 const attempt=p.state.attempts[pane.id],turns=attempt?p.state.activeChat(pane,false)?.turns:undefined,failed=Array.isArray(turns)?turns.find(t=>t?.turnInstanceId===attempt?.turnInstanceId):undefined;
 const failure=attempt?.unsent?.failure??(failed?turnFailure({code:failed.errorCode,message:failed.failure?.reason??'Причина отказа не была сохранена'},p.dir,failed.failure?.durationMs??failed.durationMs??0):undefined);
 if(pane.status==='uncertain'&&attempt)return {...(failure?{failure}:{}),queuedSeqs:p.journal.pendingFor(pane.id).filter(r=>!attempt.recordSeqs.includes(r.record.seq)).map(r=>r.record.seq),status:attempt.unsent?'unsent':'uncertain',...(attempt.unsent?{messages:attempt.recordSeqs.map(seq=>({seq,text:p.journal.get(seq)?.text??'Сообщение с изображением'}))}:{}),recordSeqs:[...attempt.recordSeqs],startedAt:attempt.startedAt,turnInstanceId:attempt.turnInstanceId,actions:p.state.deliveryBoundary(pane.id,p.journal,attempt)===null?['retry']:['retry','skip']};
 if(pane.status==='recovering'){const result=p.state.results(pane).find(r=>r.runtime?.effectsPending||p.state.undurable.has(r.runtime?.turnInstanceId));if(result&&typeof result.runtime?.turnInstanceId==='string')return {status:'recovering',recordSeqs:Array.isArray(result.runtime.recordSeqs)?[...result.runtime.recordSeqs]:[],startedAt:null,turnInstanceId:result.runtime.turnInstanceId,actions:['finish']}}
 return null
}
export function waitingError(p:ProjectState,pane:Pane):RuntimeError {
 const info=waiting(p,pane),seqs=info?.recordSeqs??[],records=seqs.length?' по записи '+(seqs.length===1?'#'+seqs[0]:'#'+seqs[0]+'–#'+seqs.at(-1)):'';
 const text=info?.status==='unsent'?'Не отправлено: '+(info.failure?.reason??'причина не сохранена'):pane.status==='uncertain'?info?.turnInstanceId.startsWith('unreadable:')?'место «'+pane.label+'»: состав прежней попытки неизвестен: attempts.json повреждён; модель получит всю очередь места заново — выберите «Повторить»':'место «'+pane.label+'» ждёт итога хода'+records+': '+(info?.actions.includes('skip')?'выберите «Повторить» или «Пропустить»':'граница прежней доставки неизвестна; выберите «Повторить», модель получит всю очередь места заново'): 'место «'+pane.label+'»: ответ'+records+' сохранён, завершаются местные действия; если не завершаются — «Повторить восстановление»';
 return new RuntimeError(pane.status==='uncertain'?'uncertain':'recovering',text,409,{fields:{pane:pane.id,project:p.dir,waiting:info}})
}
export function free(p:ProjectState,pane:Pane,text='место сейчас отвечает — дождитесь ответа',changingProject=false):void {
 if(pane.busy||p.editing.has(pane.id)||p.materializing.has(pane.id))throw new RuntimeError('busy',text,409);
 if(changingProject)return;
 if(p.restoreFailed.has(pane.id))throw new RuntimeError('restore_failed','место «'+pane.label+'»: '+p.restoreFailed.get(pane.id)+'; повторите восстановление проекта',409,{fields:{pane:pane.id,project:p.dir}});
 if(pane.status!=='idle')throw waitingError(p,pane);
}
export function reserve(p:ProjectState,panes:readonly Pane[],text?:string,changingProject=false):{token:symbol;release:()=>void} {
 for(const pane of panes)free(p,pane,text,changingProject);
 const token=Symbol('owner operation');for(const pane of panes)p.editing.set(pane.id,token);
 return {token,release(){for(const pane of panes)if(p.editing.get(pane.id)===token)p.editing.delete(pane.id)}};
}
export function locked<T>(runtime:Runtime,p:ProjectState,fn:()=>T):Promise<T> {
 return withPathLock(p.dir,()=>{same(runtime,p);return fn()});
}
