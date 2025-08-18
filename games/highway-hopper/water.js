// Water system: logs + turtles + crocs; water is hazardous unless on a floating platform.
export function createWaterSystem({ tileW, tileH, offsetX, boardW, rows }) {
  // platform:
  // { x,row,lenTiles,dir,speed,type,phase?,submerge?,blink?,hasPassenger?, _geom? }
  const platforms = [];
  let lanes = [];
  const laneTimers = new Map();
  let passengerActive = false; // only one on river at a time

  // ---------- Public API ----------
  function configure({ lanes: laneDefs }) {
    lanes = laneDefs.slice();
    laneTimers.clear();
    lanes.forEach((l) => laneTimers.set(l.row, 0));

    // reset runtime state on reconfigure (e.g., level up)
    passengerActive = false;
    platforms.length = 0;
  }

  function update(dt) {
    // Move & lifecycle
    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      p.x += p.dir * p.speed * dt;

      // turtles & crocs: submerge cycle + blink timer for warning flash
      if ((p.type === 'turtle' || p.type === 'croc') && p.submerge) {
        p.phase = (p.phase + dt) % p.submerge.period;
        p.blink = (p.blink || 0) + dt;
      }

      // Despawn when far off-screen
      if (
        (p.dir === 1 && p.x > offsetX + boardW + tileW * 2) ||
        (p.dir === -1 && p.x < offsetX - tileW * 2)
      ) {
        if (p.hasPassenger) passengerActive = false;
        platforms.splice(i, 1);
      }
    }

    // Spawns
    for (const cfg of lanes) {
      const t = (laneTimers.get(cfg.row) || 0) + dt * 1000;
      const laneCount = platforms.reduce(
        (n, p) => n + (p.row === cfg.row ? 1 : 0),
        0,
      );
      const target = cfg.interval + Math.random() * (cfg.jitter || 0);

      if (t >= target && laneCount < (cfg.maxEntities || 3)) {
        const len = pick(cfg.lenTiles || [2]);

        // NEW: spacing so platforms don't glue head-to-tail
        const minGapTiles = cfg.minGapTiles ?? 1;
        if (!canSpawnInLane(cfg.row, cfg.dir, len, minGapTiles)) {
          laneTimers.set(cfg.row, t - 200); // retry soon
          continue;
        }

        laneTimers.set(cfg.row, 0);

        const startX =
          cfg.dir === 1
            ? offsetX - len * tileW - tileW
            : offsetX + boardW + tileW;

        const plat = {
          x: startX,
          row: cfg.row,
          lenTiles: len,
          dir: cfg.dir,
          speed: cfg.speed,
          type: cfg.type,
        };

        // Submerge model for turtles/crocs
        if ((cfg.type === 'turtle' || cfg.type === 'croc') && cfg.submerge) {
          const base = cfg.submerge; // {period, down, warn?}
          // vary uptime slightly; same down time
          const useLong = Math.random() < 0.5;
          const extra = 3 + Math.random() * 3;
          const period = useLong ? base.period + extra : base.period;
          const down = base.down;
          const warn = base.warn ?? 2;
          plat.submerge = { period, down, warn };
          plat.phase = 0;
          plat.blink = 0;
        }

        // Passenger spawns only on logs/turtles
        if (
          !passengerActive &&
          (cfg.type === 'log' || cfg.type === 'turtle') &&
          Math.random() < 0.15
        ) {
          plat.hasPassenger = true;
          passengerActive = true;
        }

        platforms.push(plat);
      } else {
        laneTimers.set(cfg.row, t);
      }
    }
  }

  function draw(ctx) {
    for (const p of platforms) {
      const w = p.lenTiles * tileW * 0.95;
      const h = tileH * 0.7;
      const vx = p.x + tileW * 0.025;
      const vy = p.row * tileH + (tileH - h) / 2;

      const bodyHidden = isBodySubmerged(p); // crocs keep head up even if body down
      const warn = aboutToDive(p);
      const blinkOn = warn
        ? Math.floor(((p.blink || 0) * 1000) / 150) % 2 === 0
        : false;

      if (p.type === 'log') {
        if (!bodyHidden) {
          ctx.fillStyle = '#b07a4a';
          roundRect(ctx, vx, vy, w, h, 10);
          ctx.fill();
          ctx.fillStyle = '#7a5432';
          ctx.fillRect(vx + 6, vy + h * 0.25, w - 12, 3);
          ctx.fillRect(vx + 6, vy + h * 0.55, w - 12, 3);
        }
      } else if (p.type === 'turtle') {
        if (!bodyHidden) {
          const segments = p.lenTiles * 2;
          for (let i = 0; i < segments; i++) {
            const cx = vx + (i + 0.5) * (w / segments);
            const cy = vy + h * 0.5;
            ctx.beginPath();
            ctx.fillStyle = '#2aa66a';
            ctx.arc(cx, cy, Math.min(h * 0.35, tileW * 0.32), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#14593d';
            ctx.fillRect(cx - 6, cy - 2, 12, 4);
          }
        }
      } else if (p.type === 'croc') {
        // --- Croc body (hidden when submerged) ---
        if (!bodyHidden) {
          ctx.fillStyle = '#1c7a5a';
          roundRect(ctx, vx, vy + h * 0.12, w, h * 0.76, 10);
          ctx.fill();
          // back scutes
          ctx.fillStyle = '#125942';
          for (let i = 0; i < Math.max(2, Math.floor(p.lenTiles * 2)); i++) {
            const sx =
              vx + (i + 0.5) * (w / Math.max(2, Math.floor(p.lenTiles * 2)));
            ctx.fillRect(sx - 4, vy + h * 0.12, 8, 6);
          }
        }

        // --- Croc head (always visible) ---
        const g = computeCrocGeom(p); // cache geometry
        ctx.save();
        ctx.fillStyle = '#239c74';
        roundRect(ctx, g.headStartX, g.hy, g.headLen, g.headH, 10);
        ctx.fill();

        // snout/mouth (hazard zone)
        ctx.fillStyle = '#d94b4b';
        const mx0 = p.dir === 1 ? g.tipX - g.mouthLen : g.headStartX;
        const mw = g.mouthLen;
        ctx.fillRect(
          Math.min(mx0, mx0 + mw),
          g.hy + g.headH * 0.25,
          Math.abs(mw),
          g.headH * 0.18,
        );

        // eye
        ctx.fillStyle = '#0a0e14';
        const eyeX =
          p.dir === 1
            ? g.headStartX + g.headLen * 0.75
            : g.headStartX + g.headLen * 0.25;
        ctx.beginPath();
        ctx.arc(eyeX, g.hy + g.headH * 0.28, 3, 0, Math.PI * 2);
        ctx.fill();

        // warning ring on head near dive
        if (warn && blinkOn) {
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffd166';
          ctx.beginPath();
          roundRect(ctx, g.headStartX, g.hy, g.headLen, g.headH, 10);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Passenger sprite (only on logs/turtles, and only when body visible)
      if (
        p.hasPassenger &&
        (p.type === 'log' || p.type === 'turtle') &&
        !bodyHidden
      ) {
        const wpx = p.lenTiles * tileW * 0.95;
        const hpx = tileH * 0.7;
        const pvx = p.x + tileW * 0.025;
        const pvy = p.row * tileH + (tileH - hpx) / 2;
        drawPassenger(
          ctx,
          pvx + wpx / 2,
          pvy + hpx * 0.42,
          Math.min(hpx * 0.35, tileW * 0.3),
        );
      }
    }
  }

  // Croc mouth hazard: true if player's tile overlaps a croc's mouth zone
  function hazardAt(row, col) {
    const pxLeft = offsetX + col * tileW;
    const pxRight = pxLeft + tileW - 1;

    for (const p of platforms) {
      if (p.row !== row) continue;
      if (p.type !== 'croc') continue;

      const g = computeCrocGeom(p);
      const mouthStart = p.dir === 1 ? g.tipX - g.mouthLen : g.headStartX;
      const mouthEnd = p.dir === 1 ? g.tipX : g.headStartX + g.mouthLen;

      if (
        pxRight >= Math.min(mouthStart, mouthEnd) &&
        pxLeft <= Math.max(mouthStart, mouthEnd)
      ) {
        return true;
      }
    }
    return false;
  }

  // Carry speed if standing on a rideable surface (null => drown)
  function carrySpeed(row, col) {
    const pxLeft = offsetX + col * tileW;
    const pxRight = pxLeft + tileW - 1;

    for (const p of platforms) {
      if (p.row !== row) continue;

      if (p.type === 'croc') {
        const g = computeCrocGeom(p);

        // Body ride when visible
        if (!isBodySubmerged(p)) {
          const bodyStart = p.x;
          const bodyEnd = p.x + p.lenTiles * tileW;
          if (pxRight >= bodyStart && pxLeft <= bodyEnd) return p.dir * p.speed;
        }

        // Head ride allowed, but not the mouth zone (caller may also check hazardAt)
        const headSafeStart =
          p.dir === 1 ? g.tipX - g.headLen : g.headStartX + g.mouthLen;
        const headSafeEnd =
          p.dir === 1 ? g.tipX - g.mouthLen : g.headStartX + g.headLen;
        if (
          pxRight >= Math.min(headSafeStart, headSafeEnd) &&
          pxLeft <= Math.max(headSafeStart, headSafeEnd)
        ) {
          return p.dir * p.speed;
        }
        continue;
      }

      // Logs/turtles standard rules
      if (isBodySubmerged(p)) continue; // turtles down = not rideable
      const start = p.x;
      const end = p.x + p.lenTiles * tileW;
      if (pxRight >= start && pxLeft <= end) {
        return p.dir * p.speed;
      }
    }
    return null;
  }

  // Attempt to pick up passenger on current platform (returns true on pickup)
  function tryPickup(row, col) {
    const pxLeft = offsetX + col * tileW;
    const pxRight = pxLeft + tileW - 1;
    for (const p of platforms) {
      if (!p.hasPassenger) continue;
      if (p.row !== row) continue;
      if (isBodySubmerged(p)) continue;
      const start = p.x;
      const end = p.x + p.lenTiles * tileW;
      if (pxRight >= start && pxLeft <= end) {
        p.hasPassenger = false;
        passengerActive = false;
        return true;
      }
    }
    return false;
  }

  return { configure, update, draw, carrySpeed, hazardAt, tryPickup };

  // ---------- Helpers ----------
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Prevent head-to-tail coupling in a lane
  function canSpawnInLane(row, dir, lenTiles, minGapTiles = 1) {
    const gapPx = minGapTiles * tileW;

    // New platform's leading edge (edge entering screen) at spawn time (just off-screen)
    const leadingEdge = dir === 1 ? offsetX - tileW : offsetX + boardW + tileW;

    // Find nearest existing platform in this row, same dir, near spawn edge
    let nearestDist = Infinity;
    for (const p of platforms) {
      if (p.row !== row || p.dir !== dir) continue;
      const pLeading = dir === 1 ? p.x + p.lenTiles * tileW : p.x;
      const isCandidate =
        dir === 1 ? pLeading <= leadingEdge : pLeading >= leadingEdge;
      if (!isCandidate) continue;
      const dist = Math.abs(leadingEdge - pLeading);
      if (dist < nearestDist) nearestDist = dist;
    }

    if (nearestDist === Infinity) return true; // nothing nearby
    return nearestDist >= gapPx + 1; // enforce minimum gap in px
  }

  function computeCrocGeom(p) {
    if (p._geom) return p._geom;
    const w = p.lenTiles * tileW * 0.95;
    const h = tileH * 0.7;
    const vx = p.x + tileW * 0.025;
    const tipX = vx + w;
    const tailX = vx;
    const headLen = Math.min(tileW * 0.9, tileW * 0.85);
    const mouthLen = headLen * 0.35; // hazard length at snout
    const headStartX = p.dir === 1 ? tipX - headLen : tailX;
    const headH = h * 0.65;
    const hy = p.row * tileH + (tileH - h) / 2 + (h - headH) / 2;
    p._geom = { vx, w, tipX, tailX, headLen, mouthLen, headStartX, headH, hy };
    return p._geom;
  }

  function isBodySubmerged(p) {
    if (!(p.type === 'turtle' || p.type === 'croc')) return false;
    if (!p.submerge) return false;
    // DOWN at start of cycle for `down` seconds
    return p.phase < (p.submerge.down || 2);
  }

  function aboutToDive(p) {
    if (!(p.type === 'turtle' || p.type === 'croc')) return false;
    if (!p.submerge) return false;
    if (isBodySubmerged(p)) return false;
    const warnWindow = p.submerge.warn ?? 2;
    return p.phase >= p.submerge.period - warnWindow;
  }

  function drawPassenger(ctx, cx, cy, r) {
    ctx.save();
    ctx.fillStyle = '#ff77aa';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0e14';
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.15, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.25, cy - r * 0.15, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r = 8) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
