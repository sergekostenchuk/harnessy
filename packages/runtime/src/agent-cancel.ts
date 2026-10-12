import {ProviderError} from '@harnessy/providers';

/** Stop awaiting an uncooperative transport/tool; its late result has no consumer. */
export async function untilAbort<T>(signal:AbortSignal,operation:()=>Promise<T>):Promise<T>{
 if(signal.aborted)throw new ProviderError('cancelled','Ход отменён');
 let abort!:()=>void;const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new ProviderError('cancelled','Ход отменён'));signal.addEventListener('abort',abort,{once:true})});
 try{return await Promise.race([Promise.resolve().then(()=>{if(signal.aborted)throw new ProviderError('cancelled','Ход отменён');return operation()}),cancelled])}finally{signal.removeEventListener('abort',abort)}
}
export async function* cancellable<T>(input:AsyncIterable<T>,signal:AbortSignal):AsyncGenerator<T>{
 const iterator=input[Symbol.asyncIterator]();let ended=false;
 try{while(true){const value=await untilAbort(signal,()=>iterator.next());if(value.done){ended=true;return}yield value.value}}
 finally{if(!ended&&iterator.return)void Promise.resolve().then(()=>iterator.return!()).catch(()=>{})}
}
