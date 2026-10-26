export const KINDS=['task','status','question','answer','review-request','verdict','blocker','escalation','note','stop','resume','digest','proposal','decision','report'] as const;
export const SYSTEM_KINDS=['protocol','rejected','policy','ack'] as const;
export const REPLY_KIND={question:'answer',task:'status','review-request':'verdict'} as const;
export type Kind=typeof KINDS[number];
export const IMAGE_MIMES=['image/png','image/jpeg','image/webp','image/gif'] as const;
export type ImageMime=typeof IMAGE_MIMES[number];
export const ATTACHMENT_MAX_BYTES=10*1024*1024,ATTACHMENT_MAX_COUNT=8;
export interface AttachmentRef {id:string;mime:ImageMime;size:number;w:number;h:number}
export type JournalCode='kind_unknown'|'to_invalid'|'to_unknown'|'self_addressed'|'text_empty'|'text_too_long'|'attachments_invalid'|'reply_to_missing'|'evidence_invalid'|'score_invalid'|'round_invalid'|'reply_to_required'|'sha_required'|'sha_unknown'|'evidence_required'|'evidence_outside'|'evidence_missing'|'evidence_contract'|'policy_denied'|'ack_not_pending'|'ack_closed'|'write_failed'|'initiator_invalid'|'before_invalid';
export class JournalError extends Error {
 readonly code:JournalCode;readonly maybeWritten?:true;
 constructor(code:JournalCode,message:string,maybeWritten?:true){super(message);this.name='JournalError';this.code=code;if(maybeWritten)this.maybeWritten=maybeWritten}
}
export interface AttemptDecision {pane:string;turnInstanceId:string;action:'retry'|'skip'|'finish';network?:'direct_once';autopilot?:{model:string;vendor:string};unsent?:true;deliverySeq:number|null;done:boolean}
export interface Record_ {seq:number;id:string;ts:string;from:string;to:string[];kind:string;thread:string|null;reply_to:number|null;text:string;evidence:string[];attachments?:AttachmentRef[];policy:number;score?:number;round?:number;origin?:string;accepted?:boolean;bounds?:Bounds|null;ack?:'pending';sha?:string;merged?:string;version?:number;kinds?:string[];attempt?:AttemptDecision}
export type Bounds=Readonly<Record<string,unknown>>;
export interface DeliveryEntry {record:Record_;deliverySeq:number}
export interface AppendInput {sender:string;to:string|string[];kind:string;text:string;thread?:string|null;reply_to?:number|null;evidence?:string[]|null;attachments?:AttachmentRef[]|null;policy?:number;score?:number|null;round?:number|null;origin?:string|null;accepted?:boolean|null;bounds?:Bounds|null;ack?:'pending'|null;sha?:string|null;merged?:string|null;attempt?:AttemptDecision}
export interface Initiator {seat:string;trust:'owner'|'harness'|'agent';source?:'autopilot'}
export interface AgentPostInput {to:string|string[];kind:Kind;text:string;thread?:string|null;reply_to?:number|null;evidence?:string[]|null;score?:number;round?:number;sha?:string}
export interface CorePostInput extends Omit<AgentPostInput,'kind'> {kind:Kind|typeof SYSTEM_KINDS[number];origin?:string;merged?:string;attachments?:AttachmentRef[]}
export interface ThreadState {rounds:number;accepted:boolean;lastScore:number|null;sha:string|null;merged:string|null}
export interface Route {from:readonly string[];to:readonly string[];kinds:'*'|readonly string[];trigger:string|null;bounds:Bounds|null;n:number}
export interface Decision {allow:boolean;pending:boolean;reason:string;route:Route|null;bounds:Bounds;trigger:string|null}
export interface PolicyView {version:number;default:string;routes:readonly Route[];observe:Readonly<Record<string,'*'|readonly string[]>>;routeFor(from:string,to:string,kind:string):Route|null;allowedKinds(from:string,to:string):string[];checkSend(from:string,to:string,kind:string):Decision;canObserve(role:string,targetRole:string):boolean;summaryFor(role:string,seatRoles:Record<string,string>,labels:Record<string,string>):string}
export type ChannelEvent={type:'posted';record:Record_;initiator:Initiator}|{type:'delivered';record:Record_;deliverySeq:number}|{type:'pendingAck';record:Record_}|{type:'rejected';record:Record_;sender:string;reason:string}|{type:'verdict';record:Record_;thread:ThreadState};
export function object(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v)}
export function normalizeAttachments(value:unknown):AttachmentRef[] {
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.length>ATTACHMENT_MAX_COUNT)throw new JournalError('attachments_invalid','в сообщении может быть не больше '+ATTACHMENT_MAX_COUNT+' изображений');
 const normalized=value.map(raw=>{
  if(!object(raw)||Object.keys(raw).some(k=>!['id','mime','size','w','h'].includes(k))||typeof raw.id!=='string'||!/^[0-9a-f]{64}$/.test(raw.id)||!IMAGE_MIMES.includes(raw.mime as ImageMime)||!Number.isSafeInteger(raw.size)||Number(raw.size)<1||Number(raw.size)>ATTACHMENT_MAX_BYTES||!Number.isSafeInteger(raw.w)||Number(raw.w)<1||!Number.isSafeInteger(raw.h)||Number(raw.h)<1)throw new JournalError('attachments_invalid','неверная ссылка на изображение');
  return {id:raw.id,mime:raw.mime as ImageMime,size:Number(raw.size),w:Number(raw.w),h:Number(raw.h)};
 });
 if(new Set(normalized.map(ref=>ref.id)).size!==normalized.length)throw new JournalError('attachments_invalid','изображение указано повторно');
 return normalized;
}
export function freeze<T>(value:T,seen=new WeakSet<object>()):T {
 if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const item of Object.values(value))freeze(item,seen);Object.freeze(value)}return value
}
export function normalizeReplyTo<T extends {reply_to?:number|null}>(input:T):T {return {...input,...(input.reply_to===0?{reply_to:null}:{})}}
