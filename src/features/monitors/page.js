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
      lastControls = null,
      comparison = null,
      lastFeed = null,
      preview = false,
      timer = null,
      dialog = null;
    root.innerHTML =
      '<div class="monitor-page"><header class="monitor-header"><div><span class="monitor-eyebrow">SOURCING INTELLIGENCE · STAGING</span><h1>Monitors</h1><p>Your searches. New finds. One place.</p></div><button class="btn btn-primary" data-action="new">+ New monitor</button></header><div class="monitor-message" role="status" aria-live="polite"></div><section class="monitor-health skeleton" aria-label="Loading source status"><p>Checking source connection…</p></section><div class="monitor-layout"><aside><div class="monitor-section-title"><h2>Your monitors</h2><button class="btn" data-action="refresh">Refresh</button></div><div class="monitor-list"><div class="monitor-card skeleton" style="height:160px"></div><div class="monitor-card skeleton" style="height:120px"></div></div><section class="monitor-card monitor-phone"><h2>Alerts on this phone</h2><p>Receive new matches even when RETRADE is closed. Alerts are separate from buying recommendations.</p><p class="monitor-push-help">On iPhone: Safari → Share → Add to Home Screen. Open that shortcut, then enable notifications.</p><div class="monitor-actions"><button class="btn" data-action="push">Enable notifications</button><button class="btn" data-action="test">Send test</button><button class="btn" data-action="unpush">Disable this device</button></div><p class="monitor-device-state"></p></section></aside><section class="monitor-results"><div class="monitor-section-title"><h2>Listing feed</h2><button class="btn" data-action="preview">Preview example cards</button></div><p class="monitor-feed-note"></p><div class="monitor-feed" aria-live="polite"></div><section class="monitor-card monitor-comparison"><div class="monitor-section-title"><h2>Compare with Discord</h2><button class="btn" data-action="export" disabled>Export sample CSV</button></div><p>Record the Vinted link and the actual Discord message time. This does not read your Discord account.</p><form class="monitor-compare-form"><label>Vinted listing link or ID<input name="listingId" required maxlength="2048" placeholder="https://www.vinted.co.uk/items/…"></label><label>Discord message time (your local time)<input name="observedAt" type="datetime-local" step="1" required></label><button class="btn" type="submit">Record observation</button></form><div class="monitor-stats"></div><div class="monitor-comparison-rows"></div></section></section></div></div>';
    var $ = function (s) {
      return root.querySelector(s);
    };
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
      ++feedToken;
      lastFeed = null;
      comparison = null;
      $(".monitor-feed").innerHTML = '<p role="status">Loading this monitor…</p>';
      $(".monitor-feed-note").textContent = "";
      $(".monitor-stats").replaceChildren();
      $(".monitor-comparison-rows").replaceChildren();
      $('[data-action="export"]').disabled = true;
    }
    function select(id) {
      selected = id;
      preview = false;
      $('.monitor-results [data-action="preview"]').textContent = "Preview example cards";
      clearFeed();
    }
    function controls() {
      var signature = JSON.stringify([data, selected]);
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
          data.source.status === "ready"
            ? "Catalogue reachable"
            : data.source.status === "degraded"
              ? "Catalogue temporarily unavailable"
              : "Live source not connected",
        ) +
        "</strong><p>" +
        esc(data.source.message) +
        "</p><small>Checked " +
        esc(time(data.source.checkedAt)) +
        (data.source.retryAt && data.source.status !== "blocked" ? " · Next attempt " + esc(time(data.source.retryAt)) : "") +
        "</small></div>";
      health.dataset.state = data.source.status;
      $(".monitor-device-state").textContent = data.anonymous
        ? "Developer bypass: builder testing only. Sign in with a registered staging account for background scans and phone alerts."
        : data.devices +
          " subscribed device" + (data.devices === 1 ? "" : "s") +
          " across this account. Enable alerts on each monitor you want.";
      $(".monitor-list").innerHTML = data.monitors
        .map(function (m) {
          return (
            '<article class="monitor-card ' +
            (m.id === selected ? "is-selected" : "") +
            '"><button class="monitor-select" data-action="select" data-id="' +
            esc(m.id) +
            '"><span class="monitor-state">' +
            esc(
              m.archived
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
            '</small></button><div class="monitor-actions"><button class="btn" data-action="edit" data-id="' +
            esc(m.id) +
            '">Edit</button><button class="btn" data-action="toggle" data-id="' +
            esc(m.id) +
            '" ' +
            (data.anonymous || m.archived ? "disabled" : "") +
            ">" +
            (m.enabled ? "Pause" : "Resume") +
            '</button><button class="btn" data-action="duplicate" data-id="' +
            esc(m.id) +
            '">Duplicate</button><button class="btn" data-action="archive" data-id="' +
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
    async function refresh() {
      var token = ++refreshToken;
      var result = await api.request(data ? "status" : "bootstrap");
      if (!alive || token !== refreshToken) return;
      data = result;
      if (!selected || !current())
        select(data.monitors[0] && data.monitors[0].id);
      controls();
      await loadFeed();
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
      if (!rows.length) {
        $(".monitor-feed").innerHTML =
          '<div class="monitor-empty"><div class="monitor-radar" aria-hidden="true">◎</div><h3>No live listings yet</h3><p>' +
          (data.source.status === "blocked"
            ? "Your monitor is saved. Vinted source access must be connected before new matches can arrive."
            : "The first successful scan establishes a silent baseline. New matches after that can notify you.") +
          "</p></div>";
        return;
      }
      $(".monitor-feed").innerHTML = rows
        .map(function (row) {
          var l = row.listing,
            photos = (l.imageUrls || []).map(safePhoto).filter(Boolean).slice(0, 8),
            photo = photos[0],
            id = /^[1-9]\d{0,19}$/.test(l.id) ? l.id : null;
          return (
            '<article class="monitor-card monitor-listing" data-listing="' + esc(l.id) + '">' +
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
              : row.baseline
                ? "Initial baseline · no alert"
                : row.result.status === "pending"
                  ? "Needs listing details"
                  : "New match") +
            "</span><strong>" +
            money(l.itemPricePence) +
            "</strong></div><h3>" +
            esc(l.title || "Untitled listing") +
            "</h3><p>" +
            esc(l.description || "Description not supplied by the catalogue.") +
            '</p><p class="monitor-meta">' +
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
            '</p><p class="monitor-meta">Buyer fee and delivery: not verified</p>' +
            (photos.length > 1 ? '<details class="monitor-gallery"><summary>' + photos.length + ' listing photos</summary><div>' + photos.map(function (src) {
              return '<img loading="lazy" referrerpolicy="no-referrer" alt="Listing photo" src="' + esc(src) + '">';
            }).join('') + '</div></details>' : '') +
            (!isPreview && l.sourceUpdatedAt ? '<p class="monitor-meta">Updated on Vinted ' + esc(time(l.sourceUpdatedAt)) + '</p>' : '') +
            ((row.result.warnings || []).length
              ? '<p class="monitor-warning">Check: ' +
                esc(row.result.warnings.join(", ").replaceAll("_", " ")) +
                "</p>"
              : "") +
            '<div class="monitor-section-title"><small>' +
            (isPreview
              ? "Preview only"
              : (row.result.status === "match" ? "Confirmed " + esc(time(row.confirmed_at || row.observed_at)) : "First seen " + esc(time(row.observed_at)))) +
            "</small>" +
            (id && !isPreview
              ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.vinted.co.uk/items/' +
                id +
                '">View on Vinted ↗</a>'
              : "") +
            "</div></div></article>"
          );
        })
        .join("");
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
      $(".monitor-feed-note").textContent =
        current().name +
        " · latest 200 matches/candidates; pending details are not confirmed matches.";
      var signature = JSON.stringify([id, result]);
      if (signature !== lastFeed) {
        var focused = $(".monitor-feed").contains(document.activeElement)
          ? document.activeElement.href
          : null;
        var galleries = Array.from($(".monitor-feed").querySelectorAll('.monitor-gallery[open]')).map(function (el) { return el.closest('[data-listing]').dataset.listing; });
        cards(result.matches, false);
        Array.from($(".monitor-feed").querySelectorAll('.monitor-gallery')).forEach(function (el) {
          el.open = galleries.includes(el.closest('[data-listing]').dataset.listing);
        });
        stats(result);
        lastFeed = signature;
        if (focused) {
          var link = Array.from($(".monitor-feed").querySelectorAll("a")).find(
            function (a) {
              return a.href === focused;
            },
          );
          if (link) link.focus({ preventScroll: true });
        }
      }
    }
    function examples() {
      preview = !preview;
      lastFeed = null;
      ++feedToken;
      $(".monitor-feed-note").textContent = preview
        ? "EXAMPLES ONLY · fictional listings, never saved or notified."
        : "";
      $('.monitor-results [data-action="preview"]').textContent = preview
        ? "Back to live feed"
        : "Preview example cards";
      if (!preview) return loadFeed();
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
        '</h2><button type="button" class="btn" data-close aria-label="Close builder">Close</button></div><p>Match any model or phrase below. Search terms control which Vinted catalogue searches run.</p><label>Name<input name="name" maxlength="80" required value="' +
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
        '</textarea></label><p class="monitor-meta">All conditions stay visible. ' +
        (recipe.kind === "canon"
          ? "Known Canon model codes include their Rebel aliases. "
          : "") +
        'Detailed condition/seller filters will follow verified source access. Changing matching rules starts a new silent baseline.</p><label class="monitor-check"><input name="enabled" type="checkbox" ' +
        (m && m.enabled && !duplicate ? "checked" : "") +
        " " +
        (data.anonymous ? "disabled" : "") +
        '> Monitor enabled</label><label class="monitor-check"><input name="notifications" type="checkbox" ' +
        (m && m.notifications && !duplicate ? "checked" : "") +
        " " +
        (data.anonymous ? "disabled" : "") +
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
      if (action === "test") {
        if (!sub) throw new Error("Enable notifications first.");
        var result = await api.request("testPush", { endpoint: sub.endpoint });
        message(result.message);
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
        m = data && data.monitors.find(function (x) {
          return x.id === b.dataset.id;
        });
      b.disabled = true;
      try {
        if (action === "new") editor(null, false);
        if (action === "edit") editor(m, false);
        if (action === "duplicate") editor(m, true);
        if (action === "select") {
          select(m.id);
          controls();
          await loadFeed();
        }
        if (action === "preview") await examples();
        if (action === "export") exportComparison();
        if (action === "refresh") { await refresh(); message("Monitors refreshed."); }
        if (["push", "test", "unpush"].includes(action)) await push(action);
        if (action === "toggle" || action === "archive") {
          await api.request(
            "save",
            Object.assign({}, m, {
              enabled: action === "toggle" ? !m.enabled : false,
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
      }
    };
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
      ++feedToken;
      ++refreshToken;
      api.close();
      clearInterval(timer);
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
      if (alive && !document.hidden && !dialog && !preview)
        refresh().catch(function (e) {
          message(e.message, true);
        });
    }, 30000);
  }
  window.RETRADE_MONITORS = {
    mount: mount,
    unmount: function () {
      if (dispose) dispose();
    },
  };
})();
