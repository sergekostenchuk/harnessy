export type Mode = 'chat'|'read'|'check'|'web'|'ask'|'edit'|'all';
export type Vendor = string;
export type BuiltinVendor = 'claude'|'codex';
export interface TurnModeSupport {ok:boolean;reason?:string;note?:string}
export type TurnModes=Record<'read'|'edit'|'all',TurnModeSupport>&Partial<Record<Mode,TurnModeSupport>>;
export const providerId=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v)&&!['human','owner','harness'].includes(v);
export interface Seat { id:string; vendor:Vendor; label:string; model:string; mode:Mode; cwd:string; sessionId:string|null; writePaths:string[]; worktree:string|null }
/** input is fresh input only; cacheRead is disjoint. Missing/invalid measurements stay null. */
export interface Usage {input:number|null;output:number|null;cacheRead:number|null}
export interface LimitWindow {label:string;percentUsed:number;resetsAt:number|null;windowMinutes:number|null}
export type LimitsCode='limits_unsupported'|'limits_not_applicable'|'limits_auth'|'limits_rate_limited'|'limits_unavailable'|'limits_invalid'|'limits_timeout'|'limits_storage';
export interface LimitCredits {hasCredits:boolean;unlimited:boolean;balance:number|null}
export function limitCredits(raw:unknown):LimitCredits|null {
 if(!record(raw)||typeof raw.hasCredits!=='boolean'||raw.unlimited!==undefined&&typeof raw.unlimited!=='boolean')return null;
 const balance=typeof raw.balance==='string'&&/^\d+(?:\.\d+)?$/.test(raw.balance)?Number(raw.balance):raw.balance;
 if(!(balance===null||balance===undefined||typeof balance==='number'&&Number.isFinite(balance)&&balance>=0)||raw.hasCredits&&!raw.unlimited&&balance==null)return null;
 return {hasCredits:raw.hasCredits,unlimited:raw.unlimited===true,balance:typeof balance==='number'?balance:null};
}
export type ProviderLimits={ok:true;plan:string|null;planLevel?:'5x'|'20x'|null;extraUsageEnabled?:boolean|null;windows:LimitWindow[];fetchedAt:number;source:string;credits?:LimitCredits;resetCredits?:number}|{ok:false;code:LimitsCode;reason:string;retryAfterSeconds?:number};

export function limitPlan(value:unknown):string|null {const plans:Record<string,string>={max:'Max',pro:'Pro',plus:'Plus',team:'Team',business:'Business',enterprise:'Enterprise',edu:'Edu',free:'Free',go:'Go'};return typeof value==='string'&&Object.hasOwn(plans,value.toLowerCase())?plans[value.toLowerCase()]!:null}
export type TurnEvent =
 | {type:'delta';text:string}|{type:'tool';name:string;detail:string}|{type:'toolError';text:string}
 | {type:'approval';id:string;title:string;detail:string}|{type:'approvalResolved';id:string;decision:'allow'|'deny'|'timeout'}
 | {type:'done';sessionId:string|null;model:string;durationMs:number;usage:Usage}|{type:'error';text:string};
export type ToolResult={ok:true;text:string}|{ok:false;error:string;code?:string};
export type Kind='task'|'status'|'question'|'answer'|'review-request'|'verdict'|'blocker'|'escalation'|'note'|'stop'|'resume'|'digest'|'proposal'|'decision'|'report';
export interface SendArgs {to:string;kind:Kind;text:string;thread?:string;reply_to?:number;evidence?:string[];score?:number;round?:number;sha?:string}
export interface AskArgs {to:string;text:string;thread?:string}
export interface ReadPaneArgs {pane:string;last_n?:number}
export interface MergeArgs {sha:string;message?:string}
export interface AssignRoleArgs {role:string;model?:string;mode?:Mode;specialization?:{title:string;text:string}}
export interface ProposedSeat {kind:'assistant'|'architect'|'worker'|'reviewer'|'tester'|'researcher';label:string;vendor:Vendor;model:string;mode:Mode;intro:string}
export interface ProposeSeatsArgs {seats:ProposedSeat[];proposalId?:string;version?:number}
export interface CreateSeatsArgs {proposalId:string;version:number}
export interface PeerTools {
 proposeSeats(a:ProposeSeatsArgs):Promise<ToolResult>;createSeats(a:CreateSeatsArgs):Promise<ToolResult>;
 send(a:SendArgs):Promise<ToolResult>;ask(a:AskArgs):Promise<ToolResult>;readPane(a:ReadPaneArgs):Promise<ToolResult>;
 merge(a:MergeArgs):Promise<ToolResult>;assignRole(a:AssignRoleArgs):Promise<ToolResult>
}
export type RouteEnv=Partial<Record<'HTTPS_PROXY'|'HTTP_PROXY'|'ALL_PROXY'|'https_proxy'|'http_proxy'|'all_proxy',string>>;
export const FORBIDDEN_ENV={claude:['ANTHROPIC_API_KEY','CLAUDECODE','CLAUDE_CODE_SIMPLE'],codex:['OPENAI_API_KEY']} as const;
export interface TurnHandle {interrupt():Promise<void>;steer(text:string):Promise<void>}
export interface ToolTrace {id:string;name:string;phase:'call'|'result';data?:unknown;outcome?:'ok'|'failed'|'rejected'|'timeout'|'cancelled';reason?:string;error?:string}
export interface TurnContext {
 /** Optional owner-probe binding check, after preparation and immediately before inference. */
 beforeModel?(run:{provider:string;model:string}):Promise<void>;
 traceTool?<T>(name:string,args:unknown,run:()=>Promise<T>):Promise<T>;traceEvent?(event:ToolTrace):void;
 modelStarted?():void;signal:AbortSignal;publish(ev:TurnEvent):void;askApproval(title:string,detail:string):Promise<boolean>;
 session(id:string):void;setHandle(h:TurnHandle|null):void;env:RouteEnv;roleNote:string;
 peers:{id:string;label:string;vendor:Vendor}[];tools:PeerTools;relayDepth:number;projectDir:string|null;appUrl:string;
 registerProcessToken(token:string):void;revokeProcessToken(token:string):void;writableRoots:string[]
}
export type ErrorCode='no_binary'|'not_logged_in'|'session_missing'|'model_unsupported'|'protocol'|'transport_lost'|'cancelled'|'busy'|'cwd_changed'|'turn_failed'|'unknown_request'|'models_unavailable'|'mode_unsupported'|'capability_unsupported'|'permission_denied'|'provider_unknown'|'not_installed'|'platform_unsupported'|'login_terminal_failed'|'login_changed'|'state_dir_tampered';
export class ProviderError extends Error {
 code:ErrorCode;vendorText:string;sessionId:string|null;
 constructor(code:ErrorCode,vendorText:string,sessionId:string|null=null){super(vendorText);this.name='ProviderError';this.code=code;this.vendorText=vendorText;this.sessionId=sessionId}
}
export interface Provider {
 readonly vendor:Vendor;runTurn(seat:Seat,message:string,ctx:TurnContext):Promise<{text:string;sessionId:string|null;interrupted?:boolean}>;
 listSessions(cwd:string):Promise<{id:string;title:string;updated:number}[]>;
 sessionMessages(cwd:string,id:string):Promise<{role:'me'|'ai';text:string}[]>;
 auth():Promise<{loggedIn:boolean;[k:string]:unknown}>;models():Promise<{id:string;label:string}[]>;
 limits?(signal?:AbortSignal):Promise<ProviderLimits>;
 reset():Promise<void>;close():Promise<void>
}
export function record(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v)}
export function snapshot(seat:Seat,ctx:TurnContext):Seat {
 if(!record(seat)||typeof seat.id!=='string'||!seat.id||typeof seat.cwd!=='string'||!seat.cwd||!['claude','codex'].includes(seat.vendor)||!['chat','read','check','web','ask','edit','all'].includes(seat.mode)||
 typeof seat.model!=='string'||typeof seat.label!=='string'||!Array.isArray(seat.writePaths)||!seat.writePaths.every(p=>typeof p==='string')||
 !(seat.sessionId===null||typeof seat.sessionId==='string')||!(seat.worktree===null||typeof seat.worktree==='string'))
 throw new ProviderError('protocol','invalid Seat');
 if(!record(ctx)||!ctx.signal||typeof ctx.signal.addEventListener!=='function'||typeof ctx.signal.aborted!=='boolean'||
 (ctx.modelStarted!==undefined&&typeof ctx.modelStarted!=='function')||!record(ctx.env)||!record(ctx.tools)||!Array.isArray(ctx.peers)||!ctx.peers.every(p=>record(p)&&typeof p.id==='string'&&typeof p.label==='string'&&providerId(p.vendor))||
 !Array.isArray(ctx.writableRoots)||!ctx.writableRoots.every(p=>typeof p==='string')||typeof ctx.roleNote!=='string'||typeof ctx.relayDepth!=='number'||
 !(ctx.projectDir===null||typeof ctx.projectDir==='string')||typeof ctx.appUrl!=='string'||
 ['publish','askApproval','session','setHandle','registerProcessToken','revokeProcessToken'].some(k=>typeof (ctx as unknown as Record<string,unknown>)[k]!=='function')||
 ['send','ask','readPane','merge','assignRole','proposeSeats','createSeats'].some(k=>typeof (ctx.tools as unknown as Record<string,unknown>)[k]!=='function'))
 throw new ProviderError('protocol','invalid TurnContext');
 return {...seat,writePaths:[...seat.writePaths]};
}
export async function approval(ctx:TurnContext,title:string,detail:string,requestSignal:AbortSignal=ctx.signal):Promise<boolean>{
 const signal=AbortSignal.any([ctx.signal,requestSignal]);
 if(signal.aborted)return false;
 let stop:()=>void=()=>{};
 const cancelled=new Promise<boolean>(resolve=>{stop=()=>resolve(false);signal.addEventListener('abort',stop,{once:true})});
 try{const allowed=await Promise.race([Promise.resolve().then(()=>signal.aborted?false:ctx.askApproval(title,detail)).catch(()=>false),cancelled]);return allowed===true&&!signal.aborted}
 finally{signal.removeEventListener('abort',stop)}
}
