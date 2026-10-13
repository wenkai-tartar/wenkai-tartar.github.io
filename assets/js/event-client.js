(() => {
  const script = document.currentScript;
  if (!script || window.location.origin !== script.dataset.siteOrigin) return;

  const endpoint = script.dataset.endpoint;
  if (!endpoint || !endpoint.startsWith("https://")) return;

  // A local preference identifies the owner's browser; it grants no access to data.
  let actorType = "unknown";
  const applyOwnerPreference = () => {
    const ownerMarker = window.location.hash;
    actorType = "unknown";
    try {
      if (ownerMarker === "#event-owner=self") window.localStorage.setItem("wenkai-event-owner", "self");
      else if (ownerMarker === "#event-owner=other") window.localStorage.removeItem("wenkai-event-owner");
      actorType = window.localStorage.getItem("wenkai-event-owner") === "self" ? "self" : "other";
    } catch {
      // Storage restrictions should not prevent logging; classify these events as unknown.
    }
    if (ownerMarker === "#event-owner=self" || ownerMarker === "#event-owner=other") {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      } catch {
        // The URL fragment is never included in the payload.
      }
    }
  };
  applyOwnerPreference();
  window.addEventListener("hashchange", applyOwnerPreference);

  // One page load = one event. No cookies, query strings or referrers.
  const record = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", record);
    try {
      const payload = JSON.stringify({ event_id: crypto.randomUUID(), path: window.location.pathname, actor_type: actorType });
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
