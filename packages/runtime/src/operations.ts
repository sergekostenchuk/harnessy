import {withPathLock} from '@harnessy/team';
import type {Initiator} from '@harnessy/journal';
import {RuntimeError} from './errors.ts';
import type {Runtime} from './runtime.ts';
import type {ProjectState} from './types.ts';
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
export function free(p:ProjectState,pane:Pane,text='место сейчас отвечает — дождитесь ответа'):void {
 if(pane.busy||p.editing.has(pane.id))throw new RuntimeError('busy',text,409);
 if(pane.status!=='idle'||p.materializing.has(pane.id))throw new RuntimeError(pane.status==='uncertain'?'uncertain':'recovering','ответ модели сохранён; завершается восстановление доставки',409);
}
export function reserve(p:ProjectState,panes:readonly Pane[],text?:string):{token:symbol;release:()=>void} {
 for(const pane of panes)free(p,pane,text);
 const token=Symbol('owner operation');for(const pane of panes)p.editing.set(pane.id,token);
 return {token,release(){for(const pane of panes)if(p.editing.get(pane.id)===token)p.editing.delete(pane.id)}};
}
export function locked<T>(runtime:Runtime,p:ProjectState,fn:()=>T):Promise<T> {
 return withPathLock(p.dir,()=>{same(runtime,p);return fn()});
}
