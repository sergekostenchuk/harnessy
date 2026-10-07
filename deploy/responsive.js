
  // ===== адаптив: выдвижная боковая панель (≤900px), облики в панели, закрытие по выбору/фону/Esc (04.10.2026)
  (function(){
    const app=document.querySelector('.app'), side=document.querySelector('.side'); if(!app||!side) return;
    const mq=window.matchMedia('(max-width:900px)');
    const open=v=>app.classList.toggle('side-open',v);
    document.querySelector('.menu-btn')?.addEventListener('click',()=>open(!app.classList.contains('side-open')));
    document.querySelector('.drawer-bg')?.addEventListener('click',()=>open(false));
    addEventListener('keydown',e=>{ if(e.key==='Escape') open(false); });
    side.addEventListener('click',e=>{ if(mq.matches && e.target.closest('[data-s],[data-sec],.proj,.conv,.newbtn,.srch')) open(false); });
    const foot=side.querySelector('.foot')||side;
    const row=document.createElement('div'); row.className='skinrow';
    row.innerHTML=['a','b','c'].map(k=>'<button data-skin="'+k+'">'+k.toUpperCase()+'</button>').join('');
    row.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>skin(b.dataset.skin)));
    foot.appendChild(row);
    const syncSkin=()=>{ const k=document.documentElement.dataset.skin||'a'; row.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.skin===k)); };
    new MutationObserver(syncSkin).observe(document.documentElement,{attributes:true,attributeFilter:['data-skin']}); syncSkin();
  })();
