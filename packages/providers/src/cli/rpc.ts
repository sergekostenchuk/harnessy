import {ProviderError,record} from '../types.ts';
/** One metadata request, no session creation or model invocation. Byte framing is SDK JSON-RPC. */
export class MetadataRpc {
 private buffer=Buffer.alloc(0);private complete=false;
 request(method:string){const body=JSON.stringify({jsonrpc:'2.0',id:1,method,params:{}});return 'Content-Length: '+Buffer.byteLength(body)+'\r\n\r\n'+body}
 push(chunk:Buffer):string|undefined {
  if(this.complete&&chunk.length)throw this.invalid();this.buffer=Buffer.concat([this.buffer,chunk]);let result:string|undefined;
  while(this.buffer.length){const split=this.buffer.indexOf('\r\n\r\n');if(split<0){if(this.buffer.length>8192)throw this.invalid();break}
   const header=this.buffer.subarray(0,split).toString('ascii'),matches=[...header.matchAll(/^Content-Length:\s*(\d+)\s*$/gim)];
   if(matches.length!==1)throw this.invalid();const size=Number(matches[0]![1]);if(!Number.isSafeInteger(size)||size<1||size>1024*1024)throw this.invalid();const end=split+4+size;if(this.buffer.length<end)break;
   const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(this.buffer.subarray(split+4,end)));this.buffer=this.buffer.subarray(end);
   if(!record(v)||v.jsonrpc!=='2.0'||this.complete)throw this.invalid();
   if(v.id===undefined&&typeof v.method==='string')continue;
   if(v.id!==1||!record(v.result)||v.error!==undefined)throw this.invalid();this.complete=true;result=JSON.stringify(v.result);
  }return result;
 }
 finish(){if(!this.complete||this.buffer.length)throw this.invalid()}
 private invalid(){return new ProviderError('protocol','CLI: неверный ответ RPC метаданных')}
}
