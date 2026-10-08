import {ProviderError} from './types.ts';

// Configuration and binary discovery do not accept an AbortSignal themselves.
export async function waitWithSignal<T>(start:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw new ProviderError('cancelled','ход отменён');
 let stop:()=>void=()=>{};
 const cancelled=new Promise<never>((_,reject)=>{
 stop=()=>reject(new ProviderError('cancelled','ход отменён'));
 signal.addEventListener('abort',stop,{once:true});
 });
 const work=Promise.resolve().then(()=>{
 if(signal.aborted)throw new ProviderError('cancelled','ход отменён');
 return start()
 });
 try{return await Promise.race([work,cancelled])}
 finally{signal.removeEventListener('abort',stop)}
}
