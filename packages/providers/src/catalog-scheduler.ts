import {ProviderError} from './types.ts';

// 10 installed programs, 3 readers: 8308 ms total; slowest Antigravity 7981 ms
// at load 7.24. Round up its measured whole read, then reserve x2 per program.
export const CATALOG_CONCURRENCY=3,CATALOG_READ_TIMEOUT_MS=8000*2;
/** The queue consumes no timeout budget. Each admitted program owns its deadline. */
export class CatalogScheduler {
 private active=0;private queue:(()=>void)[]=[];private stop=new AbortController();
 private concurrency:number;private timeoutMs:number;
 constructor(concurrency=CATALOG_CONCURRENCY,timeoutMs=CATALOG_READ_TIMEOUT_MS){this.concurrency=concurrency;this.timeoutMs=timeoutMs;if(!Number.isInteger(concurrency)||concurrency<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('invalid catalog schedule')}
 async run<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  await new Promise<void>(resolve=>{if(this.active<this.concurrency){this.active++;resolve()}else this.queue.push(resolve)});
  const timer=new AbortController(),signal=AbortSignal.any([this.stop.signal,timer.signal]);const timeout=setTimeout(()=>timer.abort(),this.timeoutMs);
  try{if(signal.aborted)throw new ProviderError('cancelled','Каталог закрыт');return await work(signal)}finally{clearTimeout(timeout);const next=this.queue.shift();if(next)next();else this.active--}
 }
 close(){this.stop.abort()}
}
