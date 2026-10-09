import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Clock,Subscription} from '@harnessy/runtime';
import {pythonJson} from './responses.ts';
function drain(res:ServerResponse,signal:AbortSignal):Promise<void>{return new Promise(resolve=>{
 if(signal.aborted||res.destroyed){resolve();return}
 const finish=()=>{res.off('drain',finish);res.off('close',finish);signal.removeEventListener('abort',finish);resolve()};
 res.once('drain',finish);res.once('close',finish);signal.addEventListener('abort',finish,{once:true})
 })}
export async function serveSse(request:IncomingMessage,res:ServerResponse,sub:Subscription,clock:Clock,streams:Set<()=>void>):Promise<void>{
 let wake=()=>{};const stop=()=>{sub.close();wake();res.destroy()},disconnected=()=>sub.close();streams.add(stop);
 sub.closed.addEventListener('abort',stop,{once:true});res.once('close',disconnected);request.once('aborted',disconnected);
 const iterator=sub.events[Symbol.asyncIterator]();let timer:unknown;
 const write=async(chunk:string)=>{if(!sub.closed.aborted&&!res.destroyed&&!res.write(chunk))await drain(res,sub.closed)};
 try{
 if(sub.closed.aborted)return;
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();await write(': ok\n\n');
 let next:IteratorResult<import('@harnessy/runtime').RuntimeEvent>|undefined;
 const readNext=()=>{void iterator.next().then(value=>{next=value;wake()},()=>sub.close())};readNext();
 while(!sub.closed.aborted){
 if(!next)await new Promise<void>(resolve=>{wake=resolve;timer=clock.setTimeout(resolve,15_000);if(next||sub.closed.aborted)resolve()});
 if(timer!==undefined)clock.clearTimeout(timer);timer=undefined;wake=()=>{};
 if(sub.closed.aborted)break;
 if(next){const outcome=next;next=undefined;if(outcome.done)break;await write('data: '+pythonJson(outcome.value,false)+'\n\n');if(!sub.closed.aborted)readNext()}
 else await write(': ka\n\n');
 }
 }finally{if(timer!==undefined)clock.clearTimeout(timer);sub.closed.removeEventListener('abort',stop);sub.close();await iterator.return?.();res.off('close',disconnected);request.off('aborted',disconnected);streams.delete(stop);if(!res.destroyed)res.end()}
}
