/* View loading owns requests only. Calculations, data and wrapped public APIs stay in core. */
(function(){
  'use strict';
  var assets=window.RT_ASSETS,definitions=assets.views||{},implementations=Object.create(null),pending=Object.create(null),tickets=Object.create(null);
  function keyFor(name){return (assets.viewRoutes||{})[name]||name;}
  function user(){try{return typeof _currentUserId==='undefined'?null:_currentUserId;}catch(_){return null;}}
  function ready(key){return !!implementations[key];}

  window.__rtRegisterView=function(key,functions){
    var definition=definitions[key];
    if(!definition||!definition.functions.every(function(name){return typeof functions[name]==='function';}))throw new Error('Incomplete view module: '+key);
    if(!ready(key))implementations[key]=functions;
  };
  window.__rtViewReady=function(name){var key=keyFor(name);return !definitions[key]||ready(key);};
  window.__rtEnsureView=function(name){
    var key=keyFor(name),definition=definitions[key];
    if(!definition||ready(key))return Promise.resolve();
    if(pending[key])return pending[key];
    var request=new Promise(function(resolve,reject){
      var script=document.createElement('script'),timer,finished=false;
      function finish(error){
        if(finished)return;finished=true;clearTimeout(timer);
        script.onload=null;script.onerror=null;
        if(error){script.remove();reject(error);}else resolve();
      }
      script.id='rt-view-'+key;
      script.src='./'+definition.file+'?v='+encodeURIComponent(assets.build);
      script.async=false;
      script.onload=function(){finish(ready(key)?null:new Error('View did not initialise: '+key));};
      script.onerror=function(){finish(new Error('View could not load: '+key));};
      timer=setTimeout(function(){finish(new Error('View loading timed out: '+key));},20000);
      document.head.appendChild(script);
    });
    pending[key]=request.then(function(){delete pending[key];},function(error){delete pending[key];throw error;});
    return pending[key];
  };
  window.__rtViewLoadError=function(pageName,retry){
    var page=document.getElementById('p-'+pageName);if(!page||!page.classList.contains('on'))return;
    if(typeof _clearRoutePending==='function')_clearRoutePending(page);
    var card=document.createElement('div');card.className='panel-card rt-view-error';card.style.cssText='padding:24px;margin:16px';card.setAttribute('role','alert');
    var title=document.createElement('h2');title.textContent='This view couldn’t load';
    var description=document.createElement('p');description.textContent='Check your connection and try again.';
    var button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent='Try again';button.onclick=retry;
    card.append(title,description,button);page.replaceChildren(card);
  };
  window.__rtCallView=function(key,name,receiver,args,pageName,replay){
    if(ready(key))return implementations[key][name].apply(receiver,args);
    // Public render functions remain stable so existing wrappers still run.
    // The latest request for this page wins; leaving it or changing user cancels replay.
    var page=document.getElementById('p-'+pageName),ticket=(tickets[pageName]||0)+1;
    tickets[pageName]=ticket;
    var epoch=window.__rtViewNavigationEpoch,owner=user(),savedArgs=Array.prototype.slice.call(args);
    var visible=!!(page&&page.classList.contains('on'));
    function current(){return visible&&tickets[pageName]===ticket&&epoch===window.__rtViewNavigationEpoch&&owner===user()&&page.classList.contains('on');}
    function render(){
      if(!current())return;
      try{window[replay].apply(receiver,savedArgs);}
      finally{if(typeof _clearRoutePending==='function')_clearRoutePending(page);}
    }
    if(visible){
      if(pageName==='item')page.replaceChildren();
      if(typeof _showRoutePending==='function')_showRoutePending(pageName);
    }
    window.__rtEnsureView(key).then(render,function(){
      if(current())window.__rtViewLoadError(pageName,function(){window[replay].apply(receiver,savedArgs);});
    });
  };
})();
