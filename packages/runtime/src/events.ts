import type {RuntimeEvent} from './types.ts';
export type Selector={pane:string;owner?:never;all?:never}|{owner:true;pane?:never;all?:never}|{all:true;pane?:never;owner?:never};
export interface Subscription {events:AsyncIterable<RuntimeEvent>;closed:AbortSignal;close():void}
interface Listener {selector:Selector;push(pane:string,ev:RuntimeEvent,replay?:boolean):void;close():void}
export class EventBus {
 observer:((pane:string,event:RuntimeEvent)=>RuntimeEvent)|null=null;
 private listeners=new Set<Listener>();private ended=false;
 private replay:()=>{pane:string;event:RuntimeEvent;replay?:boolean}[];readonly capacity:number;
 constructor(replay:()=>{pane:string;event:RuntimeEvent;replay?:boolean}[],capacity=4000){this.replay=replay;this.capacity=capacity}
 get subscribers(){return this.listeners.size}
 publish(pane:string,event:RuntimeEvent):void {try{event=this.observer?.(pane,event)??event}catch{}if(!this.ended)for(const listener of [...this.listeners])listener.push(pane,event)}
 subscribe(selector:Selector):Subscription {
 if(!selector||Object.keys(selector).length!==1||!('pane' in selector&&typeof selector.pane==='string'&&selector.pane||'all' in selector&&selector.all===true||'owner' in selector&&selector.owner===true))throw new TypeError('неверная подписка');
 const controller=new AbortController(),queue:RuntimeEvent[]=[],waiters:((v:IteratorResult<RuntimeEvent>)=>void)[]=[];
 const accepts=(pane:string)=>'all' in selector?selector.all===true:'owner' in selector?selector.owner===true&&pane==='owner':selector.pane===pane;
 const close=()=>{if(controller.signal.aborted)return;this.listeners.delete(listener);queue.length=0;controller.abort();for(const resolve of waiters.splice(0))resolve({done:true,value:undefined})};
 const listener:Listener={selector,close,push:(pane,event,replay=false)=>{
 if(controller.signal.aborted||!accepts(pane))return;let value=event;
 if('all' in selector||replay){try{value={...event,...('all' in selector?{pane}:{}),...(replay?{replay:true}:{})}}catch{
  let type='unknown';try{const raw=event.type;if(typeof raw==='string')type=raw}catch{}
  value={type:'error',code:'unserializable',message:'событие не представимо: '+type,...('all' in selector?{pane}:{})}
 }}
 const waiter=waiters.shift();if(waiter)waiter({done:false,value});else if(queue.length>=this.capacity)close();else queue.push(value)
 }};
 // No await: registration and card replay are one synchronous operation.
 if(this.ended)close();else {this.listeners.add(listener);for(const card of this.replay())listener.push(card.pane,card.event,card.replay)}
 const iterator:AsyncIterator<RuntimeEvent>={next:()=>{if(controller.signal.aborted)return Promise.resolve({done:true,value:undefined});const value=queue.shift();return value?Promise.resolve({done:false,value}):new Promise(resolve=>waiters.push(resolve))},return:async()=>{close();return {done:true,value:undefined}}};
 return {events:{[Symbol.asyncIterator]:()=>iterator},closed:controller.signal,close}
 }
 close():void{this.ended=true;for(const listener of [...this.listeners])listener.close()}
}
