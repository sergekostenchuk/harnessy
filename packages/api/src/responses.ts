import type {ServerResponse} from 'node:http';
import {compatJson,JournalError} from '@harnessy/journal';
import {ProjectError} from '@harnessy/projects';
import {ProviderError} from '@harnessy/providers';
import {RuntimeError} from '@harnessy/runtime';
import {TeamError} from '@harnessy/team';
export interface Reply {status:number;value:unknown;plain?:boolean;headers?:Record<string,string>}
export const json=(value:unknown,status=200):Reply=>({status,value});
export const plain=(value:string,status:number,headers?:Record<string,string>):Reply=>({status,value,plain:true,...(headers?{headers}:{})});
export class HttpError extends Error {readonly reply:Reply;constructor(reply:Reply){super(typeof reply.value==='string'?reply.value:'HTTP '+reply.status);this.reply=reply}}
export const text=(error:unknown)=>error instanceof Error?error.message:String(error);
export const slice=(value:string,n:number)=>[...value].slice(0,n).join('');
export function pythonJson(value:unknown,ascii=true):string {const raw=compatJson(value);return ascii?raw.replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')):raw}
const lifecycle=new Set(['recovering','uncertain','merge_uncertain','stale_session','project_changed','steer_failed','ack_closed','actions_invalid','project_closed','restore_failed','stale_attempt','not_waiting','decision_exists','decision_invalid']);
export function failure(error:unknown,style:'E'|'F'|'J'='F',statuses:Record<string,number>={}):Reply {
 if(error instanceof HttpError)return error.reply;
 const code=error instanceof RuntimeError||error instanceof ProjectError||error instanceof JournalError||error instanceof ProviderError||error instanceof TeamError?error.code:'internal_error';
 const status=statuses[code]??(code==='write_failed'?500:lifecycle.has(code)?409:error instanceof RuntimeError||error instanceof ProjectError?error.status:error instanceof JournalError||error instanceof TeamError?400:error instanceof ProviderError?404:500);
 if(code==='direct_required'||code==='selection_required')return json({ok:false,...(error instanceof RuntimeError?error.fields:{}),error:text(error)},status);
 if(['kind_invalid','proposal_required','model_required'].includes(code)||lifecycle.has(code)||style==='J'||code==='path_is_root'||error instanceof JournalError||code==='write_failed'&&error instanceof RuntimeError)return json({ok:false,code,error:text(error),...(error instanceof RuntimeError?error.fields:{})},error instanceof RuntimeError&&error.code==='write_failed'?error.status:status);
 return json(style==='E'?{error:text(error)}:{ok:false,error:text(error)},status)
}
export function writeReply(res:ServerResponse,reply:Reply,head=false){
 const body=reply.plain?String(reply.value):pythonJson(reply.value);res.writeHead(reply.status,{'Content-Type':reply.plain?'text/plain; charset=utf-8':'application/json; charset=utf-8','Content-Length':String(Buffer.byteLength(body)),...reply.headers});res.end(head?undefined:body)
}
