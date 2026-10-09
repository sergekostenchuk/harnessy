import {RuntimeError,object} from './errors.ts';
import type {ProjectState} from './types.ts';
export interface ReviewAction {sid:string;reviewSeq:number;firstTurnInstanceId:string;stage:'awaiting'|'nudged'|'escalated'|'closed'}
export interface MergeAction {
 key:string;stage:'intent'|'completed'|'failed'|'uncertain';sha:string;branch:string;message:string;beforeHead:string;alreadyMerged:boolean;
 initiator:{seat:string;trust:'owner'|'agent';role:string;label:string};verdict:{seq:number;thread:string;score:number};
 result?:{sha:string;mergeSha:string};error?:string;
}
export interface ActionState {reviews:ReviewAction[];merges:MergeAction[]}
const full=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const seq=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
export function readActions(p:ProjectState):ActionState {
 const raw=p.state.readActions(),fail=():never=>{throw new RuntimeError('actions_invalid','действия не читаются: неверная форма actions.json',409)};
 if(!object(raw)||!Array.isArray(raw.reviews)||!Array.isArray(raw.merges))return fail();
 const reviews=raw.reviews,merges=raw.merges;
 if(reviews.some(r=>!object(r)||typeof r.sid!=='string'||!r.sid||!seq(r.reviewSeq)||typeof r.firstTurnInstanceId!=='string'||!r.firstTurnInstanceId||!['awaiting','nudged','escalated','closed'].includes(String(r.stage))))return fail();
 if(new Set(reviews.map(r=>r.sid+':'+r.reviewSeq)).size!==reviews.length)return fail();
 for(const r of reviews){const source=p.journal.get(r.reviewSeq);if(!source||source.kind!=='review-request'||!source.to.includes(r.sid))return fail()}
 for(const m of merges){
 if(!object(m)||!full(m.sha)||!full(m.beforeHead)||typeof m.branch!=='string'||!m.branch||m.branch.startsWith('-')||typeof m.message!=='string'||typeof m.alreadyMerged!=='boolean'||m.key!==m.branch+':'+m.sha||!['intent','completed','failed','uncertain'].includes(String(m.stage)))return fail();
 if(!object(m.initiator)||typeof m.initiator.seat!=='string'||!m.initiator.seat||typeof m.initiator.label!=='string'||!m.initiator.label||typeof m.initiator.role!=='string'||!m.initiator.role||!['owner','agent'].includes(String(m.initiator.trust))||(m.initiator.trust==='owner'?m.initiator.seat!=='owner'||m.initiator.role!=='owner':['owner','harness'].includes(m.initiator.seat)))return fail();
 if(!object(m.verdict)||!seq(m.verdict.seq)||typeof m.verdict.thread!=='string'||typeof m.verdict.score!=='number')return fail();
 const verdict=p.journal.get(Number(m.verdict.seq));if(!verdict||verdict.kind!=='verdict'||!verdict.accepted||verdict.sha!==m.sha||(verdict.thread||'без треда')!==m.verdict.thread||verdict.score!==m.verdict.score||verdict.ack==='pending'&&p.channel.ackDecision(verdict.seq)?.kind!=='ack')return fail();
 if(m.stage==='completed'&&(!object(m.result)||m.result.sha!==m.sha||!full(m.result.mergeSha)))return fail();
 if(m.result!==undefined&&(!object(m.result)||m.result.sha!==m.sha||!full(m.result.mergeSha)))return fail();
 if(['failed','uncertain'].includes(String(m.stage))&&typeof m.error!=='string')return fail();
 }
 if(new Set(merges.map(m=>m.key)).size!==merges.length)return fail();
 return raw as unknown as ActionState;
}
export function saveReview(p:ProjectState,r:ReviewAction):void {const state=readActions(p),at=state.reviews.findIndex(a=>a.sid===r.sid&&a.reviewSeq===r.reviewSeq);if(at<0)state.reviews.push(r);else state.reviews[at]=r;p.state.saveActions(state)}
export function saveMerge(p:ProjectState,m:MergeAction):void {const state=readActions(p),at=state.merges.findIndex(a=>a.key===m.key);if(at<0)state.merges.push(m);else state.merges[at]=m;p.state.saveActions(state)}
