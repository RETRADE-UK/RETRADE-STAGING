/* Optional diagnostic fixtures. Loaded on demand, never during normal startup. */
function _buildPreviewDB(){
  // ── Date helpers ──────────────────────────────────────────────────────────
  const MNTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const now=new Date();
  const ago=function(days){const d=new Date(now);d.setDate(d.getDate()-days);return d.toISOString().split('T')[0];}
  const mkey=function(daysAgo){const d=new Date(now);d.setDate(d.getDate()-daysAgo);return MNTHS[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2);}

  // ── Sourcing runs ─────────────────────────────────────────────────────────
  const run1={id:'pv-run-1',name:'Taplow Car Boot',location:'Taplow',dateStarted:ago(85),startedAtIso:new Date(ago(85)).toISOString(),dateEnded:ago(85),status:'ended',notes:'Early start — good cameras section'};
  const run2={id:'pv-run-2',name:'Maidenhead Oxfam',location:'Maidenhead',dateStarted:ago(70),startedAtIso:new Date(ago(70)).toISOString(),dateEnded:ago(70),status:'ended',notes:'Scored Lego and a PS4 controller'};
  const run3={id:'pv-run-3',name:'Slough Sunday Boot',location:'Slough',dateStarted:ago(54),startedAtIso:new Date(ago(54)).toISOString(),dateEnded:ago(54),status:'ended',notes:'Rain but great electronics pile'};
  const run4={id:'pv-run-4',name:'Windsor Charity Sweep',location:'Windsor',dateStarted:ago(40),startedAtIso:new Date(ago(40)).toISOString(),dateEnded:ago(40),status:'ended',notes:'Three shops in one trip — books and games'};
  const run5={id:'pv-run-5',name:'Reading Boot Sale',location:'Reading',dateStarted:ago(25),startedAtIso:new Date(ago(25)).toISOString(),dateEnded:ago(25),status:'ended',notes:'Massive boot — left with full boot of car'};
  const run6={id:'pv-run-6',name:'Farnham Sunday Run',location:'Farnham',dateStarted:ago(10),startedAtIso:new Date(ago(10)).toISOString(),dateEnded:ago(10),status:'ended',notes:'Quiet day but two solid scores'};
  const run7={id:'pv-run-7',name:'Basingstoke Boot Sale',location:'Basingstoke',dateStarted:ago(175),startedAtIso:new Date(ago(175)).toISOString(),dateEnded:ago(175),status:'ended',notes:'Excellent first big run — cameras, gaming and audio'};
  const run8={id:'pv-run-8',name:'Guildford Charity Circuit',location:'Guildford',dateStarted:ago(158),startedAtIso:new Date(ago(158)).toISOString(),dateEnded:ago(158),status:'ended',notes:'Five shops, unusually strong branded clothing and electronics'};
  const run9={id:'pv-run-9',name:'Bracknell Saturday Boot',location:'Bracknell',dateStarted:ago(142),startedAtIso:new Date(ago(142)).toISOString(),dateEnded:ago(142),status:'ended',notes:'High volume low buy-in stock — strong ROI'};
  const run10={id:'pv-run-10',name:'Fleet Community Sale',location:'Fleet',dateStarted:ago(124),startedAtIso:new Date(ago(124)).toISOString(),dateEnded:ago(124),status:'ended',notes:'Mixed run with two standout camera buys'};
  const run11={id:'pv-run-11',name:'Woking Boot & Charity Run',location:'Woking',dateStarted:ago(108),startedAtIso:new Date(ago(108)).toISOString(),dateEnded:ago(108),status:'ended',notes:'Profitable mixed sourcing day with fast sell-through'};
  const run12={id:'pv-run-12',name:'Camberley Sunday Boot',location:'Camberley',dateStarted:ago(96),startedAtIso:new Date(ago(96)).toISOString(),dateEnded:ago(96),status:'ended',notes:'Good console and small-electronics haul'};
  _sourcingRuns=[run7,run8,run9,run10,run11,run12,run1,run2,run3,run4,run5,run6];
  _activeSourcingRun=null;

  // ── Preview partners / supplier accounts ─────────────────────────────────
  // These intentionally cover all three account models so the Accounts page,
  // settlement workflow, P&L and return/resale logic are exercised in preview.
  _accounts=[
    {id:'pv-acct-supplier',name:'Martin Camera Stock',notes:'Local camera supplier — usually paid after sale.',settlements:[],accountType:'supplier',paymentTerms:'on_sale',defaultSplitPercent:null,defaultCostContribution:null},
    {id:'pv-acct-consign',name:'Alex Consignment',notes:'Friend/customer stock sold on a 50/50 gross-profit split.',settlements:[],accountType:'consignment',paymentTerms:'on_sale',defaultSplitPercent:50,defaultCostContribution:null},
    {id:'pv-acct-hybrid',name:'TechClearance Partner',notes:'Small upfront contribution plus 25% profit share.',settlements:[],accountType:'hybrid',paymentTerms:'on_sale',defaultSplitPercent:25,defaultCostContribution:10}
  ];

  // ── Item builder ──────────────────────────────────────────────────────────
  let _gid=1;
  const it=function(o){
    return {
      id:'pv-item-'+(_gid),
      gid:'R-'+String(_gid++).padStart(4,'0'),
      item:o.item, category:o.cat||'Electronics',
      source:o.src||'Car boot', location:o.loc||null,
      state:o.state||'listed',
      dateListed:o.listed||null, dateSold:o.sold||null,
      dateSourced:o.sourced||null,
      salePrice:o.sp||0, costPrice:o.cp||0,
      postage:o.post||3.20, shippingCost:o.ship||o.post||3.20,
      packagingCost:o.pkg||0.90, promoPercent:o.promo||0,
      estSalePrice:o.est||null,
      isReturned:o.returned||false,
      resaleSalePrice:o.rsp||null, resaleDateSold:o.rsd||null,
      resaleShippingCost:o.rship||null, resalePromoPercent:o.rpromo||null,
      resalePackagingCost:o.rpkg||null, resalePostage:o.rpost||null,
      returnHistory:o.returns||[],
      parts:o.parts||[], notes:o.notes||'',
      defaultPlatform:o.plat||'ebay', soldOnPlatform:o.splat||null,
      sourcingRunId:o.runId||null,
      accountId:o.accountId||null,
      accountType:o.accountType||null,
      accountSplitPercent:o.accountSplitPercent!=null?o.accountSplitPercent:null,
      accountSettled:o.accountSettled===true,
      accountPaidAmount:o.accountPaidAmount!=null?o.accountPaidAmount:null,
      scrappedAt:o.scrappedAt||null,
      scrapReason:o.scrapReason||null,
      scrapNote:o.scrapNote||null,
      supplierRefund:o.supplierRefund!=null?o.supplierRefund:null,
      grossProfit:null,
    };
  }

  // ── Build month buckets ───────────────────────────────────────────────────
  const DB_={_userOwned:false,trips:[],expenses:[],cashLedger:[]};
  // Ensure all month keys exist
  for(let i=0;i<7;i++){const k=mkey(i*30);if(!DB_[k])DB_[k]=[];}
  const push=function(item){const k=mkey(0); // will be re-bucketed below
    const date=item.dateListed||item.dateSourced||ago(0);
    const d=new Date(date);const mk=MNTHS[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2);
    if(!DB_[mk])DB_[mk]=[];DB_[mk].push(item);
  }

  // ── Six-month historical volume (March → early May) ─────────────────────
  // run7: Basingstoke — 6/6 sold, deliberately strong profitable run
  push(it({item:'Canon EOS 600D + 18-55mm',cat:'Cameras',src:'Car boot',sourced:ago(175),listed:ago(174),sold:ago(158),sp:128,cp:28,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',runId:'pv-run-7'}));
  push(it({item:'Nintendo Wii U 32GB bundle',cat:'Gaming',src:'Car boot',sourced:ago(175),listed:ago(174),sold:ago(162),sp:92,cp:18,post:6.99,ship:6.99,pkg:2.00,splat:'ebay',runId:'pv-run-7'}));
  push(it({item:'Bose SoundDock Series II',cat:'Audio',src:'Car boot',sourced:ago(175),listed:ago(173),sold:ago(154),sp:58,cp:8,post:6.50,ship:6.50,pkg:2.00,splat:'ebay',runId:'pv-run-7'}));
  push(it({item:'Garmin Edge 520 cycling computer',cat:'Electronics',src:'Car boot',sourced:ago(175),listed:ago(174),sold:ago(160),sp:64,cp:10,post:3.20,ship:3.20,pkg:0.80,splat:'ebay',runId:'pv-run-7'}));
  push(it({item:'Lego Technic 42055 Bucket Wheel',cat:'Lego',src:'Car boot',sourced:ago(175),listed:ago(173),sold:ago(149),sp:105,cp:20,post:7.50,ship:7.50,pkg:2.50,splat:'ebay',runId:'pv-run-7'}));
  push(it({item:'Sony Cyber-shot RX100 original',cat:'Cameras',src:'Car boot',sourced:ago(175),listed:ago(174),sold:ago(151),sp:118,cp:24,post:4.99,ship:4.99,pkg:1.20,splat:'ebay',runId:'pv-run-7'}));

  // run8: Guildford — higher volume charity sourcing
  push(it({item:'Patagonia Better Sweater M',cat:'Jackets',src:'Charity shop',sourced:ago(158),listed:ago(157),sold:ago(139),sp:52,cp:7,post:3.99,ship:3.99,splat:'vinted',runId:'pv-run-8'}));
  push(it({item:'Dr Martens 1460 boots UK 9',cat:'Shoes',src:'Charity shop',sourced:ago(158),listed:ago(157),sold:ago(137),sp:58,cp:9,post:4.99,ship:4.99,splat:'ebay',runId:'pv-run-8'}));
  push(it({item:'Sony PlayStation Vita OLED',cat:'Gaming',src:'Charity shop',sourced:ago(158),listed:ago(156),sold:ago(135),sp:96,cp:18,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-8'}));
  push(it({item:'Marshall Major III Bluetooth',cat:'Audio',src:'Charity shop',sourced:ago(158),listed:ago(156),sold:ago(141),sp:44,cp:6,post:3.20,ship:3.20,splat:'ebay',runId:'pv-run-8'}));
  push(it({item:'Le Creuset 24cm casserole',cat:'Kitchen',src:'Charity shop',sourced:ago(158),listed:ago(155),sold:ago(132),sp:62,cp:11,post:6.50,ship:6.50,pkg:2.00,splat:'ebay',runId:'pv-run-8'}));

  // run9: Bracknell — fast, profitable low-cost run
  push(it({item:'Canon EF 50mm f/1.8 II',cat:'Camera Lenses',src:'Car boot',sourced:ago(142),listed:ago(141),sold:ago(128),sp:48,cp:6,post:3.20,ship:3.20,splat:'ebay',runId:'pv-run-9'}));
  push(it({item:'Nintendo 3DS XL red',cat:'Gaming',src:'Car boot',sourced:ago(142),listed:ago(141),sold:ago(125),sp:86,cp:14,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-9'}));
  push(it({item:'Apple Magic Keyboard A1644',cat:'Peripherals',src:'Car boot',sourced:ago(142),listed:ago(140),sold:ago(123),sp:38,cp:5,post:3.20,ship:3.20,splat:'ebay',runId:'pv-run-9'}));
  push(it({item:'Makita DHP453 drill body',cat:'Tools',src:'Car boot',sourced:ago(142),listed:ago(140),sold:ago(120),sp:42,cp:7,post:4.99,ship:4.99,splat:'ebay',runId:'pv-run-9'}));
  push(it({item:'Lego Creator 10252 Beetle',cat:'Lego',src:'Car boot',sourced:ago(142),listed:ago(140),sold:ago(118),sp:82,cp:13,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',runId:'pv-run-9'}));
  push(it({item:'Nikon SB-700 Speedlight',cat:'Cameras',src:'Car boot',sourced:ago(142),listed:ago(139),sold:ago(117),sp:72,cp:12,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-9'}));

  // run10: Fleet — includes one return/resale cycle
  push(it({item:'Canon EOS 700D body',cat:'Cameras',src:'Community sale',sourced:ago(124),listed:ago(123),sold:ago(109),sp:145,cp:35,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',runId:'pv-run-10'}));
  push(it({item:'GoPro Hero 7 Silver',cat:'Cameras',src:'Community sale',sourced:ago(124),listed:ago(122),sold:ago(105),sp:72,cp:16,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-10'}));
  push(it({item:'Xbox One S 500GB',cat:'Gaming',src:'Community sale',sourced:ago(124),listed:ago(122),sold:ago(108),sp:82,cp:22,post:6.99,ship:6.99,pkg:2.00,splat:'ebay',runId:'pv-run-10'}));
  push(it({item:'Sennheiser Momentum 2 Wireless',cat:'Audio',src:'Community sale',sourced:ago(124),listed:ago(121),sold:ago(103),sp:68,cp:14,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-10'}));

  // run11 + run12 fill out April/May with believable sell-through
  push(it({item:'Olympus PEN E-PL7 + kit lens',cat:'Cameras',src:'Car boot',sourced:ago(108),listed:ago(107),sold:ago(90),sp:138,cp:32,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',runId:'pv-run-11'}));
  push(it({item:'Nintendo Switch Lite turquoise',cat:'Gaming',src:'Car boot',sourced:ago(108),listed:ago(106),sold:ago(93),sp:98,cp:28,post:3.99,ship:3.99,pkg:1.20,splat:'ebay',runId:'pv-run-11'}));
  push(it({item:'Bose QC35 Series II',cat:'Audio',src:'Car boot',sourced:ago(108),listed:ago(106),sold:ago(88),sp:82,cp:20,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-11'}));
  push(it({item:'Lego Ideas 21319 Central Perk',cat:'Lego',src:'Car boot',sourced:ago(108),listed:ago(105),sold:ago(86),sp:62,cp:11,post:5.50,ship:5.50,pkg:1.50,splat:'ebay',runId:'pv-run-11'}));
  push(it({item:'PlayStation Classic mini console',cat:'Gaming',src:'Car boot',sourced:ago(96),listed:ago(95),sold:ago(81),sp:46,cp:8,post:4.50,ship:4.50,pkg:1.20,splat:'ebay',runId:'pv-run-12'}));
  push(it({item:'JBL Flip 5 speaker',cat:'Audio',src:'Car boot',sourced:ago(96),listed:ago(95),sold:ago(80),sp:42,cp:8,post:3.50,ship:3.50,splat:'ebay',runId:'pv-run-12'}));
  push(it({item:'Canon PowerShot SX620 HS',cat:'Cameras',src:'Car boot',sourced:ago(96),listed:ago(94),sold:ago(78),sp:98,cp:20,post:3.99,ship:3.99,pkg:1.00,splat:'ebay',runId:'pv-run-12'}));
  push(it({item:'Apple TV 4th gen 32GB',cat:'Electronics',src:'Car boot',sourced:ago(96),listed:ago(94),sold:ago(77),sp:42,cp:7,post:3.20,ship:3.20,splat:'ebay',runId:'pv-run-12'}));

  // ── Partner/account history ───────────────────────────────────────────────
  // Supplier — costs exist, with a mix of settled and currently outstanding stock.
  push(it({item:'Canon EOS 2000D + 18-55mm',cat:'Cameras',src:'Partner stock',sourced:ago(150),listed:ago(149),sold:ago(131),sp:205,cp:105,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',accountId:'pv-acct-supplier',accountType:'supplier',accountSettled:true,runId:null}));
  push(it({item:'Nikon D3500 body',cat:'Cameras',src:'Partner stock',sourced:ago(118),listed:ago(117),sold:ago(99),sp:188,cp:92,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',accountId:'pv-acct-supplier',accountType:'supplier',accountSettled:true}));
  push(it({item:'Canon EOS 4000D body',cat:'Cameras',src:'Partner stock',sourced:ago(18),listed:ago(17),sp:145,cp:72,post:5.99,ship:5.99,pkg:1.50,est:145,state:'listed',accountId:'pv-acct-supplier',accountType:'supplier',accountSettled:false}));

  // Consignment — zero acquisition cost; partner share appears only once sold.
  push(it({item:'MacBook Air 2019 128GB',cat:'Laptops',src:'Consignment',sourced:ago(112),listed:ago(111),sold:ago(91),sp:310,cp:0,post:7.99,ship:7.99,pkg:2.50,splat:'ebay',accountId:'pv-acct-consign',accountType:'consignment',accountPaidAmount:132.40,accountSettled:true}));
  push(it({item:'iPad 8th Gen 32GB Wi-Fi',cat:'Tablets',src:'Consignment',sourced:ago(74),listed:ago(73),sold:ago(56),sp:178,cp:0,post:5.99,ship:5.99,pkg:1.50,splat:'ebay',accountId:'pv-acct-consign',accountType:'consignment',accountSplitPercent:50,accountSettled:false}));
  push(it({item:'Apple Watch Series 6 44mm',cat:'Smartwatches',src:'Consignment',sourced:ago(14),listed:ago(13),sp:118,cp:0,post:3.99,ship:3.99,est:118,state:'listed',accountId:'pv-acct-consign',accountType:'consignment',accountSplitPercent:50,accountSettled:false}));

  // Hybrid — upfront contribution + later profit split.
  push(it({item:'Dell Latitude 5420 i5 16GB',cat:'Laptops',src:'Partner stock',sourced:ago(62),listed:ago(61),sold:ago(43),sp:245,cp:45,post:7.99,ship:7.99,pkg:2.50,splat:'ebay',accountId:'pv-acct-hybrid',accountType:'hybrid',accountPaidAmount:42.50,accountSettled:true}));
  push(it({item:'Lenovo ThinkPad T480 i5',cat:'Laptops',src:'Partner stock',sourced:ago(21),listed:ago(20),sp:185,cp:35,post:7.99,ship:7.99,pkg:2.50,est:185,state:'listed',accountId:'pv-acct-hybrid',accountType:'hybrid',accountSplitPercent:25,accountSettled:false}));

  // ── Return/refund history ─────────────────────────────────────────────────
  // Partial refund, item stays sold.
  push(it({item:'Sony WH-CH710N headphones',cat:'Audio',src:'Car boot',sourced:ago(136),listed:ago(135),sold:ago(119),sp:42,cp:8,post:3.99,ship:3.99,splat:'ebay',returns:[{id:'pv-ret-2',type:'partial_seller',refundAmount:8,loggedAt:new Date(ago(114)).toISOString(),notes:'Partial refund for missing charging cable',_dateSoldAtReturn:ago(119),_salePriceAtReturn:42,_postageAtReturn:3.99,_platformAtReturn:'ebay',_promoPercentAtReturn:0}]}));
  // Full return then successful resale — tests cost restoration and Sale 2.
  push(it({item:'Nintendo Switch V1 tablet',cat:'Gaming',src:'Facebook',sourced:ago(132),listed:ago(131),sold:ago(116),sp:118,cp:42,post:4.99,ship:4.99,pkg:1.20,returned:true,rsp:112,rsd:ago(87),rship:4.99,rpkg:1.20,rpromo:0,rpost:4.99,state:'listed',returns:[{id:'pv-ret-3',type:'full_seller',refundAmount:118,returnPostage:3.50,loggedAt:new Date(ago(110)).toISOString(),notes:'Buyer changed mind after delivery; returned complete',_dateSoldAtReturn:ago(116),_salePriceAtReturn:118,_postageAtReturn:4.99,_platformAtReturn:'ebay',_promoPercentAtReturn:0,_relistedAt:ago(103),_salePriceAtRelist:118,_postageAtRelist:4.99,_shippingCostAtRelist:4.99,_packagingCostAtRelist:1.20,_promoPercentAtRelist:0}]}));
  // Platform-decided partial refund.
  push(it({item:'Fitbit Versa 2',cat:'Smartwatches',src:'Charity shop',sourced:ago(92),listed:ago(91),sold:ago(74),sp:46,cp:10,post:2.80,ship:2.80,splat:'ebay',returns:[{id:'pv-ret-4',type:'partial_ebay',refundAmount:12,loggedAt:new Date(ago(70)).toISOString(),notes:'Platform goodwill adjustment',_dateSoldAtReturn:ago(74),_salePriceAtReturn:46,_postageAtReturn:2.80,_platformAtReturn:'ebay',_promoPercentAtReturn:0}]}));
  // Full return still in returned stock, intentionally not yet relisted.
  push(it({item:'Canon EF-S 55-250mm IS II',cat:'Camera Lenses',src:'Car boot',sourced:ago(48),listed:ago(47),sold:ago(31),sp:78,cp:22,post:4.50,ship:4.50,pkg:1.20,returned:true,state:'returned',returns:[{id:'pv-ret-5',type:'full_seller',refundAmount:78,returnPostage:3.49,loggedAt:new Date(ago(24)).toISOString(),notes:'Autofocus intermittent on buyer body — checking before relist',_dateSoldAtReturn:ago(31),_salePriceAtReturn:78,_postageAtReturn:4.50,_platformAtReturn:'ebay',_promoPercentAtReturn:0}]}));
  // Consignment sold, partner paid, then returned — tests paid partner sunk-cost invariant.
  push(it({item:'iPhone 11 64GB Black',cat:'Phones',src:'Consignment',sourced:ago(52),listed:ago(51),sold:ago(37),sp:218,cp:0,post:4.99,ship:4.99,pkg:1.20,returned:true,state:'returned',accountId:'pv-acct-consign',accountType:'consignment',accountPaidAmount:91.00,accountSettled:true,returns:[{id:'pv-ret-6',type:'full_seller',refundAmount:218,returnPostage:3.49,loggedAt:new Date(ago(29)).toISOString(),notes:'Face ID issue discovered after sale; partner share had already been paid',_dateSoldAtReturn:ago(37),_salePriceAtReturn:218,_postageAtReturn:4.99,_platformAtReturn:'ebay',_promoPercentAtReturn:0}]}));

  // ── Removed stock / archive examples ──────────────────────────────────────
  push(it({item:'Broken Canon IXUS 185',cat:'Cameras',src:'Car boot',sourced:ago(66),cp:8,est:28,state:'scrapped',scrappedAt:ago(50),scrapReason:'scrapped',scrapNote:'Main board fault — uneconomic repair'}));
  push(it({item:'Bundle of generic phone cases',cat:'Phone Accessories',src:'Job lot',sourced:ago(59),cp:6,est:12,state:'scrapped',scrappedAt:ago(41),scrapReason:'donated',scrapNote:'Donated locally after low demand'}));
  push(it({item:'Faulty Epson scanner',cat:'Electronics',src:'Supplier',sourced:ago(34),cp:18,est:30,state:'scrapped',scrappedAt:ago(28),scrapReason:'supplier_return',scrapNote:'Returned to supplier after failed test',supplierRefund:18}));

  // ── run1: Taplow Car Boot (85d ago) — 5 items all sold ─────────────────
  push(it({item:'Canon EOS 1100D body',       cat:'Cameras',       src:'Car boot',     sourced:ago(85),listed:ago(84),sold:ago(70),sp:62, cp:12,post:4.99,ship:4.99,pkg:1.20,splat:'ebay',runId:'pv-run-1',notes:'Tested working, slight dust on sensor'}));
  push(it({item:'Canon 18-55mm kit lens',      cat:'Camera Lenses', src:'Car boot',     sourced:ago(85),listed:ago(84),sold:ago(68),sp:28, cp:5, post:3.20,ship:3.20,          splat:'ebay',runId:'pv-run-1'}));
  push(it({item:'Nintendo DS Lite + charger',  cat:'Gaming',        src:'Car boot',     sourced:ago(85),listed:ago(83),sold:ago(71),sp:22, cp:4, post:2.80,ship:2.80,          splat:'ebay',runId:'pv-run-1'}));
  push(it({item:'Dyson V6 Slim handheld',      cat:'Hoovers',       src:'Car boot',     sourced:ago(85),listed:ago(82),sold:ago(60),sp:45, cp:8, post:5.99,ship:5.99,pkg:1.50,splat:'ebay',runId:'pv-run-1'}));
  push(it({item:'Lego Star Wars 75177',         cat:'Lego',          src:'Car boot',     sourced:ago(85),listed:ago(83),sold:ago(55),sp:38, cp:7, post:4.50,ship:4.50,          splat:'ebay',runId:'pv-run-1'}));

  // ── run2: Maidenhead Oxfam (70d ago) — 4 items all sold ──────────────────
  push(it({item:'PS4 DualShock controller',     cat:'Gaming',        src:'Charity shop', sourced:ago(70),listed:ago(69),sold:ago(45),sp:28, cp:5, post:2.80,ship:2.80,          splat:'ebay',runId:'pv-run-2'}));
  push(it({item:'Lego City 60141 police stn',   cat:'Lego',          src:'Charity shop', sourced:ago(70),listed:ago(69),sold:ago(40),sp:44, cp:8, post:5.50,ship:5.50,pkg:2.00,splat:'ebay',runId:'pv-run-2'}));
  push(it({item:'Bose SoundLink Mini II',        cat:'Audio',         src:'Charity shop', sourced:ago(70),listed:ago(69),sold:ago(38),sp:55, cp:12,post:3.99,ship:3.99,pkg:1.50,splat:'ebay',runId:'pv-run-2'}));
  push(it({item:'GoPro Hero 5 Black',            cat:'Cameras',       src:'Car boot',     sourced:ago(70),listed:ago(68),sold:ago(35),sp:58, cp:12,post:3.50,ship:3.50,pkg:1.20,splat:'ebay',runId:'pv-run-2'}));

  // ── run3: Slough Sunday Boot (54d ago) — 4 sold, 1 still listed ─────────
  push(it({item:'Dell XPS 13 charger 45W',      cat:'Laptop Acc',    src:'Car boot',     sourced:ago(54),listed:ago(53),sold:ago(30),sp:22, cp:3, post:2.40,ship:2.40,          splat:'ebay',runId:'pv-run-3'}));
  push(it({item:'Razer BlackWidow keyboard',     cat:'Peripherals',   src:'Car boot',     sourced:ago(54),listed:ago(52),sold:ago(28),sp:35, cp:8, post:5.50,ship:5.50,pkg:2.00,splat:'ebay',runId:'pv-run-3'}));
  push(it({item:'Sony PSP 3003',                 cat:'Gaming',        src:'Car boot',     sourced:ago(54),listed:ago(53),sold:ago(35),sp:32, cp:6, post:3.99,ship:3.99,          splat:'ebay',runId:'pv-run-3',notes:'Needed new battery'}));
  push(it({item:'Olympus OM-10 35mm SLR',        cat:'Cameras',       src:'Car boot',     sourced:ago(54),listed:ago(53),sold:ago(33),sp:48, cp:9, post:4.50,ship:4.50,pkg:1.50,splat:'ebay',runId:'pv-run-3'}));
  push(it({item:'North Face Puffa jacket M',     cat:'Jackets',       src:'Car boot',     sourced:ago(54),listed:ago(52),           sp:32, cp:6, post:4.50,ship:4.50,est:32,state:'listed',runId:'pv-run-3'}));

  // ── run4: Windsor Charity Sweep (40d ago) — 4 items all sold ────────────
  push(it({item:'Game Boy Advance SP + games',   cat:'Gaming',        src:'Charity shop', sourced:ago(40),listed:ago(39),sold:ago(22),sp:48, cp:10,post:3.50,ship:3.50,pkg:1.20,splat:'ebay',runId:'pv-run-4'}));
  push(it({item:'Lego Friends 41450 mall',        cat:'Lego',          src:'Charity shop', sourced:ago(40),listed:ago(39),sold:ago(20),sp:36, cp:7, post:4.50,ship:4.50,pkg:1.50,splat:'ebay',runId:'pv-run-4'}));
  push(it({item:'Harry Potter complete set',      cat:'Books',         src:'Charity shop', sourced:ago(40),listed:ago(38),sold:ago(18),sp:42, cp:8, post:5.99,ship:5.99,pkg:2.00,splat:'ebay',runId:'pv-run-4'}));
  push(it({item:'Tonka digger toy diecast',       cat:'Toys',          src:'Charity shop', sourced:ago(40),listed:ago(39),sold:ago(15),sp:24, cp:3, post:3.20,ship:3.20,          splat:'ebay',runId:'pv-run-4'}));

  // ── run5: Reading Boot Sale (25d ago) — 2 sold, 3 listed ────────────────
  push(it({item:'Bose QC25 headphones',           cat:'Audio',         src:'Car boot',     sourced:ago(25),listed:ago(24),sold:ago(8), sp:68, cp:14,post:4.99,ship:4.99,pkg:1.50,splat:'ebay',runId:'pv-run-5'}));
  push(it({item:'Sennheiser HD 280 Pro',           cat:'Audio',         src:'Car boot',     sourced:ago(25),listed:ago(24),sold:ago(12),sp:38, cp:8, post:4.50,ship:4.50,          splat:'ebay',runId:'pv-run-5'}));
  push(it({item:'Stanley Multi-tool set',          cat:'Tools',         src:'Car boot',     sourced:ago(25),listed:ago(24),            sp:32, cp:6, post:5.50,ship:5.50,est:32,state:'listed',runId:'pv-run-5'}));
  push(it({item:'Vintage Tonka truck red',          cat:'Toys',          src:'Car boot',     sourced:ago(25),listed:ago(23),            sp:28, cp:5, post:5.50,ship:5.50,est:28,state:'listed',runId:'pv-run-5'}));
  push(it({item:'Polaroid SX-70 camera',            cat:'Cameras',       src:'Car boot',     sourced:ago(25),listed:ago(23),            sp:55, cp:12,post:5.99,ship:5.99,pkg:1.50,est:55,state:'listed',runId:'pv-run-5'}));

  // ── run6: Farnham Sunday Run (10d ago) — 1 sold, 1 listed, 2 in stock ───
  push(it({item:'Microsoft Sculpt keyboard',       cat:'Peripherals',   src:'Car boot',     sourced:ago(10),listed:ago(9),sold:ago(3), sp:28, cp:5, post:3.99,ship:3.99,          splat:'ebay',runId:'pv-run-6'}));
  push(it({item:'Nikon D40 DSLR body',              cat:'Cameras',       src:'Car boot',     sourced:ago(10),listed:ago(9),             sp:55, cp:18,post:5.99,ship:5.99,pkg:1.50,est:55,state:'listed',runId:'pv-run-6',notes:'Body only, low shutter count'}));
  push(it({item:'Vintage Pyrex casserole set',      cat:'Kitchen',       src:'Car boot',     sourced:ago(10),                           cp:7,                                    est:32,state:'sourced',runId:'pv-run-6'}));
  push(it({item:'Boxed Monopoly vintage edition',   cat:'Games',         src:'Car boot',     sourced:ago(10),                           cp:4,                                    est:22,state:'sourced',runId:'pv-run-6'}));

  // ── RETURNED + RELISTED ───────────────────────────────────────────────────
  const samsungId='pv-item-'+_gid;
  push(it({item:'Samsung Galaxy S9 64GB',cat:'Phones',src:'Car boot',sourced:ago(50),listed:ago(49),sold:ago(32),sp:48,cp:14,post:3.75,ship:3.75,returned:true,
    rsp:52,rsd:ago(10),rship:3.75,rpkg:1.00,rpromo:0,rpost:3.75,state:'listed',
    returns:[{id:'pv-ret-1',type:'full_seller',refundAmount:48,loggedAt:new Date(ago(25)).toISOString(),notes:'Buyer claimed not as described',_dateSoldAtReturn:ago(32),_salePriceAtReturn:48}],
    notes:'Returned — relisted and resold'}));

  // ── Non-run sold items — general stock history ────────────────────────────
  push(it({item:'Apple iPhone 7 128GB',           cat:'Phones',        src:'Charity shop', sourced:ago(78),listed:ago(77),sold:ago(62),sp:72, cp:18,post:3.75,ship:3.75,pkg:1.00,splat:'ebay'}));
  push(it({item:'Vintage Casio F-91W',             cat:'Watches',       src:'Car boot',     sourced:ago(75),listed:ago(74),sold:ago(58),sp:18, cp:2, post:1.50,ship:1.50,          splat:'vinted'}));
  push(it({item:'Sony WH-1000XM3 headphones',      cat:'Audio',         src:'Facebook',     sourced:ago(72),listed:ago(71),sold:ago(50),sp:85, cp:22,post:4.99,ship:4.99,pkg:2.00,splat:'ebay',notes:'Missing 3.5mm cable, stated in listing'}));
  push(it({item:'JBL Charge 3 speaker',             cat:'Audio',         src:'Charity shop', sourced:ago(68),listed:ago(67),sold:ago(44),sp:32, cp:6, post:3.99,ship:3.99,          splat:'ebay'}));
  push(it({item:'Lego Technic 42082',               cat:'Lego',          src:'Car boot',     sourced:ago(65),listed:ago(64),sold:ago(40),sp:52, cp:10,post:5.50,ship:5.50,pkg:1.50,splat:'ebay'}));
  push(it({item:'Nike Air Max 95 size 10',          cat:'Trainers',      src:'Charity shop', sourced:ago(62),listed:ago(61),sold:ago(38),sp:55, cp:9, post:4.99,ship:4.99,          splat:'ebay'}));
  push(it({item:'Garmin Forerunner 235',             cat:'Watches',       src:'Facebook',     sourced:ago(60),listed:ago(59),sold:ago(35),sp:62, cp:15,post:3.50,ship:3.50,pkg:1.00,splat:'ebay'}));
  push(it({item:'Beats Solo3 Wireless',             cat:'Audio',         src:'Car boot',     sourced:ago(58),listed:ago(57),sold:ago(30),sp:42, cp:8, post:3.99,ship:3.99,          splat:'ebay'}));
  push(it({item:'Fitbit Charge 4',                  cat:'Smartwatches',  src:'Charity shop', sourced:ago(48),listed:ago(47),sold:ago(33),sp:32, cp:7, post:2.80,ship:2.80,          splat:'ebay'}));
  push(it({item:'Apple AirPods 2nd gen',            cat:'Audio',         src:'Facebook',     sourced:ago(45),listed:ago(44),sold:ago(28),sp:48, cp:15,post:2.80,ship:2.80,pkg:1.00,splat:'ebay'}));
  push(it({item:'Vintage Levi denim jacket',        cat:'Jackets',       src:'Charity shop', sourced:ago(35),listed:ago(34),sold:ago(17),sp:38, cp:6, post:4.50,ship:4.50,          splat:'vinted'}));
  push(it({item:'Lego Architecture 21041',          cat:'Lego',          src:'Car boot',     sourced:ago(32),listed:ago(31),sold:ago(14),sp:42, cp:8, post:5.50,ship:5.50,pkg:1.50,splat:'ebay'}));
  push(it({item:'Penguin Classics 30-book lot',     cat:'Books',         src:'Car boot',     sourced:ago(28),listed:ago(27),sold:ago(13),sp:35, cp:5, post:6.99,ship:6.99,pkg:2.50,splat:'ebay'}));
  push(it({item:'Vintage Schwinn road bike',        cat:'Sports',        src:'Facebook',     sourced:ago(20),listed:ago(19),sold:ago(5), sp:165,cp:45,post:0,  ship:0,              splat:'facebook',notes:'Collection only, sold same week'}));
  push(it({item:'Anker Powercore 20100mAh',         cat:'Electronics',   src:'Car boot',     sourced:ago(40),listed:ago(39),sold:ago(15),sp:18, cp:3, post:2.40,ship:2.40,          splat:'ebay'}));
  push(it({item:'Kindle Paperwhite 3rd gen',        cat:'Tablets',       src:'Car boot',     sourced:ago(68),listed:ago(67),sold:ago(44),sp:28, cp:5, post:2.80,ship:2.80,          splat:'ebay'}));

  // ── Active listed items ───────────────────────────────────────────────────
  push(it({item:'Pentax K1000 film camera',         cat:'Cameras',       src:'Car boot',     sourced:ago(45),listed:ago(44),sp:38, cp:8, post:4.99,ship:4.99,          est:38, state:'listed',notes:'Fully mechanical, working shutter'}));
  push(it({item:'Vitamix 5200 blender',             cat:'Kitchen',       src:'Charity shop', sourced:ago(42),listed:ago(41),sp:78, cp:15,post:7.99,ship:7.99,pkg:2.50,est:78, state:'listed'}));
  push(it({item:"Levi's 501 W32 L30",               cat:'Jeans',         src:'Charity shop', sourced:ago(40),listed:ago(39),sp:24, cp:4, post:2.99,ship:2.99,          est:24, state:'listed'}));
  push(it({item:'Fujifilm Instax Mini 9',           cat:'Cameras',       src:'Car boot',     sourced:ago(38),listed:ago(37),sp:22, cp:5, post:2.80,ship:2.80,          est:22, state:'listed'}));
  push(it({item:'Kindle Fire HD 8 8th gen',         cat:'Tablets',       src:'Charity shop', sourced:ago(35),listed:ago(34),sp:32, cp:7, post:2.80,ship:2.80,          est:32, state:'listed'}));

  // ── Sourced (in stock) ────────────────────────────────────────────────────
  push(it({item:'Panasonic Lumix TZ70',             cat:'Cameras',       src:'Car boot',     sourced:ago(8), cp:14,est:55,state:'sourced',notes:'Fully working, good condition'}));
  push(it({item:'Lego Minecraft 21137',             cat:'Lego',          src:'Car boot',     sourced:ago(6), cp:7, est:38,state:'sourced'}));
  push(it({item:'Adidas Samba OG W size 6',         cat:'Trainers',      src:'Charity shop', sourced:ago(4), cp:5, est:45,state:'sourced'}));
  push(it({item:'Apple Watch Series 3 42mm',        cat:'Smartwatches',  src:'Car boot',     sourced:ago(3), cp:12,est:35,state:'sourced',notes:'Battery 78%, working'}));
  push(it({item:'Wii console + 2 controllers',      cat:'Gaming',        src:'Car boot',     sourced:ago(2), cp:10,est:32,state:'sourced'}));
  push(it({item:'Canon Pixma printer (spares)',     cat:'Printers',      src:'Charity shop', sourced:ago(1), cp:2, est:14,state:'sourced',notes:'For parts — ink heads only'}));

  // ── Trips ─────────────────────────────────────────────────────────────────
  DB_.trips=[
    {id:'pv-trip-12',date:ago(175),description:'Basingstoke Boot Sale',mileage:24,ratePerMile:0.55,expenses:[{description:'Entry',amount:3.00,date:ago(175)},{description:'Parking',amount:2.00,date:ago(175)}],sourcingRunId:'pv-run-7'},
    {id:'pv-trip-11',date:ago(158),description:'Guildford Charity Circuit',mileage:31,ratePerMile:0.55,expenses:[{description:'Parking',amount:4.20,date:ago(158)}],sourcingRunId:'pv-run-8'},
    {id:'pv-trip-10',date:ago(142),description:'Bracknell Saturday Boot',mileage:18,ratePerMile:0.55,expenses:[{description:'Entry',amount:2.50,date:ago(142)}],sourcingRunId:'pv-run-9'},
    {id:'pv-trip-9',date:ago(124),description:'Fleet Community Sale',mileage:12,ratePerMile:0.55,expenses:[{description:'Entry',amount:2.00,date:ago(124)}],sourcingRunId:'pv-run-10'},
    {id:'pv-trip-8b',date:ago(108),description:'Woking Boot & Charity Run',mileage:34,ratePerMile:0.55,expenses:[{description:'Parking',amount:3.50,date:ago(108)}],sourcingRunId:'pv-run-11'},
    {id:'pv-trip-8a',date:ago(96),description:'Camberley Sunday Boot',mileage:20,ratePerMile:0.55,expenses:[{description:'Entry',amount:3.00,date:ago(96)}],sourcingRunId:'pv-run-12'},
    {id:'pv-trip-1',date:ago(85),description:'Taplow Car Boot',mileage:14,ratePerMile:0.45,expenses:[{description:'Parking',amount:2.00,date:ago(85)}],sourcingRunId:'pv-run-1'},
    {id:'pv-trip-2',date:ago(70),description:'Maidenhead Oxfam run',mileage:9,ratePerMile:0.45,expenses:[],sourcingRunId:'pv-run-2'},
    {id:'pv-trip-3',date:ago(40),description:'Windsor charity shop crawl',mileage:16,ratePerMile:0.45,expenses:[],sourcingRunId:'pv-run-4'},
    {id:'pv-trip-4',date:ago(54),description:'Slough Sunday Boot',mileage:22,ratePerMile:0.45,expenses:[{description:'Entry fee',amount:3.00,date:ago(54)},{description:'Parking',amount:2.50,date:ago(54)}],sourcingRunId:'pv-run-3'},
    {id:'pv-trip-5',date:ago(25),description:'Reading Boot Sale',mileage:28,ratePerMile:0.45,expenses:[{description:'Entry fee',amount:4.00,date:ago(25)},{description:'Coffee',amount:3.20,date:ago(25)}],sourcingRunId:'pv-run-5'},
    {id:'pv-trip-6',date:ago(10),description:'Farnham Sunday Run',mileage:18,ratePerMile:0.45,expenses:[{description:'Entry',amount:2.00,date:ago(10)}],sourcingRunId:'pv-run-6'},
    {id:'pv-trip-7',date:ago(7),description:'Quick Aldershot scout',mileage:8,ratePerMile:0.45,expenses:[],sourcingRunId:null},
  ];

  // ── Expenses ──────────────────────────────────────────────────────────────
  DB_.expenses=[
    {id:'pv-exp-older-1',date:ago(172),description:'Royal Mail parcel boxes x25',amount:18.50,category:'Packaging Materials',sourcingRunId:null},
    {id:'pv-exp-older-2',date:ago(154),description:'Isopropyl alcohol + cleaning cloths',amount:9.40,category:'Parts & Repairs',sourcingRunId:null},
    {id:'pv-exp-older-3',date:ago(138),description:'Thermal labels 4x6 bulk pack',amount:15.99,category:'Shipping Supplies',sourcingRunId:null},
    {id:'pv-exp-older-4',date:ago(121),description:'Replacement camera batteries',amount:21.50,category:'Parts & Repairs',sourcingRunId:null},
    {id:'pv-exp-older-5',date:ago(101),description:'Packing tape 12-roll carton',amount:14.99,category:'Shipping Supplies',sourcingRunId:null},
    {id:'pv-exp-1',date:ago(80),description:'Bubble wrap roll 50m',amount:8.99,category:'Packaging Materials',sourcingRunId:null},
    {id:'pv-exp-2',date:ago(75),description:'Small jiffy bags x100',amount:12.49,category:'Packaging Materials',sourcingRunId:null},
    {id:'pv-exp-3',date:ago(60),description:'Poly mailers 100pk',amount:9.99,category:'Packaging Materials',sourcingRunId:null},
    {id:'pv-exp-4',date:ago(55),description:'Cardboard boxes assorted',amount:14.50,category:'Packaging Materials',sourcingRunId:null},
    {id:'pv-exp-5',date:ago(45),description:'Tape gun + rolls',amount:6.99,category:'Shipping Supplies',sourcingRunId:null},
    {id:'pv-exp-6',date:ago(30),description:'Thermal label printer rolls',amount:11.99,category:'Shipping Supplies',sourcingRunId:null},
    {id:'pv-exp-7',date:ago(20),description:'Phone repair kit',amount:7.50,category:'Parts & Repairs',sourcingRunId:null},
    {id:'pv-exp-8',date:ago(10),description:'Bubble wrap refill',amount:7.49,category:'Packaging Materials',sourcingRunId:null},
    {id:'pv-exp-9',date:ago(85),description:'Boot run snacks & fuel stop',amount:6.00,category:'Travel',sourcingRunId:'pv-run-1'},
  ];

  // Historical settlement records shown on partner/account pages.
  // Item IDs are stable because preview IDs are generated deterministically.
  const byName=function(name){let found=null;Object.keys(DB_).forEach(function(k){if(Array.isArray(DB_[k])){const x=DB_[k].find(function(i){return i.item===name;});if(x)found=x;}});return found;};
  const sup1=byName('Canon EOS 2000D + 18-55mm'),sup2=byName('Nikon D3500 body');
  const con1=byName('MacBook Air 2019 128GB'),conRet=byName('iPhone 11 64GB Black');
  const hyb1=byName('Dell Latitude 5420 i5 16GB');
  if(sup1&&sup2)_accounts[0].settlements=[{id:'pv-stl-sup-1',date:ago(95),createdAt:new Date(ago(95)).toISOString(),paid:true,kind:'supplier',partnerAmount:+((sup1.costPrice||0)+(sup2.costPrice||0)).toFixed(2),yourAmount:0,note:'Bank transfer — settled sold camera stock',items:[{id:sup1.id,amount:sup1.costPrice,name:sup1.item},{id:sup2.id,amount:sup2.costPrice,name:sup2.item}]}];
  if(con1&&conRet)_accounts[1].settlements=[{id:'pv-stl-con-1',date:ago(84),createdAt:new Date(ago(84)).toISOString(),paid:true,partnerAmount:132.40,yourAmount:140.61,grossProfit:273.01,note:'March/April consignment payout',items:[{id:con1.id,amount:132.40}]},{id:'pv-stl-con-ret',date:ago(33),createdAt:new Date(ago(33)).toISOString(),paid:true,partnerAmount:91.00,yourAmount:0,note:'Partner paid before buyer return — intentionally retained as sunk cost',items:[{id:conRet.id,amount:91.00}]}];
  if(hyb1)_accounts[2].settlements=[{id:'pv-stl-hyb-1',date:ago(39),createdAt:new Date(ago(39)).toISOString(),paid:true,partnerAmount:42.50,yourAmount:141.01,note:'Hybrid profit-share settlement',items:[{id:hyb1.id,amount:42.50}]}];

  return DB_;
}
