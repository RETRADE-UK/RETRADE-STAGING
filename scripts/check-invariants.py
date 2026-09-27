"""Production invariants; run from repository root."""

from pathlib import Path
import re

failures=[]
for p in Path('.github/workflows').glob('*.y*ml'):
    if p.name == 'ci.yml':
        continue
    text=p.read_text(encoding='utf-8')
    if re.search(r'contents\s*:\s*write', text):
        failures.append(f'{p}: contents: write')
    if re.search(r'(^|\s)git\s+push(\s|$)', text):
        failures.append(f'{p}: git push')
if failures:
    raise SystemExit('Unsafe repository-writing workflow detected:\n'+'\n'.join(failures))
print('Workflow write-safety check passed')

from pathlib import Path
index=Path('index.html').read_text(encoding='utf-8')
for required in ('app.js','assets/styles/application.css'):
    assert required in index, f'{required} is not referenced by index.html'
print('Core file reference check passed')

from pathlib import Path
import re

index=Path('index.html').read_text(encoding='utf-8')
app=Path('app.js').read_text(encoding='utf-8')
sw=Path('sw.js').read_text(encoding='utf-8')
core=Path('src/core/application.js').read_text(encoding='utf-8')
launch=Path('src/platform/launch.js').read_text(encoding='utf-8')
perf=Path('src/platform/performance.js').read_text(encoding='utf-8')
partner=Path('src/features/partners/page-unified-v1503.js').read_text(encoding='utf-8')
partner_exp=Path('src/features/partners/account-experience-v2.js').read_text(encoding='utf-8')
chart=Path('src/features/charts/motion.js').read_text(encoding='utf-8')

assert 'assets/styles/loading.css' in index
manifest=Path('config/assets.js').read_text(encoding='utf-8')
app_build=re.search(r'"build": "([^"]+)"',manifest)
sw_build=app_build if 'const BUILD=ASSETS.build;' in sw and 'var v=assets.build;' in app else None
assert app_build and sw_build and app_build.group(1)==sw_build.group(1), 'app/SW build mismatch'
assert "src/features/sales/calendar-layout-v1530.js" in manifest

for name in (
    'main-page-loading-motion-v1506.js','main-page-truth-gate-v1507.js',
    'sales-loading-mask-v1508.js','sales-month-loading-v1509.js',
    'main-kpi-count-motion-v1510.js','skeleton-truth-exclusivity-v1511.js'
):
    assert f"'./{name}'" not in app, f'competing loader returned: {name}'

for name in (
    'gesture-back-v31.js','gesture-native-v3.js','gesture-native-v3-actions.js',
    'gesture-live-tracking.js','interaction-system-v2.js','chart-gesture-v2.js'
):
    assert f"'./{name}'" not in app, f'experimental gesture module shipped live: {name}'

for marker in ('rt-launch-brand','BRAND_TO_SKELETON_MS','retrade:motion-ready'):
    assert marker in launch, f'launch marker missing: {marker}'
for marker in ('function _prepareSalesEntry()','const _hydratedBootPage=','.rt-chart-primary-bar','__rtAuthHandoff'):
    assert marker in core, f'core marker missing: {marker}'
assert 'rt-sales-route-v1' not in perf and 'restoreSalesState()' not in perf
assert 'MONTHLY_VIEW=' not in perf, 'Presentation layer must not override Sales entry'
assert 'renderLoadingShell(a);' not in partner
assert 'installPaintFirstNavigation();' not in partner_exp
assert 'el.textContent=money(0' not in chart
print('Production loading/gesture invariants passed:',app_build.group(1))

from pathlib import Path

index=Path('index.html').read_text(encoding='utf-8')
launch=Path('src/platform/launch.js').read_text(encoding='utf-8')
core=Path('src/core/application.js').read_text(encoding='utf-8')

plate=index.find('<div id="rt-launch-brand"')
nav=index.find('<nav id="nav"')
supabase=index.find('@supabase/supabase-js')
app=index.find('<script src="./app.js')
head=index.find('</head>')

assert plate!=-1 and nav!=-1 and plate<nav, 'launch plate must precede visible app chrome'
assert 'rt-launch-first-frame-style' in index and 'rt-launch-sealed' in index, 'frame-zero seal/CSS missing'
assert 'rtLaunchShieldArc1540' in index and 'rtLaunchWordReveal1540' in index, 'branded shield/title motion missing'
assert supabase!=-1 and app!=-1 and supabase<app and supabase>head, 'Supabase must load at body end after launch plate parses'
assert "document.getElementById('rt-launch-brand')" in launch, 'launch coordinator is not adopting static plate'
lifecycle=Path('src/platform/lifecycle.js').read_text(encoding='utf-8')
assert 'armSnapshot()' in lifecycle and 'rt-launch-snapshot' in lifecycle, 'branded snapshot guard missing'
assert "!finishRequested&&b&&b.classList.contains('rt-real-layout-loading')" not in launch, 'finish request is suppressing skeleton handoff again'
assert 'BRAND_MIN_MS=2425' in launch and 'BRAND_TO_SKELETON_MS=2525' in launch and 'SKELETON_MIN_MS=360' in launch and 'skeletonRemaining' in launch, 'premium launch/skeleton timing missing'

start=core.find('function setSummaryPeriod(p)')
end=core.find('\n}',start)
block=core[start:end+2]
assert start!=-1
assert '_queueInteractionRender' not in block, 'Dashboard period filter regained the generic defer queue'
assert 'requestAnimationFrame' in block and 'setTimeout' not in block and 'renderSummary();' in block, 'Dashboard period filter should render on the next frame without an extra timer hop'

assert "_existingGrid.replaceWith(_nextGrid)" in core and "_existingHeader" in core, 'Dashboard period render must preserve header/filter DOM'
print('Frame-zero launch and Dashboard filter invariants passed')

from pathlib import Path

core=Path('src/core/application.js').read_text(encoding='utf-8')
names=(
    'setSummaryPeriod','setMonthlyPeriod','setMonthFilter','setMonthSort',
    'setStockSort','setStockFilter','setStockSourcedFilter','setStockStateFilter',
    'toggleStockGrouped','_scheduleCashflowResultsUpdate'
)
for name in names:
    start=core.find('function '+name+'(')
    assert start!=-1, f'{name} missing'
    nxt=core.find('\nfunction ',start+10)
    block=core[start:nxt if nxt!=-1 else start+2500]
    assert '_queueInteractionRender' not in block, f'{name} is artificially deferred again'
print('Local filter responsiveness invariants passed')

from pathlib import Path
index=Path('index.html').read_text(encoding='utf-8')
core=Path('src/core/application.js').read_text(encoding='utf-8')
sw=Path('sw.js').read_text(encoding='utf-8')

for name in (
    'assets/launch/launch-light-1170x2532.png','assets/launch/launch-dark-1170x2532.png',
    'assets/launch/launch-light-1179x2556.png','assets/launch/launch-dark-1179x2556.png',
    'assets/launch/launch-light-1206x2622.png','assets/launch/launch-dark-1206x2622.png',
    'assets/launch/launch-light-1284x2778.png','assets/launch/launch-dark-1284x2778.png',
    'assets/launch/launch-light-1290x2796.png','assets/launch/launch-dark-1290x2796.png',
    'assets/launch/launch-light-1320x2868.png','assets/launch/launch-dark-1320x2868.png'
):
    assert name in index
    assert name in manifest
    assert Path(name).exists()

start=core.find('function setMonthlyPeriod(v)')
end=core.find('\n}',start)
block=core[start:end+2]
assert start!=-1 and block.count('requestAnimationFrame')>=2
assert '_monthlyPeriodRenderToken' in core
assert "if(MONTHLY_VIEW==='grid')renderMonthlyGrid();" in block
print('iOS startup and Sales period responsiveness invariants passed')

from pathlib import Path
core=Path('src/core/application.js').read_text(encoding='utf-8')
assert 'function _queueLocalControlRender(key,fn)' in core
assert "_queueLocalControlRender('stock-filter'" in core
assert "_queueLocalControlRender('month-detail-filter'" in core
assert 'data-stock-state=' in core
assert 'data-stock-filter=' in core
assert 'data-stock-sourced-filter=' in core
assert 'data-month-filter=' in core
for fn in ('setStockSort','setStockFilter','setStockSourcedFilter','setStockStateFilter','setMonthFilter','setMonthSort'):
    start=core.find('function '+fn+'(')
    assert start!=-1, fn+' missing'
    end=core.find('\n}',start)
    block=core[start:end+2]
    assert 'renderStock();' not in block and 'renderMonth();' not in block, fn+' blocks input with synchronous full render'
print('Local Inventory and month-filter responsiveness invariants passed')
