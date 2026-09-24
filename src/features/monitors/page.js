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
      preview = false,
      timer = null,
      dialog = null;
    root.innerHTML =
      '<div class="monitor-page"><header class="monitor-header"><div><span class="monitor-eyebrow">SOURCING INTELLIGENCE · STAGING</span><h1>Monitors</h1><p>Your searches. New finds. One place.</p></div><button class="btn btn-primary" data-action="new">+ New monitor</button></header><div class="monitor-message" role="status" aria-live="polite"></div><section class="monitor-health skeleton" aria-label="Loading source status"><p>Checking source connection…</p></section><div class="monitor-layout"><aside><div class="monitor-section-title"><h2>Your monitors</h2><button class="btn" data-action="refresh">Refresh</button></div><div class="monitor-list"><div class="monitor-card skeleton" style="height:160px"></div><div class="monitor-card skeleton" style="height:120px"></div></div><section class="monitor-card monitor-phone"><h2>Alerts on this phone</h2><p>Receive new matches even when RETRADE is closed. Alerts are separate from buying recommendations.</p><p class="monitor-push-help">On iPhone: Safari → Share → Add to Home Screen. Open that shortcut, then enable notifications.</p><div class="monitor-actions"><button class="btn" data-action="push">Enable notifications</button><button class="btn" data-action="test">Send test</button><button class="btn" data-action="unpush">Disable this device</button></div><p class="monitor-device-state"></p></section></aside><section class="monitor-results"><div class="monitor-section-title"><h2>Listing feed</h2><button class="btn" data-action="preview">Preview example cards</button></div><p class="monitor-feed-note"></p><div class="monitor-feed" aria-live="polite"></div><section class="monitor-card monitor-comparison"><h2>Compare with Discord</h2><p>Record the Vinted link and the actual Discord message time. This does not read your Discord account.</p><form class="monitor-compare-form"><label>Vinted listing link or ID<input name="listingId" required maxlength="2048" placeholder="https://www.vinted.co.uk/items/…"></label><label>Discord message time (your local time)<input name="observedAt" type="datetime-local" step="1" required></label><button class="btn" type="submit">Record observation</button></form><div class="monitor-stats"></div><div class="monitor-comparison-rows"></div></section></section></div></div>';
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
    function controls() {
      var health = $(".monitor-health");
      health.classList.remove("skeleton");
      health.innerHTML =
        '<span class="monitor-dot"></span><div><strong>' +
        esc(
          data.source.status === "ready"
            ? "Catalogue reachable"
            : "Live source not connected",
        ) +
        "</strong><p>" +
        esc(data.source.message) +
        "</p><small>Checked " +
        esc(time(data.source.checkedAt)) +
        "</small></div>";
      $(".monitor-device-state").textContent = data.anonymous
        ? "Developer bypass: builder testing only. Sign in with a registered staging account for background scans and phone alerts."
        : data.devices +
          " subscribed device" +
          (data.devices === 1 ? "" : "s") +
          ". Enable alerts on each monitor you want.";
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
            (data.anonymous ? "disabled" : "") +
            ">" +
            (m.enabled ? "Pause" : "Resume") +
            '</button><button class="btn" data-action="duplicate" data-id="' +
            esc(m.id) +
            '">Duplicate</button><button class="btn" data-action="archive" data-id="' +
            esc(m.id) +
            '">' +
            (m.archived ? "Restore" : "Archive") +
            "</button></div></article>"
          );
        })
        .join("");
    }
    async function refresh() {
      var result = await api.request("bootstrap");
      if (!alive) return;
      data = result;
      if (!selected || !current())
        selected = data.monitors[0] && data.monitors[0].id;
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
            photo = (l.imageUrls || []).map(safePhoto).find(Boolean),
            id = /^[1-9]\d{0,19}$/.test(l.id) ? l.id : null;
          return (
            '<article class="monitor-card monitor-listing">' +
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
            ((row.result.warnings || []).length
              ? '<p class="monitor-warning">Check: ' +
                esc(row.result.warnings.join(", ").replaceAll("_", " ")) +
                "</p>"
              : "") +
            '<div class="monitor-section-title"><small>' +
            (isPreview
              ? "Preview only"
              : "Detected " + esc(time(row.observed_at))) +
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
        ? "Recent sample only; export/full-history comparison is not available yet. "
        : "";
      note +=
        result.baselineExclusions +
        " baseline observations excluded. " +
        (c.pairedIds
          ? "Median RETRADE − Discord: " +
            (c.medianDifferenceMs / 1000).toFixed(1) +
            "s; negative means RETRADE was earlier."
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
    async function loadFeed() {
      if (!selected || preview) return;
      var token = ++feedToken,
        id = selected;
      var result = await api.request("feed", { id: id });
      if (!alive || token !== feedToken || preview) return;
      $(".monitor-feed-note").textContent =
        current().name +
        " · latest 200 candidates; pending details are not confirmed matches.";
      cards(result.matches, false);
      stats(result);
    }
    function examples() {
      preview = !preview;
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
      dialog.querySelector("[data-close]").onclick = function () {
        dialog.close();
        dialog.remove();
        dialog = null;
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
        var next = Object.assign({}, recipe, {
          models: recipe.kind === "canon" ? models : [],
          customModels: recipe.kind === "canon" ? [] : models,
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
          selected = result.monitor.id;
          dialog.close();
          dialog.remove();
          dialog = null;
          await refresh();
          message(
            "Monitor saved" +
              (data.anonymous ? " paused in your test workspace." : "."),
          );
        } catch (e) {
          if (alive)
            form.querySelector(".monitor-form-error").textContent = e.message;
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
      var reg = await navigator.serviceWorker.ready,
        sub = await reg.pushManager.getSubscription();
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
      if (!b || !data) return;
      var action = b.dataset.action,
        m = data.monitors.find(function (x) {
          return x.id === b.dataset.id;
        });
      b.disabled = true;
      try {
        if (action === "new") editor(null, false);
        if (action === "edit") editor(m, false);
        if (action === "duplicate") editor(m, true);
        if (action === "select") {
          selected = m.id;
          preview = false;
          controls();
          await loadFeed();
        }
        if (action === "preview") await examples();
        if (action === "refresh") await refresh();
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
      api.close();
      clearInterval(timer);
      authSub.data.subscription.unsubscribe();
      root.onclick = null;
      if (dialog) {
        dialog.close();
        dialog.remove();
      }
      root.replaceChildren();
      dispose = null;
    };
    refresh().catch(function (e) {
      if (!alive) return;
      message(e.message, true);
      $(".monitor-health").classList.remove("skeleton");
      $(".monitor-health").textContent =
        "Could not load monitors. Leave this page and try again.";
    });
    timer = setInterval(function () {
      if (alive && !document.hidden && !dialog && !preview)
        loadFeed().catch(function (e) {
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
