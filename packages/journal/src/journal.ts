import * as fs from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {KINDS,SYSTEM_KINDS,JournalError,object,freeze,type Record_,type AppendInput,type DeliveryEntry} from './types.ts';
import {compatJson,localIso,pythonTrim,parseCompat,orderedClone} from './compat-json.ts';
import {PROTOCOL_TEXT,PROTOCOL_VERSION} from './strings.ts';
type JournalFs=Pick<typeof fs,'mkdirSync'|'readFileSync'|'openSync'|'appendFileSync'|'fsyncSync'|'closeSync'|'writeFileSync'|'renameSync'>;
export interface JournalOptions {now?:()=>Date;id?:(milliseconds:number)=>string;fs?:Partial<JournalFs>}
export function ackResolution(record:Record_,replies:Record_[]):Record_|null {
 if(record.ack!=='pending')return null;
 return replies.find(r=>r.seq>record.seq&&(r.kind==='ack'&&r.from==='owner'||r.kind==='rejected'&&r.from==='harness'&&r.to.includes('owner')))??null
}
export function validateForm(input:{to:unknown;text:unknown;evidence?:unknown}) {
 const to=typeof input.to==='string'?[input.to]:input.to;
 if(!Array.isArray(to)||!to.length||!to.every(t=>typeof t==='string'&&!!t))throw new JournalError('to_invalid','адресат — имя места или список мест');
 if(typeof input.text!=='string'||!pythonTrim(input.text))throw new JournalError('text_empty','пустой текст записи');
 if([...input.text].length>100000)throw new JournalError('text_too_long','текст записи длиннее 100000 символов');
 const evidence=input.evidence??[];
 if(!Array.isArray(evidence)||!evidence.every(e=>typeof e==='string'))throw new JournalError('evidence_invalid','evidence — список строк');
 return {to:[...to] as string[],text:input.text,evidence:[...evidence] as string[]}
}
export function requireKind(kind:unknown,system=true):asserts kind is string {
 if(typeof kind!=='string'||!KINDS.includes(kind as never)&&(!system||!SYSTEM_KINDS.includes(kind as never)))throw new JournalError('kind_unknown','неизвестный вид записи: '+String(kind)+'; есть '+KINDS.join(', '))
}
export class Journal {
 readonly channelPath:string;readonly cursorsPath:string;readonly panesPath:string;readonly ackEventsPath:string;
 private io:JournalFs;private now:()=>Date;private id:(milliseconds:number)=>string;
 private records:Record_[]=[];private cursorData:Record<string,number>=Object.create(null);private decisions=new Map<number,Record_>();
 private ackEvents:Record<string,string[]>=Object.create(null);private ackEventsDirty=false;
 private offset=0;private _recovering=false;private _tailBroken=false;private skipped=0;
 get recovering(){return this._recovering}get tailBroken(){return this._tailBroken}get diagnostics(){return {skipped:this.skipped,recovering:this._recovering,tailBroken:this._tailBroken,confirmedSeq:this.records.reduce((max,r)=>Math.max(max,r.seq),0)}}
 get cursors():Readonly<Record<string,number>> {return freeze(orderedClone(this.cursorData))}
 get lastSeq(){this.recover();return this.records.reduce((max,r)=>Math.max(max,r.seq),0)}
 constructor(projectDir:string,options:JournalOptions={}){
 this.io={...fs,...options.fs};this.now=options.now??(()=>new Date());this.id=options.id??(ms=>ms.toString(16)+'-'+randomBytes(3).toString('hex'));
 const state=join(projectDir,'.harness','state');this.io.mkdirSync(state,{recursive:true});
 this.channelPath=join(state,'channel.ndjson');this.cursorsPath=join(state,'cursors.json');this.panesPath=join(state,'panes.json');this.ackEventsPath=join(state,'ack-events.json');
 const bytes=this.readBytes();this.ingest(bytes);this.offset=bytes.length;this.indexDecisions();
 if(!this.records.length){const now=this.now();this.write({seq:0,id:this.id(now.getTime()),ts:localIso(now),from:'harness',to:['*'],kind:'protocol',thread:null,reply_to:null,text:PROTOCOL_TEXT,evidence:[],policy:0,version:PROTOCOL_VERSION,kinds:[...KINDS]})}
 try{const value=parseCompat(this.io.readFileSync(this.cursorsPath,'utf8'));if(object(value)){this.cursorData=orderedClone(value as Record<string,number>);for(const [key,v] of Object.entries(this.cursorData))if(!Number.isSafeInteger(v)||v<0)delete this.cursorData[key]}}catch{}
 try{
 const data=parseCompat(this.io.readFileSync(this.ackEventsPath,'utf8'));
 if(!object(data)||!Object.values(data).every(v=>Array.isArray(v)&&v.every(x=>typeof x==='string')))throw Error('неверная форма');
 this.ackEvents=orderedClone(data as Record<string,string[]>);
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new JournalError('write_failed','события подтверждения не читаются: '+(e instanceof Error?e.message:String(e)))}
 }
 private readBytes():Buffer {try{return this.io.readFileSync(this.channelPath)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return Buffer.alloc(0);throw e}}
 private ingest(bytes:Buffer){
 const lines=bytes.toString('utf8').split('\n');let lastBad=false;this._tailBroken=bytes.length>0&&bytes[bytes.length-1]!==10;
 for(const line of lines){if(!line.trim())continue;let raw:unknown;try{raw=parseCompat(line)}catch{lastBad=true;this.skipped++;continue}
 if(!object(raw)||!Number.isSafeInteger(raw.seq)||Number(raw.seq)<0||typeof raw.from!=='string'||!Array.isArray(raw.to)||!raw.to.every(t=>typeof t==='string')||typeof raw.kind!=='string'){lastBad=true;this.skipped++;continue}
 lastBad=false;this.records.push(freeze(raw as unknown as Record_))
 }
 this._tailBroken||=lastBad
 }
 private recover(){if(!this._recovering)return;const bytes=this.readBytes();
 // The confirmed prefix already lives in memory. Preserve every fragment on disk.
 if(bytes.length<this.offset)throw new JournalError('write_failed','файл журнала укорочен во время восстановления',true);
 if(bytes.length>this.offset)this.ingest(bytes.subarray(this.offset));this.offset=bytes.length;this._tailBroken||=bytes.length>0&&bytes[bytes.length-1]!==10;this.indexDecisions();this._recovering=false
 }
 private indexDecisions(){this.decisions.clear();for(const r of this.records)if(r.ack==='pending'){const answer=ackResolution(r,this.records.filter(a=>a.reply_to===r.seq));if(answer)this.decisions.set(r.seq,answer)}}
 private write(record:Record_){
 const value=freeze(record),line=(this._tailBroken?'\n':'')+compatJson(value)+'\n';let fd:number|undefined;
 try{fd=this.io.openSync(this.channelPath,'a');this.io.appendFileSync(fd,line,'utf8');this.io.fsyncSync(fd)}
 catch(e){this._recovering=true;throw new JournalError('write_failed','запись журнала не сохранена: '+(e instanceof Error?e.message:String(e)),true)}
 finally{if(fd!==undefined)try{this.io.closeSync(fd)}catch{}}
 this.records.push(value);this.offset+=Buffer.byteLength(line);this._tailBroken=false;this.indexDecisions();return value
 }
 append(input:AppendInput):Record_ {
 this.recover();requireKind(input.kind);const form=validateForm(input);let thread=input.thread??null,reply=input.reply_to??null;
 if(reply!==null){const target=this.get(reply);if(!target)throw new JournalError('reply_to_missing','нет записи #'+String(reply));if(thread===null)thread=target.thread??null}
 const now=this.now();const rec:Record_={seq:this.lastSeq+1,id:this.id(now.getTime()),ts:localIso(now),from:input.sender,to:form.to,kind:input.kind,thread,reply_to:reply,text:form.text,evidence:form.evidence,policy:input.policy??0};
 for(const key of ['score','round','origin','accepted','bounds','ack','sha','merged'] as const)if(input[key]!==null&&input[key]!==undefined)Object.assign(rec,{[key]:input[key]});
 if(input.attempt!==undefined)rec.attempt={...input.attempt};
 return this.write(rec)
 }
 get(seq:number):Record_|null {this.recover();for(let i=this.records.length-1;i>=0;i--)if(this.records[i]!.seq===seq)return this.records[i]!;return null}
 read({since=0,limit=200,thread=null,kinds,before}: {since?:number;limit?:number;thread?:string|null;kinds?:readonly string[];before?:number|undefined}={}):Record_[]{
 if(before!==undefined&&(!Number.isSafeInteger(before)||before<=0))throw new JournalError('before_invalid','before: ожидается целое число больше нуля');
 this.recover();const out=this.records.filter(r=>r.seq>since&&(before===undefined||r.seq<before)&&(thread===null||r.thread===thread)&&(!kinds?.length||kinds.includes(r.kind)));if(before!==undefined)out.sort((a,b)=>a.seq-b.seq);return limit?out.slice(-limit):out
 }
 repliesTo(seq:number):Record_[]{this.recover();return this.records.filter(r=>r.reply_to===seq)}
 pendingFor(seat:string):DeliveryEntry[]{
 this.recover();const cursor=this.cursorData[seat]??0,out:DeliveryEntry[]=[];
 for(const record of this.records){if(record.origin==='steer'||SYSTEM_KINDS.includes(record.kind as never)||record.from===seat||!record.to.some(t=>t===seat||t==='*'))continue;
 const resolution=this.decisions.get(record.seq);if(record.ack==='pending'&&resolution?.kind!=='ack')continue;
 const deliverySeq=record.ack==='pending'?resolution!.seq:record.seq;if(deliverySeq>cursor)out.push({record,deliverySeq})}
 return out.sort((a,b)=>a.deliverySeq-b.deliverySeq)
 }
 markAcked(seq:number){this.recover();const record=this.get(seq);if(!record)return;const resolution=ackResolution(record,this.repliesTo(seq));if(resolution)this.decisions.set(seq,resolution)}
 ackEventRecorded(decision:Record_,event:string):boolean{return this.ackEvents[decision.seq+':'+decision.id]?.includes(event)??false}
 markAckEvent(decision:Record_,event:string):void {
 const key=decision.seq+':'+decision.id;
 if(!this.ackEventRecorded(decision,event)){this.ackEvents[key]=[...(this.ackEvents[key]??[]),event];this.ackEventsDirty=true}
 this.flushAckEvents()
 }
 flushAckEvents():void {
 if(!this.ackEventsDirty)return;
 const temp=this.ackEventsPath+'.tmp';let fd:number|undefined;
 try{fd=this.io.openSync(temp,'w');this.io.writeFileSync(fd,compatJson(this.ackEvents,2),'utf8');this.io.fsyncSync(fd);this.io.closeSync(fd);fd=undefined;this.io.renameSync(temp,this.ackEventsPath);this.ackEventsDirty=false}
 catch(e){throw new JournalError('write_failed','события подтверждения не сохранены: '+(e instanceof Error?e.message:String(e)))}
 finally{if(fd!==undefined)try{this.io.closeSync(fd)}catch{}}
 }
 private saveJson(path:string,data:unknown){const temp=path.replace(/\.json$/,'.tmp');try{this.io.writeFileSync(temp,compatJson(data,2),'utf8');this.io.renameSync(temp,path)}catch(e){throw new JournalError('write_failed','состояние не сохранено: '+(e instanceof Error?e.message:String(e)))}}
 advance(seat:string,seq:number){this.recover();if(!Number.isSafeInteger(seq)||seq<0)throw new JournalError('write_failed','курсор доставки должен быть неотрицательным целым');if(seq>(this.cursorData[seat]??0)){const next=orderedClone(this.cursorData,{[seat]:seq});this.saveJson(this.cursorsPath,next);this.cursorData=next}}
 savePanes(data:Record<string,unknown>){this.recover();this.saveJson(this.panesPath,data)}
 loadPanes():Record<string,unknown>{this.recover();try{const value=parseCompat(this.io.readFileSync(this.panesPath,'utf8'));return object(value)?value:{}}catch{return {}}}
}
