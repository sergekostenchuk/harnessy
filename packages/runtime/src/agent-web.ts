import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP,type LookupFunction} from 'node:net';
import {request as httpRequest,type RequestOptions,type IncomingMessage,type ClientRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {untilAbort} from './agent-cancel.ts';

export const WEB_MAX_BYTES=1_048_576,WEB_TEXT_BYTES=65_536,WEB_TIMEOUT_MS=10_000,WEB_REDIRECTS=5;
type Address={address:string;family:number};
type WebCode='web_url_denied'|'web_unavailable'|'web_timeout'|'web_too_large'|'web_content_unsupported'|'web_redirect_limit'|'web_http_error'|'cancelled';
const reasons:Record<WebCode,string>={web_url_denied:'Доступ разрешён только к публичным HTTP/HTTPS-страницам',web_unavailable:'Страница недоступна',web_timeout:'Истекло время загрузки страницы',web_too_large:'Страница превышает предел размера',web_content_unsupported:'Ответ не является поддерживаемым текстом',web_redirect_limit:'Слишком много перенаправлений',web_http_error:'Сервер отказал в загрузке страницы',cancelled:'Загрузка страницы отменена'};
export class AgentWebError extends Error {readonly code:WebCode;constructor(code:WebCode){super(reasons[code]);this.code=code}}
export interface WebFetchOptions {
 resolve?:(hostname:string)=>Promise<Address[]>;
 request?:(url:URL,options:RequestOptions,response:(res:IncomingMessage)=>void)=>ClientRequest;
 timeoutMs?:number;
}

// Conservative exclusion of IANA special-purpose ranges, including mapped and transition IPv6.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
export function publicWebAddress(address:string):boolean {
 if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number) as [number,number,number,number];
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&(c===0||c===2)||b===88&&c===99||b===31&&c===196||b===52&&c===193||b===175&&c===48)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
 }
 if(isIP(address)!==6||address.includes('%')||address.includes('.'))return false;
 const parts=address.toLowerCase().split(':'),a=parseInt(parts[0]||'0',16),b=parseInt(parts[1]||'0',16);
 return a>=0x2000&&a<=0x3fff&&!(a===0x2001&&(b<0x200||b===0xdb8)||a===0x2002||a===0x3fff&&b<0x1000);
}
function target(raw:string,base?:URL):URL {
 if(typeof raw!=='string'||!raw||raw.length>8192||/[\x00-\x20\x7f]/.test(raw))throw new AgentWebError('web_url_denied');
 let url:URL;try{url=new URL(raw,base)}catch{throw new AgentWebError('web_url_denied')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname)throw new AgentWebError('web_url_denied');
 url.hash='';return url;
}
async function addresses(url:URL,signal:AbortSignal,resolve:NonNullable<WebFetchOptions['resolve']>){
 const host=url.hostname.replace(/^\[|\]$/g,''),family=isIP(host),list=family?[{address:host,family}]:await untilAbort(signal,()=>resolve(host));
 if(!list.length||list.some(row=>!row||isIP(row.address)!==row.family||!publicWebAddress(row.address)))throw new AgentWebError('web_url_denied');
 return list[0]!;
}
const nativeRequest:NonNullable<WebFetchOptions['request']>=(url,options,response)=>(url.protocol==='https:'?httpsRequest:httpRequest)(url,options,response);
function page(url:URL,address:Address,signal:AbortSignal,request:NonNullable<WebFetchOptions['request']>):Promise<{status:number;location?:string;type:string;body:Buffer}>{
 return new Promise((resolve,reject)=>{
  // Pin the checked address into the socket lookup; Host and TLS servername remain the URL host.
  const lookup:LookupFunction=(_host,options,callback)=>{if(options.all)callback(null,[address]);else callback(null,address.address,address.family)};
  const req=request(url,{method:'GET',agent:false,lookup,signal,maxHeaderSize:16384,headers:{Accept:'text/html, text/plain, application/xhtml+xml, application/json','Accept-Encoding':'identity','User-Agent':'Harnessy web_fetch'}},res=>{
   void(async()=>{
    const status=res.statusCode??0;
    if([301,302,303,307,308].includes(status)){const location=res.headers.location;res.destroy();if(!location)throw new AgentWebError('web_url_denied');return {status,location,type:'',body:Buffer.alloc(0)}}
    if(status<200||status>=300)throw new AgentWebError('web_http_error');
    const type=res.headers['content-type']??'',encoding=res.headers['content-encoding'];
    if(!/^(?:text\/[^;]+|application\/(?:json|xml|xhtml\+xml))(?:;|$)/i.test(type)||encoding&&encoding.toLowerCase()!=='identity')throw new AgentWebError('web_content_unsupported');
    const charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(type)?.[1];if(charset&&!/^(utf-8|utf8|us-ascii)$/i.test(charset))throw new AgentWebError('web_content_unsupported');
    if(Number(res.headers['content-length'])>WEB_MAX_BYTES)throw new AgentWebError('web_too_large');
    const chunks:Buffer[]=[];let size=0;
    for await(const data of res){const chunk=Buffer.isBuffer(data)?data:Buffer.from(data);size+=chunk.length;if(size>WEB_MAX_BYTES)throw new AgentWebError('web_too_large');chunks.push(chunk)}
    return {status,type,body:Buffer.concat(chunks)};
   })().then(resolve,reject).finally(()=>res.destroy());
  });
  req.once('error',reject);req.once('upgrade',(_res,socket)=>{socket.destroy();reject(new AgentWebError('web_content_unsupported'))});req.end();
 });
}
function htmlText(html:string){
 const pieces:string[]=[];let at=0,hidden='';
 while(at<html.length){const start=html.indexOf('<',at);if(start<0){if(!hidden)pieces.push(html.slice(at));break}if(!hidden)pieces.push(html.slice(at,start));
  if(html.startsWith('<!--',start)){const end=html.indexOf('-->',start+4);if(end<0)break;at=end+3;continue}
  const end=html.indexOf('>',start+1);if(end<0){if(!hidden)pieces.push(html.slice(start));break}
  const tag=/^\s*(\/?)\s*([a-z0-9]+)/i.exec(html.slice(start+1,end)),name=tag?.[2]?.toLowerCase();
  if(hidden){if(tag?.[1]&&name===hidden)hidden=''}else if(!tag?.[1]&&name&&['script','style','template','svg'].includes(name))hidden=name;
  pieces.push(' ');at=end+1;
 }return pieces.join('');
}
function pageText(body:Buffer,type:string){
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(body)}catch{throw new AgentWebError('web_content_unsupported')}
 if(text.includes('\0'))throw new AgentWebError('web_content_unsupported');
 if(/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(type)){
  text=htmlText(text);
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  text=text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,key:string)=>{if(key[0]!=='#')return entities[key.toLowerCase()]??all;const n=parseInt(key.slice(key[1]?.toLowerCase()==='x'?2:1),key[1]?.toLowerCase()==='x'?16:10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' '}).replace(/\s+/g,' ').trim();
 }
 let bytes=0,end=0;for(const char of text){bytes+=Buffer.byteLength(char);if(bytes>WEB_TEXT_BYTES)break;end+=char.length}
 return {text:text.slice(0,end),truncated:end<text.length};
}
/** A credential-free, GET-only reader. Never accepts model-supplied headers, DNS overrides or proxies. */
export async function webFetch(raw:string,outer:AbortSignal,options:WebFetchOptions={}){
 const timeout=AbortSignal.timeout(Math.max(1,Math.min(options.timeoutMs??WEB_TIMEOUT_MS,WEB_TIMEOUT_MS))),signal=AbortSignal.any([outer,timeout]);
 try{
  let url=target(raw);for(let redirects=0;;redirects++){
   const address=await addresses(url,signal,options.resolve??(host=>dnsLookup(host,{all:true,verbatim:true})));
   const response=await untilAbort(signal,()=>page(url,address,signal,options.request??nativeRequest));
   if(response.location){if(redirects>=WEB_REDIRECTS)throw new AgentWebError('web_redirect_limit');url=target(response.location,url);continue}
   return {url:url.href,status:response.status,...pageText(response.body,response.type),bytes:response.body.length};
  }
 }catch(e){if(outer.aborted)throw new AgentWebError('cancelled');if(timeout.aborted)throw new AgentWebError('web_timeout');if(e instanceof AgentWebError)throw e;throw new AgentWebError('web_unavailable')}
}
