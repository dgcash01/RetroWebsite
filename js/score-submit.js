// js/score-submit.js
const API_BASE = "/api";

export async function submitScore(game, player, score) {
  try {
    const res = await fetch(`${API_BASE}/scores`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game, player, score })
    });
    if (!res.ok) throw new Error(`submit failed: ${res.status}`);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function loadTopScores(game, limit = 10) {
  const res = await fetch(`${API_BASE}/scores?game=${encodeURIComponent(game)}&limit=${limit}`);
  if (!res.ok) return [];
  return res.json();
}
