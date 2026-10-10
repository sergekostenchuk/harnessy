import type {Provider,Vendor,TurnHandle,AskArgs,MergeArgs,AssignRoleArgs,Usage,Mode} from '@harnessy/providers';
import type {Record_,Channel,Journal,JournalOptions,Policy,Initiator} from '@harnessy/journal';
import type {Team} from '@harnessy/team';
import type {Connections,ProjectRegistry,GitOps,Settings,Pins} from '@harnessy/projects';
import type {Pane,Registry} from './pane.ts';
import type {Runtime} from './runtime.ts';
import type {EventBus} from './events.ts';
import type {StateStore,StateIO,ResultMessage} from './state.ts';
export interface Clock {now():number;setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(timer:unknown):void}
export const systemClock:Clock={now:Date.now,setTimeout(fn,ms){const t=setTimeout(fn,ms);t.unref();return t},clearTimeout(t){clearTimeout(t as ReturnType<typeof setTimeout>)}};
export type RuntimeEvent={type:string;[field:string]:unknown};
export interface Waiting {status:'uncertain'|'recovering';recordSeqs:number[];startedAt:number|null;turnInstanceId:string;actions:('retry'|'skip'|'finish')[]}
export type ModelCatalog=Partial<Record<Vendor,{id:string;label?:string}[]>>;
export interface TurnScope {readonly projectDir:string;readonly seatId:string;readonly turnInstanceId:string}
export type TurnRecords=readonly Readonly<Record_>[];
export interface ActionContext {readonly runtime:Runtime;readonly scope:TurnScope;readonly turnRecords:TurnRecords;readonly relayDepth:number;assertActive():void}
export interface AfterTurnContext {readonly runtime:Runtime;readonly project:ProjectState;readonly pane:Pane;readonly turnInstanceId:string;readonly records:TurnRecords;readonly text:string;readonly interrupted:boolean}
export type BridgeSendArgs=Omit<import('@harnessy/providers').SendArgs,'to'|'reply_to'>&{to:string|string[];reply_to?:number|null};
export interface BridgeFailure {ok:false;code:string;error:string}
export type SendResult=BridgeFailure|{ok:true;seq:number;thread:string|null;to:string[]};
export type ReadPaneResult=BridgeFailure|{ok:true;text:string};
export type AskResult=BridgeFailure|{ok:true;reply:string;seq:number};
export type MergeResult=BridgeFailure|{ok:true;sha:string;mergeSha:string;branch:string;thread?:string};
export type AssignRoleResult=BridgeFailure|{ok:true;pane:string;label:string;model:string;mode:Mode;mandate:number};
export interface OwnerMergeContext {readonly runtime:Runtime;readonly project:ProjectState;readonly initiator:Initiator;assertActive():void}
export interface RuntimeActions {
 ask(args:AskArgs,ctx:ActionContext):Promise<AskResult>;
 merge(args:MergeArgs,ctx:ActionContext):Promise<MergeResult>;
 mergeOwner?(args:MergeArgs,ctx:OwnerMergeContext):Promise<MergeResult>;
 closeProject?(project:ProjectState):void;
 assignRole(args:AssignRoleArgs,ctx:ActionContext):Promise<AssignRoleResult>;
 afterTurn(ctx:AfterTurnContext):Promise<'completed'|'unavailable'>;
 restorePendingAcks(ctx:{runtime:Runtime;project:ProjectState}):Promise<void>;
 cancelAsks(scope:TurnScope,reason:string):void;
}
export interface RuntimeDeps {
 projectDir:string;providers:Partial<Record<Vendor,Provider>>;appUrl:string;models?:ModelCatalog;clock?:Clock;
 connections?:Connections;projectRegistry?:ProjectRegistry;gitops?:GitOps;stateIO?:StateIO;journalOptions?:JournalOptions;
 id?:()=>string;defaultDir?:string;settings?:Settings|((currentProject:()=>string|null)=>Settings);pins?:Pins|((currentProject:()=>string|null,chatMeta:(id:string)=>import('@harnessy/projects').ChatMeta|null)=>Pins);
}
export interface ActiveTurn {
 scope:TurnScope;controller:AbortController;pane:Pane;records:TurnRecords;deliverySeq:number;
 relayDepth:number;attemptNumber:number;handle:TurnHandle|null;started:boolean;stopRequested:boolean;terminal:RuntimeEvent|null;partial:string;
 finished:Promise<void>;finish():void;timer:unknown;resetWait:Promise<void>;releaseReset():void;result:ResultMessage|null;injected:import('./state.ts').TranscriptMessage[];
}
export interface ProjectState {
 generation:number;dir:string;closed:boolean;starting:boolean;now:()=>number;editing:Map<string,symbol>;materializing:Set<string>;restoreFailed:Map<string,string>;team:Team|null;repoRoot:string|null;policy:Policy|null;journal:Journal;channel:Channel;
 registry:Registry;owner:Pane;bus:EventBus;state:StateStore;lineErrors:string[];halted:boolean;
 active:Map<string,ActiveTurn>;pumps:Map<string,Promise<void>>;resets:Map<Vendor,Promise<void>>;routeJobs:Map<Vendor,Promise<unknown>>;processEpoch:Map<Vendor,number>;wakeups:Set<string>;
}
export interface DoneEvent extends RuntimeEvent {type:'done';sessionId:string|null;model:string;durationMs:number;usage:Usage;interrupted?:boolean}
