/* TS-23e: one recovery card for first run and provider connections. */
(()=>{
 'use strict';const L=window.LIVE;if(!L)return;const esc=L.esc;
 const failures={
  region:{title:'недоступен из вашего региона',text:'Сервис сообщил, что из вашего региона он недоступен. Подключите прокси или свой VPS и повторите проверку входа.'},
  blocked:{title:'подключение заблокировано',text:'Сервис сообщил о блокировке подключения. Можно подключить прокси или свой VPS либо выбрать другую модель.'},
  offline:{title:'нет связи',text:'Не удалось соединиться с сервисом. Проверьте сеть или подключите прокси либо свой VPS.'},
  unresponsive:{title:'не отвечает',text:'Не удалось проверить вход. Причина не установлена. Можно повторить проверку, подключить прокси или VPS либо выбрать другую модель.'}
 };
 const valid=p=>p&&typeof p.id==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(p.id)&&typeof p.title==='string';
 function html(p,options={}){if(!valid(p))return '';const failure=Object.hasOwn(failures,p.login?.failure)?failures[p.login.failure]:null,disabled=options.busy||p.checking?' disabled':'';
  return (failure?'<section class="login-recovery" data-login-recovery="'+esc(p.id)+'" role="status"><strong>'+esc(p.title+' · '+failure.title)+'</strong><p>'+failure.text+'</p><div class="login-recovery-actions"><button class="btn p" type="button" data-login-connect="'+esc(p.id)+'"'+disabled+'>Подключить через прокси или VPS</button><button class="btn ghost" type="button" data-login-other="'+esc(p.id)+'"'+disabled+'>Выбрать другую модель</button></div></section>':'')+(options.check&&p.installed===true?'<div class="first-login-check"><button class="btn sm ghost" type="button" data-login-check="'+esc(p.id)+'"'+disabled+'>'+(options.busy?'Проверяем вход…':'Проверить вход')+'</button></div>':'');
 }
 function open(p,{current,recheck}){if(!valid(p)||!current()||!Object.hasOwn(failures,p.login?.failure))return;let consumed=false;
  const openAdd=L.network?.openAdd||L.networkAdd?.open;return openAdd?.({provider:p.id,title:p.title,onSaved(_receipt,selection){if(consumed||selection?.usedFor!==p.id||!current())return;consumed=true;L.networkAdd.close();void recheck()}});
 }
 L.loginRecovery={html,open};L.firstModelsDraw?.();
})();
