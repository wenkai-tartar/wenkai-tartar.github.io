(() => {
  const script = document.currentScript;
  if (!script || window.location.origin !== script.dataset.siteOrigin) return;

  const endpoint = script.dataset.endpoint;
  if (!endpoint || !endpoint.startsWith("https://")) return;

  // One page load = one visit. No cookies, local storage, query strings or referrers.
  const record = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", record);
    try {
      const payload = JSON.stringify({ event_id: crypto.randomUUID(), path: window.location.pathname });
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, payload)) return;
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: payload,
        credentials: "omit",
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Logging must never interfere with the page.
    }
  };

  if (document.visibilityState === "visible") record();
  else document.addEventListener("visibilitychange", record);
})();
