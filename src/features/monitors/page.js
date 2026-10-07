/* Native monitor page. Everything received from the service is untrusted text. */
(function () {
  "use strict";
  var dispose = null;
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  };
  var money = function (p) {
    return Number.isSafeInteger(p)
      ? "£" + (p / 100).toFixed(2)
      : "Price unknown";
  };
  var time = function (s) {
    return s ? new Date(s).toLocaleString("en-GB") : "Not yet";
  };
  function mount(ctx) {
    if (dispose) dispose();
    var root = ctx.root,
      api = RT_MONITOR_CLOUD.create(ctx.client, ctx.userId),
      alive = true,
      data = null,
      selected = null,
      feedToken = 0,
      refreshToken = 0,
      actionSerial = 0,
      lastControls = null,
      comparison = null,
      lastFeed = null,
      preview = false,
      historyRows = [], historyCursor = null, historyExpanded = false, historyFilter = "all", historyQuery = "", historyToken = 0,
      sampleObservedAt = null, sessionBusy = false, sessionSerial = 0, sessionRetryAt = null,
      timer = null, connectionTimer = null,
      dialog = null;
    root.innerHTML =
      '<div class="monitor-page"><header class="monitor-header"><div><span class="monitor-eyebrow">SOURCING INTELLIGENCE · STAGING</span><h1>Monitors</h1><p>Only matching items. Your tiers, your rules.</p></div><button class="btn btn-primary" data-action="new">+ New monitor</button></header><div class="monitor-message" role="status" aria-live="polite"></div><section class="monitor-health skeleton" aria-label="Loading source status"><p>Checking source connection…</p></section><div class="monitor-layout"><aside><div class="monitor-section-title"><h2>Your monitors</h2><button class="btn btn-secondary" data-action="refresh">Refresh</button></div><div class="monitor-list"><div class="monitor-card skeleton" style="height:160px"></div><div class="monitor-card skeleton" style="height:120px"></div></div><section class="monitor-card monitor-phone"><h2>Alerts on this phone</h2><p>Receive new matches even when RETRADE is closed. Alerts are separate from buying recommendations.</p><p class="monitor-push-help">On iPhone: Safari → Share → Add to Home Screen. Open that shortcut, then enable notifications.</p><div class="monitor-actions"><button class="btn btn-secondary" data-action="push">Enable notifications</button><button class="btn btn-secondary" data-action="test">Send test</button><button class="btn btn-secondary" data-action="unpush">Disable this device</button></div><p class="monitor-device-state"></p></section></aside><section class="monitor-results"><div class="monitor-section-title"><h2>Listing feed</h2><button class="btn btn-secondary" data-action="preview">Preview example cards</button></div><p class="monitor-feed-note"></p><div class="monitor-feed" aria-live="polite"></div><section class="monitor-card monitor-comparison"><div class="monitor-section-title"><h2>Compare with Discord</h2><button class="btn btn-secondary" data-action="export" disabled>Export sample CSV</button></div><p>Record the Vinted link and the actual Discord message time. This does not read your Discord account.</p><form class="monitor-compare-form"><label>Vinted listing link or ID<input name="listingId" required maxlength="2048" placeholder="https://www.vinted.co.uk/items/…"></label><label>Discord message time (your local time)<input name="observedAt" type="datetime-local" step="1" required></label><button class="btn btn-secondary" type="submit">Record observation</button></form><div class="monitor-stats"></div><div class="monitor-comparison-rows"></div></section></section></div></div>';
    var $ = function (s) {
      return root.querySelector(s);
    };
    // Finds lead in DOM and visual order at every width.
    var nav = document.createElement("div");
    nav.className = "monitor-navigation"; nav.setAttribute("role", "navigation"); nav.setAttribute("aria-label", "Monitor workspace");
    nav.innerHTML = '<button class="btn btn-secondary is-active" data-action="section" data-section="finds" aria-current="page">Finds</button><button class="btn btn-secondary" data-action="section" data-section="manage">Monitors</button><button class="btn btn-secondary" data-action="section" data-section="settings">Settings</button>';
    nav.appendChild($('[data-action="refresh"]')); $(".monitor-layout").before(nav);
    var manage = $(".monitor-layout aside"), finds = $(".monitor-results"), alerts = $(".monitor-phone");
    manage.dataset.panel = "manage"; finds.dataset.panel = "finds"; alerts.dataset.panel = "alerts";
    $(".monitor-layout").appendChild(alerts); $(".monitor-layout").prepend(finds);
    manage.hidden = true; alerts.hidden = true;
    var connection = document.createElement("section");
    connection.className = "monitor-connection"; connection.dataset.panel = "settings"; connection.hidden = true;
    connection.innerHTML = '<header class="monitor-settings-heading"><h2>Monitor settings</h2><p>Connect Vinted and choose where your alerts arrive.</p></header><p class="monitor-connection-availability" role="status"></p><div class="monitor-settings-grid"></div>';
    var settingsGrid = connection.querySelector('.monitor-settings-grid');

    var persistent = document.createElement("section");
    persistent.className = "monitor-card monitor-persistent";
    persistent.hidden = true;
    persistent.innerHTML = '<div class="monitor-section-title"><h2>Vinted connection</h2><span class="monitor-connection-badge">Not connected</span></div><p>United Kingdom · Automatic session renewal</p><ol class="monitor-setup-steps" aria-label="Connection progress"><li data-step="saved"><span>1</span>Save connection</li><li data-step="search"><span>2</span>Verify search</li><li data-step="running"><span>3</span>Start monitoring</li></ol><div class="monitor-connection-status" role="status"><strong class="monitor-persistent-state"></strong><p class="monitor-connection-next"></p></div><form class="monitor-persistent-form" autocomplete="off"><h3 class="monitor-form-title">Connect your Vinted account</h3><label>Refresh token<input name="refreshToken" type="password" required minlength="20" maxlength="8192" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your refresh_token_web value" aria-describedby="monitor-token-hint"></label><p id="monitor-token-hint" class="monitor-meta">Paste only the cookie value from your signed-in Vinted browser.</p><details class="monitor-setup-help"><summary>How to find your refresh token</summary><ol><li>In the desktop browser signed in to Vinted, open developer tools (F12).</li><li>Choose <strong>Application → Cookies → https://www.vinted.co.uk</strong>.</li><li>Find <code>refresh_token_web</code> and copy its <strong>Value</strong> into the field above.</li></ol></details><label>Vinted browser User-Agent<input name="userAgent" required minlength="10" maxlength="512" autocomplete="off" spellcheck="false" placeholder="Browser details for your Vinted session"></label><div class="monitor-browser-help"><button class="btn btn-secondary" type="button" data-connection="browser">Use this browser</button><p>Use this if Vinted is signed in in the same browser. Otherwise copy User-Agent from Vinted’s Network → Request Headers.</p></div><input name="country" type="hidden" value="GB"><p class="monitor-meta">Connecting stores your token encrypted and checks renewal and search access. Another tool sharing this Vinted session may be affected.</p><div class="monitor-form-actions"><button class="btn btn-primary" type="submit" aria-describedby="monitor-connection-wait">Connect Vinted</button><button class="btn btn-secondary" type="button" data-connection="cancel" hidden>Cancel</button></div></form><div class="monitor-actions monitor-connection-actions"><button class="btn btn-primary" type="button" data-connection="test" aria-describedby="monitor-connection-wait">Check connection</button><button class="btn btn-secondary" type="button" data-connection="update">Update connection</button><button class="btn btn-primary" type="button" data-connection="automatic">Start 12-hour trial</button></div><p id="monitor-connection-wait" class="monitor-connection-wait" hidden></p><p class="monitor-persistent-result" role="status" aria-live="polite"></p><details class="monitor-search-check"><summary>Check an individual search</summary><p>Use your saved connection to check one monitor’s search.</p><form class="monitor-session-form" autocomplete="off"><label>Monitor<select name="monitor" aria-label="Monitor to check"></select></label><label>Saved search<select name="searchText" aria-label="Saved search to check"></select></label></form><button class="btn btn-secondary" type="button" data-connection="sample">Check saved search</button><p class="monitor-session-result" role="status" aria-live="polite"></p><button class="btn btn-secondary" data-action="session-finds" hidden>View sample finds</button></details>';
    settingsGrid.appendChild(persistent);
    var disconnectOptions = document.createElement('details');
    disconnectOptions.className = 'monitor-disconnect';
    disconnectOptions.innerHTML = '<summary>Disconnect Vinted</summary><p>This stops automatic searches and deletes the saved connection. Your monitors and finds remain. To replace a token, use Update connection above.</p><button class="btn btn-destructive" type="button" data-connection="disconnect">Disconnect &amp; delete credentials</button>';
    persistent.appendChild(disconnectOptions);
    delete alerts.dataset.panel; alerts.hidden = false;
    settingsGrid.appendChild(alerts);
    var connectionBusy = false, editingConnection = false, connectionOperation = null;
    function clearConnectionInputs() {
      persistent.querySelector('input[name="refreshToken"]').value = "";
      persistent.querySelector('input[name="userAgent"]').value = "";
    }
    async function runConnection(op, credentials) {
      if (connectionBusy || sessionBusy || !data || data.anonymous || !data.capabilities.persistentConnection) return;
      ++refreshToken; // Ignore a status request started before this write.
      connectionBusy = true; connectionOperation = op; connectionControls();
      persistent.querySelector('.monitor-persistent-result').textContent = op === 'connectionDisconnect' ? 'Deleting saved credentials…' : 'Checking the saved connection and search access…';
      var payload = credentials ? {credentials:credentials,id:selected} : {id:selected};
      try {
        var result = await api.request(op, payload);
        if (!alive) return;
        data.connection = result.connection;
        sessionRetryAt = result.retryAt || null;
        editingConnection = false;
        persistent.querySelector('.monitor-persistent-result').textContent = result.message;
        await refresh();
      } catch(e) {
        if (alive) {
          sessionRetryAt = e.retryAt || sessionRetryAt;
          persistent.querySelector('.monitor-persistent-result').textContent = e.message;
        }
      } finally {
        payload.credentials = null; credentials = null; connectionBusy = false; connectionOperation = null;
        if (alive) connectionControls();
      }
    }
    persistent.querySelector('form').onsubmit = function(event) {
      event.preventDefault();
      var f = event.currentTarget;
      if (connectionBusy || sessionBusy || f.querySelector('button[type="submit"]').disabled) return;
      f.elements.refreshToken.value = f.elements.refreshToken.value.trim();
      f.elements.userAgent.value = f.elements.userAgent.value.trim();
      f.elements.refreshToken.setCustomValidity(/^[A-Za-z0-9._~-]{20,8192}$/.test(f.elements.refreshToken.value) ? '' : 'Paste only the refresh_token_web cookie value, without quotes or other cookies.');
      f.elements.userAgent.setCustomValidity(/^[\x20-\x7e]{10,512}$/.test(f.elements.userAgent.value) ? '' : 'Enter the User-Agent from your Vinted browser.');
      if (!f.reportValidity()) return;
      var credentials = {refreshToken:f.elements.refreshToken.value, userAgent:f.elements.userAgent.value, country:f.elements.country.value};
      clearConnectionInputs();
      void runConnection('connectionTest', credentials);
    };
    persistent.querySelector('.monitor-persistent-form').oninput = function(event) {
      if (event.target.setCustomValidity) event.target.setCustomValidity('');
      persistent.querySelector('.monitor-persistent-result').textContent = '';
    };
    persistent.querySelector('[data-connection="browser"]').onclick = function() {
      var field = persistent.querySelector('input[name="userAgent"]');
      field.value = navigator.userAgent; field.setCustomValidity('');
    };
    persistent.querySelector('[data-connection="update"]').onclick = function() {
      clearConnectionInputs(); editingConnection = true;
      persistent.querySelector('.monitor-persistent-result').textContent = '';
      connectionControls(); persistent.querySelector('input[name="refreshToken"]').focus();
    };
    persistent.querySelector('[data-connection="cancel"]').onclick = function() {
      clearConnectionInputs(); editingConnection = false; connectionControls();
      persistent.querySelector('[data-connection="update"]').focus();
    };
    connection.querySelector('[data-connection="sample"]').onclick = async function() {
      if (sessionBusy || connectionBusy || !current()) return;
      ++refreshToken;
      var serial = ++sessionSerial; sessionBusy = true; connectionControls();
      persistent.querySelector('.monitor-persistent-result').textContent = 'Checking the selected search…';
      try {
        var result = await api.request('savedSessionCheck', {id:selected,searchText:$('.monitor-session-form').elements.searchText.value});
        if (!alive || serial !== sessionSerial) return;
        sessionRetryAt = result.retryAt;
        if (result.connection) data.connection = result.connection;
        persistent.querySelector('.monitor-persistent-result').textContent = result.message + (result.status === 'sample_received' ? ' ' + result.saved + ' new sample finds saved.' : '');
        $('[data-action="session-finds"]').hidden = result.status !== 'sample_received';
        if (result.status === 'sample_received') await loadHistory(false);
      } catch(e) {if(alive && serial === sessionSerial) {sessionRetryAt=e.retryAt || null;persistent.querySelector('.monitor-persistent-result').textContent = e.message;}}
      finally {sessionBusy = false;if(alive) connectionControls();}
    };
    persistent.querySelector('[data-connection="automatic"]').onclick = async function() {
      if(connectionBusy || sessionBusy) return;
      ++refreshToken;
      connectionBusy=true;connectionOperation='automatic';connectionControls();
      try {
        var result=await api.request('connectionAutomatic',{enabled:!data.connection.automatic});
        if(!alive)return;
        data.connection=result.connection;message(result.message);await refresh();
      }catch(e){message(e.message,true);}
      finally{connectionBusy=false;connectionOperation=null;if(alive)connectionControls();}
    };
    persistent.querySelector('[data-connection="test"]').onclick = function() {void runConnection('connectionTest');};
    persistent.querySelector('[data-connection="disconnect"]').onclick = function() {clearConnectionInputs();void runConnection('connectionDisconnect');};
    $(".monitor-layout").appendChild(connection);
    alerts.querySelector("h2").textContent = "Alerts on this device";
    alerts.querySelector("h2").nextElementSibling.textContent = "Receive new confirmed matches even when RETRADE is closed. Tap an item alert to open that listing on Vinted.";
    $(".monitor-eyebrow").textContent = "VINTED UK · STAGING";
    var device = document.createElement("p"); device.className = "monitor-device-status"; device.setAttribute("role","status"); alerts.querySelector(".monitor-actions").before(device);
    $('[data-action="test"]').disabled = true;
    $('[data-action="unpush"]').disabled = true;
    var testAll=document.createElement("button");testAll.className="btn btn-secondary";testAll.dataset.action="test-all";testAll.textContent="Test all devices";alerts.querySelector('.monitor-actions').appendChild(testAll);
    var localTest=document.createElement("button");localTest.className="btn btn-secondary";localTest.dataset.action="test-local";localTest.textContent="Test this screen";alerts.querySelector('.monitor-actions').appendChild(localTest);
    var delivery=document.createElement("div");delivery.className="monitor-delivery";alerts.appendChild(delivery);
    var help=document.createElement("p");help.className="monitor-meta";help.textContent="If a device acknowledges the notification but no banner appears, check Notification Centre, Focus / Do Not Disturb, and notification permissions for RETRADE or your browser.";alerts.appendChild(help);
    var notificationChecks = document.createElement("details");
    notificationChecks.className = "monitor-notification-checks";
    notificationChecks.innerHTML = "<summary>Notification tests &amp; troubleshooting</summary>";
    ['test', 'test-all', 'test-local', 'unpush'].forEach(function(action) {
      notificationChecks.appendChild(alerts.querySelector('[data-action="' + action + '"]'));
    });
    notificationChecks.appendChild(delivery); notificationChecks.appendChild(help);
    alerts.appendChild(notificationChecks);
    var choices = document.createElement("div"); choices.className = "monitor-alert-list"; alerts.appendChild(choices);
    var toolbar = document.createElement("div"); toolbar.className = "monitor-feed-toolbar";
    toolbar.innerHTML = '<label>Monitor<select class="monitor-picker" aria-label="Choose monitor"></select></label><form class="monitor-search-form"><label>Search history<input name="query" type="search" maxlength="100" placeholder="Model, title or listing ID"></label><button class="btn btn-secondary" type="submit">Search</button></form><div class="monitor-filters" role="group" aria-label="Filter found items"><button class="btn btn-secondary is-active" data-action="filter" data-filter="all" aria-pressed="true">All matches</button><button class="btn btn-secondary" data-action="filter" data-filter="new" aria-pressed="false">Unread</button><button class="btn btn-secondary" data-action="filter" data-filter="saved" aria-pressed="false">Saved</button></div>';
    finds.prepend(toolbar);
    var searchToggle = document.createElement("button"); searchToggle.className = "btn btn-secondary monitor-search-toggle";
    searchToggle.dataset.action = "search-toggle"; searchToggle.textContent = "Search";
    searchToggle.setAttribute("aria-expanded","false"); searchToggle.setAttribute("aria-controls","monitor-history-search");
    $(".monitor-search-form").id = "monitor-history-search"; $(".monitor-filters").appendChild(searchToggle);
    var tools = document.createElement("details"); tools.className = "monitor-tools";
    tools.innerHTML = "<summary>Examples &amp; Discord comparison</summary><p>Testing tools only. These do not connect a listing source.</p>";
    tools.appendChild(finds.querySelector(".monitor-section-title")); tools.querySelector("h2").remove();
    tools.appendChild($(".monitor-comparison")); connection.appendChild(tools);
    var more = document.createElement("button"); more.className = "btn btn-secondary monitor-load-more"; more.dataset.action = "more"; more.textContent = "Load older finds"; more.hidden = true; finds.appendChild(more);
    function showSection(name) {
      if (name !== "settings") {clearConnectionInputs(); editingConnection = false;}
      root.querySelectorAll("[data-panel]").forEach(function(el) {el.hidden = el.dataset.panel !== name;});
      nav.querySelectorAll('[data-action="section"]').forEach(function(el) {
        el.classList.toggle("is-active", el.dataset.section === name);
        if(el.dataset.section === name) el.setAttribute("aria-current","page"); else el.removeAttribute("aria-current");
      });
      if (data) connectionControls();
    }
    function message(s, error) {
      if (alive) {
        $(".monitor-message").textContent = s;
        $(".monitor-message").classList.toggle("is-error", !!error);
      }
    }
    function current() {
      return (
        data &&
        data.monitors.find(function (m) {
          return m.id === selected;
        })
      );
    }
    function clearFeed() {
      ++feedToken; ++historyToken;
      historyRows = []; historyCursor = null; historyExpanded = false;
      lastFeed = null;
      comparison = null;
      $(".monitor-feed").innerHTML = '<p role="status">Loading this monitor…</p>';
      $(".monitor-feed-note").textContent = "";
      $(".monitor-stats").replaceChildren();
      $(".monitor-comparison-rows").replaceChildren();
      $('[data-action="export"]').disabled = true;
    }
    function select(id) {
      ++sessionSerial;
      $(".monitor-session-result").textContent = "";
      $('[data-action="session-finds"]').hidden = true;
      selected = id;
      preview = false;
      $('[data-action="preview"]').textContent = "Preview example cards";
      clearFeed();
    }
    function controls() {
      var signature = JSON.stringify([data, selected, sampleObservedAt]);
      if (signature === lastControls) return;
      lastControls = signature;
      var focus = document.activeElement;
      var focusAction = focus && focus.dataset && focus.dataset.action;
      var focusId = focus && focus.dataset && focus.dataset.id;
      var health = $(".monitor-health");
      health.classList.remove("skeleton");
      health.innerHTML =
        '<span class="monitor-dot"></span><div><strong>' +
        esc(
          data.source.intervalSeconds
            ? (data.source.status === "ready" ? "Automatic monitoring · every minute" : data.source.status === "starting" ? "Starting automatic searches…" : data.source.automatic ? "Automatic monitoring needs attention" : "Automatic searches paused")
            : data.source.status === "ready"
            ? "Catalogue reachable"
            : data.source.status === "degraded"
              ? "Catalogue temporarily unavailable"
              : sampleObservedAt ? "Connection test succeeded · background monitoring inactive" : "Live source not connected",
        ) +
        '</strong><details><summary>Details</summary><p>' +
        esc(sampleObservedAt && data.source.status === "blocked" && !data.source.intervalSeconds ? "Vinted returned a saved sample on " + time(sampleObservedAt) + ". This confirms that request worked; it does not establish a continuing connection. Background searches and listing alerts are not running." : data.source.message) +
        "</p><small>Checked " +
        esc(time(sampleObservedAt && data.source.status === "blocked" && !data.source.intervalSeconds ? sampleObservedAt : data.source.checkedAt)) +
        (data.source.retryAt && data.source.status !== "blocked" ? " · Next attempt " + esc(time(data.source.retryAt)) : "") +
        (data.source.trialEndsAt ? " · Trial ends " + esc(time(data.source.trialEndsAt)) : "") +
        "</small></details></div>";
      health.dataset.state = data.source.status;
      var setupAction = document.createElement('button');
      setupAction.className = 'btn btn-secondary'; setupAction.dataset.action = 'section'; setupAction.dataset.section = 'settings';
      setupAction.textContent = !data.connection || !data.connection.stored ? 'Set up Vinted' : data.connection.automatic ? 'Settings' : 'Review connection';
      health.appendChild(setupAction);
      connectionControls();
      $('.monitor-delivery').innerHTML = (data.pushDevices || []).map(function(d) {
        var text = d.displayedAt ? 'Device requested notification display · ' + time(d.displayedAt) : d.failedAt ? 'Device could not display the notification' : d.receivedAt ? 'Device received the push; display not confirmed' : d.state === 'sent' ? 'Push provider accepted · awaiting device acknowledgement' : d.state === 'failed' ? 'Delivery failed · reconnect this device' : d.state ? 'Delivery queued' : 'Registered · no test recorded';
        return '<p><strong>'+esc(d.provider)+'</strong><br>'+esc(text)+'</p>';
      }).join('');
      $(".monitor-device-state").textContent = data.anonymous
        ? "Developer bypass: builder testing only. Sign in with a registered staging account for background scans and phone alerts."
        : data.devices +
          " subscribed device" + (data.devices === 1 ? "" : "s") +
          " across this account. Enable alerts on each monitor you want.";
      $(".monitor-picker").innerHTML = data.monitors.map(function(m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === selected ? " selected" : "") + '>' + esc(m.name) + (m.archived ? " · Archived" : "") + '</option>';
      }).join("");
      $(".monitor-alert-list").innerHTML = '<h2>Alerts by monitor</h2><p>Only enabled monitors with alerts on can notify you. The first scan stays silent.</p>' + data.monitors.filter(function(m) {return !m.archived;}).map(function(m) {
        return '<div class="monitor-alert-row"><div><strong>' + esc(m.name) + '</strong><small>' + (!m.enabled ? "Paused · no alerts" : data.source.status === "blocked" ? "Waiting for source" : "Enabled") + '</small></div><button class="btn btn-secondary" data-action="alerts-toggle" data-id="' + esc(m.id) + '" aria-pressed="' + !!m.notifications + '" ' + (data.anonymous || m.recipe.setupRequired ? "disabled" : "") + '>' + (m.notifications ? "Alerts on" : "Alerts off") + '</button></div>';
      }).join("");
      $(".monitor-list").innerHTML = data.monitors
        .map(function (m) {
          return (
            '<article class="monitor-card ' +
            (m.id === selected ? "is-selected" : "") +
            '"><button class="monitor-select" data-action="select" data-id="' +
            esc(m.id) +
            '"><span class="monitor-state">' +
            esc(
              m.recipe.setupRequired
                ? "Needs original rules"
                : m.archived
                ? "Archived"
                : !m.enabled
                  ? "Paused"
                  : data.source.status === "blocked"
                    ? "Waiting for source"
                    : m.status,
            ) +
            "</span><strong>" +
            esc(m.name) +
            "</strong><span>" +
            esc(m.recipe.searchTerms.join(" / ")) +
            " · " +
            money(m.recipe.minPricePence) +
            "–" +
            (m.recipe.maxPricePence == null
              ? "No cap"
              : money(m.recipe.maxPricePence)) +
            "</span><small>Last scan: " +
            esc(time(m.last_success_at)) +
            " · Alerts " +
            (m.notifications ? "on" : "off") +
            '</small><span class="monitor-open-label">View finds →</span></button><div class="monitor-actions"><button class="btn btn-secondary" data-action="edit" data-id="' +
            esc(m.id) +
            '">Edit</button><button class="btn btn-secondary" data-action="toggle" data-id="' +
            esc(m.id) +
            '" ' +
            (data.anonymous || m.archived || m.recipe.setupRequired ? "disabled" : "") +
            ">" +
            (m.enabled ? "Pause" : "Resume") +
            '</button><button class="btn btn-secondary" data-action="duplicate" data-id="' +
            esc(m.id) +
            '">Duplicate</button><button class="btn btn-secondary" data-action="archive" data-id="' +
            esc(m.id) +
            '">' +
            (m.archived ? "Restore" : "Archive") +
            "</button></div>" +
            (m.message ? '<p class="monitor-meta">' + esc(m.message) + '</p>' : '') +
            '<div class="monitor-search-links">' + m.recipe.searchTerms.map(function (term) {
              var u = new URL("https://www.vinted.co.uk/catalog");
              u.searchParams.set("search_text", term);
              u.searchParams.set("price_from", (m.recipe.minPricePence / 100).toFixed(2));
              if (m.recipe.maxPricePence != null) u.searchParams.set("price_to", (m.recipe.maxPricePence / 100).toFixed(2));
              u.searchParams.set("currency", "GBP");
              u.searchParams.set("order", "newest_first");
              return '<a target="_blank" rel="noopener noreferrer" href="' + esc(u.href) + '">Search ' + esc(term) + ' on Vinted ↗</a>';
            }).join('') + '<small>Manual search; model rules still need checking.</small></div></article>'
          );
        })
        .join("");
      if (focusAction && focusId && !document.contains(focus)) {
        var replacement = Array.from(root.querySelectorAll('[data-action]')).find(function (b) {
          return b.dataset.action === focusAction && b.dataset.id === focusId;
        });
        if (replacement) replacement.focus({ preventScroll: true });
      }
    }
    // Clock-only updates never rebuild fields, move focus or make network requests.
    function connectionActions() {
      if (!data) return;
      var c = data.connection || {state:'disconnected',stored:false};
      var busy = connectionBusy || sessionBusy || c.state === 'testing';
      var retry = Math.max(Date.parse(c.retryAt) || 0, Date.parse(c.checkRetryAt) || 0, Date.parse(sessionRetryAt) || 0);
      var seconds = Math.max(0, Math.ceil((retry - Date.now()) / 1000));
      var canCheck = ['verified','rate_limited'].indexOf(c.state) >= 0;
      var monitor = current(), hasSearch = !!(monitor && !monitor.archived && monitor.recipe.searchTerms.length);
      var form = persistent.querySelector('.monitor-persistent-form');
      var submit = form.querySelector('button[type="submit"]');
      submit.textContent = connectionBusy && connectionOperation === 'connectionTest' ? 'Checking connection…' : c.stored ? 'Save new connection' : 'Connect Vinted';
      submit.disabled = busy || seconds > 0 || !hasSearch;
      var check = persistent.querySelector('[data-connection="test"]');
      check.textContent = connectionBusy && connectionOperation === 'connectionTest' ? 'Checking connection…' : 'Check connection';
      check.disabled = busy || seconds > 0 || !c.stored || !canCheck || !hasSearch;
      check.classList.toggle('btn-primary', c.canStart !== true && !c.automatic);
      check.classList.toggle('btn-secondary', c.canStart === true || !!c.automatic);
      persistent.querySelector('[data-connection="sample"]').disabled = busy || seconds > 0 || !canCheck || !hasSearch;
      ['update','cancel','browser','disconnect'].forEach(function(action) {
        persistent.querySelector('[data-connection="' + action + '"]').disabled = busy || (action === 'disconnect' && !c.stored);
      });
      form.querySelectorAll('input').forEach(function(input) {input.disabled = busy;});
      var autoButton = persistent.querySelector('[data-connection="automatic"]');
      autoButton.textContent = connectionOperation === 'automatic' ? 'Updating monitoring…' : c.automatic ? 'Pause automatic searches' : 'Start 12-hour trial';
      autoButton.disabled = busy || (!c.automatic && c.canStart !== true);
      autoButton.title = !c.automatic && c.canStart !== true ? 'A successful connection check is needed before monitoring can start.' : '';
      var wait = persistent.querySelector('.monitor-connection-wait');
      wait.hidden = !seconds || busy;
      wait.textContent = seconds ? 'Next connection check in ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + '. You can enter your details now; the button will enable automatically.' : '';
      if (!hasSearch && !busy) {
        wait.hidden = false;
        wait.textContent = 'Create a monitor in the Monitors tab before checking your connection.';
      }
    }
    function connectionControls() {
      var supported = !!(data.capabilities && data.capabilities.persistentConnection) && !data.anonymous;
      persistent.hidden = !supported;
      if (!supported) clearConnectionInputs();
      var c = data.connection || {state:'disconnected',stored:false};
      var editing = editingConnection || !c.stored || c.state === 'reconnect';
      var title, next, badge = 'Not connected', tone = 'waiting';
      if (connectionBusy || sessionBusy || c.state === 'testing') {
        title = connectionOperation === 'connectionDisconnect' ? 'Disconnecting Vinted…' : 'Checking your connection…';
        next = 'Please wait. Your connection status will update here.'; badge = 'Working';
      } else if (!c.stored) {
        title = 'Connect Vinted to get started';
        next = 'Add your refresh token and browser details below. We’ll check that Vinted searches work before monitoring starts.';
      } else if (c.state === 'reconnect') {
        title = 'Vinted needs a new connection'; badge = 'Reconnect'; tone = 'attention';
        next = 'Vinted rejected the saved session. Enter your current details below to reconnect.';
      } else if (['blocked','unavailable'].includes(c.state)) {
        title = 'Your connection needs review'; badge = 'Needs attention'; tone = 'attention';
        next = c.state === 'blocked' ? 'Vinted refused session renewal. Your saved details are retained; replacing the token may not resolve this.' : 'Renewal could not be confirmed safely. Your saved details are retained and automatic checks are paused.';
      } else if (['access_rejected','blocked','endpoint_unavailable','schema_changed'].includes(c.searchStatus)) {
        title = 'Connection saved · search access blocked'; badge = 'Needs attention'; tone = 'attention';
        next = c.searchStatus === 'access_rejected' ? 'Vinted renewed your session but rejected search access (401). Monitoring is paused. A new token has not been shown to fix this.' : 'Vinted search is unavailable through this connection. Monitoring stays paused until a search check succeeds.';
      } else if (c.automatic) {
        title = 'Monitoring is running'; badge = 'Connected'; tone = 'ready';
        next = 'Your enabled monitors check every minute. New matches appear in Finds.' + (c.trialEndsAt ? ' Trial ends ' + time(c.trialEndsAt) + '.' : '');
      } else if (c.canStart === true) {
        title = 'Ready to start monitoring'; badge = 'Connected'; tone = 'ready';
        next = 'Search access is verified. Start the 12-hour trial when you’re ready. The first scan creates a silent baseline.';
      } else {
        title = c.state === 'rate_limited' || c.searchStatus === 'rate_limited' ? 'Vinted asked us to wait' : 'Connection saved · check search access';
        badge = 'Saved';
        next = c.searchStatus === 'empty' ? 'The search returned no listings. Check the saved connection again before starting monitoring.' : 'Use Check connection to verify search access. Your saved token is used automatically.';
      }
      persistent.querySelector('.monitor-persistent-state').textContent = title;
      persistent.querySelector('.monitor-connection-next').textContent = next;
      persistent.querySelector('.monitor-connection-status').dataset.tone = tone;
      var badgeEl = persistent.querySelector('.monitor-connection-badge');
      badgeEl.textContent = badge; badgeEl.dataset.tone = tone;
      persistent.querySelectorAll('.monitor-setup-steps li').forEach(function(step) {
        var complete = step.dataset.step === 'saved' ? !!c.stored && c.state !== 'reconnect' : step.dataset.step === 'search' ? c.searchStatus === 'ready' : !!c.automatic;
        step.classList.toggle('is-complete', complete);
        step.querySelector('span').textContent = complete ? '✓' : step.dataset.step === 'saved' ? '1' : step.dataset.step === 'search' ? '2' : '3';
      });
      persistent.querySelector('.monitor-persistent-form').hidden = !editing;
      persistent.querySelector('.monitor-form-title').textContent = 'Update your connection';
      persistent.querySelector('.monitor-form-title').hidden = !c.stored;
      persistent.querySelector('[data-connection="cancel"]').hidden = !editingConnection;
      persistent.querySelector('.monitor-connection-actions').hidden = editing;
      persistent.querySelector('[data-connection="test"]').hidden = !c.stored;
      persistent.querySelector('[data-connection="update"]').hidden = !c.stored;
      persistent.querySelector('[data-connection="automatic"]').hidden = !c.stored || !(data.capabilities && data.capabilities.automaticMonitoring);
      disconnectOptions.hidden = !c.stored || editing;
      $('.monitor-search-check').hidden = !supported || !c.stored || editing;
      $('.monitor-connection-availability').textContent = !supported
        ? data.anonymous ? 'Sign in with a registered staging account to connect Vinted.' : 'Connection setup is not available yet. Your saved monitors and history remain available.' : '';
      connectionActions();
      var form = $('.monitor-session-form');
      form.hidden = !supported || !c.stored;
      form.elements.monitor.innerHTML = data.monitors.filter(function(m) {return !m.archived;}).map(function(m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('');
      var m = current(), oldSearch = form.elements.searchText.value;
      form.elements.searchText.innerHTML = m && !m.archived ? m.recipe.searchTerms.map(function(term) {
        return '<option value="' + esc(term) + '">' + esc(term) + '</option>';
      }).join('') : '';
      if (m && m.recipe.searchTerms.includes(oldSearch)) form.elements.searchText.value = oldSearch;
    }
    async function refresh() {
      var token = ++refreshToken;
      var result = await api.request(data ? "status" : "bootstrap");
      if (!alive || token !== refreshToken) return;
      data = result;
      if (!selected || !current() || current().archived) {
        var first = data.monitors.find(function(m) {return !m.archived && !m.recipe.setupRequired;}) || data.monitors.find(function(m) {return !m.archived;}) || data.monitors[0];
        select(first && first.id);
      }
      controls();
      connectionControls();
      if (!historyExpanded) await loadHistory(false);
      await deviceStatus();
      if ($(".monitor-tools").open) await loadFeed();
    }
    async function deviceStatus() {
      var sub = null, ready = false;
      var note = data.anonymous ? "Sign in with a registered staging account to enable push." : "Notifications are not enabled on this device.";
      try {
        if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
          var reg = await navigator.serviceWorker.getRegistration();
          sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
          if (sub && !data.anonymous) ready = (await api.request("device", {endpoint:sub.endpoint})).registered && Notification.permission === "granted";
          note = ready ? "This device is connected. Send a test to confirm receipt." : Notification.permission === "denied" ? "Permission blocked. Allow notifications in device or browser settings." : sub ? "Reconnect this device to this account." : note;
        } else note = "Web push is unavailable here. On iPhone, open the Home Screen app.";
      } catch(e) {note = "Could not verify this device. " + e.message;}
      if (!alive) return;
      $(".monitor-device-status").textContent = note;
      $('[data-action="test"]').disabled = !ready;
      $('[data-action="unpush"]').disabled = !sub;
      $('[data-action="push"]').textContent = ready ? "Reconnect device" : "Enable notifications";
      $('[data-action="push"]').disabled = !!data.anonymous;
    }
    async function loadHistory(more) {
      if (!selected || preview) return;
      var token = ++historyToken, id = selected;
      var result = await api.request("history", {id:id, filter:historyFilter, query:historyQuery, cursor:more ? historyCursor : null});
      if (!alive || token !== historyToken || id !== selected || preview) return;
      var matches = result.rows.filter(function(row) { return row.result && row.result.status === "match"; });
      historyRows = more ? historyRows.concat(matches) : matches;
      historyExpanded = !!more;
      historyCursor = result.nextCursor;
      historyRows.forEach(function(row) { if(row.listing.captureMode === "session_check" && (!sampleObservedAt || Date.parse(row.observed_at) > Date.parse(sampleObservedAt))) sampleObservedAt = row.observed_at; });
      controls();
      $(".monitor-feed-note").textContent = historyRows.length + (historyCursor ? "+" : "") + (historyRows.length === 1 && !historyCursor ? " match" : " matches") + " · current tier rules" + (historyQuery ? ' · Search: “' + historyQuery + '”' : ' · saved to your account');
      $('[data-action="more"]').hidden = !historyCursor;
      var signature = JSON.stringify([id,historyFilter,historyRows]);
      if (signature === lastFeed) return;
      var expanded = Array.from($(".monitor-feed").querySelectorAll(".monitor-listing details[open]")).map(function(el) {return el.closest("[data-listing]").dataset.listing + ":" + el.className;});
      var focus = document.activeElement, focusId = focus && focus.dataset.listing, focusAction = focus && focus.dataset.action;
      cards(historyRows,false); lastFeed = signature;
      $(".monitor-feed").querySelectorAll(".monitor-listing details").forEach(function(el) {el.open = expanded.includes(el.closest("[data-listing]").dataset.listing + ":" + el.className);});
      if (focusId) {
        var next = Array.from($(".monitor-feed").querySelectorAll("[data-action]")).find(function(el) {return el.dataset.listing === focusId && el.dataset.action === focusAction;});
        if(next) next.focus({preventScroll:true});
      }
    }
    function safePhoto(s) {
      try {
        var u = new URL(s);
        return u.protocol === "https:" &&
          !u.port &&
          !u.username &&
          !u.password &&
          (u.hostname === "vinted.net" || u.hostname.endsWith(".vinted.net"))
          ? u.href
          : null;
      } catch (e) {
        return null;
      }
    }
    function cards(rows, isPreview) {
      if (!isPreview) rows = rows.filter(function(row) { return row.result && row.result.status === "match"; });
      if (!rows.length) {
        $(".monitor-feed").innerHTML =
          '<div class="monitor-empty"><div class="monitor-radar" aria-hidden="true">◎</div><h3>No finds to show</h3><p>' +
          (historyQuery ? "No matches for this search. Try a different model, title or listing ID." :
            historyFilter === "saved" ? "Save listings to keep a shortlist here. This saves in RETRADE, not in your Vinted favourites." :
            historyFilter === "new" ? "You have no unread confirmed matches." :
            data.source.status === "blocked" ? "Your searches are saved, but the live listing source is not connected. No items have been invented or imported from Discord." :
            "Only listings passing the current tier rules appear here. Pausing preserves matching finds.") +
          "</p></div>";
        return;
      }
      var previousDay = {match:"",pending:""};
      var rendered = rows
        .map(function (row) {
          var l = row.listing,
            photos = (l.imageUrls || []).map(safePhoto).filter(Boolean).slice(0, 8),
            photo = photos[0],
            id = /^[1-9]\d{0,19}$/.test(l.id) ? l.id : null;
          var day = isPreview ? "Example layout" : new Date(row.observed_at).toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric"});
          var group = !isPreview && row.result.status === "pending" ? "pending" : "match";
          var heading = day !== previousDay[group] ? '<h2 class="monitor-day">' + esc(day) + '</h2>' : ""; previousDay[group] = day;
          var markup = (
            heading + '<article class="monitor-card monitor-listing" data-listing="' + esc(l.id) + '">' +
            (photo
              ? '<img loading="lazy" referrerpolicy="no-referrer" alt="" src="' +
                esc(photo) +
                '">'
              : '<div class="monitor-photo-empty" aria-hidden="true">' +
                (isPreview ? "EXAMPLE" : "NO PHOTO") +
                "</div>") +
            '<div><div class="monitor-section-title"><span class="monitor-state">' +
            (isPreview
              ? "Example · not a live listing"
              : l.captureMode === "session_check"
                ? (row.result.status === "pending" ? "Connection sample · needs details" : "Connection sample · no alert")
              : row.baseline
                ? "Initial baseline · no alert"
                : row.result.status === "pending"
                  ? "Needs listing details"
                  : row.read_at ? "Viewed" : "Unread match") +
            "</span><strong>" +
            money(l.itemPricePence) +
            "</strong></div><h3>" +
            esc(l.title || "Untitled listing") +
            '</h3><p class="monitor-meta">' +
            esc(l.brand || "Brand unknown") +
            " · " +
            esc(l.condition || "Condition unknown") +
            '</p><p class="monitor-meta">Seller ' +
            esc((l.seller && l.seller.username) || "unknown") +
            " · " +
            esc(
              l.seller && l.seller.rating != null
                ? l.seller.rating + "/5"
                : "Rating unknown",
            ) +
            " · " +
            esc(
              l.seller && l.seller.reviews != null
                ? l.seller.reviews + " reviews"
                : "Review count unknown",
            ) +
            '</p><details class="monitor-item-details"><summary>Description &amp; photos</summary><p>' +
            esc(l.description || "Description not supplied by the catalogue.") +
            '</p><p class="monitor-meta">Buyer fee and delivery: not verified. Check availability and the final total on Vinted.</p>' +
            (photos.length > 1 ? '<details class="monitor-gallery"><summary>' + photos.length + ' listing photos</summary><div>' + photos.map(function (src) {
              return '<img loading="lazy" referrerpolicy="no-referrer" alt="Listing photo" src="' + esc(src) + '">';
            }).join('') + '</div></details>' : '') +
            (!isPreview && l.sourceUpdatedAt ? '<p class="monitor-meta">Updated on Vinted ' + esc(time(l.sourceUpdatedAt)) + '</p>' : '') +
            "</details>" +
            ((row.result.warnings || []).length
              ? '<p class="monitor-warning">Check: ' +
                esc(row.result.warnings.join(", ").replaceAll("_", " ")) +
                "</p>"
              : "") +
            '<div class="monitor-item-actions"><small>' +
            (isPreview
              ? "Preview only"
              : (row.result.status === "match" ? "Confirmed " + esc(time(row.confirmed_at || row.observed_at)) : "First seen " + esc(time(row.observed_at)))) +
            "</small>" +
            (id && !isPreview
              ? '<a class="btn btn-primary" data-action="view-item" data-listing="' + id + '" target="_blank" rel="noopener noreferrer" href="https://www.vinted.co.uk/items/' +
                id +
                '">View on Vinted ↗</a><button class="btn btn-secondary" data-action="save-item" data-listing="' + id + '" aria-pressed="' + !!row.saved + '">' + (row.saved ? 'Saved' : 'Save') + '</button><button class="btn btn-secondary" data-action="read-item" data-listing="' + id + '">' + (row.read_at ? 'Mark unread' : 'Mark read') + '</button>'
              : "") +
            "</div></div></article>"
          );
          return markup;
        })
        .join("");
      $(".monitor-feed").innerHTML = rendered;
    }
    function stats(result) {
      var c = result.comparison;
      comparison = c;
      $('[data-action="export"]').disabled = !c.rows.length;
      $(".monitor-stats").innerHTML = [
        ["Discord IDs", c.observedDiscordIds],
        ["Seen by both", c.pairedIds],
        ["Discord only", c.discordOnly],
        ["RETRADE only", c.retradeOnly],
      ]
        .map(function (x) {
          return (
            "<div><strong>" + x[1] + "</strong><span>" + x[0] + "</span></div>"
          );
        })
        .join("");
      var note = result.truncated
        ? "Recent sample only; exported rows are not a full-history audit. "
        : "";
      if (result.baselineReady === false) note += "Initial baseline is not complete. These observations do not establish detection coverage. ";
      note +=
        result.baselineExclusions +
        " baseline observations excluded. " +
        (c.pairedIds
          ? "Median RETRADE − Discord: " +
            (c.medianDifferenceMs / 1000).toFixed(1) +
            "s; p95: " + (c.p95DifferenceMs / 1000).toFixed(1) +
            "s. Negative means RETRADE was earlier."
          : "No paired timings yet. Coverage and speed are unproven.");
      $(".monitor-comparison-rows").innerHTML =
        '<p class="monitor-meta">' +
        esc(note) +
        "</p>" +
        c.rows
          .slice(0, 15)
          .map(function (r) {
            return (
              '<div class="monitor-compare-row"><span>' +
              esc(r.listingId) +
              "</span><span>" +
              (!r.retradeAt
                ? "Discord only"
                : !r.discordAt
                  ? "RETRADE only"
                  : (r.differenceMs / 1000).toFixed(1) + "s") +
              "</span></div>"
            );
          })
          .join("");
    }
    function exportComparison() {
      if (!comparison || !comparison.rows.length) return;
      var rows = [["listing_id", "retrade_observed_at_utc", "discord_observed_at_utc", "retrade_minus_discord_ms"]];
      comparison.rows.forEach(function (r) { rows.push([r.listingId, r.retradeAt, r.discordAt, r.differenceMs]); });
      var csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replaceAll('"', '""') + '"'; }).join(','); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = 'retrade-monitor-comparison-sample.csv'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    async function loadFeed() {
      if (!selected || preview) return;
      var token = ++feedToken,
        id = selected;
      var result = await api.request("feed", { id: id });
      if (!alive || token !== feedToken || id !== selected || preview) return;
      stats(result);
    }
    function examples() {
      preview = !preview;
      lastFeed = null;
      ++feedToken; ++historyToken;
      $(".monitor-feed-note").textContent = preview
        ? "EXAMPLES ONLY · fictional listings, never saved or notified."
        : "";
      $('[data-action="preview"]').textContent = preview
        ? "Back to live feed"
        : "Preview example cards";
      if (!preview) return loadHistory(false);
      $('[data-action="more"]').hidden = true;
      cards(
        [
          {
            listing: {
              id: "1",
              title: "Canon EOS 600D with kit lens",
              itemPricePence: 8500,
              brand: "Canon",
              condition: "good",
              seller: { username: "Example seller", reviews: 28, rating: 4.8 },
            },
            result: { warnings: [] },
          },
          {
            listing: {
              id: "2",
              title: "Canon Rebel T3 · untested",
              itemPricePence: 6500,
              brand: "Canon",
              seller: { reviews: 0 },
            },
            result: { warnings: ["untested", "zero reviews"] },
          },
        ],
        true,
      );
    }
    function editor(m, duplicate) {
      if (dialog) dialog.remove();
      dialog = document.createElement("dialog");
      dialog.className = "monitor-dialog";
      var editing = m && !duplicate,
        recipe = m
          ? m.recipe
          : {
              kind: "custom",
              models: [],
              customModels: [],
              searchTerms: [],
              minPricePence: 0,
              maxPricePence: 10000,
              warningTerms: [],
            };
      dialog.innerHTML =
        '<form class="monitor-editor"><div class="monitor-section-title"><h2>' +
        (editing ? "Edit monitor" : "New monitor") +
        '</h2><button type="button" class="btn btn-secondary" data-close aria-label="Close builder">Close</button></div><p>Match any model or phrase below. Search terms control which Vinted catalogue searches run.</p><label>Name<input name="name" maxlength="80" required value="' +
        esc(m ? (duplicate ? m.name + " copy" : m.name) : "") +
        '"></label><label>Search terms (comma separated, up to 3)<input name="terms" required value="' +
        esc(recipe.searchTerms.join(", ")) +
        '" placeholder="Canon, EOS, Rebel"></label><label>Model names / matching phrases (comma separated)<textarea name="models" required rows="3" placeholder="600D, Rebel T3, EOS 1100D">' +
        esc(recipe.models.concat(recipe.customModels).join(", ")) +
        '</textarea></label><div class="monitor-price-fields"><label>Minimum £<input name="min" type="number" min="0" max="1000000" step="0.01" required value="' +
        recipe.minPricePence / 100 +
        '"></label><label>Maximum £ (blank = no cap)<input name="max" type="number" min="0" max="1000000" step="0.01" value="' +
        (recipe.maxPricePence == null ? "" : recipe.maxPricePence / 100) +
        '"></label></div><label>Flag these words for review (comma separated)<textarea name="warnings" rows="2" placeholder="faulty, untested, spares">' +
        esc(recipe.warningTerms.join(", ")) +
        '</textarea></label><p class="monitor-meta">' +
        (recipe.setupRequired ? 'Recovered name only: original model, price and bundle rules are still needed. This draft cannot scan or send alerts. ' : '') +
        (recipe.conditions && recipe.conditions.length ? 'Required reported condition: ' + esc(recipe.conditions.join(', ')) + '. Missing condition is excluded. ' : 'No reported-condition filter. ') +
        (recipe.titleRejectTerms && recipe.titleRejectTerms.length ? 'Title exclusions: ' + esc(recipe.titleRejectTerms.join(', ')) + '. ' : '') +
        (recipe.bundleMode === 'require' ? 'Bundle requires 18–55mm plus a named 55–250mm, 75–300mm, 70–300mm or 50mm lens in the title. ' : recipe.bundleMode === 'exclude' ? 'Named two-lens bundles go to the Bundles tier to avoid duplicate alerts. ' : '') +
        (recipe.kitAllowancePence ? 'Named 18–55mm kits allow ' + money(recipe.kitAllowancePence) + ' above the body cap, within the tier limit. ' : '') +
        (recipe.modelMaxPricePence && Object.keys(recipe.modelMaxPricePence).length ? 'Model caps: ' + Object.keys(recipe.modelMaxPricePence).map(function(k){return esc(k) + ' ' + money(recipe.modelMaxPricePence[k]);}).join(', ') + '. ' : '') +
        (recipe.kind === "canon"
          ? "Known Canon model codes include their Rebel aliases. "
          : "") +
        'Seller claims and faults hidden in descriptions are not verified by a catalogue match. Changing matching rules starts a new silent baseline.</p><label class="monitor-check"><input name="enabled" type="checkbox" ' +
        (m && m.enabled && !duplicate ? "checked" : "") +
        " " +
        (data.anonymous || recipe.setupRequired ? "disabled" : "") +
        '> Monitor enabled</label><label class="monitor-check"><input name="notifications" type="checkbox" ' +
        (m && m.notifications && !duplicate ? "checked" : "") +
        " " +
        (data.anonymous || recipe.setupRequired ? "disabled" : "") +
        '> Push every new confirmed match to my subscribed devices</label><p class="monitor-form-error" role="alert"></p><button class="btn btn-primary" type="submit">Save monitor</button></form>';
      root.appendChild(dialog);
      dialog.addEventListener("close", function () {
        this.remove();
        if (dialog === this) dialog = null;
      });
      dialog.showModal();
      var ownDialog = dialog;
      dialog.querySelector("[data-close]").onclick = function () {
        ownDialog.close();
      };
      dialog.querySelector("form").onsubmit = async function (event) {
        event.preventDefault();
        var form = event.currentTarget,
          fd = new FormData(form),
          button = form.querySelector('[type="submit"]');
        button.disabled = true;
        function terms(k) {
          return String(fd.get(k) || "")
            .split(",")
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean);
        }
        var models = terms("models");
        var canonModels = data.canonModels || recipe.models;
        function canonCode(name) {
          return canonModels.find(function (code) { return code.toLowerCase() === name.toLowerCase(); });
        }
        var next = Object.assign({}, recipe, {
          models: recipe.kind === "canon" ? models.map(canonCode).filter(Boolean) : [],
          customModels: recipe.kind === "canon" ? models.filter(function (name) { return !canonCode(name); }) : models,
          searchTerms: terms("terms"),
          minPricePence: Math.round(Number(fd.get("min")) * 100),
          maxPricePence:
            fd.get("max") === ""
              ? null
              : Math.round(Number(fd.get("max")) * 100),
          warningTerms: terms("warnings"),
        });
        if (next.modelMaxPricePence) next.modelMaxPricePence = Object.fromEntries(Object.entries(next.modelMaxPricePence).filter(function(pair){return next.models.includes(pair[0]);}));
        try {
          var result = await api.request("save", {
            id: editing ? m.id : null,
            revision: editing ? m.revision : null,
            name: fd.get("name"),
            recipe: next,
            enabled: fd.get("enabled") === "on",
            notifications: fd.get("notifications") === "on",
            archived: editing ? m.archived : false,
          });
          if (!alive) return;
          select(result.monitor.id);
          if (ownDialog.open) ownDialog.close();
          ownDialog.remove();
          if (dialog === ownDialog) dialog = null;
          await refresh();
          message(
            "Monitor saved" +
              (data.anonymous ? " paused in your test workspace." : "."),
          );
        } catch (e) {
          if (alive && ownDialog.isConnected)
            form.querySelector(".monitor-form-error").textContent = e.message;
          else message(e.message, true);
        } finally {
          button.disabled = false;
        }
      };
    }
    async function push(action) {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(
          "Push is unavailable here. On iPhone, add staging to your Home Screen and open it there.",
        );
      if (data.anonymous)
        throw new Error(
          "Sign in with a registered staging account to enable phone alerts.",
        );
      var permission =
        action === "push"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (action === "push" && permission !== "granted")
        throw new Error(
          "Notifications were not allowed. Change this site’s notification permission in your browser settings.",
        );
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.active || !reg.pushManager)
        throw new Error(
          "Notification setup is not ready. Refresh the page, then try again.",
        );
      var sub = await reg.pushManager.getSubscription();
      if (action === "unpush") {
        if (sub) {
          await api.request("unsubscribe", { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        message("Notifications disabled on this device.");
        return refresh();
      }
      if (action === "test-local") {
        if(permission!=='granted')throw new Error('Enable notifications on this device first.');
        await reg.showNotification('RETRADE · Screen test',{body:'Your device accepted a local notification.',tag:'monitor-local-'+Date.now(),icon:'assets/icons/app-180.png'});
        message('Your device accepted the display request. Check Notification Centre if no banner appeared.');return;
      }
      if (action === "test" || action === "test-all") {
        if (!sub && action !== "test-all") throw new Error("Enable notifications first.");
        var result = await api.request("testPush", { endpoint: sub && sub.endpoint, all: action === "test-all" });
        message(result.message);
        await refresh();
        return;
      }

      if (!sub) {
        var key = data.pushKey.replace(/-/g, "+").replace(/_/g, "/");
        var bytes = Uint8Array.from(atob(key), function (c) {
          return c.charCodeAt(0);
        });
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
      }
      await api.request("subscribe", { subscription: sub.toJSON() });
      message(
        "This device is subscribed. Enable alerts on the monitors you want, then send a test.",
      );
      await refresh();
    }
    root.onclick = async function (event) {
      var b = event.target.closest("[data-action]");
      if (!b) return;
      if (!data && b.dataset.action !== "refresh") return;
      var action = b.dataset.action,
        actionNumber = ++actionSerial,
        m = data && data.monitors.find(function (x) {
          return x.id === b.dataset.id;
        });
      b.disabled = true;
      try {
        if (action === "new") editor(null, false);
        if (action === "edit") editor(m, false);
        if (action === "duplicate") editor(m, true);
        if (action === "select") { select(m.id); controls(); showSection("finds"); await loadHistory(false); }
        if (action === "section") showSection(b.dataset.section);
        if (action === "session-finds") {
          historyFilter = "all"; historyQuery = ""; preview = false;
          $('[data-action="preview"]').textContent = "Preview example cards";
          $(".monitor-search-form").elements.query.value = "";
          root.querySelectorAll('[data-action="filter"]').forEach(function(el) {
            el.classList.toggle("is-active",el.dataset.filter === "all"); el.setAttribute("aria-pressed",String(el.dataset.filter === "all"));
          });
          clearFeed(); showSection("finds"); await loadHistory(false);
        }
        if (action === "search-toggle") {
          var isOpen = $(".monitor-search-form").classList.toggle("is-open");
          b.setAttribute("aria-expanded",String(isOpen));
          if (isOpen) $(".monitor-search-form input").focus();
        }
        if (action === "filter") {
          historyFilter = b.dataset.filter; preview = false; clearFeed();
          $('[data-action="preview"]').textContent = "Preview example cards";
          root.querySelectorAll('[data-action="filter"]').forEach(function(el) {el.classList.toggle("is-active",el === b); el.setAttribute("aria-pressed",String(el === b));});
          await loadHistory(false);
        }
        if (action === "more") await loadHistory(true);
        if (["save-item","read-item","view-item"].includes(action)) {
          var item = historyRows.find(function(row) {return row.listing.id === b.dataset.listing;});
          if (item) {
            await api.request("itemState", {id:selected,listingId:item.listing.id,
              saved:action === "save-item" ? !item.saved : undefined,
              read:action === "save-item" ? undefined : action === "view-item" ? true : !item.read_at});
            await loadHistory(false);
            if (actionNumber === actionSerial) message(action === "save-item" ? (item.saved ? "Removed from your RETRADE saved list." : "Saved in RETRADE. Vinted favourites are unchanged.") : "Read status updated.");
          }
        }
        if (action === "preview") { showSection("finds"); await examples(); }
        if (action === "export") exportComparison();
        if (action === "refresh") { message(""); historyCursor = null; historyExpanded = false; await refresh(); if(actionNumber === actionSerial) message("Monitors refreshed."); }
        if (["push", "test", "test-all", "test-local", "unpush"].includes(action)) await push(action);
        if (action === "toggle" || action === "archive" || action === "alerts-toggle") {
          await api.request(
            "save",
            Object.assign({}, m, {
              enabled: action === "toggle" ? !m.enabled : action === "archive" ? false : m.enabled,
              notifications: action === "alerts-toggle" ? !m.notifications : m.notifications,
              archived: action === "archive" ? !m.archived : m.archived,
            }),
          );
          await refresh();
          message("Monitor updated.");
        }
      } catch (e) {
        message(e.message, true);
      } finally {
        b.disabled = false;
        if (["push","test","unpush"].includes(action)) await deviceStatus();
      }
    };
    $(".monitor-session-form").elements.monitor.onchange = async function(event) {
      select(event.target.value); controls();
      try {await loadHistory(false);} catch(e) {message(e.message,true);}
    };
    $(".monitor-session-form").onsubmit = function(event) { event.preventDefault(); };
    $(".monitor-picker").onchange = async function(event) {
      select(event.target.value); controls();
      try {await loadHistory(false);} catch(e) {message(e.message,true);}
    };
    $(".monitor-search-form").onsubmit = async function(event) {
      event.preventDefault(); historyQuery = this.elements.query.value.trim(); preview = false; clearFeed();
      $('[data-action="preview"]').textContent = "Preview example cards";
      try {await loadHistory(false);} catch(e) {message(e.message,true);}
    };
    $(".monitor-tools").ontoggle = function() {if (this.open && data) loadFeed().catch(function(e) {message(e.message,true);});};
    $(".monitor-compare-form").onsubmit = async function (event) {
      event.preventDefault();
      var form = event.currentTarget,
        button = form.querySelector("button"),
        fd = new FormData(form);
      button.disabled = true;
      try {
        if (!selected) throw new Error("Choose a monitor first.");
        await api.request("compare", {
          id: selected,
          listingId: fd.get("listingId"),
          observedAt: new Date(fd.get("observedAt")).toISOString(),
        });
        await loadFeed();
        message("Discord observation saved.");
        form.reset();
      } catch (e) {
        message(e.message, true);
      } finally {
        button.disabled = false;
      }
    };
    var authSub = ctx.client.auth.onAuthStateChange(function (event, session) {
      if (
        event === "SIGNED_OUT" ||
        (session && session.user.id !== ctx.userId)
      ) {
        if (dispose) dispose();
        root.replaceChildren();
      }
    });
    dispose = function () {
      alive = false;
      clearConnectionInputs();
      ++feedToken;
      ++refreshToken; ++historyToken;
      api.close();
      clearInterval(timer);
      clearInterval(connectionTimer);
      authSub.data.subscription.unsubscribe();
      root.onclick = null;
      if (dialog) {
        var closing = dialog;
        dialog = null;
        closing.close();
        closing.remove();
      }
      root.replaceChildren();
      dispose = null;
    };
    refresh().catch(function (e) {
      if (!alive) return;
      message(e.message, true);
      $(".monitor-health").classList.remove("skeleton");
      $(".monitor-health").textContent =
        "Could not load monitors. Use Refresh to try again.";
    });
    timer = setInterval(function () {
      if (alive && !document.hidden && !dialog && !preview && !connectionBusy && !sessionBusy)
        refresh().catch(function (e) {
          message(e.message, true);
        });
    }, 30000);
    connectionTimer = setInterval(function() {
      if (alive && !document.hidden && !connection.hidden) connectionActions();
    }, 1000);
  }
  window.RETRADE_MONITORS = {
    mount: mount,
    unmount: function () {
      if (dispose) dispose();
    },
  };
})();
