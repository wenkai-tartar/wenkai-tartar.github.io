(() => {
  const script = document.currentScript;
  if (!script || window.location.origin !== script.dataset.siteOrigin) return;

  const endpoint = script.dataset.endpoint;
  if (!endpoint || !endpoint.startsWith("https://")) return;

  // A local preference identifies the owner's browser; it grants no access to data.
  let visitorType = "unknown";
  const applyOwnerPreference = () => {
    const ownerMarker = window.location.hash;
    visitorType = "unknown";
    try {
      if (ownerMarker === "#visit-owner=self") window.localStorage.setItem("wenkai-visit-owner", "self");
      else if (ownerMarker === "#visit-owner=other") window.localStorage.removeItem("wenkai-visit-owner");
      visitorType = window.localStorage.getItem("wenkai-visit-owner") === "self" ? "self" : "other";
    } catch {
      // Storage restrictions should not prevent logging; classify these visits as unknown.
    }
    if (ownerMarker === "#visit-owner=self" || ownerMarker === "#visit-owner=other") {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      } catch {
        // The URL fragment is never included in the payload.
      }
    }
  };
  applyOwnerPreference();
  window.addEventListener("hashchange", applyOwnerPreference);

  // One page load = one visit. No cookies, query strings or referrers.
  const record = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", record);
    try {
      const context = {};
      // Optional browser settings must never prevent the visit itself from being recorded.
      try {
        context.language = navigator.language;
        context.languages = Array.from(navigator.languages || []).slice(0, 10);
      } catch {}
      try {
        context.browser_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        context.utc_offset_minutes = -new Date().getTimezoneOffset();
      } catch {}
      const payload = JSON.stringify({ event_id: crypto.randomUUID(), path: window.location.pathname, visitor_type: visitorType, ...context });
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
