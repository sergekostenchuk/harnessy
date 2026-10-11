import test from 'node:test';
import assert from 'node:assert/strict';
import {roleKnowledgeText,teamKnowledgeChanges,teamMemberState,type TeamMemberKnowledge} from './team-knowledge.ts';
const member:TeamMemberKnowledge={id:'worker-1',label:'Юрист',kind:'worker',proposedKind:'worker',model:'w1',mode:'read',task:'Проверь договор',state:'proposed',chat:null,createdBy:null};
test('251: knowledge contains memory, document links, full intro and truthful row states',()=>{
 const lead={...member,id:'lead',label:'Оркестратор',kind:'orchestrator',proposedKind:'orchestrator',state:'created' as const,chat:'c0'},created={...member,kind:'researcher',state:'created' as const,chat:'c1',createdBy:'владелец (интерфейс)'};
 const text=roleKnowledgeText({project:'/case',pane:member.id,chat:'c1',proposalId:'p1',version:1,memory:'## Цель\nЗащитить интересы клиента',documents:[{project:'/source',path:'claim.md'}],intro:'Полная\nвводная',team:[lead,created,{...member,id:'worker-2'}]});
 for(const value of ['Защитить интересы клиента','/source/claim.md','Полная\nвводная','Оркестратор','создана владельцем как researcher','предложена · чата ещё нет'])assert.ok(text.includes(value));
 assert.equal(teamMemberState({...member,state:'creating'}),'создаётся · создание ещё не завершено');
});
test('252: team changes include newly created or reconfigured rows, never invent changes for unchanged snapshots',()=>{
 const created={...member,kind:'researcher',state:'created' as const,chat:'c1',createdBy:'владелец (интерфейс)'};
 assert.equal(teamKnowledgeChanges([member],[{...member}]),'');assert.match(teamKnowledgeChanges([member],[created]),/^изменения в команде:[\s\S]*создана владельцем как researcher/);
 assert.match(teamKnowledgeChanges([created],[{...created,model:'c1'}]),/c1/);assert.match(teamKnowledgeChanges([created],[]),/больше не входит/);
});
