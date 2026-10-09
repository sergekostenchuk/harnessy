import type {IncomingMessage} from 'node:http';
import type {Reply} from './responses.ts';
export interface RequestContext {request:IncomingMessage;body:Record<string,unknown>;query:URLSearchParams;params:Record<string,string>}
export interface Route {method:'GET'|'POST';path:string;style?:'E'|'F'|'J';statuses?:Record<string,number>;handle(ctx:RequestContext):Reply|Promise<Reply>}
export const OWNER=Object.freeze({seat:'owner',trust:'owner'} as const);
export const string=(value:unknown)=>String(value||'');
export function integer(value:string|null,fallback:number):number {return value!==null&&/^\s*[+-]?\d+\s*$/u.test(value)&&Number.isSafeInteger(Number(value))?Number(value):fallback}
