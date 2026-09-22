/* RETRADE partner row menu popover v1.4.79
 * Replaces the Partner-page full action drawer with a compact anchored menu.
 * Reuses the existing v3 action registry/standard handlers so accounting and
 * lifecycle behaviour stay authoritative in the live app.
 */
(function(){
  'use strict';
  if(window.__rtPartnerRowPopoverLoaded)return;
  window.__rtPartnerRowPopoverLoaded=true;

  var pop=null;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function txt(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function close(){if(pop){try{pop.remove();}catch(_){}pop=null;}}
  function quote(v){return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}

  function style(){
    if(document.getElementById('rt-partner-row-popover-style'))return;
    var s=document.createElement('style');
    s.id='rt-partner-row-popover-style';
    s.textContent='\
      .rt-partner-row-popover{position:fixed;z-index:99999;width:min(230px,calc(100vw - 20px));padding:7px;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:0 16px 40px rgba(0,0,0,.18);}\
      .rt-partner-row-popover-section{padding:5px 8px 4px;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);}\
      .rt-partner-row-popover button{width:100%;border:0;background:transparent;color:var(--text);display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:9px 10px;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;}\
      .rt-partner-row-popover button:hover,.rt-partner-row-popover button:focus{background:var(--surface2);outline:none;}\
      .rt-partner-row-popover button.danger{color:var(--danger,#c33);}\
      .rt-partner-row-popover .hint{font-size:11px;color:var(--text-secondary);}\
      .rt-partner-row-popover-divider{height:1px;background:var(--border);margin:5px 2px;}\
    ';
    document.head.appendChild(s);
  }

  function identity(row){
    var el=row&&row.querySelector('[data-itemid][data-month]');
    if(!el)return null;
    var itemId=el.getAttribute('data-itemid'),month=el.getAttribute('data-month');
    if(!itemId||!month)return null;
    return {itemId:itemId,month:month};
  }

  function accountId(row){
    var id=null;
    try{
      var x=identity(row),items=x&&DB&&Array.isArray(DB[x.month])?DB[x.month]:[];
      var item=items.find(function(i){return i&&String(i.id)===String(x.itemId);});
      id=item&&item.accountId!=null?item.accountId:null;
    }catch(_){}
    return id;
  }

  function partnerActions(row){
    var out=[],seen=Object.create(null);
    row.querySelectorAll('[data-rt-v3-action-token]').forEach(function(el){
      var token=el.getAttribute('data-rt-v3-action-token');if(!token)return;
      var label=txt(el)||String(el.getAttribute('aria-label')||el.getAttribute('title')||'Partner action');
      if(/^[⋯…\.]+$/.test(label)||/^(more|actions|partner actions|item actions)$/i.test(label))return;
      var key=label.toLowerCase();if(seen[key])return;seen[key]=true;
      out.push({token:token,label:label});
    });
    return out;
  }

  function button(label,fn,danger){
    var b=document.createElement('button');b.type='button';if(danger)b.className='danger';
    b.innerHTML='<span>'+esc(label)+'</span><span class="hint" aria-hidden="true">›</span>';
    b.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();close();fn();});
    return b;
  }

  function position(btn){
    if(!pop)return;
    var r=btn.getBoundingClientRect(),w=pop.offsetWidth||230,h=pop.offsetHeight||250,g=6;
    var left=Math.min(window.innerWidth-w-10,Math.max(10,r.right-w));
    var below=window.innerHeight-r.bottom;
    var top=(below>=h+g)?r.bottom+g:Math.max(10,r.top-h-g);
    pop.style.left=Math.round(left)+'px';pop.style.top=Math.round(top)+'px';
  }

  function open(btn,row){
    close();style();
    var id=identity(row);if(!id)return;
    var aid=accountId(row),actions=partnerActions(row);
    var box=document.createElement('div');box.className='rt-partner-row-popover';box.setAttribute('role','menu');

    if(actions.length){
      var h=document.createElement('div');h.className='rt-partner-row-popover-section';h.textContent='Partner';box.appendChild(h);
      actions.forEach(function(a){box.appendChild(button(a.label,function(){if(typeof window._rtPartnerV3RunOriginal==='function')window._rtPartnerV3RunOriginal(a.token);},false));});
      var d=document.createElement('div');d.className='rt-partner-row-popover-divider';box.appendChild(d);
    }

    var ih=document.createElement('div');ih.className='rt-partner-row-popover-section';ih.textContent='Item';box.appendChild(ih);
    function standard(action){if(typeof window._rtPartnerV3Standard==='function')window._rtPartnerV3Standard(action,id.month,id.itemId,aid==null?'':aid);}
    box.appendChild(button('View',function(){standard('view');},false));
    if(typeof editItem==='function')box.appendChild(button('Edit',function(){standard('edit');},false));
    if(typeof confirmDupeItem==='function')box.appendChild(button('Duplicate',function(){standard('duplicate');},false));
    if(typeof openScrapModal==='function')box.appendChild(button('Dispose',function(){standard('dispose');},false));
    if(typeof deleteItem==='function')box.appendChild(button('Delete',function(){standard('delete');},true));

    document.body.appendChild(box);pop=box;position(btn);
  }

  document.addEventListener('click',function(ev){
    var btn=ev.target&&ev.target.closest?ev.target.closest('.rt-partner-row-menu-v3'):null;
    if(btn){
      var row=btn.closest('.metric-inline');
      if(!row)return;
      ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
      if(pop&&pop.__anchor===btn){close();return;}
      open(btn,row);if(pop)pop.__anchor=btn;return;
    }
    if(pop&&!ev.target.closest('.rt-partner-row-popover'))close();
  },true);

  document.addEventListener('keydown',function(ev){if(ev.key==='Escape')close();});
  window.addEventListener('resize',close);
  window.addEventListener('scroll',close,true);
  console.info('[RETRADE] v1.4.79 compact partner row action popover loaded');
})();