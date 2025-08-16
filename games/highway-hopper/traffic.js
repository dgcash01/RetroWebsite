// Traffic system module
export function createTrafficSystem({ tileW, tileH, offsetX, boardW, rows }){
  const vehicles = []; // { x, row, lenTiles, dir, speed, color }
  let lanes = [];
  const laneTimers = new Map();

  function configure({ lanes: laneDefs }){
    lanes = laneDefs.slice();
    laneTimers.clear();
    lanes.forEach(l => laneTimers.set(l.row, 0));
  }

  function update(dt){
    // move
    for (let i = vehicles.length - 1; i >= 0; i--){
      const v = vehicles[i];
      v.x += v.dir * v.speed * dt;
      if ((v.dir === 1 && v.x > offsetX + boardW + tileW*2) ||
          (v.dir === -1 && v.x < offsetX - tileW*2)){
        vehicles.splice(i, 1);
      }
    }

    // spawn
    for (const cfg of lanes){
      const t = (laneTimers.get(cfg.row) || 0) + dt * 1000; // ms
      const laneCount = vehicles.reduce((n, v) => n + (v.row === cfg.row ? 1 : 0), 0);
      const target = cfg.interval + Math.random() * (cfg.jitter || 0);
      if (t >= target && laneCount < (cfg.maxEntities || 3)){
        laneTimers.set(cfg.row, 0);
        const len = cfg.lengths[Math.floor(Math.random() * cfg.lengths.length)];
        const startX = cfg.dir === 1 ? (offsetX - len*tileW - tileW) : (offsetX + boardW + tileW);
        const color = cfg.color || '#ffbd6b'; // safe default, no external colors array needed
        vehicles.push({ x: startX, row: cfg.row, lenTiles: len, dir: cfg.dir, speed: cfg.speed, color });
      } else {
        laneTimers.set(cfg.row, t);
      }
    }
  }

  function draw(ctx){
    for (const v of vehicles){
      const w = v.lenTiles * tileW * 0.95;
      const h = tileH * 0.7;
      const vx = v.x + (tileW * 0.025);
      const vy = (v.row * tileH) + ((tileH - h) / 2);
      ctx.save();
      ctx.fillStyle = v.color;
      roundRect(ctx, vx, vy, w, h, 10);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(vx + 6, vy + h - 6, 14, 4);
      ctx.fillRect(vx + w - 20, vy + h - 6, 14, 4);
      ctx.restore();
    }
  }

  function overlaps(row, playerCol){
    for (const v of vehicles){
      if (v.row !== row) continue;
      const startCol = Math.floor((v.x - offsetX) / tileW);
      const endCol   = Math.floor(((v.x + v.lenTiles * tileW - 1) - offsetX) / tileW);
      if (playerCol >= startCol && playerCol <= endCol){
        return true;
      }
    }
    return false;
  }

  // local helper (module private)
  function roundRect(ctx, x, y, w, h, r = 8){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { configure, update, draw, overlaps };
}