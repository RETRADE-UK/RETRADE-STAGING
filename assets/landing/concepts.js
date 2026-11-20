
(function(){
  'use strict';
  document.documentElement.classList.add('js');
  const stages=[...document.querySelectorAll('.feature')];
  const nav=[...document.querySelectorAll('.journey-nav a')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  // The page keeps native vertical scrolling. A stage becomes active as its
  // content crosses the reading line; tabs are optional, never scroll locks.
  function setCurrent(){
    const readingLine=innerHeight*.48;
    let active=stages[0];
    for(const stage of stages) if(stage.getBoundingClientRect().top<=readingLine) active=stage;
    for(const link of nav){
      if(link.dataset.nav===active.id) link.setAttribute('aria-current','step');
      else link.removeAttribute('aria-current');
    }
  }
  let frame=0;
  addEventListener('scroll',function(){
    if(frame)return;
    frame=requestAnimationFrame(function(){frame=0;setCurrent();});
  },{passive:true});
  addEventListener('resize',setCurrent,{passive:true});
  const observer='IntersectionObserver' in window ? new IntersectionObserver(function(entries){
    for(const entry of entries){
      if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
    }
  },{threshold:.12,rootMargin:'0px 0px -5% 0px'}):null;
  for(const stage of stages){if(observer)observer.observe(stage);else stage.classList.add('is-visible');}
  if(reduced.matches) for(const stage of stages)stage.classList.add('is-visible');
  setCurrent();
  const dialog=document.getElementById('image-dialog');
  const dialogImage=dialog.querySelector('img');
  const dialogTitle=document.getElementById('image-dialog-title');
  let returnTo=null;
  document.querySelectorAll('[data-zoom]').forEach(function(button){
    button.addEventListener('click',function(){
      const src=innerWidth<=650 && button.dataset.phone ? button.dataset.phone : button.dataset.zoom;
      if(!src || !src.startsWith('/assets/landing/'))return;
      dialogImage.src=src;
      dialogTitle.textContent='RETRADE · '+(button.dataset.title||'Product view');
      returnTo=button;
      if(dialog.showModal) dialog.showModal();
      else window.open(src,'_blank','noopener');
    });
  });
  function close(){if(dialog.open)dialog.close();}
  document.getElementById('close-dialog').addEventListener('click',close);
  dialog.addEventListener('click',function(event){if(event.target===dialog)close();});
  dialog.addEventListener('close',function(){
    dialogImage.removeAttribute('src');
    if(returnTo && returnTo.isConnected)returnTo.focus({preventScroll:true});
  });
  const format=function(value){return '£'+value.toFixed(2);};
  const add=document.getElementById('add-find');
  if(add){
    let extra=false;
    function draw(){
      document.getElementById('demo-spend').textContent=format(41+(extra?6:0));
      document.getElementById('demo-count').textContent=String(6+(extra?1:0));
      document.getElementById('find-status').textContent=extra?'Sample find added. No changes saved.':'Try adding an item to this example run.';
      add.disabled=extra;
    }
    add.addEventListener('click',function(){extra=true;draw();});
    document.getElementById('reset-find').addEventListener('click',function(){extra=false;draw();});
  }
  const stockButtons=[...document.querySelectorAll('[data-stock-filter]')];
  const stockItems=document.getElementById('demo-items');
  if(stockItems){
    const inventory={
      listed:[['Mario Kart 8 Deluxe','£24'],['Vintage denim jacket','£34']],
      unlisted:[['Canon camera strap','£12'],['Paperback book bundle','£18']]
    };
    for(const button of stockButtons){
      button.addEventListener('click',function(){
        stockButtons.forEach(function(other){other.setAttribute('aria-pressed',String(other===button));});
        const fragment=document.createDocumentFragment();
        for(const entry of inventory[button.dataset.stockFilter]){
          const li=document.createElement('li'),span=document.createElement('span'),strong=document.createElement('strong');
          span.textContent=entry[0];strong.textContent=entry[1];li.append(span,strong);fragment.append(li);
        }
        stockItems.replaceChildren(fragment);
      });
    }
  }
  const priceSlider=document.getElementById('demo-sale-price');
  if(priceSlider){
    function recalc(){
      const price=Number(priceSlider.value);
      const platformFee=Math.round((price*.12+.54)*100)/100;
      const profit=Math.round((price-8-2.1-.25-.36-platformFee)*100)/100;
      document.getElementById('demo-price').textContent=format(price);
      document.getElementById('demo-fees').textContent=format(platformFee);
      const result=document.getElementById('demo-profit');
      result.textContent=(profit<0?'-':'')+format(Math.abs(profit));
      result.classList.toggle('positive',profit>=0);
    }
    priceSlider.addEventListener('input',recalc);recalc();
  }
  const metricBtns=[...document.querySelectorAll('[data-metric]')];
  if(metricBtns.length){
    const data={
      profit:['Gross profit · 30 days','£808.23','Illustrative profit after direct costs.'],
      sales:['Gross revenue · 30 days','£1,977.00','58 recorded example sales.'],
      returns:['Refund rate · 30 days','1.7%','One partial refund in the example period.']
    };
    for(const button of metricBtns){
      button.addEventListener('click',function(){
        metricBtns.forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});
        const row=data[button.dataset.metric];
        document.getElementById('demo-metric-label').textContent=row[0];
        document.getElementById('demo-metric-number').textContent=row[1];
        document.getElementById('demo-metric-detail').textContent=row[2];
      });
    }
  }
})();
