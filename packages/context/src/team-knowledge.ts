export interface TeamMemberKnowledge {
 id:string;label:string;kind:string;proposedKind:string;model:string;mode:string;task:string;
 state:'created'|'creating'|'proposed';chat:string|null;createdBy:string|null;
}
export interface RoleKnowledge {
 project:string;pane:string;chat:string;proposalId:string;version:number;
 memory:string;documents:{project:string;path:string}[];intro:string;team:TeamMemberKnowledge[];text:string;
}
export function isTeamSnapshot(value:unknown):value is TeamMemberKnowledge[] {
 return Array.isArray(value)&&value.every(m=>m&&typeof m==='object'&&['id','label','kind','proposedKind','model','mode','task'].every(k=>typeof m[k]==='string')&&['created','creating','proposed'].includes(m.state)&&(m.chat===null||typeof m.chat==='string')&&(m.createdBy===null||typeof m.createdBy==='string'));
}
export function teamMemberState(member:TeamMemberKnowledge):string {
 if(member.state==='proposed')return 'предложена · чата ещё нет';
 if(member.state==='creating')return 'создаётся · создание ещё не завершено';
 return member.kind!==member.proposedKind?'создана владельцем как '+member.kind:'создана · чат открыт';
}
export function teamMemberText(member:TeamMemberKnowledge):string {
 return member.label+' ['+member.id+'] · '+member.kind+' · '+member.model+' · '+member.mode+' · '+teamMemberState(member)+(member.createdBy?' · кем: '+member.createdBy:'')+'\nЗадача: '+member.task;
}
export function roleKnowledgeText(input:Omit<RoleKnowledge,'text'>):string {
 return ['Что знает эта роль','Проект: '+input.project,
  'Цель и память проекта:\n'+(input.memory.trim()||'Память проекта пока не заполнена.'),
  'Прикреплённые документы (ссылки):\n'+(input.documents.map(d=>d.project+'/'+d.path).join('\n')||'Документы не прикреплены.'),
  'Вводная роли:\n'+input.intro,
  'Состав команды:\n'+input.team.map(teamMemberText).join('\n\n')].join('\n\n');
}
export function teamKnowledgeChanges(previous:readonly TeamMemberKnowledge[],current:readonly TeamMemberKnowledge[]):string {
 const before=new Map(previous.map(m=>[m.id,m])),after=new Set(current.map(m=>m.id));
 const changed=current.filter(m=>JSON.stringify(before.get(m.id))!==JSON.stringify(m)).map(teamMemberText);
 for(const m of previous)if(!after.has(m.id))changed.push(m.label+' ['+m.id+'] — больше не входит в состав команды');
 return changed.length?'изменения в команде:\n'+changed.join('\n\n'):'';
}
