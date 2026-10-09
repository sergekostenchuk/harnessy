import {assignRoleAction} from './roles.ts';
import type {RuntimeActions} from './types.ts';
const unavailable=(name:string)=>Promise.resolve({ok:false as const,code:'unavailable',error:'действие недоступно: '+name});
export const unavailableActions:RuntimeActions={
 ask:()=>unavailable('ask'),merge:()=>unavailable('merge'),assignRole:()=>unavailable('assign_role'),
 async afterTurn({pane}){pane.recoveryNote='обработка после хода недоступна в этой сборке';pane.publish({type:'note',text:pane.recoveryNote});return 'unavailable'},
 async restorePendingAcks({project}){if(project.channel.pendingAcks().length){const text='восстановление карточек подтверждения недоступно в этой сборке';if(!project.lineErrors.includes(text))project.lineErrors.push(text);project.owner.publish({type:'error',message:text,sessionId:null})}},
 cancelAsks(){}
};

export function withRoleActions(actions:RuntimeActions):RuntimeActions{return {...actions,assignRole:assignRoleAction}}
