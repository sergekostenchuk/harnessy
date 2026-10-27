import {setTimeout as delay} from 'node:timers/promises';
import {ProviderError,type Provider,type Seat,type TurnContext,type Vendor} from '@harnessy/providers';

export type FakeOutcome='ok'|'error'|'lost'|'retry'|'partial-retry';
export interface FakeScenario {ttftMs:0|2000|15000;outcome:FakeOutcome;tools:number}
type Wait=(ms:number,signal:AbortSignal)=>Promise<void>;

/** Only the documented scenarios are accepted; a typo must not start a different audit. */
export function fakeScenario(env:NodeJS.ProcessEnv):FakeScenario {
 const ms=env.HARNESS_FAKE_TTFT_MS??'0',outcome=env.HARNESS_FAKE_OUTCOME??'ok',tools=env.HARNESS_FAKE_TOOLS??'0';
 if(!['0','2000','15000'].includes(ms))throw Error('HARNESS_FAKE_TTFT_MS: ожидается 0, 2000 или 15000');
 if(!['ok','error','lost','retry','partial-retry'].includes(outcome))throw Error('HARNESS_FAKE_OUTCOME: ожидается ok, error, lost, retry или partial-retry');
 if(!/^(?:0|[1-9][0-9]?)$/.test(tools)||Number(tools)>50)throw Error('HARNESS_FAKE_TOOLS: ожидается целое число от 0 до 50');
 return {ttftMs:Number(ms) as FakeScenario['ttftMs'],outcome:outcome as FakeOutcome,tools:Number(tools)};
}

const wait:Wait=async(ms,signal)=>{if(signal.aborted)throw new ProviderError('cancelled','Ход остановлен');
 try{if(ms)await delay(ms,undefined,{signal})}catch(e){if(signal.aborted)throw new ProviderError('cancelled','Ход остановлен');throw e}
 if(signal.aborted)throw new ProviderError('cancelled','Ход остановлен')};

/** No process, network, keychain or model is invoked by this provider. */
export class ScenarioProvider implements Provider {
 private retrySeats=new Set<string>();
 readonly vendor:Vendor;private scenario:FakeScenario;private readonly pause:Wait;
 constructor(vendor:'claude'|'codex',scenario:FakeScenario,pause:Wait=wait){this.vendor=vendor;this.scenario=scenario;this.pause=pause}
 async runTurn(seat:Seat,_message:string,ctx:TurnContext){
  const started=Date.now();ctx.modelStarted?.();
  await this.pause(this.scenario.ttftMs,ctx.signal);
  if(ctx.signal.aborted)throw new ProviderError('cancelled','Ход остановлен');
  if(this.scenario.outcome==='error')throw new ProviderError('turn_failed','Тестовая ошибка провайдера');
  if(this.scenario.outcome==='lost')throw new ProviderError('transport_lost','Тестовый обрыв связи с провайдером');
  if(this.scenario.outcome==='partial-retry'){
   if(!this.retrySeats.delete(seat.id)){
    this.retrySeats.add(seat.id);
    ctx.publish({type:'delta',text:'Незавершённый фрагмент первой попытки.'});
    ctx.publish({type:'tool',name:'Проверка первой попытки',detail:'Тестовый инструмент, без выполнения'});
    ctx.traceEvent?.({id:'ts50-first-tool',name:'Проверка первой попытки',phase:'call'});
    ctx.traceEvent?.({id:'ts50-first-tool',name:'Проверка первой попытки',phase:'result',outcome:'ok'});
    throw new ProviderError('turn_failed','Тестовая ошибка после частичного ответа');
   }
   const text='Завершённый ответ второй попытки.';
   ctx.publish({type:'delta',text});
   ctx.publish({type:'done',sessionId:'ts50-fake',model:seat.model,durationMs:Date.now()-started,usage:{input:20,output:12,cacheRead:0}});
   return {text,sessionId:'ts50-fake'};
  }
  if(this.scenario.outcome==='retry'&&!this.retrySeats.delete(seat.id)){
   this.retrySeats.add(seat.id);
   throw new ProviderError('turn_failed','Тестовая ошибка: повторите ход');
  }
  for(let i=0;i<this.scenario.tools;i++){const id='ts47-tool-'+i,name='Проверка '+(i+1);ctx.publish({type:'tool',name,detail:'Тестовый инструмент, без выполнения'});ctx.traceEvent?.({id,name,phase:'call'});ctx.traceEvent?.({id,name,phase:'result',outcome:'ok'})}
  const chunks=['Это ответ тестового провайдера. ','Поток и инструменты созданы для аудита окна.'];
  for(const text of chunks){if(ctx.signal.aborted)throw new ProviderError('cancelled','Ход остановлен');ctx.publish({type:'delta',text})}
  ctx.publish({type:'done',sessionId:'ts47-fake',model:seat.model,durationMs:Date.now()-started,usage:{input:20,output:12,cacheRead:0}});
  return {text:chunks.join(''),sessionId:'ts47-fake'};
 }
 async auth(){return {loggedIn:true,plan:'Тест'}}
 async models(){return this.vendor==='claude'?[{id:'claude-opus-5-5',label:'Opus 5.5'}]:[{id:'gpt-5.6-sol',label:'GPT 5.6'}]}
 async listSessions(){return []}
 async sessionMessages(){return []}
 async reset(){this.retrySeats.clear()}
 async close(){}
}
