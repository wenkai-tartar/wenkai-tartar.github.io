import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import worker from "./worker.mjs";

const origin = "https://wenkai-tartar.github.io";
const event_id = "bd98421c-6f01-4e68-9129-6382a65cbf91";
const request = (payload = { event_id, path: "/publications/" }, headers = {}) => {
  const req = new Request("https://example.workers.dev/collect", {
    method: "POST",
    headers: { Origin: origin, "CF-Connecting-IP": "203.0.113.1", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  req.cf = { country: "CN", city: "Shanghai", latitude: "31.2", longitude: "121.5" };
  return req;
};

test("internal collection, deduplication and per-IP aggregation use the real schema", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("./migrations/0001_actor_type.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("./migrations/0002_browser_context.sql", import.meta.url), "utf8"));
  const env = {
    SITE_ORIGIN: origin,
    DB: { prepare: (sql) => ({ bind: (...values) => ({ run: () => db.prepare(sql).run(...values) }) }) },
  };
  assert.equal((await worker.fetch(request(), env)).status, 204);
  assert.equal((await worker.fetch(request(), env)).status, 204);
  assert.equal((await worker.fetch(request({ event_id: event_id.replace("bd98421c", "ad98421c"), path: "/" }), env)).status, 204);
  const row = db.prepare("SELECT * FROM events LIMIT 1").get();
  assert.equal(row.ip, "203.0.113.1");
  assert.equal(row.city, "Shanghai");
  assert.equal(row.region, null);
  assert.equal(row.actor_type, "unknown");
  assert.equal(row.browser_timezone, null);
  assert.equal(row.os, null);
  assert.ok(Number.isFinite(Date.parse(row.received_at)));
  assert.equal(db.prepare("SELECT event_count FROM actors").get().event_count, 2);
  assert.equal((await worker.fetch(new Request("https://example.workers.dev/collect"), env)).status, 405);
  assert.equal((await worker.fetch(new Request("https://example.workers.dev/actors"), env)).status, 404);
  assert.equal((await worker.fetch(request(undefined, { Origin: "https://other.example" }), env)).status, 403);
  for (const payload of [
    "bad json",
    "x".repeat(2049),
    { event_id, path: "/?secret=value" },
    { event_id, path: "//other.example" },
    { event_id, path: "/", actor_type: "admin" },
  ]) {
    assert.equal((await worker.fetch(request(payload), env)).status, 400);
  }
  const noGeo = request({ event_id: event_id.replace("bd98421c", "cd98421c"), path: "/" });
  delete noGeo.cf;
  assert.equal((await worker.fetch(noGeo, env)).status, 204);
  assert.equal(db.prepare("SELECT country FROM events WHERE event_id = ?").get(event_id.replace("bd98421c", "cd98421c")).country, null);
  assert.equal((await worker.fetch(request(), { SITE_ORIGIN: origin })).status, 503);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM events").get().count, 3);
  db.close();
});

test("migration preserves history and separates owner and other events sharing an IP", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO events (event_id, ip, received_at, path) VALUES (?, ?, ?, ?)").run(event_id, "203.0.113.1", "2026-10-12T01:00:00Z", "/");
  db.exec(readFileSync(new URL("./migrations/0001_actor_type.sql", import.meta.url), "utf8"));
  assert.equal(db.prepare("SELECT actor_label FROM labeled_events").get().actor_label, "未识别");
  db.exec(readFileSync(new URL("./migrations/0002_browser_context.sql", import.meta.url), "utf8"));
  const env = {
    SITE_ORIGIN: origin,
    DB: { prepare: (sql) => ({ bind: (...values) => ({ run: () => db.prepare(sql).run(...values) }) }) },
  };
  for (const [prefix, actor_type] of [
    ["ad98421c", "self"],
    ["cd98421c", "other"],
  ]) {
    assert.equal((await worker.fetch(request({ event_id: event_id.replace("bd98421c", prefix), path: "/", actor_type }), env)).status, 204);
  }
  assert.equal(db.prepare("SELECT browser_timezone FROM events WHERE event_id = ?").get(event_id).browser_timezone, null);
  const counts = db.prepare("SELECT actor_label, event_count FROM labeled_actors ORDER BY actor_type").all();
  assert.deepEqual(
    counts.map((row) => [row.actor_label, row.event_count]),
    [
      ["别人", 1],
      ["自己", 1],
      ["未识别", 1],
    ]
  );
  assert.equal(db.prepare("SELECT event_count FROM actors").get().event_count, 3);
  db.close();
});

test("browser owner preference persists, can be cleared, and handles blocked storage", () => {
  const code = readFileSync(new URL("../assets/js/event-client.js", import.meta.url), "utf8");
  const run = (locationOrigin, beaconResult, visibility = "visible", storage = new Map(), hash = "", blocked = false, missingContext = false) => {
    const calls = [];
    const handlers = new Map();
    const windowHandlers = new Map();
    const location = { origin: locationOrigin, pathname: "/publications/", search: "?secret=value", hash };
    const document = {
      currentScript: { dataset: { endpoint: "https://example.workers.dev/collect", siteOrigin: origin } },
      visibilityState: visibility,
      addEventListener: (event, handler) => handlers.set(event, handler),
      removeEventListener: (event) => handlers.delete(event),
    };
    vm.runInNewContext(code, {
      document,
      window: {
        location,
        addEventListener: (event, handler) => windowHandlers.set(event, handler),
        get localStorage() {
          if (blocked) throw new Error("Storage denied");
          return { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
        },
        history: {
          state: null,
          replaceState: (state, title, url) => {
            assert.equal(url, "/publications/?secret=value");
          },
        },
      },
      crypto: { randomUUID: () => event_id },
      Intl: {
        DateTimeFormat: () => {
          if (missingContext) throw new Error("Timezone unavailable");
          return { resolvedOptions: () => ({ timeZone: "America/New_York" }) };
        },
      },
      navigator: {
        language: missingContext ? undefined : "zh-CN",
        languages: missingContext ? undefined : ["zh-CN", "en-US"],
        sendBeacon: (url, payload) => {
          calls.push(JSON.parse(payload));
          return beaconResult;
        },
      },
      fetch: (url, options) => {
        calls.push(options);
        return Promise.resolve();
      },
    });
    return { calls, document, handlers, location, windowHandlers };
  };
  assert.equal(run("http://localhost:8080", true).calls.length, 0);
  const captured = run(origin, true).calls[0];
  assert.equal(captured.actor_type, "other");
  assert.equal(captured.language, "zh-CN");
  assert.deepEqual(captured.languages, ["zh-CN", "en-US"]);
  assert.equal(captured.browser_timezone, "America/New_York");
  assert.ok(Number.isInteger(captured.utc_offset_minutes));
  assert.equal(captured.path, "/publications/");
  const withoutContext = run(origin, true, "visible", new Map(), "", false, true).calls[0];
  assert.equal(withoutContext.path, "/publications/");
  assert.equal(withoutContext.browser_timezone, undefined);
  assert.equal(withoutContext.language, undefined);
  const storage = new Map();
  assert.equal(run(origin, true, "visible", storage, "#event-owner=self").calls[0].actor_type, "self");
  assert.equal(run(origin, true, "visible", storage).calls[0].actor_type, "self");
  assert.equal(run(origin, true, "visible", storage, "#event-owner=other").calls[0].actor_type, "other");
  assert.equal(run(origin, true, "visible", storage).calls[0].actor_type, "other");
  assert.equal(run(origin, true, "visible", storage, "#event-owner=self", true).calls[0].actor_type, "unknown");
  const samePage = run(origin, true, "visible", storage);
  samePage.location.hash = "#event-owner=self";
  samePage.windowHandlers.get("hashchange")();
  assert.equal(storage.get("wenkai-event-owner"), "self");
  assert.equal(samePage.calls.length, 1);
  const fallback = run(origin, false).calls;
  assert.equal(fallback.length, 2);
  assert.equal(fallback[1].credentials, "omit");
  const hidden = run(origin, true, "hidden");
  assert.equal(hidden.calls.length, 0);
  hidden.document.visibilityState = "visible";
  hidden.handlers.get("visibilitychange")();
  assert.equal(hidden.calls.length, 1);
  assert.equal(hidden.handlers.size, 0);
});

test("browser context stores client settings separately from IP geolocation and tolerates invalid optional fields", async () => {
  const db = new DatabaseSync(":memory:");
  for (const file of ["schema.sql", "migrations/0001_actor_type.sql", "migrations/0002_browser_context.sql"]) {
    db.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  }
  const env = {
    SITE_ORIGIN: origin,
    DB: { prepare: (sql) => ({ bind: (...values) => ({ run: () => db.prepare(sql).run(...values) }) }) },
  };
  const req = request(
    { event_id, path: "/", language: "zh-CN", languages: ["zh-CN", "en-US"], browser_timezone: "America/New_York", utc_offset_minutes: -240 },
    { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15" }
  );
  req.cf.timezone = "Asia/Shanghai";
  assert.equal((await worker.fetch(req, env)).status, 204);
  const row = db.prepare("SELECT * FROM labeled_events").get();
  assert.equal(row.os, "macOS");
  assert.equal(row.browser, "Safari");
  assert.equal(row.language, "zh-CN");
  assert.deepEqual(JSON.parse(row.languages), ["zh-CN", "en-US"]);
  assert.equal(row.browser_timezone, "America/New_York");
  assert.equal(row.timezone, "Asia/Shanghai");
  assert.equal(row.utc_offset_minutes, -240);
  assert.ok(row.user_agent.includes("Safari"));
  const invalid = request({
    event_id: event_id.replace("bd98421c", "dd98421c"),
    path: "/",
    language: {},
    languages: [null, "x".repeat(65)],
    browser_timezone: "invalid/zone",
    utc_offset_minutes: "60",
  });
  assert.equal((await worker.fetch(invalid, env)).status, 204);
  const missing = db.prepare("SELECT * FROM events WHERE event_id = ?").get(event_id.replace("bd98421c", "dd98421c"));
  for (const field of ["language", "languages", "browser_timezone", "utc_offset_minutes"]) assert.equal(missing[field], null);
  const agents = [
    ["Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0", "Windows", "Edge"],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36", "Android", "Chrome"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/130.0", "iOS/iPadOS", "Firefox"],
  ];
  for (const [index, [agent, os, browser]] of agents.entries()) {
    const id = event_id.replace("bd98421c", String(index + 1).padStart(8, "0"));
    assert.equal((await worker.fetch(request({ event_id: id, path: "/" }, { "User-Agent": agent }), env)).status, 204);
    const stored = db.prepare("SELECT os, browser FROM events WHERE event_id = ?").get(id);
    assert.equal(stored.os, os);
    assert.equal(stored.browser, browser);
  }
  db.close();
});
