import type {IncomingMessage} from 'node:http';
import type {Readable,Duplex} from 'node:stream';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import {parseCompat} from '@harnessy/journal';
import {HttpError,json,plain} from './responses.ts';
export const BODY_LIMIT=2_000_000;
export const ATTACHMENT_BODY_LIMIT=14_100_000;
const errors={host_denied:'запрос не с локального адреса окна',origin_denied:'запрос с чужой страницы отклонён',content_type:'тело запроса должно быть application/json'};
export function header(request:IncomingMessage,key:string):string {const value=request.headers[key.toLowerCase()];return typeof value==='string'?value:''}
export function checkBrowser(request:IncomingMessage,path:string,port:number):void {
 if(!path.startsWith('/api/'))return;
 const hosts=['localhost:'+port,'127.0.0.1:'+port,'[::1]:'+port],deny=(code:keyof typeof errors,status:number):never=>{throw new HttpError(json({ok:false,code,error:errors[code]},status))};
 if(!hosts.includes(header(request,'host')))deny('host_denied',403);
 const method=request.method??'GET',mutating=method==='POST'||['GET','HEAD'].includes(method)&&path.startsWith('/api/sessions/');if(!mutating)return;
 const origin=request.headers.origin;if(origin!==undefined&&(typeof origin!=='string'||!hosts.map(h=>'http://'+h).includes(origin)))deny('origin_denied',403);
 if(origin===undefined&&['cross-site','same-site'].includes(header(request,'sec-fetch-site').toLowerCase()))deny('origin_denied',403);
 if(method==='POST'&&header(request,'content-type').split(';')[0]!.trim().toLowerCase()!=='application/json')deny('content_type',415)
}
export async function readBody(request:IncomingMessage,limit=BODY_LIMIT):Promise<Record<string,unknown>> {
 const tooLarge=()=>limit===ATTACHMENT_BODY_LIMIT?new HttpError(json({ok:false,code:'attachment_too_large',error:'изображение больше 10 МБ'},413)):new HttpError(plain('Maximum request body size '+limit+' exceeded.',413));
 const encoding=header(request,'content-encoding').trim().toLowerCase();let stream:Readable=request,decoder:Duplex|undefined;
 if(encoding&&encoding!=='identity'){
 decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():undefined;
 if(!decoder)throw new HttpError(plain('415: Unsupported Media Type',415));request.pipe(decoder);stream=decoder
 }
 const chunks:Buffer[]=[];let size=0;
 const upstreamError=(e:Error)=>decoder?.destroy(e);request.on('error',upstreamError);
 try{for await(const value of stream.iterator({destroyOnReturn:false})){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);size+=bytes.length;if(size>limit)throw tooLarge();chunks.push(bytes)}
 const raw:unknown=parseCompat(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('shape');return raw as Record<string,unknown>
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(json({error:'тело не JSON-объект'},400))}
 finally{request.off('error',upstreamError);if(decoder){request.unpipe(decoder);decoder.destroy()}if(!request.readableEnded&&!request.destroyed)request.resume()}
}
