export interface TranscriptMessage {readonly role:string;readonly text:string;readonly ts?:number}
export interface SeatView {readonly id:string;readonly role:string;readonly label:string;readonly model:string;readonly mode:string;readonly writePaths:readonly string[];readonly worktree:string|null;readonly branch:string|null}
export interface TeamView {readonly integrationBranch:string;readonly mergeRoles:readonly string[]}
export interface RoleNoteDeps {readonly projectDir:string;readonly repoRoot:string|null;readonly team:TeamView|null;readonly instructionText:string;readonly policySummary:string|null}
export interface PeerView {readonly id:string;readonly role:string;readonly label:string;readonly model:string;readonly mode:string}
export interface JournalPreview {readonly seq:number;readonly from:string;readonly to:readonly string[];readonly kind:string;readonly text:string;readonly origin?:string|null}
export interface OnboardingDeps extends RoleNoteDeps {readonly memoryText:string;readonly peers:readonly PeerView[];readonly records:readonly JournalPreview[];readonly now:Date;readonly modeLabels:Readonly<Record<string,string>>}
export interface DigestViewer {readonly id:string;readonly digest:boolean;readonly seen:Readonly<Record<string,number>>}
export interface DigestPane {readonly id:string;readonly label:string;readonly vendor:string;readonly model:string;readonly mode:string;readonly transcript:readonly TranscriptMessage[]}
export interface ContextUsage {readonly input?:number|null;readonly output?:number|null;readonly cacheRead?:number|null}
export interface CardPane {readonly id:string;readonly label:string;readonly model:string;readonly busy:boolean;readonly tokens:ContextUsage|null;readonly transcript:readonly TranscriptMessage[]}
export interface CardDeps {readonly instructionText:string;readonly roleNote:string;readonly chat:Readonly<Record<string,unknown>>|null}
export interface ContextPart {key:string;label:string;tokens:number;est:boolean;count?:number;residual?:boolean}
export interface ContextItem {i:number;title:string;tokens:number;ts:number;role?:string}
