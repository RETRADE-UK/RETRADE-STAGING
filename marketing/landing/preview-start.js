// Every frame starts with its own fresh copy of this synthetic workspace.
DB = previewSeed.db;
_sourcingRuns = previewSeed.runs;
_previewMode = true;
SUMMARY_PERIOD = '30d';
saveDB = function () {}; // Mutations already updated this document's in-memory DB.
_refreshCloudOnResume = async () => false;
const previewRoute = document.body.dataset.preview;
const previewRender = { summary: renderSummary, monthly: renderMonth, stock: renderStock, expenses: renderExpenses }[previewRoute];
const originalPreviewRange = _periodDateRange;
_periodDateRange = period => period === 'cy'
  ? { from: previewSeed.asOf.slice(0, 4) + '-01-01', to: previewSeed.asOf.slice(0, 10) }
  : originalPreviewRange(period);

function previewRouteHint() { toast('Explore this page here. Other pages have their own preview.'); }
goToTab = name => { if (name === previewRoute) previewRender(); else previewRouteHint(); };
openItemPage = (month, id) => { previewRender(); openItemDetail(month, id); };
openItemPageFromPanel = openRunPage = openRunPageFromRuns = previewRouteHint;
openActiveRunPage = openAccountPage = openJobLotPage = openSearchPage = previewRouteHint;
openDashboardStock = backToMonthlyGrid = previewRouteHint;
// A frame contains just its own page. Keep drill-down panels, forms, and
// filter menus local, including when reached by keyboard or chart gestures.
document.addEventListener('click', event => {
  if (event.target.closest('a[href]')) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
document.addEventListener('submit', event => event.preventDefault());
if (previewRoute === 'monthly') _prepareSalesEntry();
document.documentElement.dataset.theme = 'dark';
if (previewRoute === 'summary') {
  // Use the app's category results for both the ring and its keyboard-accessible
  // legend. Each period render creates new segments and new values.
  const drawDashboard = renderSummary;
  renderSummary = function () {
    drawDashboard();
    const legend = [...document.querySelectorAll('.cat-legend-row')];
    const arcs = [...document.querySelectorAll('.cat-donut-svg circle[stroke-dasharray]')];
    const panel = document.querySelector('.summary-categories');
    if (!panel || !legend.length) return;
    const detail = document.createElement('output');
    detail.className = 'preview-category-detail';
    panel.append(detail);
    legend.forEach((row, index) => {
      const category = (window.__summaryByCat || []).find(entry => entry.cat === row.dataset.cat);
      if (!category) return;
      const description = category.cat + ' · ' + fmt(category.totalRev) + ' revenue';
      const show = () => { detail.textContent = description; };
      const clear = () => { detail.textContent = ''; };
      const explore = () => showCategoryItems(category.cat);
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', description);
      row.addEventListener('focus', show);
      row.addEventListener('blur', clear);
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); explore(); }
      });
      const arc = arcs[(index + arcs.length - 1) % arcs.length];
      for (const target of [row, arc].filter(Boolean)) {
        target.addEventListener('pointerenter', show);
        target.addEventListener('pointerleave', clear);
        target.addEventListener('click', explore);
      }
    });
  };
  renderSummary();
} else previewRender();
