import {projectSection,readProjectSection} from '@harnessy/projects';
import {RuntimeError,type Runtime} from '@harnessy/runtime';
import {OWNER,type Route} from './routes.ts';
import {json} from './responses.ts';

export function sectionRoutes(r:Runtime):Route[]{return [
 {method:'GET',path:'/api/project/sections/:section',style:'J',handle:async({params})=>{
  const section=projectSection(params.section!),p=r.project;
  const current=()=>{if(p.closed||r.project!==p)throw new RuntimeError('project_changed','проект сменился',409)};
  current();let data;
  try{data=await readProjectSection(p.dir,section)}catch(error){current();throw error}current();
  const orch=[...p.registry.panes.values()].find(p=>p.kind==='orchestrator');
  return json({ok:true,project:p.dir,section,...data,orchestrator:orch?{pane:orch.id,label:orch.label}:null});
 }},
 {method:'POST',path:'/api/project/sections/:section/request',style:'J',handle:({params,body})=>{
  projectSection(params.section!);const p=r.project;
  if(p.closed||typeof body.project!=='string'||body.project!==p.dir)throw new RuntimeError('project_changed','проект сменился',409);
  const orch=[...p.registry.panes.values()].find(p=>p.kind==='orchestrator');
  if(!orch)return json({ok:false,code:'orchestrator_missing',error:'В проекте нет оркестратора. Откройте исходный разговор и назначьте оркестратора.'},409);
  if(typeof body.text!=='string')throw new RuntimeError('text_empty','пустое сообщение',400);
  return json({...r.chat({pane:orch.id,kind:'task',message:body.text},OWNER),project:p.dir,pane:orch.id});
 }}
]}
