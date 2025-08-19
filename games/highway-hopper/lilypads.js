// Lily pads module
export const PAD_COLS = [2, 4, 6, 8, 10]; // ends pulled inward for balance

// occupiedCols is an optional Set<number> of columns that already have frogs
export function drawLilyPads(
  ctx,
  tileToPx,
  tileW,
  tileH,
  row,
  waterColor,
  occupiedCols = new Set(),
) {
  const rx = tileW * 0.44;
  const ry = tileH * 0.34;

  for (const col of PAD_COLS) {
    const [x, y] = tileToPx(col, row);
    const cx = x + tileW / 2;
    const cy = y + tileH / 2;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + tileH * 0.22, rx * 0.7, ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // pad
    ctx.fillStyle = '#2aa66a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // notch
    ctx.fillStyle = waterColor || '#133a68';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rx * 0.55, -0.35, 0.35);
    ctx.closePath();
    ctx.fill();

    // occupied frog marker
    if (occupiedCols.has(col)) {
      const w = tileW * 0.55;
      const h = tileH * 0.45;
      ctx.save();
      ctx.translate(cx - w / 2, cy - h / 2);
      ctx.fillStyle = '#1d7d52';
      roundRect(ctx, 0, 0, w, h, 10);
      ctx.fill();
      ctx.fillStyle = '#0a0e14';
      ctx.beginPath();
      ctx.arc(w * 0.3, h * 0.25, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w * 0.7, h * 0.25, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
