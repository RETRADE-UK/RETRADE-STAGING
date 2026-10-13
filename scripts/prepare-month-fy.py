from pathlib import Path
import re

path=Path('src/core/application.js')
s=path.read_text()
def replace(old,new):
    global s
    assert s.count(old)==1,(old[:100],s.count(old))
    s=s.replace(old,new)
replace("let COST_CAT_FILTER='all';   // 'all' or a canonical EXPENSE_CATEGORY_DEFS label", """let COST_CAT_FILTER='all';   // 'all' or a canonical EXPENSE_CATEGORY_DEFS label
// Session-only disclosure choices, scoped to the account and filtered period.
// Search and selection temporarily reveal rows without overwriting these choices.
let _costMonthScope='';
let _costMonthExpanded=Object.create(null);""")
replace('function searchCosts(value){', '''function toggleCostMonth(month){
  if(!/^\\d{4}-\\d{2}$/.test(month))return;
  const section=document.querySelector('#cost-ledger [data-cost-month="'+month+'"]');
  const button=section&&section.querySelector('.cost-month-toggle');
  const rows=section&&section.querySelector('.cost-month-rows');
  if(!button||!rows)return;
  const expanded=button.getAttribute('aria-expanded')!=='true';
  _costMonthExpanded[month]=expanded;
  button.setAttribute('aria-expanded',String(expanded));
  rows.hidden=!expanded;
  // Keep the mounted list, focus and scroll context; a disclosure is not a render.
}
function searchCosts(value){''')
replace("  const sortedMonths=Object.keys(mMap).sort((a,b)=>b.localeCompare(a));", """  const sortedMonths=Object.keys(mMap).sort((a,b)=>b.localeCompare(a));
  const monthScope=JSON.stringify([_currentUserId,COST_PERIOD,COST_CAT_FILTER,_per.from,_per.to]);
  if(monthScope!==_costMonthScope){_costMonthScope=monthScope;_costMonthExpanded=Object.create(null);}
  // Single-month views need no disclosure. Never hide search results or rows
  // covered by Select all; restore browsing choices when those modes finish.
  const canCollapseMonths=sortedMonths.length>1&&!COST_SEARCH.trim()&&!COST_SELECTION_MODE;""")
replace('''    return `<div class="ledger-month">
      <div class="ledger-month-label">
        <span>${_fmtMK(mk)} <span class="lm-count">${rc} item${rc!==1?'s':''}</span></span>
        <span class="lm-total">${mTot>0?'−'+fmt(mTot):'—'}</span>
      </div>
      ${rows}
    </div>`;''', '''    const expanded=!canCollapseMonths||(_costMonthExpanded[mk]!==undefined?_costMonthExpanded[mk]:mk===sortedMonths[0]);
    const rowsId='cost-month-rows-'+mk;
    const heading=`<span class="cost-month-heading">${_fmtMK(mk)} <span class="lm-count">${rc} item${rc!==1?'s':''}</span></span>
        <span class="lm-total">${mTot>0?'−'+fmt(mTot):'—'}</span>`;
    const header=canCollapseMonths
      ?`<button type="button" class="ledger-month-label cost-month-toggle" aria-expanded="${expanded}" aria-controls="${rowsId}" onclick="toggleCostMonth('${mk}')">${heading}<span class="cost-month-chevron" aria-hidden="true">▾</span></button>`
      :`<div class="ledger-month-label">${heading}</div>`;
    return `<div class="ledger-month" data-cost-month="${mk}">
      ${header}
      <div id="${rowsId}" class="cost-month-rows"${expanded?'':' hidden'}>${rows}</div>
    </div>`;''')
replace('function renderMonthlyMoneyFlow(){', '''// Performance's FY header and breakdown share both the accounting result and
// the margin denominator. A mean of item margins is not business net margin.
function _performancePeriodSummary(from,to,label){
  const pnl=_buildPnLSummary(from,to,label);
  const grossRevenue=Number(pnl.revenue)||0;
  const customerRefunds=+(pnl.events||[]).filter(function(e){return e.isReturnAdjustment;})
    .reduce(function(sum,e){return sum+Math.max(0,-(Number(e.salePrice)||0));},0).toFixed(2);
  const netRevenue=+(grossRevenue-customerRefunds).toFixed(2);
  const netProfit=Number(pnl.netProfit)||0;
  return {pnl:pnl,grossRevenue:grossRevenue,customerRefunds:customerRefunds,
    netRevenue:netRevenue,netProfit:netProfit,netMargin:netRevenue!==0?netProfit/netRevenue*100:null};
}

function renderMonthlyMoneyFlow(){''')
replace('''  let p;
  try{ p=_buildPnLSummary(r.from,r.to,r.label); }
  catch(e){ host.innerHTML='<div class="mf-foot">Unable to build P&amp;L summary.</div>'; return; }

  const grossRevenue=Number(p.revenue)||0;
  const flowEvents=getSaleEventsInRange(r.from,r.to);
  const customerRefunds=+flowEvents.filter(function(e){return e.isReturnAdjustment;})
    .reduce(function(sum,e){return sum+Math.max(0,-(Number(e.salePrice)||0));},0).toFixed(2);
  const netRevenue=+(grossRevenue-customerRefunds).toFixed(2);''', '''  let summary;
  try{ summary=_performancePeriodSummary(r.from,r.to,r.label); }
  catch(e){ host.innerHTML='<div class="mf-foot">Unable to build P&amp;L summary.</div>'; return; }

  const p=summary.pnl;
  const grossRevenue=summary.grossRevenue;
  const customerRefunds=summary.customerRefunds;
  const netRevenue=summary.netRevenue;''')
replace('''  const net=Number(p.netProfit)||0;

  if(grossRevenue<=0){''', '''  const net=summary.netProfit;

  if(grossRevenue===0&&customerRefunds===0&&cogs===0&&otherSelling===0&&overheads===0&&net===0){''')
replace("  const pct=function(v){return Math.max(0,Math.min(100,(Math.abs(v)/grossRevenue)*100));};", "  const pct=function(v){return grossRevenue>0?Math.max(0,Math.min(100,(Math.abs(v)/grossRevenue)*100)):0;};")
replace('  const margin=netRevenue!==0?(net/netRevenue*100):null;', '  const margin=summary.netMargin;')
replace("+'. Bars are % of gross revenue · reconciles with your Tax Return.</div>';", "+(grossRevenue>0?'. Bars are % of gross revenue.':'. No gross sales in this period.')+'</div>';")
start=s.index('    let fyProfit=0,fySold=0,fyROISum=0,fyROICount=0,fyMarginSum=0,fyMarginCount=0;')
end=s.index('    const fyLabel=_getFYLabelHTML(fy);',start)
s=s[:start]+'''    const fyRange=_monthlyPeriodResolve('fy:'+fy);
    const fySummary=_performancePeriodSummary(fyRange.from,fyRange.to,fyRange.label);
    const fyProfit=fySummary.netProfit,fySold=fySummary.pnl.soldCount||0;
    const fyNetMargin=fySummary.netMargin;
'''+s[end:]
replace('''    const roiSpan=fyAvgMargin!==null?'<span style="color:var(--text-secondary)">'+fyAvgMargin.toFixed(1)+'% avg margin</span>':'';''', '''    const netMarginSpan=fyNetMargin!==null?'<span data-fy-net-margin style="color:var(--text-secondary)" title="Net profit divided by net revenue, after refunds and all costs">'+fyNetMargin.toFixed(1)+'% net margin</span>':'';''')
replace("      +(roiSpan?roiSpan.replace('<span ','<span class=\"fy-stat-hide\" '):'')", "      +(netMarginSpan?netMarginSpan.replace('<span ','<span class=\"fy-stat-hide\" '):'')")
replace('style="font-weight:700;color:'+"'+profitColor+'"+'">'+"'+fmt(fyProfit)+'"+'</span>', 'data-fy-net-profit title="Net profit after all costs" style="font-weight:700;color:'+"'+profitColor+'"+'">'+"'+fmt(fyProfit)+'"+'</span>')
replace('  const monthEvents=function(k){return _calendarEventsByMonth.get(k)||[];};\n','')
path.write_text(s)
css=Path('assets/styles/workspaces.css')
css.write_text(css.read_text()+'''\n/* Expense month disclosures: totals remain visible; search/selection reveal all. */
.rt #p-expenses .cost-month-heading{flex:1;min-width:0;text-align:left;}
.rt #p-expenses .cost-month-toggle{width:100%;min-height:44px;box-sizing:border-box;border:0;border-bottom:1px solid var(--border);border-radius:0;font-family:inherit;text-align:left;cursor:pointer;}
.rt #p-expenses .cost-month-toggle:hover{background:var(--surface3,var(--surface2));}
.rt #p-expenses .cost-month-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:-3px;}
.rt #p-expenses .cost-month-toggle[aria-expanded="false"]{border-bottom-color:transparent;}
.rt #p-expenses .cost-month-chevron{flex-shrink:0;color:var(--muted);font-size:14px;line-height:1;}
.rt #p-expenses .cost-month-toggle[aria-expanded="false"] .cost-month-chevron{transform:rotate(-90deg);}
.rt #p-expenses .cost-month-rows[hidden]{display:none!important;}
.rt #p-expenses .ledger-month-label .lm-total{flex-shrink:0;}
''')
manifest=Path('config/assets.js');text=manifest.read_text()
old=re.search(r'"build": "([^"]+)"',text)[1]
environment=re.search(r'"environment": "([^"]+)"',text)[1]
new='20261013-cost-months-net-margin'+('-staging' if environment=='staging' else '')
manifest.write_text(text.replace(old,new))
html=Path('index.html');html.write_text(html.read_text().replace(old,new))
p=Path('package.json');p.write_text(p.read_text().replace('"test": "node tests/dashboard-chart-browser.cjs','"test": "node tests/cost-months-performance-browser.cjs && node tests/dashboard-chart-browser.cjs'))
p=Path('docs/releases/cost-months-net-margin-2026-10-13.md');p.parent.mkdir(exist_ok=True)
p.write_text('''# Trips & Expenses month disclosures and FY reconciliation

The core `renderExpenses` owns month disclosures. Multiple visible months start
with the most recent matching month open; older groups keep their dates, counts
and totals visible. Single-month views have no toggle. Search and bulk selection
reveal all matching rows temporarily, then restore browsing choices. Choices are
session-only and reset on account/range/category changes. Native buttons expose
`aria-expanded` / `aria-controls` and update mounted rows without redrawing the page.
Styling remains in `assets/styles/workspaces.css`.

Performance FY headers and Profit Breakdown now share `_performancePeriodSummary`,
which reads the existing `_buildPnLSummary` result. Net margin is net profit divided
by revenue after dated customer refunds, not an average of item margins. FY ranges
remain the existing Performance April–March ranges; tax cash-basis calculations,
records, monthly item metrics, persistence and sync are unchanged. Expense-only
periods show the loss without a divide-by-zero percentage.

Validation: `npm run check`, `npm test`, `npm run build`. The new isolated browser
regression covers keyboard/touch-size disclosures, rerenders, searches, selection,
account/filter changes, two FYs, refunds, overheads, write-offs and zero revenue.
All browser fixtures use synthetic data and block external requests.
''')
