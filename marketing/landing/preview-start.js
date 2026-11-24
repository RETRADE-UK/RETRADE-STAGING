// Every frame starts with its own fresh copy of this synthetic workspace.
DB = previewSeed.db;
_sourcingRuns = previewSeed.runs;
_previewMode = true;
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
// The sample panel is fixed to the frame. Its controls can fall outside the
// outer viewport when only part of the example is on screen.
const previewPanel = document.getElementById('slide-panel');
let previewPanelOpen = false;
new MutationObserver(() => {
  const open = previewPanel.classList.contains('on');
  if (open && !previewPanelOpen) parent.postMessage('retrade-preview-panel-open', location.origin);
  previewPanelOpen = open;
}).observe(previewPanel, { attributes: true, attributeFilter: ['class'] });
if (previewRoute === 'monthly') _prepareSalesEntry();
document.documentElement.dataset.theme = 'dark';
if (previewRoute === 'summary') {
  const dashboard = document.getElementById('p-summary');
  // Run the signed-in app's reveal when this prepared Dashboard becomes visible.
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data !== 'retrade-preview-activate') return;
    if (!_kpiReducedMotion()) {
      _markLoadingRegions(dashboard);
      // The example is already painted. Use its real value/chart fades without
      // showing the list placeholders that mask a signed-in app's network load.
      dashboard.querySelectorAll('.rt-loading-list-overlay').forEach(overlay => overlay.remove());
      _clearLoadingRegions(dashboard);
    } else {
      dashboard.querySelectorAll('.rt-motion-hold').forEach(chart => chart.classList.remove('rt-motion-hold'));
    }
    _playDashboardBootReveal(dashboard);
  });

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
  _prepareDashboardBootReveal(dashboard);
} else if (window.__rtViewReady(previewRoute)) {
  previewRender();
} else {
  // A missing page script must not trigger the app loader's fallback URL.
  document.querySelector('.preview-loading').textContent = 'This example couldn’t load. Use Reset below to try again.';
}
// The parent reveals the frame only after the real workspace has replaced its shell.
if (!document.querySelector('.page.on .preview-loading')) {
  document.documentElement.setAttribute('data-preview-ready', '');
}
