const MAX_BODY_BYTES = 2048;

async function readPayload(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing payload");
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Payload too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const response = (status) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
    if (new URL(request.url).pathname !== "/collect") return response(404);
    // There is intentionally no public read or statistics endpoint.
    if (request.method !== "POST") return response(405);
    if (!env.SITE_ORIGIN || request.headers.get("Origin") !== env.SITE_ORIGIN) return response(403);
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return response(400);

    let payload;
    try {
      payload = await readPayload(request);
      if (
        !payload ||
        typeof payload.event_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.event_id) ||
        typeof payload.path !== "string" ||
        payload.path.length > 1024 ||
        !payload.path.startsWith("/") ||
        payload.path.startsWith("//") ||
        /[?#\\\x00-\x1f]/.test(payload.path)
      ) {
        return response(400);
      }
    } catch {
      return response(400);
    }

    const cf = request.cf || {};
    try {
      await env.DB.prepare(
        `INSERT INTO visits (event_id, ip, country, region, city, latitude, longitude, timezone, visited_at, path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`
      )
        .bind(
          payload.event_id,
          ip,
          cf.country ?? null,
          cf.region ?? null,
          cf.city ?? null,
          cf.latitude ?? null,
          cf.longitude ?? null,
          cf.timezone ?? null,
          new Date().toISOString(),
          payload.path
        )
        .run();
      return response(204);
    } catch {
      // Do not print visitor IPs or payloads to Worker logs.
      return response(503);
    }
  },
};
