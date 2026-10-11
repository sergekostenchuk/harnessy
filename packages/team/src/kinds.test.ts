import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureLine,loadTeam,addSeat,roleOf,instructionsFor,seatKind,SEAT_KINDS,TeamError,parseYaml,type YMap} from './index.ts';
const failure=(e:unknown)=>e instanceof TeamError&&e.code==='kind_invalid';
async function setup(t:TestContext){const dir=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-kind-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));const h=await ensureLine(dir);return {h,file:join(h,'team.yaml')}}

for(const kind of SEAT_KINDS)test('153: verified kind '+kind+' survives domain names; legacy role has an explicit mapping',async t=>{
 const {h,file}=await setup(t);writeFileSync(file,'version: 1\nseats: {legal: {kind: '+kind+', role: "Юрист по договорам", label: "Владелец", vendor: claude, model: w1}}');
 const team=loadTeam(h);assert.equal(team.seats.legal!.role,'Юрист по договорам');assert.equal(roleOf(team,'legal'),kind);assert.equal(roleOf(team,'owner'),null);
 writeFileSync(file,'version: 1\nseats: {legal: {role: '+(kind==='worker'?'executor':kind)+', vendor: codex}}');assert.equal(loadTeam(h).seats.legal!.kind,kind);
 assert.equal(seatKind(undefined,kind),kind);
});

test('153: missing, unknown, malformed and owner kinds refuse; neither id nor label is a legacy role',async t=>{
 const {h,file}=await setup(t);
 for(const fields of ['role: "юрист"','label: orchestrator','kind: owner, role: orchestrator','kind: executor, role: executor','kind: null, role: orchestrator','kind: "", role: orchestrator','kind: 1, role: orchestrator','kind: [orchestrator], role: orchestrator']){
  writeFileSync(file,'seats: {orchestrator: {vendor: claude, '+fields+'}}');assert.throws(()=>loadTeam(h),failure,fields);
 }
 for(const value of [null,'owner','executor','',0,{},[]])assert.throws(()=>seatKind(value,'orchestrator'),failure);
 assert.throws(()=>seatKind(undefined),failure);
 writeFileSync(file,'seats: {orchestrator: {kind: worker, role: owner, label: orchestrator, vendor: claude}}');assert.equal(roleOf(loadTeam(h),'orchestrator'),'worker');
});

test('153: reading a legacy manifest is read-only; the next team save stamps kinds without replacing roles or instruction paths',async t=>{
 const {h,file}=await setup(t),source='version: 1\nproject: legal-project\nintegration_branch: legal-main\nmerge_roles: [executor, owner]\nseats:\n  lead: {role: orchestrator, label: Руководитель, vendor: claude, model: w1, instructions: roles/orchestrator.md}\n  law: {role: executor, label: Юрист, vendor: codex, model: c1, instructions: custom.md}\n';
 writeFileSync(file,source);writeFileSync(join(h,'custom.md'),'Сохранённая инструкция.');const before=readFileSync(file);assert.equal(loadTeam(h).seats.law!.kind,'worker');assert.deepEqual(readFileSync(file),before);
 const seat=await addSeat(h,{kind:'reviewer',role:'юрист-критик',label:'Юрист 2',vendor:'claude',model:'w1',mode:'read'}),raw=parseYaml(readFileSync(file,'utf8')) as YMap,original=parseYaml(source) as YMap;
 assert.equal(raw.get('version'),1);assert.equal(raw.get('project'),'legal-project');assert.equal(raw.get('integration_branch'),'legal-main');assert.deepEqual(raw.get('merge_roles'),['executor','owner']);
 for(const [id,kind] of [['lead','orchestrator'],['law','worker']]){const prior=(original.get('seats') as YMap).get(id!) as YMap,current=(raw.get('seats') as YMap).get(id!) as YMap;assert.deepEqual([...current],[...prior,['kind',kind]])}
 const team=loadTeam(h);assert.deepEqual(team.mergeRoles,['worker','owner']);assert.equal(team.seats.law!.instructions,'custom.md');assert.equal(instructionsFor(team,team.seats.law!),'Сохранённая инструкция.');assert.equal(seat.kind,'reviewer');assert.equal(seat.label,'Юрист 2');assert.equal(seat.role,'юрист-критик');
});

test('153: free role names select the verified kind template; merge roles reject arbitrary authority',async t=>{
 const {h,file}=await setup(t);writeFileSync(join(h,'secret.md'),'DO NOT LOAD THROUGH ROLE');writeFileSync(file,'seats: {legal: {kind: worker, role: ../secret, vendor: claude}}\nmerge_roles: [executor]');
 const team=loadTeam(h);assert.equal(instructionsFor(team,team.seats.legal!),readFileSync(join(h,'roles/executor.md'),'utf8'));assert.deepEqual(team.mergeRoles,['worker']);
 writeFileSync(file,'seats: {}\nmerge_roles: ["Юрист"]');assert.throws(()=>loadTeam(h),failure);
});

test('153: a manifest cannot masquerade a team participant as the reserved roleless room',async t=>{
 const {h,file}=await setup(t);writeFileSync(file,'seats: {room: {kind: orchestrator, role: юрист, vendor: claude}}');assert.throws(()=>loadTeam(h),(e:unknown)=>e instanceof TeamError&&e.code==='team_invalid'&&e.message.includes('room зарезервировано'));
});

test('153/r2: legacy and explicit addSeat cannot duplicate an orchestrator with a domain role',async t=>{
 const {h,file}=await setup(t);writeFileSync(file,'seats: {lead: {kind: orchestrator, role: юрист, vendor: claude, model: w1}}');const original=readFileSync(file);
 for(const input of [{role:'orchestrator'},{kind:'orchestrator' as const,role:'юрист'}]){
  await assert.rejects(addSeat(h,{...input,vendor:'claude',model:'w1',mode:'read'}),(e:unknown)=>e instanceof TeamError&&e.code==='role_taken');assert.deepEqual(readFileSync(file),original);
 }
 assert.deepEqual(Object.keys(loadTeam(h).seats),['lead']);
});

test('153/r2: a worker named orchestrator does not occupy the orchestrator kind for legacy addSeat',async t=>{
 const {h,file}=await setup(t);writeFileSync(file,'seats: {legal: {kind: worker, role: orchestrator, label: Оркестратор, vendor: claude, model: w1}}');
 const added=await addSeat(h,{role:'orchestrator',vendor:'claude',model:'w1',mode:'read'});assert.equal(added.kind,'orchestrator');assert.equal(added.id,'orchestrator');
 const team=loadTeam(h);assert.equal(team.seats.legal!.kind,'worker');assert.deepEqual(Object.values(team.seats).filter(s=>s.kind==='orchestrator').map(s=>s.id),[added.id]);
});
