/* Account-scoped monitor API. No fallback writes or persistent local feed cache. */
(function () {
  "use strict";
  window.RT_MONITOR_CLOUD = {
    create: function (client, userId) {
      var alive = true,
        controllers = new Set();
      return {
        close: function () {
          alive = false;
          controllers.forEach(function (c) {
            c.abort();
          });
          controllers.clear();
        },
        request: async function (op, data) {
          var auth = await client.auth.getSession(),
            session = auth.data && auth.data.session;
          if (!alive) throw new Error("View closed");
          if (!session || session.user.id !== userId)
            throw new Error("Sign in again to use monitors");
          var controller = new AbortController();
          controllers.add(controller);
          var timeout = setTimeout(function () {
            controller.abort();
          }, 25000);
          try {
            var response = await fetch(
              "https://dvnrxmdejxfuazmpnudj.supabase.co/functions/v1/monitor-service",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + session.access_token,
                },
                body: JSON.stringify(Object.assign({}, data, { op: op })),
                signal: controller.signal,
              },
            );
            var result = await response.json();
            if (!alive) throw new Error("View closed");
            if (!response.ok)
              throw new Error(result.error || "Monitor service is unavailable");
            return result;
          } catch (error) {
            if (error.name === "AbortError")
              throw new Error("Connection timed out. Try again.");
            throw error;
          } finally {
            clearTimeout(timeout);
            controllers.delete(controller);
          }
        },
      };
    },
  };
})();
