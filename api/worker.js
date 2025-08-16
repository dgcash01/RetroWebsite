// api/worker.js
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS (harmless even on same-origin)
    if (req.method === "OPTIONS")
      return new Response(null, { headers: cors(env) });

    if (url.pathname === "/api/health") return json({ ok: true }, env);

    // GET /api/scores?game=breakout&limit=20
    if (url.pathname === "/api/scores" && req.method === "GET") {
      const game = (url.searchParams.get("game") || "breakout").toLowerCase();
      const limit = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("limit") || 20))
      );
      const { results } = await env.DB.prepare(
        "SELECT player, score, created_at FROM scores WHERE game = ? ORDER BY score DESC LIMIT ?;"
      )
        .bind(game, limit)
        .all();
      return json(results || [], env);
    }

    // POST /api/scores  { game, player, score }
    if (url.pathname === "/api/scores" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      const game = String(body.game || "").toLowerCase();
      const player =
        String(body.player || "")
          .trim()
          .slice(0, 24) || "player";
      const score = Number(body.score);
      if (!game || !Number.isFinite(score))
        return json({ error: "bad payload" }, env, 400);

      // simple sanity checks
      if (score < 0 || score > 1e9)
        return json({ error: "score out of range" }, env, 400);

      await env.DB.prepare(
        "INSERT INTO scores (game, player, score) VALUES (?, ?, ?);"
      )
        .bind(game, player, Math.floor(score))
        .run();

      return json({ ok: true }, env, 201);
    }

    return json({ error: "not found" }, env, 404);
  },
};

function cors(env, req) {
  const origin = req.headers.get("origin") || "";
  const allowed = new Set([
    "https://insertaquarter.com",
    "https://www.insertaquarter.com",
    "https://insertaquarter.pages.dev",
  ]);
  const allow = allowed.has(origin) ? origin : "https://insertaquarter.com";
  return {
    "content-type": "application/json",
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(env) });
}
