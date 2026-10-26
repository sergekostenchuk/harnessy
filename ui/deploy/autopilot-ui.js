/* Autopilot copy and counts come from the current project's engine snapshot. */
(function(){
  'use strict';
  const operations={answer_question:'ответы на вопросы',answer_blocker:'блокеры',answer_escalation:'эскалации',approve:'разрешения',deny:'отклонение запросов',assign_role:'назначение роли из команды',continue_pane:'продолжение хода',stop_pane:'остановка хода'};
  const stops={payment:'деньги и оплата',external_publish:'публикация и отправка наружу',data_delete:'удаление данных',software_install:'установка программ',external_network:'сеть наружу',spend_over_cap:'расход сверх потолка'};
  const view={key:null,request:0,loading:false,loaded:false,again:false,rows:null,reason:null,error:false};
  const L=window.LIVE;
  const binding=()=>L?.H?.on&&!L.H.snapshotOnly&&L.H.liveStatus?.autopilot?JSON.stringify([L.H.project,L.H.confirmedProjectGeneration||0,L.H.liveStatus.autopilot.generation]):null;
  function count(state,rows,project){
    if(!Array.isArray(rows)||!Number.isFinite(Date.parse(state.startedAt)))return null;
    return new Set(rows.filter(r=>r?.project===project&&r.version===1&&r.entry?.state==='applied'&&r.entry.generation===state.generation&&typeof r.entry.decisionId==='string'&&/^[0-9a-f]{64}$/.test(r.entry.decisionId)&&Date.parse(r.at)>=Date.parse(state.startedAt)).map(r=>r.entry.decisionId)).size;
  }
  function format(state,options={}){
    if(!state||typeof state.on!=='boolean')return 'Состояние Автопилота не подтверждено движком.';
    const c=state.conditions,ops=Array.isArray(c?.operations)?c.operations.map(k=>operations[k]||'неизвестная операция').join(', '):null;
    const blocked=Array.isArray(c?.stopCases)?c.stopCases.map(k=>stops[k]||'неизвестный стоп-случай').join(', '):null;
    const conditions='Решает: '+(ops===null?'условия не подтверждены':ops||'ничего не выбрано')+'; стоп-случаи: '+(blocked||'не подтверждены')+'; потолок '+(Number.isFinite(c?.maxSpendPercent)?c.maxSpendPercent+' % недельного лимита.':'не подтверждён.');
    if(!state.on)return 'Автопилот выключен. '+conditions;
    const at=state.until?.kind==='morning'?new Date(state.until.at):null;
    const until=state.until?.kind==='reply'?'до ответа':at&&Number.isFinite(at.getTime())?'до '+at.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'срок не подтверждён';
    const n=count(state,options.rows,options.project);
    return 'Автопилот '+until+' · решает за вас с консилиумом: оркестратор + ревьюер. '+conditions+' Решений за эту ночь: '+(n===null?(options.error?'журнал недоступен.':'читаю журнал…'):n+'.')+(options.reason?' Последний отказ движка: '+options.reason:'');
  }
  function short(state){if(!state||typeof state.on!=='boolean')return 'Автопилот · нет данных';if(!state.on)return 'Автопилот выключен';const at=state.until?.kind==='morning'?new Date(state.until.at):null,until=state.until?.kind==='reply'?'до ответа':at&&Number.isFinite(at.getTime())?'до '+at.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'срок не подтверждён',n=count(state,view.key===binding()?view.rows:null,L?.H.project);return 'Автопилот '+until+' · '+(n===null?(view.error?'журнал недоступен':'читаю журнал'):n+' решений')}
  function text(state){return format(state,view.key===binding()?{rows:view.rows,reason:view.reason,error:view.error,project:L?.H.project}:{})}
  function draw(){L?.autopilotDraw?.();L?.chatGuidanceDraw?.()}
  function reset(key){view.key=key;view.request++;view.loading=false;view.loaded=false;view.again=false;view.rows=null;view.reason=null;view.error=false}
  async function refresh(force=false){
    const key=binding();if(key!==view.key)reset(key);
    if(!key){draw();return}
    const state=L.H.liveStatus.autopilot;
    if(!state.on){draw();return}
    if(view.loading){if(force)view.again=true;return}if(view.loaded&&!force){draw();return}
    view.loading=true;const request=++view.request,project=L.H.project;
    try{
      const decisions=await L.api('/api/autopilot/decisions');
      if(binding()!==key||view.key!==key||view.request!==request)return;
      if(decisions?.ok!==true||decisions.project!==project||!Array.isArray(decisions.decisions))throw Error('unconfirmed decisions');
      const failure=decisions.lastFailure;
      if(failure!==null&&(!failure||failure.generation!==state.generation||typeof failure.code!=='string'||!failure.code||typeof failure.reason!=='string'||!failure.reason||!Number.isFinite(Date.parse(failure.at))||!Number.isFinite(Date.parse(state.startedAt))||Date.parse(failure.at)<Date.parse(state.startedAt)))throw Error('unconfirmed refusal');
      view.rows=decisions.decisions;view.error=false;view.reason=failure?.reason||null;view.loaded=true;
    }catch{if(binding()===key&&view.request===request){view.rows=null;view.reason=null;view.error=true;view.loaded=false}}
    finally{if(binding()===key&&view.request===request){view.loading=false;const again=view.again;view.again=false;draw();if(again)void refresh(true)}}
  }
  window.HARNESS_AUTOPILOT_UI={format,count,text,short,refresh};
  if(L){addEventListener('live:status',()=>{void refresh()});addEventListener('pagehide',()=>reset(null));const events=L.subscribeLiveEvents?.();if(events){events.onopen=()=>{void refresh(true)};events.onmessage=e=>{let data;try{data=JSON.parse(e.data)}catch{return}if(['autopilot','autopilotDecision','autopilotWaiting'].includes(data.type))void refresh(true)}};void refresh()}
})();
