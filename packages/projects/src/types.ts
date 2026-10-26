export type CommandResult={code:number;stdout:string;stderr:string};
export type GitRunner=(args:string[],cwd:string,timeout?:number)=>Promise<CommandResult>;
export type CurlRunner=(args:string[],timeout:number)=>Promise<CommandResult>;
export interface OwnerPaths {projects:string;lastProject:string;pins:string;settings:string;connections:string}
export interface ChatMeta {title:string;label:string;pane:string}
export interface Pin {kind:'folder'|'chat';path:string;name:string;chat?:string;title?:string;label?:string;pane?:string}
export interface ProjectChat {id:string;pane:string;title:string;created:number}
export interface ProjectInfo {chats:ProjectChat[]|null;chatError:string|null;path:string;name:string;hasTeam:boolean;seats:number|null;git:boolean;current:boolean}
export type JsonObject=Record<string,unknown>;
export type RouteEnv=Partial<Record<'HTTPS_PROXY'|'HTTP_PROXY'|'ALL_PROXY'|'https_proxy'|'http_proxy'|'all_proxy',string>>;
export interface CheckResult {ts:number;route:string;ok:boolean;ip:string;country:string;ms:number|null;error:string;state:'failed'|'checked'|'changed'|'matches'|'mismatch'|'stale';city?:string;prevIp?:string;seq?:number}
export interface RouteConfig {route:'direct'|'proxy'|'iface';proxy:string;iface:string;label:string;expect:string;lastCheck:CheckResult|null;state:string;rev:number;seq:number}
