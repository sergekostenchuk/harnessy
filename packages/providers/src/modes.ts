import type {Mode,Seat,TurnContext} from './types.ts';
export const PEER_TOOLS=['mcp__panes__send','mcp__panes__ask','mcp__panes__read_pane'];
export const WORK_TOOLS=['Read','Edit','Write','MultiEdit','Bash','Glob','Grep','WebFetch','WebSearch','NotebookEdit'];
export const SAFE_BASH=['Bash(git:*)','Bash(ls:*)','Bash(cat:*)','Bash(pwd)','Bash(find:*)','Bash(grep:*)','Bash(rg:*)','Bash(mkdir:*)','Bash(head:*)','Bash(tail:*)','Bash(wc:*)','Bash(od:*)','Bash(diff:*)','Bash(npm test:*)','Bash(npm run:*)','Bash(node:*)','Bash(python3:*)'];
export const MODES:Record<Mode,{tools:string[];permission:'default'|'acceptEdits'|'bypassPermissions';sandbox:'read-only'|'workspace-write'|'danger-full-access';approval:'never'|'on-request';tail:string}>={
 chat:{tools:[],permission:'default',sandbox:'read-only',approval:'never',tail:''},
 read:{tools:['Read','Glob','Grep','Edit','Write','MultiEdit'],permission:'default',sandbox:'read-only',approval:'never',tail:' Только читай и анализируй, правок не делай.'},
 check:{tools:['Read','Glob','Grep','Bash','Edit','Write','MultiEdit'],permission:'default',sandbox:'read-only',approval:'on-request',tail:' Проверяй прогоном: команды разрешены, правки кода — нет.'},
 web:{tools:['Read','Glob','Grep','WebFetch','WebSearch','Edit','Write','MultiEdit'],permission:'default',sandbox:'read-only',approval:'on-request',tail:' Интернет разрешён; каждый факт с источником.'},
 ask:{tools:WORK_TOOLS,permission:'default',sandbox:'workspace-write',approval:'on-request',tail:''},
 edit:{tools:WORK_TOOLS,permission:'acceptEdits',sandbox:'workspace-write',approval:'on-request',tail:''},
 all:{tools:WORK_TOOLS,permission:'bypassPermissions',sandbox:'danger-full-access',approval:'never',tail:''}
};
export function codexMode(seat:Seat,ctx:TurnContext){
 const row=MODES[seat.mode];const sandbox=seat.mode==='check'&&seat.worktree?'workspace-write':row.sandbox;
 const sandboxPolicy=sandbox==='danger-full-access'?{type:'dangerFullAccess'}:sandbox==='read-only'?{type:'readOnly',networkAccess:false}:{type:'workspaceWrite',writableRoots:[...ctx.writableRoots],networkAccess:false,excludeTmpdirEnvVar:false,excludeSlashTmp:false};
 return {sandbox,approvalPolicy:row.approval,sandboxPolicy};
}
export function pathRules(seat:Seat,projectDir:string|null):string[]{
 const rules=seat.writePaths.flatMap(p=>['Edit','Write','MultiEdit'].map(t=>t+'('+p+'/**)'));
 if(projectDir)rules.push(...['Edit','Write','MultiEdit'].map(t=>t+'(//'+projectDir.replace(/^\/+/, '')+'/.harness/evidence/**)'));
 return rules;
}
