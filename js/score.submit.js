(() => {
  const NAME_KEY = "player_name";
  function sanitizeName(s) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, 24);
  }
  async function getPlayerName() {
    let name = localStorage.getItem(NAME_KEY);
    if (name && name.trim()) return sanitizeName(name);
    name = sanitizeName(prompt("Enter a name for the leaderboard (max 24 chars):", "Player"));
    if (!name) name = "Player";
    localStorage.setItem(NAME_KEY, name);
    return name;
  }
  async function submitScore(game, score) {
    try {
      const player = await getPlayerName();
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game, player, score: Number(score) }),
        cache: "no-store",
        keepalive: true,
      });
      if (!res.ok) {
        console.warn("Score submit failed:", await res.text());
        return false;
      }
      const bestKeys = {
        "breakout": "breakout_best",
        "space-shooter":"space_shooter_best",
        "highway-hopper": "highway_hopper_best",
      };
      const k = bestKeys[game];
      if (k) {
        const prev = Number(localStorage.getItem(k) || 0);
        if (score > prev) localStorage.setItem(k, String(score));
      }
      window.dispatchEvent(new CustomEvent("score-posted", { detail: { game, score, player } }));
      return true;
    } catch (e) {
      console.error("Submit error", e);
      return false;
    }
  }
  window.submitScore = submitScore;
})();
