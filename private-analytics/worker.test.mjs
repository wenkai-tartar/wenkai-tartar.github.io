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

test("private collection, deduplication and per-IP aggregation use the real schema", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  const env = {
    SITE_ORIGIN: origin,
    DB: { prepare: (sql) => ({ bind: (...values) => ({ run: () => db.prepare(sql).run(...values) }) }) },
  };
  assert.equal((await worker.fetch(request(), env)).status, 204);
  assert.equal((await worker.fetch(request(), env)).status, 204);
  assert.equal((await worker.fetch(request({ event_id: event_id.replace("bd98421c", "ad98421c"), path: "/" }), env)).status, 204);
  const row = db.prepare("SELECT * FROM visits LIMIT 1").get();
  assert.equal(row.ip, "203.0.113.1");
  assert.equal(row.city, "Shanghai");
  assert.equal(row.region, null);
  assert.ok(Number.isFinite(Date.parse(row.visited_at)));
  assert.equal(db.prepare("SELECT visit_count FROM visitors").get().visit_count, 2);
  assert.equal((await worker.fetch(new Request("https://example.workers.dev/collect"), env)).status, 405);
  assert.equal((await worker.fetch(new Request("https://example.workers.dev/visitors"), env)).status, 404);
  assert.equal((await worker.fetch(request(undefined, { Origin: "https://other.example" }), env)).status, 403);
  for (const payload of ["bad json", "x".repeat(2049), { event_id, path: "/?secret=value" }, { event_id, path: "//other.example" }]) {
    assert.equal((await worker.fetch(request(payload), env)).status, 400);
  }
  const noGeo = request({ event_id: event_id.replace("bd98421c", "cd98421c"), path: "/" });
  delete noGeo.cf;
  assert.equal((await worker.fetch(noGeo, env)).status, 204);
  assert.equal(db.prepare("SELECT country FROM visits WHERE event_id = ?").get(event_id.replace("bd98421c", "cd98421c")).country, null);
  assert.equal((await worker.fetch(request(), { SITE_ORIGIN: origin })).status, 503);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM visits").get().count, 3);
  db.close();
});

test("browser sends only path and event ID, with fallback and no local-preview logging", () => {
  const code = readFileSync(new URL("../assets/js/private-visit-tracking.js", import.meta.url), "utf8");
  const run = (locationOrigin, beaconResult, visibility = "visible") => {
    const calls = [];
    const handlers = new Map();
    const document = {
      currentScript: { dataset: { endpoint: "https://example.workers.dev/collect", siteOrigin: origin } },
      visibilityState: visibility,
      addEventListener: (event, handler) => handlers.set(event, handler),
      removeEventListener: (event) => handlers.delete(event),
    };
    vm.runInNewContext(code, {
      document,
      window: { location: { origin: locationOrigin, pathname: "/publications/", search: "?secret=value" } },
      crypto: { randomUUID: () => event_id },
      navigator: {
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
    return { calls, document, handlers };
  };
  assert.equal(run("http://localhost:8080", true).calls.length, 0);
  assert.deepEqual(run(origin, true).calls, [{ event_id, path: "/publications/" }]);
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
