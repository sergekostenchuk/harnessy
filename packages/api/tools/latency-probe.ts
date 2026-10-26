#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

type JsonEvent={type:string;traceId?:string;replay?:boolean;[key:string]:unknown};
type TimedEvent={event:JsonEvent;at:number};
type Mark={at:string;elapsedMs:number};
export interface Sample {
  seq:number;traceId:string;outcome:'done'|'error';
  sent:Mark;accepted:Mark;firstEvent:Mark|null;firstOutputEvent:Mark|null;firstCharacter:Mark|null;end:Mark;
}
export interface ProbeOptions {url:string;pane:string;message:string;mode:'double'|'live';timeoutMs?:number}

// SSE is a byte stream: a UTF-8 character, CRLF, or an entire frame can span chunks.
export class EventParser {
  private decoder=new TextDecoder('utf-8',{fatal:true});
  private buffer='';
  private data:string[]=[];
  private dataLength=0;
  push(bytes:Uint8Array):JsonEvent[] {this.buffer+=this.decoder.decode(bytes,{stream:true});return this.read(false)}
  finish():JsonEvent[] {this.buffer+=this.decoder.decode();return this.read(true)}
  private read(final:boolean):JsonEvent[] {
    if(this.buffer.length>1_000_000)throw Error('SSE frame exceeds limit');
    const events:JsonEvent[]=[];
    while(this.buffer.length){
      const index=this.buffer.search(/[\r\n]/);if(index<0)break;
      const ch=this.buffer[index]!;if(ch==='\r'&&index===this.buffer.length-1&&!final)break;
      const line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+(ch==='\r'&&this.buffer[index+1]==='\n'?2:1));
      if(!line){
        if(!this.data.length)continue;
        const raw=this.data.join('\n');this.data=[];this.dataLength=0;let value:unknown;
        try{value=JSON.parse(raw)}catch{throw Error('invalid SSE JSON')}
        if(!value||typeof value!=='object'||Array.isArray(value)||typeof (value as JsonEvent).type!=='string')throw Error('invalid SSE event');
        events.push(value as JsonEvent);continue;
      }
      if(line[0]===':')continue;
      const colon=line.indexOf(':'),field=colon<0?line:line.slice(0,colon);
      let value=colon<0?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
      if(field==='data'){this.dataLength+=value.length+1;if(this.dataLength>1_000_000)throw Error('SSE frame exceeds limit');this.data.push(value)}
    }
    if(final&&(this.buffer||this.data.length))throw Error('incomplete SSE frame');
    return events;
  }
}

function target(options:ProbeOptions):URL {
  if(!['double','live'].includes(options.mode))throw Error('choose --double or --live explicitly');
  let url:URL;try{url=new URL(options.url)}catch{throw Error('invalid engine URL')}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('engine URL must be a local HTTP origin');
  if(options.mode==='double'&&Number(url.port||80)===3777)throw Error('port 3777 is reserved for the owner; use an isolated test-double engine');
  if(!options.pane.trim()||!options.message.trim())throw Error('pane and message are required');
  const timeout=options.timeoutMs??90_000;if(!Number.isSafeInteger(timeout)||timeout<1||timeout>3_600_000)throw Error('invalid timeout');
  return url;
}

// Open SSE before POST; buffer early frames until the response supplies its trace ID.
// Only this trace is counted, so replays and another conversation cannot affect a sample.
export async function measure(options:ProbeOptions):Promise<Sample> {
  const url=target(options),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeoutMs??90_000);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let pump:Promise<void>|undefined;
  let sentMono=0,sentWall=0,traceId:string|null=null,firstEvent:number|null=null,firstOutputEvent:number|null=null,firstCharacter:number|null=null;
  const early:TimedEvent[]=[];let streamError:Error|null=null,completed=false;
  let resolveEnd!:(v:{at:number;outcome:'done'|'error'})=>void,rejectEnd!:(e:Error)=>void;
  const ended=new Promise<{at:number;outcome:'done'|'error'}>((a,b)=>{resolveEnd=a;rejectEnd=b});
  // A stream may fail while POST is still pending; keep the rejection observed.
  void ended.catch(()=>{});
  const consume=({event,at}:TimedEvent)=>{
    if(completed)return;
    if(!traceId){if(early.length>=4000)throw Error('too many events before HTTP response');early.push({event,at});return}
    if(event.traceId!==traceId||event.replay||at<sentMono)return;
    firstEvent??=at;
    // Queue/state events are engine activity, not a model response.
    if(['delta','tool','toolError','done'].includes(event.type))firstOutputEvent??=at;
    if(event.type==='delta'&&typeof event.text==='string'&&event.text.length>0)firstCharacter??=at;
    if(event.type==='done'||event.type==='error'){completed=true;resolveEnd({at,outcome:event.type})}
  };
  try{
    const stream=await fetch(new URL('/api/events/'+encodeURIComponent(options.pane),url),{signal:controller.signal,headers:{Accept:'text/event-stream'}});
    if(!stream.ok||!stream.body||!stream.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream'))throw Error('event stream unavailable: HTTP '+stream.status);
    if(options.mode==='double'&&stream.headers.get('x-harnessy-test-double')!=='1')throw Error('test-double marker missing; no message was sent');
    reader=stream.body.getReader();const parser=new EventParser();
    pump=(async()=>{try{while(true){const part=await reader!.read();if(part.done){for(const event of parser.finish())consume({event,at:performance.now()});throw Error('event stream closed before completion')}for(const event of parser.push(part.value))consume({event,at:performance.now()})}}catch(error){streamError=error instanceof Error?error:Error(String(error));if(traceId&&!completed)rejectEnd(streamError)}})();
    sentMono=performance.now();sentWall=Date.now();
    const response=await fetch(new URL('/api/chat',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pane:options.pane,message:options.message,direct:true,thread:'latency:'+randomUUID()}),signal:controller.signal});
    const accepted=performance.now(),body=await response.json() as {ok?:boolean;seq?:number;queued?:boolean;code?:string};
    if(!response.ok||body.ok!==true)throw Error('message refused: '+(body.code||'HTTP '+response.status));
    if(body.queued)throw Error('message was queued; its latency cannot be isolated');
    if(!Number.isSafeInteger(body.seq)||!body.seq)throw Error('message receipt has no sequence');
    traceId=response.headers.get('x-harness-trace-id');if(!traceId)throw Error('message receipt has no trace ID');
    for(const event of early)consume(event);early.length=0;
    if(streamError&&!completed)rejectEnd(streamError);
    const end=await ended;
    const mark=(value:number):Mark=>({at:new Date(sentWall+value-sentMono).toISOString(),elapsedMs:Math.round((value-sentMono)*1000)/1000});
    return {seq:body.seq!,traceId,outcome:end.outcome,sent:mark(sentMono),accepted:mark(accepted),firstEvent:firstEvent===null?null:mark(firstEvent),firstOutputEvent:firstOutputEvent===null?null:mark(firstOutputEvent),firstCharacter:firstCharacter===null?null:mark(firstCharacter),end:mark(end.at)};
  }catch(error){if(controller.signal.aborted)throw Error('probe timed out');throw error}
  finally{clearTimeout(timer);controller.abort();try{await reader?.cancel()}catch{}await pump}
}

export async function run(options:ProbeOptions,repeat:number):Promise<Sample[]> {
  target(options);if(!Number.isSafeInteger(repeat)||repeat<1||repeat>1000)throw Error('repeat must be between 1 and 1000');
  const samples:Sample[]=[];for(let i=0;i<repeat;i++)samples.push(await measure(options));return samples;
}

const usage='Usage: node packages/api/tools/latency-probe.ts --url http://127.0.0.1:PORT --pane ID (--double | --live) [--message TEXT] [--repeat N] [--timeout-ms N] [--output FILE]\n--double: isolated FakeProvider engine, with X-Harnessy-Test-Double: 1 on SSE (never port 3777). --live: may incur model costs.\nfirstEvent includes engine queue/state events; firstOutputEvent is the first delta/tool/toolError/done event. Elapsed times are ms from sending.';
export function argumentsFor(args:string[]):{options:ProbeOptions;repeat:number;output?:string}|null {
  if(args.length===1&&args[0]==='--help')return null;
  const values:Record<string,string>={},flags=new Set<string>();
  for(let i=0;i<args.length;i++){
    const key=args[i]!;if(key==='--double'||key==='--live'){if(flags.has(key))throw Error('duplicate '+key);flags.add(key);continue}
    if(!['--url','--pane','--message','--repeat','--timeout-ms','--output'].includes(key)||values[key]!==undefined||!args[i+1]||args[i+1]!.startsWith('--'))throw Error('invalid argument: '+key);
    values[key]=args[++i]!;
  }
  if(flags.has('--double')===flags.has('--live'))throw Error('choose --double or --live explicitly');
  const options:ProbeOptions={url:values['--url']??'',pane:values['--pane']??'',message:values['--message']??'Ответьте одним словом: готово.',mode:flags.has('--live')?'live':'double',...(values['--timeout-ms']?{timeoutMs:Number(values['--timeout-ms'])}:{})};
  target(options);return {options,repeat:Number(values['--repeat']??1),...(values['--output']?{output:values['--output']}:{} )};
}

async function main(){
  const config=argumentsFor(process.argv.slice(2));if(!config){console.log(usage);return}
  const samples=await run(config.options,config.repeat);
  console.table(samples.map((sample,i)=>({run:i+1,accepted:sample.accepted.elapsedMs,firstEvent:sample.firstEvent?.elapsedMs??null,firstOutputEvent:sample.firstOutputEvent?.elapsedMs??null,firstCharacter:sample.firstCharacter?.elapsedMs??null,end:sample.end.elapsedMs,outcome:sample.outcome})));
  const now=new Date(),file=config.output??join(homedir(),'REPORTS','TS-47','latency-'+now.toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.json');
  await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,JSON.stringify({version:1,mode:config.options.mode,pane:config.options.pane,samples},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('JSON: '+file);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1});
