import {assignRoleAction} from './roles.ts';
import {Asks} from './ask.ts';
import {OwnerAcks} from './owner-acks.ts';
import {Merges} from './merge.ts';
import {afterTurn} from './after-turn.ts';
import {readActions} from './action-state.ts';
import type {RuntimeActions} from './types.ts';
export function createActions():RuntimeActions {
 const asks=new Asks(),acks=new OwnerAcks(),merges=new Merges();
 return {ask:(a,c)=>asks.ask(a,c),merge:(a,c)=>merges.merge(a,c),mergeOwner:(a,c)=>merges.merge(a,c),assignRole:assignRoleAction,afterTurn,
 async restorePendingAcks({runtime,project}){readActions(project);await merges.restore(runtime,project);acks.restore(runtime,project)},
 cancelAsks:scope=>asks.cancel(scope),closeProject:project=>{acks.close(project);asks.close(project)}};
}
export function withRoleActions(actions:RuntimeActions):RuntimeActions{return {...actions,assignRole:assignRoleAction}}
