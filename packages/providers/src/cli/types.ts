import type {Seat,TurnContext,Mode,Usage,ToolTrace,ProviderLimits,ErrorCode} from '../types.ts';

/** Runtime registration of new vendors is separate from their process driver. */
export type CliSeat=Omit<Seat,'vendor'>&{vendor:string};
export type CliContext=Omit<TurnContext,'peers'>&{peers:{id:string;label:string;vendor:string}[]};
export interface CliAuth {loggedIn:boolean;email?:string|null;plan?:string|null}
export interface CliModel {id:string;label:string}
export interface CliCommand {args:string[];input?:string}
export interface CliProcessRequest extends CliCommand {binary:string;cwd:string;env:NodeJS.ProcessEnv;timeoutMs:number;maxBytes:number}
export interface CliProcessResult {stdout:string;stderr:string;code:number|null;signal:NodeJS.Signals|null}
export type CliExecutor=(request:CliProcessRequest,signal:AbortSignal,hooks?:{stdout?(text:string):void;started?():void})=>Promise<CliProcessResult>;
export interface CliProbe<T> {command:CliCommand;exitCodes?:readonly number[];parse(result:CliProcessResult):T}
export type CliAuthProbe=CliProbe<CliAuth>|{file(env:NodeJS.ProcessEnv):string;parse(text:string|null):CliAuth};
export interface CliMcpServer {command:string;args:string[];env:{PANE_ID:string;APP_URL:string;PANE_TOKEN:string;SEATS:string}}
export interface CliTurnInput {seat:CliSeat;message:string;roleNote:string;peers:CliContext['peers'];writableRoots:string[]}
export type CliEvent=
 | {type:'session';id:string}
 | {type:'delta';text:string}
 | {type:'tool.call';id:string;name:string;input?:unknown}
 | {type:'tool.result';id:string;output?:unknown;outcome:NonNullable<ToolTrace['outcome']>;reason?:string}
 | {type:'done';text?:string;sessionId?:string|null;usage?:Usage;durationMs?:number}
 | {type:'error';code:ErrorCode;text:string};
export interface CliDescriptor {
 id:string;name:string;binary:string;
 /** Display only: the driver never starts an interactive login. */
 login:CliCommand;
 version:CliProbe<string>;auth:CliAuthProbe;models:CliProbe<CliModel[]>;
 /** Explicit flags, with no permissive fallback for a missing mode. */
 modes:Partial<Record<Mode,(input:CliTurnInput)=>string[]>>;
 forbiddenEnv:readonly string[];
 turn:{format:'json'|'stream-json'|'text';command(input:CliTurnInput):CliCommand;decode?(value:unknown):CliEvent[]};
 resume?:((sessionId:string)=>string[]);
 /** A private per-turn file; serialize receives only Harnessy's MCP server. */
 mcp:{serialize(server:CliMcpServer):string;args(configPath:string):string[]};
 limits?:CliProbe<ProviderLimits>;
 sessions?:{list(cwd:string):CliProbe<{id:string;title:string;updated:number}[]>;messages(cwd:string,id:string):CliProbe<{role:'me'|'ai';text:string}[]>};
 /** Provider-specific exit status classification; stdout is never assumed to be a successful answer. */
 failure?(result:CliProcessResult):{code:ErrorCode;text:string};
}
export interface CliDependencies {execute:CliExecutor;env:NodeJS.ProcessEnv;cwd:string;temporaryDirectory:string;probeTimeoutMs:number;turnTimeoutMs:number;maxBytes:number}
