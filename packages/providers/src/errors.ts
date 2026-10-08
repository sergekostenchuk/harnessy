import {ProviderError,type Vendor,type ErrorCode,record} from './types.ts';
import {VENDOR_ERRORS} from './vendor-errors.ts';
export function vendorError(vendor:Vendor,text:string,method?:string,info?:unknown,sessionId:string|null=null):ProviderError{
 const kind=record(info)?info.codexErrorInfo:info;
 let code:ErrorCode='turn_failed';
 if(vendor==='codex'&&method==='thread/resume')code='session_missing';
 else if(vendor==='codex'&&(kind==='badRequest'||kind==='unauthorized')&&/model/i.test(text))code='model_unsupported';
 else for(const row of VENDOR_ERRORS)if(row.vendor===vendor&&text.includes(row.text)){code=row.code;break}
 return new ProviderError(code,text,sessionId);
}
export function asError(e:unknown,sessionId:string|null=null):ProviderError{
 if(e instanceof ProviderError){e.sessionId??=sessionId;return e}
 return new ProviderError('turn_failed',e instanceof Error?e.message:String(e),sessionId);
}
export function requireRecord(v:unknown,label:string):Record<string,unknown>{
 if(!record(v))throw new ProviderError('protocol','invalid '+label);return v
}
