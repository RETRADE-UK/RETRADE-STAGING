/*
 * RETRADE MONITORS — v2 cloud-ready dev build
 * ------------------------------------------------------------
 * Native UI + editable monitor configuration + Supabase live-feed bridge.
 *
 * v1 goals:
 * - native RETRADE page and design system
 * - multiple editable Vinted scanner recipes
 * - fast guided setup
 * - Canon DSLR starter intelligence
 * - seller reputation / fresh-account risk controls
 * - deal-feed presentation + preview fixtures
 * - local fallback plus Supabase sync when the monitor migration is present
 *
 * No Vinted credentials, cookies, payment details or auto-buy logic live here.
 */
(function(){
  'use strict';

  const STORAGE_KEY='retrade_monitors_v2';
  const VIEW_KEY='retrade_monitors_view_v1';

  const CANON_MODELS=[
    {id:'500D', aliases:['EOS 500D','Rebel T1i']},
    {id:'550D', aliases:['EOS 550D','Rebel T2i']},
    {id:'600D', aliases:['EOS 600D','Rebel T3i']},
    {id:'650D', aliases:['EOS 650D','Rebel T4i']},
    {id:'700D', aliases:['EOS 700D','Rebel T5i']},
    {id:'1000D',aliases:['EOS 1000D','Rebel XS']},
    {id:'1100D',aliases:['EOS 1100D','Rebel T3']},
    {id:'1200D',aliases:['EOS 1200D','Rebel T5']},
    {id:'1300D',aliases:['EOS 1300D','Rebel T6']},
    {id:'2000D',aliases:['EOS 2000D','Rebel T7']},
    {id:'4000D',aliases:['EOS 4000D','Rebel T100']}
  ];

  const TEMPLATES={
    canon:{
      key:'canon',
      name:'Canon DSLR',
      brand:'Canon',
      category:'Digital Cameras & Lenses',
      models:CANON_MODELS,
      defaults:{
        name:'Canon DSLR',
        platform:'vinted',
        searchTerms:['Canon'],
        priceMin:0,
        priceMax:100,
        minProfit:40,
        minROI:35,
        sellerMinReviews:5,
        sellerMinRating:4.5,
        zeroReviewMode:'risky',
        allowedConditions:['new','very_good','good'],
        notifyLevels:['snipe','buy'],
        rejectKeywords:[
          'spares','parts only','not working','faulty','broken',
          'water damage','sensor damaged','shutter fault'
        ],
        warningKeywords:[
          'untested','no charger','charger missing','no battery',
          'sticky','scratched','scratches'
        ]
      }
    },

    canonBenchmark:{
      key:'canonBenchmark',
      name:'Canon RL Benchmark £51–£100',
      brand:'Canon',
      category:'Digital Cameras & Lenses',
      models:CANON_MODELS,
      defaults:{
        name:'Canon RL Benchmark £51–£100',
        platform:'vinted',
        searchTerms:['Canon','EOS','Rebel'],
        priceMin:51,
        priceMax:100,
        minProfit:40,
        minROI:35,
        sellerMinReviews:5,
        sellerMinRating:4.5,
        zeroReviewMode:'risky',
        allowedConditions:[],
        notifyLevels:[],
        rejectKeywords:[],
        warningKeywords:[
          'spares','parts only','not working','faulty','broken','untested',
          'water damage','sensor damaged','sensor fault','shutter fault',
          'no charger','charger missing','no battery'
        ],
        config:{
          benchmarkMode:true,
          benchmarkAgainst:'Resell Locker',
          benchmarkPurpose:'Detection parity before buy-rule filtering'
        }
      }
    },
    blank:{
      key:'blank',
      name:'Start from scratch',
      brand:'',
      category:'Other',
      models:[],
      defaults:{
        name:'New monitor',
        platform:'vinted',
        searchTerms:[],
        priceMin:0,
        priceMax:100,
        minProfit:30,
        minROI:30,
        sellerMinReviews:5,
        sellerMinRating:4.5,
        zeroReviewMode:'risky',
        allowedConditions:['new','very_good','good'],
        notifyLevels:['snipe','buy'],
        rejectKeywords:['not working','faulty','broken'],
        warningKeywords:['untested']
      }
    }
  };

  let _state={monitors:[],deals:[]};
  let _view='monitors';
  let _dealFilter='all';
  let _builder=null;
  let _cloudStatus='local'; // local | syncing | cloud | schema | error
  let _cloudHydrated=false;
  let _cloudLoading=false;
  let _lastCloudPull=0;
  let _demoMode=false;

  function h(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function money(v){
    const n=Number(v);
    return Number.isFinite(n)?'£'+n.toFixed(2):'—';
  }
  function monitorAgeLabel(iso,fallback){
    if(!iso)return fallback||'live';
    const ms=Date.now()-Date.parse(iso);
    if(!Number.isFinite(ms)||ms<0)return fallback||'live';
    const s=Math.floor(ms/1000);
    if(s<60)return s+' sec ago';
    const m=Math.floor(s/60);if(m<60)return m+' min ago';
    const h=Math.floor(m/60);if(h<24)return h+' hr ago';
    return Math.floor(h/24)+'d ago';
  }
  function uid(){
    try{return crypto.randomUUID();}
    catch(e){
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
        const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);
      });
    }
  }
  function nowIso(){return new Date().toISOString();}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function asNum(v,fallback){
    const n=Number(v);
    return Number.isFinite(n)?n:fallback;
  }
  function splitTerms(v){
    return String(v||'').split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  }
  function isPreview(){
    try{return typeof PREVIEW_MODE_ENABLED!=='undefined'&&PREVIEW_MODE_ENABLED;}
    catch(e){return false;}
  }

  function load(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(parsed&&Array.isArray(parsed.monitors)&&Array.isArray(parsed.deals))_state=parsed;
    }catch(e){}
    try{
      const v=localStorage.getItem(VIEW_KEY);
      if(v==='monitors'||v==='deals')_view=v;
    }catch(e){}
  }
  function save(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(_state));}catch(e){}
  }
  function saveView(){
    try{localStorage.setItem(VIEW_KEY,_view);}catch(e){}
  }

  function cloudApi(){return window.RetradeMonitorCloud||null;}
  function cloudLabel(){
    if(_cloudStatus==='cloud')return ['Cloud synced','Supabase'];
    if(_cloudStatus==='syncing')return ['Syncing','Supabase'];
    if(_cloudStatus==='schema')return ['Local test mode','Apply monitor SQL'];
    if(_cloudStatus==='error')return ['Local fallback','Cloud unavailable'];
    return ['Local test mode','Supabase not connected'];
  }
  async function hydrateCloud(force){
    if(_demoMode)return;
    const api=cloudApi();
    if(!api||typeof api.isReady!=='function'||!api.isReady())return;
    if(_cloudLoading)return;
    const now=Date.now();
    if(!force&&_cloudHydrated&&now-_lastCloudPull<12000)return;
    _cloudLoading=true;_cloudStatus='syncing';
    try{
      const localMons=_state.monitors.slice();
      let res=await api.loadState();
      if(res&&res.ok){
        // First migration after local UX testing: seed locally-created monitor
        // recipes into the authenticated user's empty cloud account.
        if((res.monitors||[]).length===0&&localMons.length){
          for(const mm of localMons){
            const wr=await api.saveMonitor(mm);
            if(!wr||!wr.ok)break;
          }
          res=await api.loadState();
        }
        if(res&&res.ok){
          _state.monitors=Array.isArray(res.monitors)?res.monitors:[];
          _state.deals=Array.isArray(res.deals)?res.deals:[];
          save();_cloudStatus='cloud';_cloudHydrated=true;_lastCloudPull=Date.now();
        }
      }else if(res&&res.reason==='schema_missing'){
        _cloudStatus='schema';
      }else if(res&&res.reason==='signed_out'){
        _cloudStatus='local';
      }else{
        _cloudStatus='error';
      }
    }catch(e){_cloudStatus='error';}
    _cloudLoading=false;
    const page=document.getElementById('p-monitors');
    if(page&&page.classList.contains('on')&&!_builder)renderMonitorsPage(false);
  }
  async function persistMonitorCloud(mm){
    const api=cloudApi();
    if(!api||typeof api.isReady!=='function'||!api.isReady())return;
    try{
      _cloudStatus='syncing';
      const res=await api.saveMonitor(mm);
      if(res&&res.ok){_cloudStatus='cloud';_cloudHydrated=true;}
      else if(res&&res.reason==='schema_missing')_cloudStatus='schema';
      else _cloudStatus='error';
    }catch(e){_cloudStatus='error';}
    const page=document.getElementById('p-monitors');
    if(page&&page.classList.contains('on')&&!_builder)renderMonitorsPage(false);
  }

  function templateFor(mon){
    return TEMPLATES[mon&&mon.templateKey]||TEMPLATES.blank;
  }
  function cloneDefaults(key){
    const t=TEMPLATES[key]||TEMPLATES.blank;
    const d=JSON.parse(JSON.stringify(t.defaults));
    d.templateKey=t.key;
    d.brand=t.brand;
    d.category=t.category;
    d.models=t.models.map(m=>m.id);
    d.customModels=[];
    if(!Array.isArray(d.searchTerms))d.searchTerms=[];
    d.config=(d.config&&typeof d.config==='object')?d.config:{};
    d.enabled=true;
    d.archived=false;
    d.createdAt=nowIso();
    d.updatedAt=nowIso();
    return d;
  }

  function sellerAssessment(deal,mon){
    const reviews=deal.sellerReviews==null?null:Math.max(0,asNum(deal.sellerReviews,0));
    const rating=deal.sellerRating==null?null:asNum(deal.sellerRating,null);
    let score=100,level='low',label='Established';

    if(reviews===null){
      score=58;level='medium';label='Seller history unavailable';
    }else if(reviews===0){
      score-=55; level='high'; label='Fresh seller';
    }else if(reviews<=3){
      score-=30; level='high'; label='Very limited history';
    }else if(reviews<Math.max(5,mon.sellerMinReviews||5)){
      score-=16; level='medium'; label='Limited history';
    }else if(reviews<10){
      score-=8; level='medium'; label='Some history';
    }else if(reviews>=50){
      score+=3; label='Highly established';
    }

    if(rating!=null){
      if(rating<4.0){score-=35;level='high';label='Weak feedback';}
      else if(rating<(mon.sellerMinRating||4.5)){score-=18;level=level==='high'?'high':'medium';label='Below rating target';}
      else if(rating>=4.8&&reviews!=null&&reviews>=10){score+=4;}
    }
    score=clamp(Math.round(score),0,100);
    return {score,level,label};
  }

  function classifyDeal(deal,mon){
    const seller=sellerAssessment(deal,mon);
    if(deal&&deal.decision&&deal.score!=null){
      const key=String(deal.decision).toLowerCase();
      return {key:key,label:key.toUpperCase(),score:clamp(Math.round(asNum(deal.score,0)),0,100),seller:seller};
    }
    const profit=asNum(deal.projectedProfit,0);
    const roi=asNum(deal.roi,0);
    const minProfit=Math.max(0,asNum(mon.minProfit,0));
    const minROI=Math.max(0,asNum(mon.minROI,0));

    let base=45;
    if(minProfit>0)base+=clamp((profit/minProfit)*25,0,34);
    if(minROI>0)base+=clamp((roi/minROI)*16,0,22);
    base-=Math.max(0,(100-seller.score)*0.32);
    const score=clamp(Math.round(base),0,99);

    if(seller.level==='high'&&profit>=minProfit)return {key:'risky',label:'RISKY',score,seller};
    if(profit>=minProfit*1.4&&roi>=minROI*1.25&&seller.level==='low')return {key:'snipe',label:'SNIPE',score:Math.max(90,score),seller};
    if(profit>=minProfit&&roi>=minROI&&seller.level!=='high')return {key:'buy',label:'BUY',score:Math.max(80,score),seller};
    return {key:'check',label:'CHECK',score,seller};
  }

  function monitorById(id){
    return _state.monitors.find(m=>m.id===id)||null;
  }
  function activeMonitors(){
    return _state.monitors.filter(m=>!m.archived);
  }

  function renderMonitorsPage(requestCloud){
    const page=document.getElementById('p-monitors');
    if(!page)return;
    load();
    if(requestCloud!==false)setTimeout(function(){hydrateCloud(false);},0);

    const mons=activeMonitors();
    const running=mons.filter(m=>m.enabled).length;
    const today=new Date().toISOString().slice(0,10);
    const todayDeals=_state.deals.filter(d=>String(d.detectedAt||'').slice(0,10)===today);
    let urgent=0,risky=0;
    todayDeals.forEach(d=>{
      const mon=monitorById(d.monitorId)||mons[0]||cloneDefaults('canon');
      const c=classifyDeal(d,mon);
      if(c.key==='snipe'||c.key==='buy')urgent++;
      if(c.key==='risky')risky++;
    });

    page.innerHTML=
      '<div class="mon-page">'+
        '<div class="page-header mon-page-header">'+
          '<div><div class="page-title">Monitors</div><div class="page-subtitle">Find profitable stock automatically, without living in search results.</div></div>'+
          '<button class="btn btn-primary mon-new-btn" onclick="openMonitorBuilder()">'+
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'+
            '<span>New monitor</span>'+
          '</button>'+
        '</div>'+

        '<div class="mon-kpis">'+
          monKpi('Running',running,mons.length?running+' of '+mons.length+' enabled':'Create your first scanner','running')+
          monKpi('Deals today',todayDeals.length,todayDeals.length?'Matched today':'No live matches yet','deals')+
          monKpi('Buy / Snipe',urgent,urgent?'Worth your attention':'Nothing urgent','hot')+
          monKpi('Seller warnings',risky,risky?'Fresh / risky sellers flagged':'Seller checks active','risk')+
        '</div>'+

        '<div class="mon-toolbar">'+
          '<div class="segmented mon-tabs" role="tablist" aria-label="Monitor view">'+
            '<button class="'+(_view==='monitors'?'is-active':'')+'" onclick="setMonitorView(\'monitors\')">Monitors <span class="count">'+mons.length+'</span></button>'+
            '<button class="'+(_view==='deals'?'is-active':'')+'" onclick="setMonitorView(\'deals\')">Live deals <span class="count">'+_state.deals.length+'</span></button>'+
          '</div>'+
          (function(){const cl=cloudLabel();return '<div class="mon-engine-state mon-engine-'+_cloudStatus+'">'+
            '<span class="mon-engine-dot"></span>'+
            '<span>'+h(cl[0])+'</span><span class="mon-engine-sep">·</span><span class="mon-engine-muted">'+h(cl[1])+'</span>'+
          '</div>';})()+
        '</div>'+
        '<div id="monitors-body"></div>'+
      '</div>';

    if(_view==='deals')renderDealFeed();
    else renderMonitorList();
  }

  function monKpi(label,value,sub,kind){
    return '<div class="card kpi mon-kpi mon-kpi-'+kind+'">'+
      '<div class="kpi-label">'+h(label)+'</div>'+
      '<div class="kpi-value num">'+h(value)+'</div>'+
      '<div class="kpi-foot">'+h(sub)+'</div>'+
    '</div>';
  }

  function setMonitorView(view){
    _view=view==='deals'?'deals':'monitors';
    saveView();
    renderMonitorsPage();
  }

  function renderMonitorList(){
    const body=document.getElementById('monitors-body');
    if(!body)return;
    const mons=activeMonitors();
    if(!mons.length){
      body.innerHTML=
        '<div class="mon-empty">'+
          '<div class="mon-empty-icon">'+radarIcon(28)+'</div>'+
          '<div class="mon-empty-title">Create your first monitor</div>'+
          '<div class="mon-empty-sub">Start with a RETRADE template or build your own. You can change models, prices and profit rules at any time.</div>'+
          '<div class="mon-template-row mon-template-row-benchmark">'+
            '<button class="mon-template-card mon-template-card-benchmark" onclick="openMonitorBuilder(null,\'canonBenchmark\')">'+
              '<span class="mon-template-ic">'+radarIcon(20)+'</span>'+
              '<span><strong>Canon RL Benchmark £51–£100</strong><small>Permissive test scanner · compare directly with your current Discord channel</small></span>'+
              '<span class="mon-template-arrow">›</span>'+
            '</button>'+
            '<button class="mon-template-card" onclick="openMonitorBuilder(null,\'canon\')">'+
              '<span class="mon-template-ic">'+cameraIcon(20)+'</span>'+
              '<span><strong>Canon DSLR</strong><small>Whitelist, seller safety and reseller profit defaults</small></span>'+
              '<span class="mon-template-arrow">›</span>'+
            '</button>'+
            '<button class="mon-template-card" onclick="openMonitorBuilder(null,\'blank\')">'+
              '<span class="mon-template-ic">'+plusCircleIcon(20)+'</span>'+
              '<span><strong>Start from scratch</strong><small>Choose your own category, models and price range</small></span>'+
              '<span class="mon-template-arrow">›</span>'+
            '</button>'+
          '</div>'+
        '</div>';
      return;
    }

    body.innerHTML=
      '<div class="mon-list-head">'+
        '<div><strong>'+mons.length+' monitor'+(mons.length===1?'':'s')+'</strong><span>Each one can scan a different model set, price band or strategy.</span></div>'+
        '<button class="btn btn-secondary mon-compact-action" onclick="openMonitorBuilder(null,\'canonBenchmark\')">Add benchmark monitor</button>'+
      '</div>'+
      '<div class="mon-card-list">'+mons.map(renderMonitorCard).join('')+'</div>';
  }

  function renderMonitorCard(mon){
    const t=templateFor(mon);
    const models=(mon.models||[]).concat(mon.customModels||[]);
    const modelLabel=models.length<=5?models.join(', '):(models.slice(0,5).join(', ')+' +'+(models.length-5));
    return '<article class="mon-card '+(mon.enabled?'is-running':'is-paused')+'">'+
      '<div class="mon-card-statusrail"></div>'+
      '<div class="mon-card-main">'+
        '<div class="mon-card-top">'+
          '<div class="mon-card-ident">'+
            '<span class="mon-card-icon">'+(t.key==='canon'?cameraIcon(18):radarIcon(18))+'</span>'+
            '<div><div class="mon-card-name">'+h(mon.name||'Monitor')+(mon.config&&mon.config.benchmarkMode?' <span class="mon-benchmark-badge">BENCHMARK</span>':'')+'</div>'+
              '<div class="mon-card-meta">Vinted · '+h(mon.category||'All categories')+'</div></div>'+
          '</div>'+
          '<label class="mon-switch" title="'+(mon.enabled?'Pause monitor':'Resume monitor')+'">'+
            '<input type="checkbox" '+(mon.enabled?'checked':'')+' onchange="toggleMonitor(\''+h(mon.id)+'\',this.checked)">'+
            '<span></span>'+
          '</label>'+
        '</div>'+
        '<div class="mon-rule-strip">'+
          monRule('Price',money(mon.priceMin)+' – '+money(mon.priceMax))+
          monRule('Min profit',money(mon.minProfit))+
          monRule('Min ROI',Math.round(asNum(mon.minROI,0))+'%')+
          monRule('Seller',Math.max(0,asNum(mon.sellerMinReviews,0))+'+ reviews')+
        '</div>'+
        '<div class="mon-card-models"><span>Models</span><strong>'+h(modelLabel||'Any model')+'</strong></div>'+
        '<div class="mon-card-foot">'+
          '<div class="mon-card-state">'+
            '<span class="mon-state-dot"></span>'+
            '<strong>'+(mon.enabled?'Enabled':'Paused')+'</strong>'+
            '<span>·</span><span>0 matches today</span>'+
          '</div>'+
          '<div class="mon-card-actions">'+
            '<button onclick="openMonitorBuilder(\''+h(mon.id)+'\')">Edit</button>'+
            '<button onclick="duplicateMonitor(\''+h(mon.id)+'\')">Duplicate</button>'+
            '<button class="danger" onclick="archiveMonitor(\''+h(mon.id)+'\')">Archive</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</article>';
  }

  function monRule(label,value){
    return '<div class="mon-rule"><span>'+h(label)+'</span><strong>'+h(value)+'</strong></div>';
  }

  function toggleMonitor(id,enabled){
    const m=monitorById(id); if(!m)return;
    m.enabled=!!enabled;m.updatedAt=nowIso();save();renderMonitorsPage(false);
    persistMonitorCloud(m);
    if(typeof toast==='function')toast((enabled?'Monitor resumed':'Monitor paused'));
  }

  function duplicateMonitor(id){
    const m=monitorById(id);if(!m)return;
    const c=JSON.parse(JSON.stringify(m));
    c.id=uid();c.name=(m.name||'Monitor')+' copy';c.enabled=false;c.createdAt=nowIso();c.updatedAt=nowIso();
    _state.monitors.unshift(c);save();renderMonitorsPage(false);persistMonitorCloud(c);
    if(typeof toast==='function')toast('Monitor duplicated — paused until you are ready');
  }

  async function archiveMonitor(id){
    const m=monitorById(id);if(!m)return;
    let ok=true;
    if(typeof showConfirm==='function'){
      ok=await showConfirm('Archive monitor?','This removes it from your active scanners but keeps its setup available in stored data.',{okLabel:'Archive'});
    }else ok=confirm('Archive this monitor?');
    if(!ok)return;
    m.archived=true;m.enabled=false;m.updatedAt=nowIso();save();renderMonitorsPage(false);persistMonitorCloud(m);
    if(typeof toast==='function')toast('Monitor archived');
  }

  function renderDealFeed(){
    const body=document.getElementById('monitors-body');if(!body)return;
    const mons=activeMonitors();
    const filters=['all','snipe','buy','check','risky'];
    const prepared=_state.deals.map(d=>{
      const mon=monitorById(d.monitorId)||mons[0]||cloneDefaults('canon');
      return {deal:d,mon:mon,c:classifyDeal(d,mon)};
    }).filter(x=>_dealFilter==='all'||x.c.key===_dealFilter);

    body.innerHTML=
      '<div class="mon-deal-head">'+
        '<div class="mon-deal-filters">'+filters.map(f=>'<button class="'+(_dealFilter===f?'active':'')+'" onclick="setMonitorDealFilter(\''+f+'\')">'+
          (f==='all'?'All':f.toUpperCase())+'</button>').join('')+'</div>'+
        (isPreview()?'<button class="btn btn-secondary mon-compact-action" onclick="loadMonitorDemoDeals()">Load demo alerts</button>':'')+
      '</div>'+
      (prepared.length
        ? '<div class="mon-deal-list">'+prepared.map(x=>renderDealCard(x.deal,x.mon,x.c)).join('')+'</div>'
        : '<div class="mon-empty mon-deals-empty"><div class="mon-empty-icon">'+boltIcon(26)+'</div><div class="mon-empty-title">No deals here yet</div><div class="mon-empty-sub">'+
          (isPreview()?'Use “Load demo alerts” to test the scoring and seller-risk presentation before the live Vinted worker is connected.':'Matches from your active scanners will land here in real time.')+
          '</div></div>');
  }

  function setMonitorDealFilter(filter){
    _dealFilter=filter||'all';renderDealFeed();
  }

  function renderDealCard(d,mon,c){
    const seller=c.seller;
    const profit=asNum(d.projectedProfit,0);
    const sellerText=d.sellerReviews==null
      ? ((d.sellerRating!=null?Number(d.sellerRating).toFixed(1)+'★ · ':'')+'review history unavailable')
      : ((d.sellerRating!=null?Number(d.sellerRating).toFixed(1)+'★ · ':'')+Math.max(0,asNum(d.sellerReviews,0))+' reviews');
    const reason=c.key==='risky'
      ? 'Strong economics, but the seller profile needs manual review.'
      : c.key==='snipe'
        ? 'Price, profit and seller confidence all clear your targets.'
        : c.key==='buy'
          ? 'Meets your profit target with an established enough seller.'
          : 'Worth checking, but it does not clear every buy threshold.';

    return '<article class="mon-deal mon-deal-'+c.key+'">'+
      '<div class="mon-deal-score"><span class="mon-decision">'+c.label+'</span><strong>'+c.score+'</strong><small>/100</small></div>'+
      '<div class="mon-deal-content">'+
        '<div class="mon-deal-title-row"><div><div class="mon-deal-title">'+h(d.title||'Vinted listing')+'</div><div class="mon-deal-source">'+h(mon.name||'Monitor')+' · detected '+h(monitorAgeLabel(d.detectedAt,d.ageLabel||'just now'))+(mon.config&&mon.config.benchmarkMode?' · BENCHMARK':'')+'</div></div>'+
        '<div class="mon-deal-price">'+money(d.deliveredPrice!=null?d.deliveredPrice:d.itemPrice)+'</div></div>'+
        '<div class="mon-deal-econ">'+
          '<div><span>Est. resale</span><strong>'+money(d.resaleLow)+'–'+money(d.resaleHigh).replace('£','')+'</strong></div>'+
          '<div><span>Projected profit</span><strong class="profit">'+money(profit)+'</strong></div>'+
          '<div><span>ROI</span><strong>'+Math.round(asNum(d.roi,0))+'%</strong></div>'+
        '</div>'+
        '<div class="mon-seller '+seller.level+'">'+
          '<span class="mon-seller-ic">'+userShieldIcon(17)+'</span>'+
          '<div><span>Seller</span><strong>'+h(sellerText)+'</strong></div>'+
          '<span class="mon-risk-pill">'+h(seller.label)+'</span>'+
        '</div>'+
        '<div class="mon-deal-reason">'+h(d.reason||reason)+'</div>'+
        '<div class="mon-deal-actions">'+
          '<button class="btn btn-primary" '+(d.url?'onclick="window.open(\''+h(d.url)+'\',\'_blank\',\'noopener\')"':'disabled')+'>Open on Vinted</button>'+
          '<button class="btn btn-secondary" onclick="dismissMonitorDeal(\''+h(d.id)+'\')">Dismiss</button>'+
        '</div>'+
      '</div>'+
    '</article>';
  }

  function dismissMonitorDeal(id){
    _state.deals=_state.deals.filter(d=>d.id!==id);save();renderDealFeed();renderMonitorCountsOnly();
    const api=cloudApi();if(api&&api.isReady&&api.isReady()&&api.dismissDeal)api.dismissDeal(id).catch(function(){});
  }
  function renderMonitorCountsOnly(){
    // Keep the implementation simple and deterministic in v1.
  }

  function loadMonitorDemoDeals(){
    _demoMode=true;
    let mon=activeMonitors()[0];
    if(!mon){
      mon=cloneDefaults('canon');mon.id=uid();mon.name='Canon DSLR £0–£100';_state.monitors.unshift(mon);
    }
    const stamp=nowIso();
    _state.deals=[
      {
        id:'demo_established',monitorId:mon.id,title:'Canon EOS 700D + 18–55mm kit',
        itemPrice:64,deliveredPrice:68,resaleLow:145,resaleHigh:160,projectedProfit:62,roi:91,
        sellerRating:4.9,sellerReviews:82,detectedAt:stamp,ageLabel:'18 sec ago',url:''
      },
      {
        id:'demo_fresh',monitorId:mon.id,title:'Canon EOS 600D bundle – very good condition',
        itemPrice:52,deliveredPrice:56,resaleLow:125,resaleHigh:145,projectedProfit:64,roi:114,
        sellerRating:null,sellerReviews:0,detectedAt:stamp,ageLabel:'31 sec ago',url:''
      },
      {
        id:'demo_check',monitorId:mon.id,title:'Canon EOS 600D + 18–55mm, box & charger',
        itemPrice:99.99,deliveredPrice:103,resaleLow:125,resaleHigh:145,projectedProfit:22,roi:21,
        sellerRating:4.9,sellerReviews:164,detectedAt:stamp,ageLabel:'1 min ago',url:''
      }
    ];
    save();_view='deals';saveView();renderMonitorsPage();
    if(typeof toast==='function')toast('Demo deal feed loaded');
  }

  function openMonitorBuilder(id,templateKey){
    let draft;
    if(id){
      const existing=monitorById(id);if(!existing)return;
      draft=JSON.parse(JSON.stringify(existing));
    }else{
      draft=cloneDefaults(templateKey||'canon');
      draft.id=uid();
      if(templateKey==='canon'||!templateKey)draft.name='Canon DSLR £0–£100';
      if(templateKey==='canonBenchmark')draft.name='Canon RL Benchmark £51–£100';
    }
    _builder={step:1,editing:!!id,draft:draft};
    ensureBuilderOverlay();
    renderBuilder();
  }

  function ensureBuilderOverlay(){
    let ov=document.getElementById('monitor-builder-overlay');
    if(ov)return ov;
    ov=document.createElement('div');
    ov.id='monitor-builder-overlay';
    ov.className='mon-builder-overlay';
    ov.innerHTML='<div class="mon-builder-shell" role="dialog" aria-modal="true" aria-labelledby="mon-builder-title"><div id="monitor-builder-inner"></div></div>';
    ov.addEventListener('click',function(e){if(e.target===ov)closeMonitorBuilder();});
    document.body.appendChild(ov);
    requestAnimationFrame(()=>ov.classList.add('on'));
    return ov;
  }

  function closeMonitorBuilder(){
    const ov=document.getElementById('monitor-builder-overlay');
    if(!ov){_builder=null;return;}
    ov.classList.remove('on');
    setTimeout(()=>ov.remove(),180);
    _builder=null;
  }

  function builderStep(step){
    if(!_builder)return;
    syncBuilderInputs();
    _builder.step=clamp(step,1,4);renderBuilder();
  }

  function syncBuilderInputs(){
    if(!_builder)return;
    const d=_builder.draft;
    const val=id=>{const el=document.getElementById(id);return el?el.value:null;};
    const name=val('mon-b-name'); if(name!==null)d.name=name.trim()||d.name;
    const brand=val('mon-b-brand'); if(brand!==null)d.brand=brand.trim();
    const category=val('mon-b-category'); if(category!==null)d.category=category.trim()||'Other';
    const pmin=val('mon-b-price-min'); if(pmin!==null)d.priceMin=Math.max(0,asNum(pmin,d.priceMin));
    const pmax=val('mon-b-price-max'); if(pmax!==null)d.priceMax=Math.max(d.priceMin,asNum(pmax,d.priceMax));
    const profit=val('mon-b-profit'); if(profit!==null)d.minProfit=Math.max(0,asNum(profit,d.minProfit));
    const roi=val('mon-b-roi'); if(roi!==null)d.minROI=Math.max(0,asNum(roi,d.minROI));
    const rev=val('mon-b-reviews'); if(rev!==null)d.sellerMinReviews=Math.max(0,Math.round(asNum(rev,d.sellerMinReviews)));
    const rating=val('mon-b-rating'); if(rating!==null)d.sellerMinRating=clamp(asNum(rating,d.sellerMinRating),0,5);
    const zero=val('mon-b-zero'); if(zero!==null)d.zeroReviewMode=zero;
    const search=val('mon-b-search'); if(search!==null)d.searchTerms=splitTerms(search);
    const custom=val('mon-b-custom-models'); if(custom!==null)d.customModels=splitTerms(custom);
    const reject=val('mon-b-reject'); if(reject!==null)d.rejectKeywords=splitTerms(reject);
    const warning=val('mon-b-warning'); if(warning!==null)d.warningKeywords=splitTerms(warning);
  }

  function setBuilderTemplate(key){
    if(!_builder)return;
    const old=_builder.draft;
    const fresh=cloneDefaults(key);
    fresh.id=old.id||uid();
    fresh.createdAt=old.createdAt||nowIso();
    if(key==='canon')fresh.name='Canon DSLR £0–£100';
    if(key==='canonBenchmark')fresh.name='Canon RL Benchmark £51–£100';
    _builder.draft=fresh;renderBuilder();
  }

  function toggleBuilderModel(model){
    if(!_builder)return;
    syncBuilderInputs();
    const arr=_builder.draft.models||(_builder.draft.models=[]);
    const idx=arr.indexOf(model);
    if(idx>=0)arr.splice(idx,1);else arr.push(model);
    renderBuilder();
  }

  function toggleBuilderArray(field,value){
    if(!_builder)return;
    syncBuilderInputs();
    const arr=_builder.draft[field]||(_builder.draft[field]=[]);
    const idx=arr.indexOf(value);
    if(idx>=0)arr.splice(idx,1);else arr.push(value);
    renderBuilder();
  }

  function renderBuilder(){
    if(!_builder)return;
    const inner=document.getElementById('monitor-builder-inner');if(!inner)return;
    const d=_builder.draft,step=_builder.step,t=templateFor(d);
    const labels=['Basics','Models','Deal rules','Alerts'];
    inner.innerHTML=
      '<div class="mon-builder-head">'+
        '<div><div class="mon-builder-kicker">'+(_builder.editing?'Edit monitor':'New monitor')+'</div><div class="mon-builder-title" id="mon-builder-title">'+h(d.name||'Monitor')+'</div></div>'+
        '<button class="mon-builder-close" onclick="closeMonitorBuilder()" aria-label="Close">×</button>'+
      '</div>'+
      '<div class="mon-builder-progress">'+labels.map((l,i)=>'<div class="'+(step===i+1?'active ':'')+(step>i+1?'done':'')+'"><span>'+(step>i+1?'✓':(i+1))+'</span><small>'+l+'</small></div>').join('')+'</div>'+
      '<div class="mon-builder-body">'+
        (step===1?builderBasics(d):step===2?builderModels(d,t):step===3?builderRules(d):builderAlerts(d))+
      '</div>'+
      '<div class="mon-builder-footer">'+
        '<button class="btn btn-secondary" '+(step===1?'onclick="closeMonitorBuilder()"':'onclick="builderStep('+(step-1)+')"')+'>'+(step===1?'Cancel':'Back')+'</button>'+
        (step<4?'<button class="btn btn-primary" onclick="builderStep('+(step+1)+')">Continue</button>':'<button class="btn btn-primary" onclick="saveMonitorBuilder()">Save monitor</button>')+
      '</div>';
  }

  function builderBasics(d){
    return '<div class="mon-builder-section">'+
      '<div class="mon-builder-section-title">Start simple</div><div class="mon-builder-section-sub">Choose a template, give the scanner a name and set the Vinted price window.</div>'+
      '<div class="mon-template-picker">'+
        '<button class="'+(d.templateKey==='canonBenchmark'?'selected':'')+'" onclick="setBuilderTemplate(\'canonBenchmark\')"><span>'+radarIcon(20)+'</span><strong>RL Benchmark</strong><small>£51–£100 detection test</small></button>'+
        '<button class="'+(d.templateKey==='canon'?'selected':'')+'" onclick="setBuilderTemplate(\'canon\')"><span>'+cameraIcon(20)+'</span><strong>Canon DSLR</strong><small>Ready-made reseller rules</small></button>'+
        '<button class="'+(d.templateKey==='blank'?'selected':'')+'" onclick="setBuilderTemplate(\'blank\')"><span>'+plusCircleIcon(20)+'</span><strong>Custom</strong><small>Build your own scanner</small></button>'+
      '</div>'+
      '<div class="mon-form-grid">'+
        field('Monitor name','mon-b-name',d.name,'text','e.g. Canon £0–£100')+
        field('Brand','mon-b-brand',d.brand,'text','e.g. Canon')+
        field('Vinted price from','mon-b-price-min',d.priceMin,'number','0','£')+
        field('Vinted price to','mon-b-price-max',d.priceMax,'number','100','£')+
      '</div>'+
      '<label class="mon-field mon-field-wide"><span>Category</span><input id="mon-b-category" class="mon-input" value="'+h(d.category||'')+'" placeholder="Digital Cameras & Lenses"></label>'+
      '<details class="mon-advanced"><summary>Search wording</summary>'+
        '<label class="mon-field mon-field-wide"><span>Vinted search terms</span><textarea id="mon-b-search" class="mon-input mon-textarea" placeholder="Canon">'+h((d.searchTerms||[]).join('\n'))+'</textarea></label>'+
      '</details>'+
      '<div class="mon-helper">'+infoIcon(15)+'<span>You can duplicate this monitor later and change only the price band. No rules need to be rebuilt.</span></div>'+
    '</div>';
  }

  function builderModels(d,t){
    const models=t.models||[];
    return '<div class="mon-builder-section">'+
      '<div class="mon-builder-section-title">What should it recognise?</div><div class="mon-builder-section-sub">Select the models this scanner is allowed to match. RETRADE keeps the known aliases behind the scenes.</div>'+
      (models.length?'<div class="mon-model-grid">'+models.map(m=>{
        const on=(d.models||[]).includes(m.id);
        return '<button class="'+(on?'selected':'')+'" onclick="toggleBuilderModel(\''+h(m.id)+'\')"><span class="mon-model-check">'+(on?'✓':'')+'</span><strong>'+h(m.id)+'</strong><small>'+h(m.aliases.slice(1).join(' · ')||m.aliases[0]||'')+'</small></button>';
      }).join('')+'</div>':'')+
      '<label class="mon-field mon-field-wide"><span>'+(models.length?'Extra / custom models':'Models or search terms')+'</span><textarea id="mon-b-custom-models" class="mon-input mon-textarea" placeholder="One per line or comma separated">'+h((d.customModels||[]).join('\n'))+'</textarea></label>'+
      ((d.templateKey==='canon'||d.templateKey==='canonBenchmark')?'<div class="mon-helper">'+infoIcon(15)+'<span>Canon aliases such as Rebel T3i / T5i are tied to their EOS equivalents automatically.</span></div>':'')+
    '</div>';
  }

  function builderRules(d){
    const cond=d.allowedConditions||[];
    return '<div class="mon-builder-section">'+
      '<div class="mon-builder-section-title">What makes a deal worth seeing?</div><div class="mon-builder-section-sub">Keep the everyday controls obvious. The scanner can be tightened later as the market changes.</div>'+
      '<div class="mon-form-grid">'+
        field('Minimum projected profit','mon-b-profit',d.minProfit,'number','40','£')+
        field('Minimum ROI','mon-b-roi',d.minROI,'number','35','%')+
        field('Minimum seller reviews','mon-b-reviews',d.sellerMinReviews,'number','5','')+
        field('Minimum seller rating','mon-b-rating',d.sellerMinRating,'number','4.5','★','0.1')+
      '</div>'+
      '<label class="mon-field mon-field-wide"><span>Fresh / zero-review sellers</span><select id="mon-b-zero" class="mon-input">'+
        option('risky','Flag as risky — no urgent push',d.zeroReviewMode)+
        option('hide','Hide from feed',d.zeroReviewMode)+
        option('allow','Allow normally',d.zeroReviewMode)+
      '</select></label>'+
      '<div class="mon-field mon-field-wide"><span>Condition</span><div class="mon-choice-row">'+
        choice('New','new',cond,'allowedConditions')+choice('Very good','very_good',cond,'allowedConditions')+choice('Good','good',cond,'allowedConditions')+choice('Satisfactory','satisfactory',cond,'allowedConditions')+
      '</div></div>'+
      '<details class="mon-advanced"><summary>Advanced wording filters</summary>'+
        '<label class="mon-field mon-field-wide"><span>Reject if description contains</span><textarea id="mon-b-reject" class="mon-input mon-textarea">'+h((d.rejectKeywords||[]).join('\n'))+'</textarea></label>'+
        '<label class="mon-field mon-field-wide"><span>Warn if description contains</span><textarea id="mon-b-warning" class="mon-input mon-textarea">'+h((d.warningKeywords||[]).join('\n'))+'</textarea></label>'+
      '</details>'+
      (d.config&&d.config.benchmarkMode?'<div class="mon-benchmark-note">'+radarIcon(18)+'<div><strong>Benchmark mode is intentionally permissive.</strong><span>Fault wording and weak sellers are flagged, not hidden, so we can measure whether RETRADE catches the same £51–£100 Canon listings as Resell Locker.</span></div></div>':'')+
      '<div class="mon-safety-note">'+userShieldIcon(18)+'<div><strong>Seller safety is part of the deal score.</strong><span>A huge bargain from a brand-new seller can still appear, but RETRADE will not label it a normal SNIPE by default.</span></div></div>'+
    '</div>';
  }

  function builderAlerts(d){
    const arr=d.notifyLevels||[];
    const modelCount=(d.models||[]).length+(d.customModels||[]).length;
    return '<div class="mon-builder-section">'+
      '<div class="mon-builder-section-title">When should RETRADE interrupt you?</div><div class="mon-builder-section-sub">Keep phone alerts for listings that genuinely deserve fast action.</div>'+
      '<div class="mon-alert-options">'+
        alertChoice('🔥','SNIPE','Exceptional deal + acceptable seller','snipe',arr)+
        alertChoice('●','BUY','Clears profit and ROI targets','buy',arr)+
        alertChoice('●','CHECK','Interesting but below a target','check',arr)+
        alertChoice('⚠','RISKY','Good economics but seller / listing risk','risky',arr)+
      '</div>'+
      '<div class="mon-builder-summary">'+
        '<div class="mon-summary-title">Monitor summary</div>'+
        summaryRow('Search',h(d.brand||'Any brand')+' · '+modelCount+' model'+(modelCount===1?'':'s'))+
        summaryRow('Price',money(d.priceMin)+' – '+money(d.priceMax))+
        summaryRow('Buy rule','At least '+money(d.minProfit)+' profit · '+Math.round(asNum(d.minROI,0))+'% ROI')+
        summaryRow('Seller',Math.max(0,asNum(d.sellerMinReviews,0))+'+ reviews · '+Number(asNum(d.sellerMinRating,0)).toFixed(1)+'★ target')+
        summaryRow('Push alerts',arr.length?arr.map(x=>x.toUpperCase()).join(' + '):'Feed only')+
        (d.config&&d.config.benchmarkMode?summaryRow('Test mode','Compare detection against Resell Locker'):'')+
      '</div>'+
      '<div class="mon-helper">'+bellIcon(15)+'<span>Phone/Web Push is the next connection step. These preferences are stored now so the same monitor controls notifications later.</span></div>'+
    '</div>';
  }

  function field(label,id,value,type,placeholder,prefix,step){
    return '<label class="mon-field"><span>'+h(label)+'</span><div class="mon-input-wrap">'+
      (prefix?'<i>'+h(prefix)+'</i>':'')+
      '<input id="'+id+'" class="mon-input '+(prefix?'has-prefix':'')+'" type="'+(type||'text')+'" value="'+h(value)+'" placeholder="'+h(placeholder||'')+'" '+(step?'step="'+h(step)+'"':'')+'>'+
    '</div></label>';
  }
  function option(value,label,current){
    return '<option value="'+h(value)+'" '+(value===current?'selected':'')+'>'+h(label)+'</option>';
  }
  function choice(label,value,current,fieldName){
    const on=(current||[]).includes(value);
    return '<button type="button" class="'+(on?'selected':'')+'" onclick="toggleBuilderArray(\''+fieldName+'\',\''+value+'\')">'+(on?'✓ ':'')+h(label)+'</button>';
  }
  function alertChoice(iconTxt,title,sub,value,current){
    const on=(current||[]).includes(value);
    return '<button type="button" class="mon-alert-choice '+(on?'selected':'')+'" onclick="toggleBuilderArray(\'notifyLevels\',\''+value+'\')">'+
      '<span class="mon-alert-symbol">'+iconTxt+'</span><span><strong>'+title+'</strong><small>'+h(sub)+'</small></span><span class="mon-alert-check">'+(on?'✓':'')+'</span>'+
    '</button>';
  }
  function summaryRow(label,value){
    return '<div><span>'+h(label)+'</span><strong>'+value+'</strong></div>';
  }

  function saveMonitorBuilder(){
    if(!_builder)return;
    syncBuilderInputs();
    const wasEditing=_builder.editing;
    const d=_builder.draft;
    if(!d.name||!d.name.trim()){
      if(typeof toast==='function')toast('Give the monitor a name','err');return;
    }
    if(asNum(d.priceMax,0)<asNum(d.priceMin,0)){
      if(typeof toast==='function')toast('Maximum price must be above minimum','err');return;
    }
    d.updatedAt=nowIso();
    const idx=_state.monitors.findIndex(m=>m.id===d.id);
    if(idx>=0)_state.monitors[idx]=d;else _state.monitors.unshift(d);
    save();closeMonitorBuilder();_view='monitors';saveView();renderMonitorsPage(false);persistMonitorCloud(d);
    if(typeof toast==='function')toast(wasEditing?'Monitor updated':'Monitor saved');
  }

  // ---------- matching visual icon language ----------
  function svg(paths,size){
    const s=size||18;
    return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
  }
  function radarIcon(s){return svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v8l5 3"/><path d="M4 12h2M18 12h2"/>',s);}
  function cameraIcon(s){return svg('<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/>',s);}
  function plusCircleIcon(s){return svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',s);}
  function infoIcon(s){return svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',s);}
  function bellIcon(s){return svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',s);}
  function boltIcon(s){return svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',s);}
  function userShieldIcon(s){return svg('<circle cx="9" cy="8" r="3"/><path d="M3 19c.7-3.2 2.7-5 6-5 1.2 0 2.3.2 3.2.7"/><path d="M17 12l4 2v3c0 2.2-1.6 4-4 5-2.4-1-4-2.8-4-5v-3z"/><path d="M15.7 17l1 1 2-2"/>',s);}

  // Expose the small public surface used by app.js / inline UI handlers.
  window.renderMonitorsPage=renderMonitorsPage;
  window.setMonitorView=setMonitorView;
  window.openMonitorBuilder=openMonitorBuilder;
  window.closeMonitorBuilder=closeMonitorBuilder;
  window.builderStep=builderStep;
  window.setBuilderTemplate=setBuilderTemplate;
  window.toggleBuilderModel=toggleBuilderModel;
  window.toggleBuilderArray=toggleBuilderArray;
  window.saveMonitorBuilder=saveMonitorBuilder;
  window.toggleMonitor=toggleMonitor;
  window.duplicateMonitor=duplicateMonitor;
  window.archiveMonitor=archiveMonitor;
  window.setMonitorDealFilter=setMonitorDealFilter;
  window.dismissMonitorDeal=dismissMonitorDeal;
  window.loadMonitorDemoDeals=loadMonitorDemoDeals;
  window.refreshMonitorCloud=function(){return hydrateCloud(true);};

  setInterval(function(){
    try{
      const page=document.getElementById('p-monitors');
      if(page&&page.classList.contains('on')&&!_builder&&!_demoMode)hydrateCloud(true);
    }catch(e){}
  },15000);
})();
