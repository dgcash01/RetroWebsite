(() => {
  const NAME_KEY = 'player_name';
  const S = (s) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);

  async function getName() {
    let n = localStorage.getItem(NAME_KEY);
    if (n && n.trim()) return S(n);
    n = S(prompt('Enter a name for the leaderboard (max 24 chars):', 'Player'));
    if (!n) n = 'Player';
    localStorage.setItem(NAME_KEY, n);
    return n;
  }

  async function submitScore(game, score) {
    try {
      const player = await getName();
      const r = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game, player, score: Number(score) }),
        cache: 'no-store',
        keepalive: true,
      });
      if (!r.ok) console.warn('Score submit failed:', await r.text());

      const bestKey = {
        breakout: 'breakout_best',
        'space-shooter': 'space_shooter_best',
        'highway-hopper': 'highway_hopper_best',
      }[game];
      if (bestKey) {
        const prev = Number(localStorage.getItem(bestKey) || 0);
        if (score > prev) localStorage.setItem(bestKey, String(score));
      }

      window.dispatchEvent(
        new CustomEvent('score-posted', { detail: { game, score, player } }),
      );
    } catch (e) {
      console.error('Submit error', e);
    }
  }

  window.submitScore = submitScore;
})();
