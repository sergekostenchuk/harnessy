import {executeCli} from '@harnessy/providers';
import {KEYCHAIN_SCRIPT} from './keychain-script.ts';
import {validRoute,isObject} from './config.ts';
import {LlmError} from './errors.ts';
export interface KeyDescription {present:boolean;mask:string|null;updatedAt:number|null}
export interface KeyStore {put(keyRef:string,secret:string):Promise<void>;delete(keyRef:string):Promise<void>;describe(keyRef:string):Promise<KeyDescription>;resolveKey(keyRef:string):Promise<string|null>}
export class MacKeyStore implements KeyStore {
 private execute:typeof executeCli;private platform:string;
 constructor(options:{execute?:typeof executeCli;platform?:string}={}){this.execute=options.execute??executeCli;this.platform=options.platform??process.platform}
 private async request(op:'get'|'put'|'delete',id:string,key?:string){
  if(!validRoute(id)||op==='put'&&(typeof key!=='string'||! /^[\x21-\x7e]{8,4096}$/.test(key)))throw new LlmError('config_invalid');
  if(this.platform!=='darwin')throw new LlmError('credential_unavailable');let value:unknown;
  try{const result=await this.execute({binary:'/usr/bin/osascript',args:['-l','JavaScript','-e',KEYCHAIN_SCRIPT],input:JSON.stringify({op,provider:id,...(key?{key}:{})}),cwd:'/',env:{PATH:process.env.PATH},timeoutMs:15000,maxBytes:16384},AbortSignal.timeout(15000));if(result.code!==0||result.signal)throw Error();value=JSON.parse(result.stdout)}catch{throw new LlmError('credential_unavailable')}
  if(!isObject(value)||value.ok!==true)throw new LlmError('credential_unavailable');return value.value;
 }
 private async read(id:string){const value=await this.request('get',id);if(value===null)return null;if(!isObject(value)||typeof value.key!=='string'||!/^[\x21-\x7e]{8,4096}$/.test(value.key)||!Number.isSafeInteger(value.updatedAt)||Number(value.updatedAt)<0)throw new LlmError('credential_unavailable');return {key:value.key,updatedAt:Number(value.updatedAt)}}
 async put(id:string,key:string){await this.request('put',id,key)}
 async delete(id:string){await this.request('delete',id)}
 async describe(id:string):Promise<KeyDescription>{const v=await this.read(id);return v?{present:true,mask:'••••••••'+v.key.slice(-4),updatedAt:v.updatedAt}:{present:false,mask:null,updatedAt:null}}
 async resolveKey(id:string){return (await this.read(id))?.key??null}
}
