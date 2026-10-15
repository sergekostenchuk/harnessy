/* release.js — постоянная отметка сборки и versioned-дисклеймер ранней alpha. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{
    root.HARNESS_RELEASE_UI=api;
    const run=()=>api.mount(root.document,root.localStorage,root.HARNESS_RELEASE);
    if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  }
})(globalThis,function(){
  const releaseValue=release=>release&&release.channel==='alpha'&&/^0\.1\.\d+-alpha(?:\.\d+)?$/.test(String(release.version||''))?release:null;
  const acceptanceKey=release=>'harnessy:release-understood:'+release.version;
  function accepted(storage,release){try{return storage.getItem(acceptanceKey(release))==='1'}catch{return false}}
  function remember(storage,release){try{storage.setItem(acceptanceKey(release),'1')}catch{}}
  function mount(document,storage,raw){
    const release=releaseValue(raw);if(!document||!release)return {mounted:false};
    const label=release.label||'alpha · '+release.version.replace(/-alpha.*$/,'');
    for(const top of document.querySelectorAll('.frame .top'))if(!top.querySelector('.release-badge')){
      const badge=document.createElement('span');badge.className='release-badge';badge.textContent=label;badge.setAttribute('aria-label','Версия '+label);top.append(badge);
    }
    if(accepted(storage,release))return {mounted:true,shown:false};
    const gate=document.createElement('div');gate.className='release-gate';gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-labelledby','release-gate-title');
    gate.innerHTML='<div class="release-card"><span class="release-badge">'+label+'</span><h1 id="release-gate-title">Ранняя версия · alpha</h1><p>Это пробная сборка. Здесь ещё может что-то ломаться и меняться.</p><dl><div><dt>Данные проектов</dt><dd>остаются в ваших папках и в git</dd></div><div><dt>Ключи</dt><dd>остаются в связке ключей macOS</dd></div></dl><button class="btn p" type="button" data-release-accept>Понимаю, продолжить</button></div>';
    gate.querySelector('[data-release-accept]').addEventListener('click',()=>{remember(storage,release);gate.remove()});
    document.body.append(gate);gate.querySelector('button').focus();
    return {mounted:true,shown:true,gate};
  }
  return {acceptanceKey,accepted,remember,mount,releaseValue};
});
