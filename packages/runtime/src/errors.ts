export class RuntimeError extends Error {
 readonly code:string;readonly status:number;
 constructor(code:string,message:string,status=409,options?:ErrorOptions){super(message,options);this.code=code;this.status=status;this.name='RuntimeError'}
}
export const message=(e:unknown)=>e instanceof Error?e.message:String(e);
export const slice=(s:string,n:number)=>[...s].slice(0,n).join('');
export const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function deepFreeze<T>(v:T):T {if(v&&typeof v==='object'){for(const x of Object.values(v))deepFreeze(x);Object.freeze(v)}return v}
