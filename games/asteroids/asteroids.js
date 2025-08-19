/* ========= Leaderboard (fetch) ========= */
      function esc(s) {
        return String(s).replace(
          /[&<>"']/g,
          (m) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[m],
        );
      }
      async function loadLeaderboard() {
        const el = document.getElementById('leaderboard');
        if (!el) return;
        el.innerHTML = '<em>Loading…</em>';
        try {
          const r = await fetch('/api/scores?game=asteroids&limit=25', {
            cache: 'no-store',
          });
          const data = await r.json();
          el.innerHTML =
            Array.isArray(data) && data.length
              ? '<ol style="margin:0;padding-left:1.25rem;line-height:1.8">' +
                data
                  .map(
                    (s, i) =>
                      `<li><strong>#${i + 1}</strong> — ${esc(s.player)} — <strong>${Number(s.score).toLocaleString()}</strong></li>`,
                  )
                  .join('') +
                '</ol>'
              : '<p>No scores yet — be the first!</p>';
        } catch {
          el.innerHTML = '<p>Could not load scores.</p>';
        }
      }

      /* ========= One-time cloud submit per run ========= */
      let scoreSent = false;
      function submitAsteroidsScoreOnce(finalScore) {
        if (scoreSent) return Promise.resolve();
        scoreSent = true;
        return window.submitScore('asteroids', finalScore).catch(() => {
          scoreSent = false;
        });
      }

      /* ========= Game Code ========= */
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      const BASE_W = 960,
        BASE_H = 640;

      // Game constants
      const SHIP_SIZE = 30;
      const SHIP_THRUST = 0.1;
      const SHIP_TURN_SPEED = 0.07;
      const FRICTION = 0.99;
      const BULLET_SPEED = 7;
      const BULLET_MAX = 10;
      const ASTEROID_NUM = 3;
      const ASTEROID_SPEED = 1;
      const ASTEROID_SIZE = 100;
      const ASTEROID_VERT = 10;
      const ASTEROID_JAG = 0.4;
      const ALIEN_SIZE = 30;
      const ALIEN_SPEED = 2;
      const ALIEN_SHOOT_DELAY = 1000;

      // --- Game Objects ---
      let player;
      let bullets = [];
      let asteroids = [];
      let alien = null;
      let alienBullets = [];
      let lastAlienShot = 0;

      // --- Audio ---
      let audioCtx = null;
      let muted = localStorage.getItem('sound_muted') === '1';
      function ensureAudio() {
        if (!audioCtx) {
          try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          } catch (e) {
            return;
          }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }
      function blip(f = 440, d = 0.06, t = 'square', v = 0.05) {
        if (muted || !audioCtx) return;
        const o = audioCtx.createOscillator(),
          g = audioCtx.createGain();
        o.type = t;
        o.frequency.value = f;
        g.gain.value = v;
        o.connect(g);
        g.connect(audioCtx.destination);
        const n = audioCtx.currentTime;
        o.start(n);
        o.stop(n + d);
        g.gain.setValueAtTime(v, n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + d);
      }
      function sShoot() {
        blip(440, 0.05, 'triangle', 0.04);
      }
      function sAsteroidHit() {
        blip(220, 0.1, 'sawtooth', 0.06);
      }
      function sExplode() {
        blip(110, 0.2, 'sawtooth', 0.1);
      }
      function setMute(m) {
        muted = m;
        localStorage.setItem('sound_muted', m ? '1' : '0');
        document.getElementById('muteBtn').textContent = m
          ? '🔇 Sound Off'
          : '🔊 Sound On';
      }

      // --- State ---
      let statsRun = {
        shots: 0,
        hits: 0,
        asteroidsDestroyed: 0,
        aliensKilled: 0,
      };
      let statsLife = (() => {
        try {
          const o = JSON.parse(
            localStorage.getItem('asteroids_stats_v1') || '{}',
          );
          return o && typeof o === 'object'
            ? o
            : {
                shots: 0,
                hits: 0,
                asteroidsDestroyed: 0,
                aliensKilled: 0,
              };
        } catch (e) {
          return {
            shots: 0,
            hits: 0,
            asteroidsDestroyed: 0,
            aliensKilled: 0,
          };
        }
      })();
      function saveStatsLife() {
        localStorage.setItem('asteroids_stats_v1', JSON.stringify(statsLife));
      }

      function statsLines(s) {
        const acc = s.shots ? (100 * s.hits) / s.shots : 0;
        return [
          `Shots fired: ${s.shots}`,
          `Accuracy: ${acc.toFixed(1)}% (${s.hits}/${s.shots})`,
          `Asteroids destroyed: ${s.asteroidsDestroyed}`,
          `Alien ships destroyed: ${s.aliensKilled}`,
        ].join('<br>');
      }
      function updateStatsUI() {
        const run = document.getElementById('runStats');
        const life = document.getElementById('lifetimeStats');
        if (run) run.innerHTML = statsLines(statsRun);
        if (life) life.innerHTML = statsLines(statsLife);
      }

      let running = false,
        paused = false,
        level = 1,
        score = 0,
        lives = 3;
      let gameOver = false;

      // HUD
      const scoreEl = document.getElementById('score');
      const bestEl = document.getElementById('best');
      const levelEl = document.getElementById('level');
      const livesEl = document.getElementById('lives');
      let best = Number(localStorage.getItem('asteroids_best') || 0);
      bestEl.textContent = best;

      // Local highscores
      function getHS() {
        try {
          const a = JSON.parse(
            localStorage.getItem('asteroids_highscores_v2') || '[]',
          );
          return Array.isArray(a) ? a : [];
        } catch (e) {
          return [];
        }
      }
      function saveHS(a) {
        localStorage.setItem('asteroids_highscores_v2', JSON.stringify(a));
      }
      function isTop10(s) {
        const a = getHS();
        if (a.length < 10) return true;
        return s > a[a.length - 1].s;
      }
      function pushHS(s, name) {
        let a = getHS();
        a.push({
          n: (name || '???').toUpperCase().slice(0, 3),
          s: Number(s) || 0,
        });
        a = a.filter((o) => Number.isFinite(o.s) && typeof o.n === 'string');
        a.sort((x, y) => y.s - x.s);
        a = a.slice(0, 10);
        saveHS(a);
        return a;
      }
      function renderLocalHS() {
        const a = getHS();
        const el = document.getElementById('localHighscores');
        el.innerHTML = a.length
          ? a.map((o, i) => `<li>#${i + 1} — ${o.n} — ${o.s}</li>`).join('')
          : '<li>No scores yet</li>';
        best = a[0]?.s || best || 0;
        bestEl.textContent = best;
      }

      // --- Game Setup ---
      function newShip() {
        return {
          x: BASE_W / 2,
          y: BASE_H / 2,
          r: SHIP_SIZE / 2,
          a: (90 / 180) * Math.PI, // convert to radians
          rot: 0,
          thrusting: false,
          thrust: { x: 0, y: 0 },
        };
      }

      function createAsteroidBelt() {
        asteroids = [];
        for (let i = 0; i < ASTEROID_NUM + level; i++) {
          asteroids.push(newAsteroid(ASTEROID_SIZE));
        }
      }

      function newAsteroid(size, x, y) {
        const roid = {
          x: x !== undefined ? x : Math.floor(Math.random() * BASE_W),
          y: y !== undefined ? y : Math.floor(Math.random() * BASE_H),
          xv: Math.random() * ASTEROID_SPEED * (Math.random() < 0.5 ? 1 : -1),
          yv: Math.random() * ASTEROID_SPEED * (Math.random() < 0.5 ? 1 : -1),
          s: size,
          a: Math.random() * Math.PI * 2, // in radians
          vert: Math.floor(Math.random() * (ASTEROID_VERT + 1) + ASTEROID_VERT / 2),
          offs: [],
        };
        // create the vertex offsets
        for (let i = 0; i < roid.vert; i++) {
          roid.offs.push(Math.random() * ASTEROID_JAG * 2 + 1 - ASTEROID_JAG);
        }
        return roid;
      }

      // Input
      const keys = new Set();
      window.addEventListener('keydown', (e) => {
        if (
          [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            ' ',
            'Enter',
            'p',
            'P',
            'r',
            'R',
            'm',
            'M',
            'f',
            'F',
            'Escape',
          ].includes(e.key)
        )
          e.preventDefault();
        if (
          [
            ' ',
            'Enter',
            'p',
            'P',
            'r',
            'R',
            'm',
            'M',
            'f',
            'F',
            'Escape',
          ].includes(e.key)
        )
          ensureAudio();
        if (e.key === 'f' || e.key === 'F') {
          toggleFs();
          return;
        }
        if (e.key === 'm' || e.key === 'M') {
          setMute(!muted);
          return;
        }
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
          paused = !paused;
          updatePauseUI();
          return;
        }
        if (e.key === 'Enter') {
          if (!running) {
            running = true;
            reset();
            loop();
          }
          paused = false;
          updatePauseUI();
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          reset();
          paused = false;
          updatePauseUI();
          if (!running) {
            running = true;
            loop();
          }
          return;
        }
        keys.add(e.key);
        if (e.key === ' ') shoot();
      });
      window.addEventListener('keyup', (e) => keys.delete(e.key));

      // Touch
      function bindHold(btn, key) {
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          keys.add(key);
        });
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          keys.delete(key);
        });
      }
      bindHold(document.getElementById('leftBtn'), 'ArrowLeft');
      bindHold(document.getElementById('rightBtn'), 'ArrowRight');
      bindHold(document.getElementById('thrustBtn'), 'ArrowUp');
      canvas.addEventListener(
        'pointerdown',
        () => {
          ensureAudio();
          shoot();
        },
        { passive: true },
      );

      // Buttons
      document.getElementById('startBtn').addEventListener('click', () => {
        ensureAudio();
        if (!running) {
          running = true;
          reset();
          loop();
        } else {
          paused = !paused;
        }
        updatePauseUI();
      });
      document.getElementById('resetBtn').addEventListener('click', () => {
        ensureAudio();
        reset();
        paused = false;
        updatePauseUI();
      });
      document.getElementById('muteBtn').addEventListener('click', () => {
        ensureAudio();
        setMute(!muted);
      });
      const quitBtn = document.getElementById('quitBtn');
      if (quitBtn) {
        quitBtn.addEventListener('click', () => {
          running = false;
          window.location.assign('/');
        });
      }

      // Fullscreen & responsive sizing
      const fsBtn = document.getElementById('fsBtn');
      const gameWrap = document.getElementById('gameWrap');
      function isFs() {
        return document.fullscreenElement || document.webkitFullscreenElement;
      }
      function updateFsBtn() {
        if (!fsBtn) return;
        fsBtn.textContent = isFs() ? '🗗 Windowed' : '⛶ Fullscreen';
      }
      async function enterFs() {
        try {
          if (gameWrap.requestFullscreen) await gameWrap.requestFullscreen();
          else if (gameWrap.webkitRequestFullscreen)
            await gameWrap.webkitRequestFullscreen();
        } catch (e) {}
        updateFsBtn();
      }
      async function exitFs() {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen)
            await document.webkitExitFullscreen();
        } catch (e) {}
        updateFsBtn();
      }
      function toggleFs() {
        ensureAudio();
        if (isFs()) exitFs();
        else enterFs();
      }
      if (fsBtn) {
        fsBtn.addEventListener('click', toggleFs);
      }
      document.addEventListener('fullscreenchange', updateFsBtn);
      document.addEventListener('webkitfullscreenchange', updateFsBtn);

      function sizeCanvas() {
        const wrapW = gameWrap.clientWidth;
        const maxH = Math.max(400, Math.floor(window.innerHeight * 0.8));
        const scale = Math.min(wrapW / BASE_W, maxH / BASE_H);
        canvas.style.width = Math.floor(BASE_W * scale) + 'px';
        canvas.style.height = Math.floor(BASE_H * scale) + 'px';
      }
      window.addEventListener('resize', sizeCanvas);
      document.addEventListener('fullscreenchange', sizeCanvas);
      document.addEventListener('webkitfullscreenchange', sizeCanvas);

      function reset() {
        player = newShip();
        createAsteroidBelt();
        bullets = [];
        score = 0;
        level = 1;
        lives = 3;
        gameOver = false;
        scoreEl.textContent = score;
        levelEl.textContent = level;
        livesEl.textContent = lives;
        statsRun = {
            shots: 0,
            hits: 0,
            asteroidsDestroyed: 0,
            aliensKilled: 0,
        };
        updateStatsUI();
      }

      function shoot() {
        if (bullets.length >= BULLET_MAX) return;
        bullets.push({
          x: player.x + (4 / 3) * player.r * Math.cos(player.a),
          y: player.y - (4 / 3) * player.r * Math.sin(player.a),
          xv: BULLET_SPEED * Math.cos(player.a),
          yv: -BULLET_SPEED * Math.sin(player.a),
          dist: 0,
        });
        sShoot();
        statsRun.shots++;
        updateStatsUI();
      }

      function loop() {
        if (!running) return;
        if (!paused) update();
        render();
        requestAnimationFrame(loop);
      }

      function update() {
        if (gameOver) return;

        // handle input
        if (keys.has('ArrowLeft')) player.a += SHIP_TURN_SPEED;
        if (keys.has('ArrowRight')) player.a -= SHIP_TURN_SPEED;
        if (keys.has('ArrowUp')) {
          player.thrust.x += SHIP_THRUST * Math.cos(player.a);
          player.thrust.y -= SHIP_THRUST * Math.sin(player.a);
        } else {
          player.thrust.x *= FRICTION;
          player.thrust.y *= FRICTION;
        }

        // move player
        player.x += player.thrust.x;
        player.y += player.thrust.y;

        // screen wrapping
        if (player.x < 0 - player.r) player.x = BASE_W + player.r;
        else if (player.x > BASE_W + player.r) player.x = 0 - player.r;
        if (player.y < 0 - player.r) player.y = BASE_H + player.r;
        else if (player.y > BASE_H + player.r) player.y = 0 - player.r;

        // move bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.xv;
          b.y += b.yv;
          if (b.x < 0 || b.x > BASE_W || b.y < 0 || b.y > BASE_H) {
            bullets.splice(i, 1);
          }
        }

        // move asteroids
        for (const roid of asteroids) {
            roid.x += roid.xv;
            roid.y += roid.yv;

            // screen wrapping
            if (roid.x < 0 - roid.s) roid.x = BASE_W + roid.s;
            else if (roid.x > BASE_W + roid.s) roid.x = 0 - roid.s;
            if (roid.y < 0 - roid.s) roid.y = BASE_H + roid.s;
            else if (roid.y > BASE_H + roid.s) roid.y = 0 - roid.s;
        }

        // collision detection
        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            // ship collision
            if (distBetweenPoints(player.x, player.y, a.x, a.y) < player.r + a.s) {
                loseLife();
            }

            // bullet collision
            for (let j = bullets.length - 1; j >= 0; j--) {
                const b = bullets[j];
                if (distBetweenPoints(b.x, b.y, a.x, a.y) < a.s) {

                    // break up asteroid
                    if (a.s > ASTEROID_SIZE / 2) {
                        asteroids.push(newAsteroid(ASTEROID_SIZE / 2, a.x, a.y));
                        asteroids.push(newAsteroid(ASTEROID_SIZE / 2, a.x, a.y));
                        score += 20;
                    } else if (a.s > ASTEROID_SIZE / 4) {
                        asteroids.push(newAsteroid(ASTEROID_SIZE / 4, a.x, a.y));
                        asteroids.push(newAsteroid(ASTEROID_SIZE / 4, a.x, a.y));
                        score += 50;
                    } else {
                        score += 100;
                    }

                    // remove asteroid and bullet
                    asteroids.splice(i, 1);
                    bullets.splice(j, 1);
                    sAsteroidHit();
                    scoreEl.textContent = score;
                    statsRun.hits++;
                    statsRun.asteroidsDestroyed++;
                    updateStatsUI();

                    if (asteroids.length === 0) {
                        nextLevel();
                    }

                    break; // move to next asteroid
                }
            }
        }

        // alien logic
        if (level >= 5 && !alien && Math.random() < 0.001) {
          newAlien();
        }

        if (alien) {
          alien.x += alien.xv;
          alien.y += alien.yv;

          if (alien.x < 0 - alien.s || alien.x > BASE_W + alien.s) {
            alien = null;
          }

          const now = performance.now();
          if (alien && now - lastAlienShot > ALIEN_SHOOT_DELAY) {
            lastAlienShot = now;
            alienBullets.push({
              x: alien.x,
              y: alien.y,
              xv: (player.x - alien.x) / 100,
              yv: (player.y - alien.y) / 100,
            });
          }
        }

        // alien bullet collision
        for (let i = alienBullets.length - 1; i >= 0; i--) {
            const ab = alienBullets[i];
            ab.x += ab.xv;
            ab.y += ab.yv;
            if (distBetweenPoints(player.x, player.y, ab.x, ab.y) < player.r) {
                alienBullets.splice(i, 1);
                loseLife();
            } else if (ab.x < 0 || ab.x > BASE_W || ab.y < 0 || ab.y > BASE_H) {
                alienBullets.splice(i, 1);
            }
        }

        // player bullet vs alien collision
        if (alien) {
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (distBetweenPoints(b.x, b.y, alien.x, alien.y) < alien.s) {
              bullets.splice(i, 1);
              alien = null;
              score += 200;
              scoreEl.textContent = score;
              statsRun.aliensKilled++;
              updateStatsUI();
              sExplode();
              break;
            }
          }

          // player vs alien collision
          if (distBetweenPoints(player.x, player.y, alien.x, alien.y) < player.r + alien.s) {
            loseLife();
            alien = null;
            sExplode();
          }
        }
      }

      function loseLife() {
        lives--;
        livesEl.textContent = lives;
        sExplode();
        if (lives <= 0) {
          endRun();
        } else {
          player = newShip();
        }
      }

      function nextLevel() {
        level++;
        levelEl.textContent = level;
        createAsteroidBelt();
      }

      function newAlien() {
        alien = {
          x: Math.random() < 0.5 ? 0 - ALIEN_SIZE : BASE_W + ALIEN_SIZE,
          y: Math.random() * BASE_H,
          xv: ALIEN_SPEED * (Math.random() < 0.5 ? 1 : -1),
          yv: 0,
          s: ALIEN_SIZE,
        };
      }

      function distBetweenPoints(x1, y1, x2, y2) {
          return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      }

      function render() {
        ctx.fillStyle = '#02060d';
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        // draw ship
        ctx.strokeStyle = '#e6edf3';
        ctx.lineWidth = SHIP_SIZE / 20;
        ctx.beginPath();
        ctx.moveTo( // nose of the ship
            player.x + (4 / 3) * player.r * Math.cos(player.a),
            player.y - (4 / 3) * player.r * Math.sin(player.a)
        );
        ctx.lineTo( // rear left
            player.x - player.r * ((2 / 3) * Math.cos(player.a) + Math.sin(player.a)),
            player.y + player.r * ((2 / 3) * Math.sin(player.a) - Math.cos(player.a))
        );
        ctx.lineTo( // rear right
            player.x - player.r * ((2 / 3) * Math.cos(player.a) - Math.sin(player.a)),
            player.y + player.r * ((2 / 3) * Math.sin(player.a) + Math.cos(player.a))
        );
        ctx.closePath();
        ctx.stroke();

        // draw bullets
        ctx.fillStyle = '#e6edf3';
        for (const b of bullets) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, SHIP_SIZE / 15, 0, Math.PI * 2, false);
            ctx.fill();
        }

        // draw asteroids
        ctx.strokeStyle = '#7ce7a2';
        ctx.lineWidth = SHIP_SIZE / 20;
        for (const roid of asteroids) {
            ctx.beginPath();
            ctx.moveTo(
                roid.x + roid.offs[0] * roid.s * Math.cos(roid.a),
                roid.y + roid.offs[0] * roid.s * Math.sin(roid.a)
            );
            for (let j = 1; j < roid.vert; j++) {
                ctx.lineTo(
                    roid.x + roid.offs[j] * roid.s * Math.cos(roid.a + (j * Math.PI * 2) / roid.vert),
                    roid.y + roid.offs[j] * roid.s * Math.sin(roid.a + (j * Math.PI * 2) / roid.vert)
                );
            }
            ctx.closePath();
            ctx.stroke();
        }

        // draw alien
        if (alien) {
            ctx.strokeStyle = '#f472b6';
            ctx.lineWidth = SHIP_SIZE / 20;
            ctx.beginPath();
            ctx.moveTo(alien.x - alien.s, alien.y);
            ctx.lineTo(alien.x + alien.s, alien.y);
            ctx.moveTo(alien.x - alien.s / 2, alien.y - alien.s / 2);
            ctx.lineTo(alien.x + alien.s / 2, alien.y - alien.s / 2);
            ctx.moveTo(alien.x - alien.s / 2, alien.y + alien.s / 2);
            ctx.lineTo(alien.x + alien.s / 2, alien.y + alien.s / 2);
            ctx.stroke();
        }

        // draw alien bullets
        ctx.fillStyle = '#f472b6';
        for (const ab of alienBullets) {
            ctx.beginPath();
            ctx.arc(ab.x, ab.y, SHIP_SIZE / 15, 0, Math.PI * 2, false);
            ctx.fill();
        }

        if (paused) {
          ctx.fillStyle = 'rgba(0,0,0,.45)';
          ctx.fillRect(0, 0, BASE_W, BASE_H);
          ctx.fillStyle = '#e6edf3';
          ctx.font = '24px Inter';
          ctx.textAlign = 'center';
          ctx.fillText(
            'Paused — Enter resume • R restart • Space shoot',
            BASE_W / 2,
            BASE_H / 2,
          );
        }

        if (gameOver) {
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.fillRect(0, 0, BASE_W, BASE_H);
          ctx.fillStyle = '#e6edf3';
          ctx.font = '28px Inter';
          ctx.textAlign = 'center';
          ctx.fillText('Game Over', BASE_W / 2, BASE_H / 2 - 14);
          ctx.font = '18px Inter';
          ctx.fillText(
            `Score: ${score}  •  Best: ${Math.max(best, score)}`,
            BASE_W / 2,
            BASE_H / 2 + 20,
          );
        }
      }

      function endRun() {
        gameOver = true;
        paused = true;
        running = false;

        const newBest = Math.max(best, score);
        localStorage.setItem('asteroids_best', newBest);
        best = newBest;
        bestEl.textContent = newBest;

        if (isTop10(score)) {
          // The original game has a more complex initials entry system.
          // For now, we'll just submit the score.
          submitAsteroidsScoreOnce(score).finally(loadLeaderboard);
        } else {
          submitAsteroidsScoreOnce(score).finally(loadLeaderboard);
        }
        statsLife.shots += statsRun.shots;
        statsLife.hits += statsRun.hits;
        statsLife.asteroidsDestroyed += statsRun.asteroidsDestroyed;
        statsLife.aliensKilled += statsRun.aliensKilled;
        saveStatsLife();
        updateStatsUI();
        updatePauseUI();
      }

      function updatePauseUI() {
        const q = document.getElementById('quitBtn');
        if (q) q.style.display = paused ? 'inline-block' : 'none';
      }
      function sizeInit() {
        const wrap = document.getElementById('gameWrap');
        const wrapW = wrap.clientWidth;
        const maxH = Math.max(400, Math.floor(window.innerHeight * 0.8));
        const scale = Math.min(wrapW / BASE_W, maxH / BASE_H);
        canvas.style.width = Math.floor(BASE_W * scale) + 'px';
        canvas.style.height = Math.floor(BASE_H * scale) + 'px';
      }

      // Boot
      document.getElementById('year').textContent = new Date().getFullYear();
      renderLocalHS();
      sizeInit();
      sizeCanvas();
      reset(); // Initial setup
      render(); // Initial render
      loadLeaderboard();
