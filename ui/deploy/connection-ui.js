/* One connection state for every built screen; failed startup never reveals sketch data. */
(function(){
 const L=window.LIVE,root=document.documentElement;if(!L||!root.hasAttribute('data-proto'))return;
 let alive=true,timer=null,job=null;
 function paint(state){root.dataset.liveConnection=state;document.querySelectorAll('.frame .main').forEach(main=>{let card=main.querySelector(':scope > [data-live-connection]');if(!card){card=document.createElement('section');card.className='live-connection';card.setAttribute('data-live-connection','');card.setAttribute('role','status');main.insertBefore(card,main.firstChild)}card.hidden=state==='ready';card.setAttribute('aria-busy',String(state==='loading'||state==='retrying'));card.innerHTML=state==='loading'?'<b>Подключаемся к движку…</b>':'<b>'+(state==='retrying'?'Подключаемся к движку…':'Не удалось прочитать данные движка')+'</b><p>'+(L.H.project?'Последний снимок устарел. Дождитесь нового чтения.':'Проверьте, что движок запущен. Повторяем подключение автоматически.')+'</p><button type="button" class="btn sm" data-live-retry'+(state==='retrying'?' disabled':'')+'>Повторить</button>'})}
 function schedule(){clearTimeout(timer);if(alive)timer=setTimeout(retry,3000)}
 function failed(){if(!alive)return;L.H.on=false;root.removeAttribute('data-live-pending');root.removeAttribute('data-live-preview');root.setAttribute('data-live-unavailable','');document.getElementById('live-boot-state')?.remove();paint('error');schedule()}
 function ready(){if(!alive||!L.H.on||L.H.snapshotOnly)return;clearTimeout(timer);timer=null;paint('ready')}
 async function retry(){if(job||!alive)return;clearTimeout(timer);paint('retrying');job=Promise.resolve().then(()=>L.connect()).catch(failed).finally(()=>{job=null;if(alive&&root.dataset.liveConnection!=='ready')schedule()});return job}
 document.addEventListener('click',e=>{if(e.target.closest('[data-live-retry]')){e.preventDefault();void retry()}});
 addEventListener('live:status',ready);addEventListener('live:offline',failed);addEventListener('online',()=>{void retry()});
 addEventListener('pagehide',()=>{alive=false;clearTimeout(timer)});addEventListener('pageshow',e=>{if(e.persisted){alive=true;void retry()}});
 window.HARNESS_CONNECTION={failed,retry};paint(L.H.on&&!L.H.snapshotOnly?'ready':L.H.connectionFailed?'error':'loading');if(L.H.connectionFailed)schedule();
})();
