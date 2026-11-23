
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
      const src=innerWidth<=600 && button.dataset.phone ? button.dataset.phone : button.dataset.zoom;
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

  const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const money = value => currency.format(value / 100);
  const mount = (id, render) => {
    const host = document.querySelector('[data-demo="' + id + '"]');
    if (host) render(host);
  };
  const button = (key, label, active = false) =>
    '<button type="button" data-choice="' + key + '" aria-pressed="' + active + '">' + label + '</button>';
  const rows = entries => entries.map(([name, detail, value]) =>
    '<li class="workspace-row"><span><b>' + name + '</b><small>' + detail +
    '</small></span><strong>' + value + '</strong></li>').join('');
  const kpis = entries => entries.map(([label, value]) =>
    '<div><small>' + label + '</small><strong>' + value + '</strong></div>').join('');
  function choose(host, draw) {
    host.querySelectorAll('[data-choice]').forEach(control => control.addEventListener('click', () => {
      host.querySelectorAll('[data-choice]').forEach(option =>
        option.setAttribute('aria-pressed', String(option === control)));
      draw(control.dataset.choice);
    }));
  }

  // Each bucket holds gross revenue, gross profit, sales and refund count.
  // Ranges sum the same underlying example trading activity.
  const weeks = [[42000, 16640, 12, 0], [48700, 20230, 14, 1], [52100, 21830, 16, 0], [45100, 18200, 14, 0]];
  const firstDays = [9800, 3923, 2, 0];
  // January–September and 1–21 October precede the final 30-day window.
  const earlierMonths = [
    [108400, 40840, 34, 1], [121630, 45610, 39, 1], [147100, 58980, 45, 1],
    [137250, 52160, 42, 2], [156530, 61280, 48, 1], [176780, 71910, 52, 2],
    [155640, 62730, 46, 1], [187420, 78910, 55, 1], [161280, 63850, 50, 1],
    [135660, 55010, 42, 1]
  ];
  const sum = buckets => buckets.reduce((totals, bucket) =>
    totals.map((total, index) => total + bucket[index]), [0, 0, 0, 0]);
  const dashboardRanges = {
    '7': [weeks[3]], '14': weeks.slice(2), '30': [firstDays, ...weeks],
    cy: [...earlierMonths, sum([firstDays, ...weeks])]
  };
  mount('dashboard', host => {
    host.innerHTML = '<h3>Dashboard</h3><div class="workspace-controls" role="group" aria-label="Dashboard period">' +
      button('7', '7 days') + button('14', '14 days') + button('30', '30 days', true) +
      button('cy', 'CY') + '</div><div class="workspace-result" aria-live="polite"></div>';
    const result = host.querySelector('.workspace-result');
    const labels = { 7: 'Last 7 days', 14: 'Last 14 days', 30: 'Last 30 days', cy: '2026 calendar year to date' };
    function draw(period, animate = true) {
      const points = dashboardRanges[period];
      const [revenue, profit, sales, refunds] = sum(points);
      const max = Math.max(...points.map(point => point[0]));
      result.innerHTML = '<p class="workspace-period">' + labels[period] + ' · 20 Nov 2026</p>' +
        '<div class="workspace-kpis">' + kpis([
          ['Gross revenue', money(revenue)], ['Gross profit', money(profit)],
          ['Margin', (100 * profit / revenue).toFixed(1) + '%'], ['Refund rate', (100 * refunds / sales).toFixed(1) + '%']
        ]) + '</div><div class="workspace-chart" aria-hidden="true">' +
        points.map(([turnover, earnings]) => '<span style="--revenue:' + (100 * turnover / max) +
          '%;--profit:' + (100 * earnings / turnover) + '%"><i></i></span>').join('') +
        '</div><p class="workspace-key" aria-hidden="true"><span>Revenue</span><span>Gross profit</span></p>' +
        '<p class="workspace-foot">' + sales + ' sales · ' + refunds + ' with refunds</p>';
      if (animate && !reduced.matches) result.animate(
        [{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 240, easing: 'ease-out' });
    }
    choose(host, draw);
    draw('30', false);
  });

  mount('sale', host => {
    // Most recent first. Profit includes any refund already issued.
    const sales = [
      ['Cotton chore jacket', 'Vinted', 4200, 1955, false],
      ['Linen blazer', 'Vinted', 3800, 1555, false],
      ['Compact coffee grinder', 'eBay', 4500, 390, true],
      ['Socket and spanner set', 'Facebook Marketplace', 4400, 2000, false],
      ['Mario Kart 8 Deluxe', 'eBay', 1900, 547, false]
    ];
    host.innerHTML = '<h3>Sales</h3><div class="workspace-controls"><div class="workspace-controls" role="group" aria-label="Sales status">' +
      button('all', 'All sales', true) + button('returned', 'Returned') +
      '</div><label class="workspace-sort">Sort by <select aria-label="Sort sales"><option value="recent">Newest sales</option>' +
      '<option value="profit">Highest profit</option></select></label></div>' +
      '<p class="workspace-foot" role="status"></p><ul class="workspace-list"></ul>';
    let filter = 'all';
    const sort = host.querySelector('select');
    function draw() {
      const visible = sales.filter(sale => filter === 'all' || sale[4]);
      if (sort.value === 'profit') visible.sort((a, b) => b[3] - a[3]);
      host.querySelector('.workspace-list').innerHTML = rows(visible.map(([name, channel, price, profit, returned]) =>
        [name, channel + ' · ' + money(price) + (returned ? ' · Partial refund' : ''), money(profit)]));
      host.querySelector('[role="status"]').textContent = visible.length + ' of ' + sales.length + ' example sales · Profit after costs';
    }
    choose(host, value => { filter = value; draw(); });
    sort.addEventListener('change', draw);
    draw();
  });

  mount('stock', host => {
    const inventory = {
      listed: [
        ['Blue enamel casserole dish', 'Listed 6 days ago', '£22 asking'],
        ['Corduroy overshirt', 'Listed 9 days ago', '£18 asking'],
        ['Mario Party Superstars', 'Listed 12 days ago', '£23 asking'],
        ['Wooden railway starter set', 'Listed 15 days ago', '£24 asking'],
        ['Agatha Christie paperbacks', 'Listed 18 days ago', '£12 asking']
      ],
      unlisted: [
        ['Picture-book bundle', 'Needs listing', '24 days unlisted'],
        ['Vintage garden hand tools', 'Needs listing', '8 days unlisted'],
        ['Wool checked scarf', 'Needs listing', '1 day unlisted']
      ]
    };
    host.innerHTML = '<h3>Stock</h3><div class="workspace-controls" role="group" aria-label="Stock status">' +
      button('listed', 'Listed · 5', true) + button('unlisted', 'Unlisted · 3') +
      '</div><div aria-live="polite"><p class="workspace-foot"></p><ul class="workspace-list"></ul></div>';
    function draw(filter) {
      host.querySelector('.workspace-list').innerHTML = rows(inventory[filter]);
      host.querySelector('.workspace-foot').textContent = filter === 'listed'
        ? '£99 total asking value' : 'Oldest first · 24 days waiting to list';
    }
    choose(host, draw);
    draw('listed');
  });

  mount('item', host => {
    const costs = [['Stock cost', 800], ['Platform fees', 282], ['Postage', 210], ['Packaging', 25], ['Listing fee', 36]];
    const price = 1900;
    const profit = price - costs.reduce((total, [, amount]) => total + amount, 0);
    host.innerHTML = '<h3>Sale breakdown</h3><div class="workspace-kpis">' +
      kpis([['Sale price', money(price)], ['Profit after costs', money(profit)]]) +
      '</div><ul class="workspace-list">' + rows(costs.map(([name, amount]) => [name, '', '−' + money(amount)])) + '</ul>';
  });

  // Separate 2025–26 self-employment example. Expenses feed the short-form worksheet.
  const expenses = [
    ['Royal Mail postage', 'Postage', 24500],
    ['Mailers and tape', 'Packaging', 6500],
    ['Marketplace subscription', 'Subscriptions', 12000],
    ['Car-boot and wholesale purchases', 'Stock purchases', 168000]
  ];
  const expenseTotal = expenses.reduce((total, row) => total + row[2], 0);
  mount('expenses', host => {
    host.innerHTML = '<h3>Expenses</h3><p class="workspace-period">6 Apr 2025 to 5 Apr 2026</p>' +
      '<div class="workspace-controls" role="group" aria-label="Expense view">' +
      button('transactions', 'Transactions', true) + button('categories', 'By category') +
      '</div><ul class="workspace-list" aria-live="polite"></ul><p class="workspace-foot">Total expenses · ' +
      money(expenseTotal) + '</p>';
    function draw(view) {
      const entries = expenses.map(([name, category, amount]) =>
        view === 'transactions' ? [name, category, money(amount)] : [category, '', money(amount)]);
      host.querySelector('.workspace-list').innerHTML = rows(entries);
    }
    choose(host, draw);
    draw('transactions');
  });

  mount('tax', host => {
    const turnover = 415000;
    const boxes = [
      [9, 'Turnover', turnover],
      [20, 'Total allowable expenses', expenseTotal],
      [21, 'Net profit before adjustments', turnover - expenseTotal]
    ];
    host.innerHTML = '<h3>Tax return</h3><p class="workspace-period">2025–26 · SA103S short form · cash basis</p>' +
      '<ul class="workspace-list">' + boxes.map(([box, label, amount]) =>
        '<li class="workspace-row"><span><small>Box ' + box + '</small><b>' + label +
        '</b></span><strong>' + money(amount) + '</strong><button type="button" data-copy="' + box +
        '" aria-label="Copy box ' + box + '">Copy</button></li>').join('') +
      '</ul><p class="workspace-foot" role="status">Example figures for review.</p>';
    const status = host.querySelector('[role="status"]');
    host.querySelectorAll('[data-copy]').forEach(control => control.addEventListener('click', async () => {
      const [box, , amount] = boxes.find(row => row[0] === Number(control.dataset.copy));
      const value = (amount / 100).toFixed(2);
      try {
        await navigator.clipboard.writeText(value);
        status.textContent = 'Box ' + box + ' copied.';
      } catch {
        status.textContent = 'Box ' + box + ' · Select and copy ' + value;
      }
    }));
  });
})();
