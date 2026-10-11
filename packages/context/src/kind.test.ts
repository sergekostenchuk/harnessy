import test from 'node:test';
import assert from 'node:assert/strict';
import {onboarding,roleNote,type SeatView,type OnboardingDeps} from './index.ts';
const deps:OnboardingDeps={projectDir:'/project/legal',repoRoot:'/project/legal',team:{integrationBranch:'main',mergeRoles:['orchestrator']},instructionText:'',policySummary:null,memoryText:'',records:[],now:new Date('2026-10-11T12:00:00Z'),modeLabels:{read:'чтение'},peers:[{id:'fake',kind:'worker',role:'orchestrator',label:'Ложный руководитель',model:'w1',mode:'read'},{id:'lead',kind:'orchestrator',role:'юрист',label:'Тимлид',model:'w1',mode:'read'}]};
const seat:SeatView={id:'orchestrator',kind:'worker',role:'orchestrator',label:'Юрист',model:'w1',mode:'read',writePaths:[],worktree:null,branch:null};

test('153: onboarding and merge hints follow verified kind despite a misleading role/id; room has no role authority',()=>{
 for(const kind of ['worker',null]){const fake={...seat,kind},text=onboarding(fake,'тест',deps);assert.match(text,/Прочитай и ответь одной-двумя фразами/);assert.doesNotMatch(text,/Ответь владельцу коротко: ты оркестратор/);assert.doesNotMatch(roleNote(fake,deps),/Слияние принятых вех/);assert.match(text,/Ложный руководитель · w1 · чтение; Тимлид · w1 · чтение — ведёт обмен/)}
 const lead={...seat,id:'legal-lead',kind:'orchestrator',role:'юрист-руководитель'};assert.match(onboarding(lead,'тест',deps),/Ответь владельцу коротко: ты оркестратор/);assert.match(roleNote(lead,deps),/Слияние принятых вех/);
});
