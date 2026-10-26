import {existsSync} from 'node:fs';
import {Journal,validateForm,requireKind,ackResolution} from './journal.ts';
import {Policy} from './policy.ts';
import {resolveEvidence,checkReport} from './evidence.ts';
import {JournalError,object,freeze,SYSTEM_KINDS,type AgentPostInput,type CorePostInput,type Initiator,type Record_,type Bounds,type ThreadState,type ChannelEvent,type PolicyView} from './types.ts';
import {POLICY_BROKEN,POLICY_BROKEN_REASON,SCORE_INVALID,ROUND_INVALID,REPLY_REQUIRED,SHA_REQUIRED,EVIDENCE_REQUIRED} from './strings.ts';
export interface ChannelDeps {journal:Journal;policy:Policy|null;projectDir:string;liveSeats:()=>string[];roleOf:(seat:string)=>string|null;labelOf:(seat:string)=>string;hasRepo:()=>boolean;resolveSha:(sha:string)=>string|null;mergeCommitFor:(sha:string)=>string|null}
const AGENT_KEYS=['to','kind','text','thread','reply_to','evidence','score','round','sha','outcome'];
const CORE_KEYS=[...AGENT_KEYS,'origin','merged','attachments'];
export class Channel {
 private emittedAckEvents=new Set<string>();private announcedVerdictEffects=new Set<string>();private deps:ChannelDeps;private handlers=new Set<(event:ChannelEvent)=>void>();private states=new Map<string,ThreadState>();
 constructor(deps:ChannelDeps){this.deps=deps;this.restoreThreads()}
 get threads():ReadonlyMap<string,ThreadState>{this.restoreThreads();return new Map([...this.states].map(([key,value])=>[key,freeze({...value})]))}
 on(handler:(event:ChannelEvent)=>void):()=>void {this.handlers.add(handler);return ()=>this.handlers.delete(handler)}
 private emit(event:ChannelEvent){for(const handler of this.handlers)try{handler(freeze(event))}catch{console.error('[journal] обработчик события завершился с ошибкой')}}
 post(input:AgentPostInput,initiator:Initiator&{trust:'agent'}):Record_ {return this.write(input,initiator,false)}
 postAgentEffect(input:AgentPostInput,initiator:Initiator&{trust:'agent'},origin:'ask'|'auto'):Record_ {
 if(origin!=='ask'&&origin!=='auto')throw new JournalError('initiator_invalid','служебные поля записи задаёт ядро');
 return this.write(input,initiator,false,undefined,origin)
 }
 ackDecision(seq:number):Record_|null {return this.pending(seq).resolution}
 postCore(input:CorePostInput,initiator:Initiator&{trust:'owner'|'harness'}):Record_ {return this.write(input,initiator,true)}
 private validateInitiator(initiator:Initiator,core:boolean){
 if(!object(initiator)||typeof initiator.seat!=='string'||!initiator.seat||(core?!(initiator.trust==='owner'&&initiator.seat==='owner'||initiator.trust==='harness'&&initiator.seat==='harness'):initiator.trust!=='agent'||['owner','harness'].includes(initiator.seat)||this.deps.roleOf(initiator.seat)===null))throw new JournalError('initiator_invalid','инициатора записи задаёт ядро')
 }
 private role(seat:string):string {return seat==='owner'?'owner':seat==='harness'?'harness':this.deps.roleOf(seat)??seat}
 private policySnapshot():PolicyView|null {
 const policy=this.deps.policy;if(!policy)return null;
 let changed=false;try{changed=policy.maybeReload()}catch{}
 if(changed){const record=this.deps.journal.append({sender:'harness',to:['*'],kind:'policy',text:'политика связи перечитана: версия '+policy.version,policy:policy.version});this.emit({type:'posted',record,initiator:{seat:'harness',trust:'harness'}})}
 return policy.broken?null:policy.snapshot()
 }
 private reject(sender:string,to:string[],kind:string,reason:string,version:number,replyTo?:number|null,origin?:string){
 const rec=this.deps.journal.append({sender:'harness',to:['owner'],kind:'rejected',text:sender+' → '+to.join(', ')+' '+kind+': '+reason,policy:version,...(replyTo!=null?{reply_to:replyTo}:{}),...(origin?{origin}:{})});
 this.emit({type:'rejected',record:rec,sender,reason})
 }
 private write(input:AgentPostInput|CorePostInput,initiator:Initiator,core:boolean,ackDecision?:Record_,agentOrigin?:'ask'|'auto'):Record_ {
 if(!object(input))throw new JournalError('to_invalid','адресат — имя места или список мест');
 const form=validateForm(input);this.validateInitiator(initiator,core);requireKind(input.kind,core);
 const keys=core?CORE_KEYS:AGENT_KEYS;
 if(Object.keys(input).some(key=>!keys.includes(key))||(input.thread!=null&&typeof input.thread!=='string'))throw new JournalError('initiator_invalid','служебные поля записи задаёт ядро');
 const coreInput=input as CorePostInput;
 if(core&&['origin','merged'].some(key=>input[key]!=null&&typeof input[key]!=='string'))throw new JournalError('initiator_invalid','служебные поля записи задаёт ядро');
 const sender=initiator.seat,live=[...this.deps.liveSeats()];
 let to=form.to;if(to.includes('*'))to=live.filter(id=>id!==sender).concat(sender==='owner'?[]:['owner']);
 if(!to.length)throw new JournalError('to_invalid','адресат — имя места или список мест');
 for(const seat of to){if(seat!=='owner'&&this.deps.roleOf(seat)===null)throw new JournalError('to_unknown','нет такого окна: '+seat+'; есть '+live.join(', ')+' и owner');if(seat===sender)throw new JournalError('self_addressed','запись самому себе не нужна')}
 const reply=input.reply_to??null;
 if(input.kind==='verdict'){
 if(!Number.isInteger(input.score)||typeof input.score!=='number'||input.score<0||input.score>10)throw new JournalError('score_invalid',SCORE_INVALID);
 if(!Number.isInteger(input.round)||typeof input.round!=='number'||input.round<1)throw new JournalError('round_invalid',ROUND_INVALID);
 if(reply===null)throw new JournalError('reply_to_required',REPLY_REQUIRED)
 }
 const target=reply!==null?this.deps.journal.get(reply):null;
 if(reply!==null&&(!target||SYSTEM_KINDS.includes(target.kind as never)))throw new JournalError('reply_to_missing','нет записи #'+String(reply)+', на которую можно ответить');
 let sha=input.sha;
 if(!core){
 if(input.sha!=null&&typeof input.sha!=='string')throw new JournalError('sha_unknown','коммита '+String(input.sha)+' нет в репозитории проекта; закоммить и пришли настоящий SHA');
 if(input.kind!=='verdict'&&input.score!=null&&(typeof input.score!=='number'||!Number.isFinite(input.score)))throw new JournalError('score_invalid',SCORE_INVALID);
 if(input.kind!=='verdict'&&input.round!=null&&(typeof input.round!=='number'||!Number.isFinite(input.round)))throw new JournalError('round_invalid',ROUND_INVALID);
 if(input.kind==='review-request'&&this.deps.hasRepo()){
 if(!sha)throw new JournalError('sha_required',SHA_REQUIRED);
 const full=typeof sha==='string'?this.deps.resolveSha(sha):null;
 if(!full)throw new JournalError('sha_unknown','коммита '+String(sha)+' нет в репозитории проекта; закоммить и пришли настоящий SHA');sha=full
 }
 if(input.kind==='verdict'){
 if(!form.evidence.length)throw new JournalError('evidence_required',EVIDENCE_REQUIRED);
 let report=false,firstError:string|null=null;
 for(const evidence of form.evidence){
 const path=resolveEvidence(this.deps.projectDir,evidence);if(path===null)throw new JournalError('evidence_outside','путь свидетельства вне проекта: '+evidence);
 const error=checkReport(path);if(error===null)report=true;else if(!existsSync(path))throw new JournalError('evidence_missing',error);
 firstError??=error
 }
 if(!report)throw new JournalError('evidence_contract',firstError!);
 if(target?.sha)sha=target.sha
 }
 if(input.kind==='report')for(const evidence of form.evidence){const path=resolveEvidence(this.deps.projectDir,evidence);if(path===null||!existsSync(path))throw new JournalError('evidence_missing','файла свидетельства нет: '+evidence)}
 }
 const view=this.policySnapshot(),version=view?.version??this.deps.policy?.version??0;
 let pending=false,bounds:Bounds={};
 const deny=(reason:string,message=reason):never=>{this.reject(sender,to,input.kind,reason,version,agentOrigin==='auto'?reply:undefined,agentOrigin==='auto'?'auto:'+sender:undefined);throw new JournalError('policy_denied',message)};
 if(!core){
 if(!view)deny(POLICY_BROKEN_REASON,POLICY_BROKEN);
 const fromRole=this.role(sender);
 for(const seat of to){const toRole=this.role(seat),decision=view!.checkSend(fromRole,toRole,input.kind);if(!decision.allow)deny(decision.reason);
 if(decision.trigger?.startsWith('reply-to:')){const need=decision.trigger.slice('reply-to:'.length);if(!target||target.kind!==need||target.from!==seat)deny('политика v'+version+': '+input.kind+' от '+fromRole+' — только ответ на '+need+' от '+toRole+' (reply_to)')}
 pending||=decision.pending;if(Object.keys(decision.bounds).length)bounds=decision.bounds
 }
 }
 if(input.kind==='verdict'&&bounds.max_rounds&&input.round!>Number(bounds.max_rounds))deny('раунд '+input.round+' больше max_rounds='+String(bounds.max_rounds)+' треда '+String(input.thread||target?.thread)+'; эскалируй владельцу');
 const record=this.deps.journal.append({sender,to,kind:input.kind,text:form.text,thread:input.thread??null,reply_to:reply,evidence:form.evidence,...(form.attachments.length?{attachments:form.attachments}:{}),policy:version,
 ...(input.outcome!==undefined?{outcome:input.outcome}:{}),...(input.score!==undefined?{score:input.score}:{}),...(input.round!==undefined?{round:input.round}:{}),...(sha!==undefined?{sha}:{}),
 ...(core&&coreInput.origin!=null?{origin:coreInput.origin}:agentOrigin?{origin:agentOrigin}:{}),...(core&&coreInput.merged!=null?{merged:coreInput.merged}:{}),
 ...(input.kind==='verdict'?{accepted:bounds.accept_score!=null&&input.score!>=Number(bounds.accept_score),bounds:Object.keys(bounds).length?bounds:null}:{}),...(pending?{ack:'pending' as const}:{})});
 const announce=()=>{this.emit({type:'posted',record,initiator:{...initiator}});
 if(pending){this.emit({type:'pendingAck',record});return}
 this.emit({type:'delivered',record,deliverySeq:record.seq});if(record.kind==='verdict')this.noteVerdict(record)};
 if(ackDecision)this.ackEvent(ackDecision,'notification',announce);else announce();return record
 }
 private ackEvent(decision:Record_,event:string,publish:()=>void,finish?:()=>void){
 const key=decision.seq+':'+decision.id+':'+event;
 if(!this.deps.journal.ackEventRecorded(decision,event)){
 if(!this.emittedAckEvents.has(key)){this.emittedAckEvents.add(key);publish()}
 // A published event does not prove that the durable effects finished.
 finish?.()
 }
 this.deps.journal.markAckEvent(decision,event)
 }
 private pending(seq:number):{record:Record_;resolution:Record_|null}{
 this.deps.journal.flushAckEvents();
 const record=this.deps.journal.get(seq);if(!record)throw new JournalError('reply_to_missing','нет записи #'+seq);
 if(record.ack!=='pending')throw new JournalError('ack_not_pending','запись #'+seq+' не ждёт подтверждения владельца');
 return {record,resolution:ackResolution(record,this.deps.journal.repliesTo(seq))}
 }
 private ackComplete(resolution:Record_):boolean{return this.deps.journal.ackEventRecorded(resolution,resolution.kind==='ack'?'confirmed':'notification')}
 pendingAcks():Record_[]{this.deps.journal.flushAckEvents();return this.deps.journal.read({limit:0}).filter(record=>{
 if(record.origin==='steer'||record.ack!=='pending')return false;
 const resolution=ackResolution(record,this.deps.journal.repliesTo(record.seq));return !resolution||!this.ackComplete(resolution)
 })}
 confirmAck(seq:number):Record_ {
 const {record,resolution}=this.pending(seq);
 if(resolution?.kind==='rejected'){
 if(this.ackComplete(resolution))throw new JournalError('ack_closed','запись #'+seq+' уже отклонена владельцем');
 return this.finishRejection(record,resolution)
 }
 const ack=resolution??this.deps.journal.append({sender:'owner',to:[record.from],kind:'ack',text:'подтверждено #'+seq,reply_to:seq,policy:this.deps.policy?.version??0});
 this.deps.journal.markAcked(seq);this.ackEvent(ack,'confirmed',()=>{
 this.emit({type:'posted',record:ack,initiator:{seat:'owner',trust:'owner'}});this.emit({type:'delivered',record,deliverySeq:ack.seq})
 },()=>{if(record.kind==='verdict')this.noteVerdict(record)});return ack
 }
 rejectAck(seq:number):Record_ {
 const {record,resolution}=this.pending(seq);
 if(resolution&&(resolution.kind==='ack'||this.ackComplete(resolution)))throw new JournalError('ack_closed','решение по записи #'+seq+' уже принято');
 const rejected=resolution??this.deps.journal.append({sender:'harness',to:['owner'],kind:'rejected',text:'#'+seq+' '+record.kind+' от '+record.from+' отклонено владельцем',reply_to:seq});
 return this.finishRejection(record,rejected)
 }
 private finishRejection(record:Record_,rejected:Record_):Record_ {
 this.ackEvent(rejected,'rejected',()=>this.emit({type:'rejected',record:rejected,sender:record.from,reason:'владелец не подтвердил'}));
 if(this.deps.roleOf(record.from)===null){this.ackEvent(rejected,'notification',()=>{});return rejected}
 const text='Запись #'+record.seq+' ('+record.kind+') владелец не подтвердил, она не доставлена.';
 const note=this.deps.journal.read({limit:0}).find(r=>r.seq>rejected.seq&&r.kind==='note'&&r.from==='harness'&&r.origin==='ack'&&r.text===text&&r.to.length===1&&r.to[0]===record.from&&(r.reply_to===record.seq||r.reply_to===null));
 if(note)this.ackEvent(rejected,'notification',()=>{this.emit({type:'posted',record:note,initiator:{seat:'harness',trust:'harness'}});this.emit({type:'delivered',record:note,deliverySeq:note.seq})});
 else this.write({to:[record.from],kind:'note',text,thread:record.thread??null,reply_to:record.seq,origin:'ack'},{seat:'harness',trust:'harness'},true,rejected);
 return rejected
 }
 private applyVerdict(record:Record_){
 if(!record.thread)return;const state=this.states.get(record.thread)??{rounds:0,accepted:false,lastScore:null,sha:null,merged:null};
 state.rounds=Math.max(state.rounds,record.round??0);state.lastScore=record.score??null;if(record.accepted){state.accepted=true;state.sha=record.sha||state.sha}this.states.set(record.thread,state)
 }
 private restoreThreads(){
 this.states.clear();const records=this.deps.journal.read({limit:0});
 for(const record of records){
 if(record.kind==='verdict'&&record.ack!=='pending')this.applyVerdict(record);
 else if(record.kind==='ack'&&record.from==='owner'&&record.reply_to!=null){const target=this.deps.journal.get(record.reply_to);if(target?.kind==='verdict'&&ackResolution(target,this.deps.journal.repliesTo(target.seq))?.seq===record.seq)this.applyVerdict(target)}
 else if(record.kind==='status'&&record.origin==='merge'&&record.thread){
 const state=this.states.get(record.thread)??{rounds:0,accepted:true,lastScore:null,sha:record.sha??null,merged:null};
 state.merged=record.merged||(this.deps.hasRepo()&&state.sha?this.deps.mergeCommitFor(state.sha):null)||state.merged;this.states.set(record.thread,state)
 }
 }
 }
 private noteVerdict(record:Record_){
 if(!record.thread)return;this.restoreThreads();const state=this.states.get(record.thread)!;this.emit({type:'verdict',record,thread:{...state}});
 const bounds=record.bounds??{},max=bounds.max_rounds;
 const line='Тред '+record.thread+': вердикт #'+record.seq+' от '+this.deps.labelOf(record.from)+', балл '+record.score+', раунд '+record.round+(max?' из '+String(max):'')+(record.accepted?' — принято.':' — не принято.');
 const orchestrators=this.deps.liveSeats().filter(seat=>this.deps.roleOf(seat)==='orchestrator'&&seat!==record.from);
 const effect=(kind:'status'|'escalation',to:string[],text:string)=>{
 const existing=this.deps.journal.repliesTo(record.seq).find(r=>r.from==='harness'&&r.kind===kind&&r.thread===record.thread&&r.origin==='verdict');
 if(!existing){const written=this.postCore({to,kind,text,thread:record.thread,reply_to:record.seq,origin:'verdict'},{seat:'harness',trust:'harness'});this.announcedVerdictEffects.add(written.id);return}
 // A failed append may have reached disk before its events were published.
 if(!this.announcedVerdictEffects.has(existing.id)){this.announcedVerdictEffects.add(existing.id);this.emit({type:'posted',record:existing,initiator:{seat:'harness',trust:'harness'}});this.emit({type:'delivered',record:existing,deliverySeq:existing.seq})}
 };
 if(orchestrators.length)effect('status',orchestrators,line);
 if(!record.accepted&&max&&(record.round??0)>=Number(max))effect('escalation',['owner',...orchestrators],'Тред '+record.thread+': раунды ревью исчерпаны ('+String(max)+'), веха не принята. Нужно решение владельца.');
 }
}
