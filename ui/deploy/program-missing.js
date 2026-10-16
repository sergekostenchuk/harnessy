/* One missing-program card for connections and the first-run model step. */
(()=>{
 'use strict';const L=window.LIVE;if(!L)return;const esc=L.esc,errors=new Map(),pending=new Set();
 const valid=p=>p&&typeof p.id==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(p.id)&&p.installed===false;
 function html(p,prefix='program'){
  if(!valid(p))return '';
  const paths=Array.isArray(p.searchedPaths)?p.searchedPaths.filter(v=>typeof v==='string'&&v.length<512).slice(0,16):[];
  const command=typeof p.install?.command==='string'?p.install.command:'',url=typeof p.install?.url==='string'&&/^https:\/\/[^\s]+$/.test(p.install.url)?p.install.url:'';
  const compact=prefix==='first-program',open=compact?'<details class="program-missing compact" data-program-missing="'+esc(p.id)+'"><summary>Не нашли '+esc(p.id)+' · как подключить</summary>':'<section class="program-missing" data-program-missing="'+esc(p.id)+'" role="status"><strong>Не нашли '+esc(p.id)+'</strong>';
  const short=paths.slice(0,2).join(', ')+(paths.length>2?' · ещё '+(paths.length-2):'');
  return open+'<p>Искали в: '+esc(short||'каталоги программ не сообщены')+'</p>'+
    (paths.length>2?'<details class="program-paths"><summary>Все каталоги поиска</summary><p>'+esc(paths.join(', '))+'</p></details>':'')+
    (command?'<p>Установить самостоятельно:</p><code>'+esc(command)+'</code><div class="program-missing-actions"><button class="btn sm" type="button" data-'+prefix+'-copy="'+esc(p.id)+'">Скопировать команду</button>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Сайт программы ↗</a>':'')+'</div>':'<p>Команда установки для этой программы не опубликована в каталоге.</p>')+
    '<div class="program-missing-actions"><button class="btn sm ghost" type="button" data-'+prefix+'-pick="'+esc(p.id)+'">Указать путь к программе…</button></div>'+
    (errors.has(p.id)?'<p class="program-missing-error" role="alert">'+esc(errors.get(p.id))+'</p>':'')+(compact?'</details>':'</section>');
 }
 async function choose(p,{current,refresh,redraw}){
  if(!valid(p)||!current()||pending.has(p.id))return;pending.add(p.id);
  try{
  if(!window.harnessy?.pickFile){errors.set(p.id,'Выбор файла доступен в приложении Harnessy.');redraw();return}
  let path;try{path=await window.harnessy.pickFile({})}catch{errors.set(p.id,'Не удалось выбрать файл программы.');redraw();return}
  if(!path||!current())return;
  try{const result=await L.api('/api/providers/'+encodeURIComponent(p.id)+'/binary',{path});if(!current())return;if(!result?.ok)throw Error(result?.error||'Путь не сохранён');errors.delete(p.id);await refresh()}
  catch(error){if(current()){errors.set(p.id,typeof error?.message==='string'?error.message:'Путь не сохранён');redraw()}}
  }finally{pending.delete(p.id)}
 }
 async function copy(p){if(!valid(p)||typeof p.install?.command!=='string')return;try{await navigator.clipboard.writeText(p.install.command)}catch{errors.set(p.id,'Не удалось скопировать команду.')}}
 L.programMissing={html,choose,copy};L.firstModelsDraw?.();
})();
