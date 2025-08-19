// api/worker.js
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env, req) });
    }

    if (url.pathname === "/api/health") return json({ ok: true }, env, req);

    // GET /api/scores?game=breakout&limit=20
    if (url.pathname === "/api/scores" && req.method === "GET") {
      const game = (url.searchParams.get("game") || "breakout").toLowerCase();
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));

      const { results } = await env.DB.prepare(
        "SELECT player, score, created_at FROM scores WHERE game = ? ORDER BY score DESC LIMIT ?;"
      ).bind(game, limit).all();

      return json(results || [], env, req);
    }

    // POST /api/scores  { game, player, score }
    if (url.pathname === "/api/scores" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return json({ error: "bad json" }, env, req, 400); }

      const game = String(body.game || "").toLowerCase();
      const player = (String(body.player || "").trim().slice(0, 24)) || "player";
      const score = Number(body.score);

      if (!game || !Number.isFinite(score)) return json({ error: "bad payload" }, env, req, 400);
      if (score < 0 || score > 1e9)        return json({ error: "score out of range" }, env, req, 400);

      await env.DB.prepare(
        "INSERT INTO scores (game, player, score) VALUES (?, ?, ?);"
      ).bind(game, player, Math.floor(score)).run();

      return json({ ok: true }, env, req, 201);
    }

    return json({ error: "not found" }, env, req, 404);
  },
};

// CORS helper
function cors(env, req) {
  const origin = req?.headers.get("origin") || "";
  // Allow during local dev; tighten in prod via env var CSV if you want.
  const allowWildcard = env.CORS_ORIGIN === "*" || !env.CORS_ORIGIN;
  if (allowWildcard) {
    return {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
  }
  // CSV of allowed origins in CORS_ORIGIN
  const allowed = new Set(env.CORS_ORIGIN.split(",").map(s => s.trim()));
  const allow = allowed.has(origin) ? origin : [...allowed][0];
  return {
    "content-type": "application/json",
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(data, env, req, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(env, req) });
}
