import {randomUUID} from 'node:crypto';
import type {ConversationTransfer} from '@harnessy/context';
import type {Pane} from './pane.ts';
import type {ProjectState} from './types.ts';
import {timestampMessage,type TranscriptMessage} from './state.ts';
import {RuntimeError} from './errors.ts';

export interface ContextChange {
 id:string;project:string;chat:string;turnInstanceId:string;kind:'transfer'|'truncate'|'manual_summary'|'provider_compaction';
 before:number|null;after:number|null;source:string;ts:number;transfer?:ConversationTransfer&{turnInstanceId:string};sourceChat?:string;
}
export function contextChange(p:ProjectState,pane:Pane,input:Omit<ContextChange,'id'|'project'|'ts'>,ms:number):ContextChange {
 const chat=p.state.chats.chats[input.chat];
 if(!chat||chat.pane!==pane.id||!input.turnInstanceId)throw new RuntimeError('context_binding_invalid','изменение контекста не соответствует разговору',409);
 const tokens=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 return {...input,id:randomUUID(),project:p.dir,before:tokens(input.before),after:tokens(input.after),ts:ms/1000};
}
export function contextChangeText(change:ContextChange):string {
 return ({transfer:'Контекст перенесён',truncate:'Контекст перенесён · сокращён',manual_summary:'Ручная выжимка перенесена',provider_compaction:'Контекст сжат провайдером'})[change.kind];
}
export function contextChangeMessage(change:ContextChange):TranscriptMessage {
 return {...timestampMessage('peer','[от харнесс] '+contextChangeText(change),change.ts*1000),contextChanged:change};
}
// Persist before SSE; the receipt remains even when the surrounding turn fails.
export function appendContextChange(p:ProjectState,pane:Pane,change:ContextChange):void {
 if(p.closed||p.state.chats.active[pane.id]!==change.chat)throw new RuntimeError('context_binding_invalid','разговор изменения контекста сменился',409);
 const notice=contextChangeMessage(change);pane.append(notice);
 try{p.state.saveChats(p.registry)}catch(error){pane.transcript=pane.transcript.filter(m=>m!==notice);throw error}
 pane.publish({type:'contextChanged',change,chat:change.chat,turnInstanceId:change.turnInstanceId,seq:notice.seq,ts:change.ts});
}
