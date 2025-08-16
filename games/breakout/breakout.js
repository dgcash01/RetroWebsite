(() => {
  'use strict';

  /***********************
   *  Score submit hook  *
   ***********************/
  let submitOnce = false;
  async function submitBreakoutScore(finalScore) {
    if (submitOnce) return;
    submitOnce = true;
    try {
      if (typeof window.submitScore === 'function') {
        await window.submitScore('breakout', Number(finalScore) || 0);
      }
    } catch (_) {
      // allow retry if it fails (e.g., network hiccup)
      submitOnce = false;
    }
  }

  /****************************
   *  DOM helpers & elements  *
   ****************************/
  const $ = (id) => document.getElementById(id);

  const canvas   = $('c');
  const ctx      = canvas.getContext('2d');

  const scoreEl  = $('score');
  const livesEl  = $('lives');
  const levelEl  = $('level');
  const bestEl   = $('best');

  const startBtn = $('startBtn');
  const resetBtn = $('resetBtn');
  const muteBtn  = $('muteBtn');
  const fsBtn    = $('fsBtn');
  const quitBtn  = $('quitBtn');
  const brandLink= $('brandLink');

  const gameWrap = $('gameWrap');

  // Optional panels if present in your HTML
  const localHSList = $('localHighscores');
  const leaderboardBox = $('leaderboard');

  /****************
   *  UI helpers  *
   ****************/
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
    ));
  }

  async function loadLeaderboard(){
    if (!leaderboardBox) return;
    leaderboardBox.innerHTML = '<em>Loading…</em>';
    try {
      const r = await fetch('/api/scores?game=breakout&limit=25', { cache: 'no-store' });
      const data = await r.json();
      leaderboardBox.innerHTML = (Array.isArray(data) && data.length)
        ? '<ol style="margin:0 0 0 1.25rem;line-height:1.8">' +
            data.map((s,i)=>`<li><strong>#${i+1}</strong> — ${escapeHtml(s.player)} — <strong>${Number(s.score).toLocaleString()}</strong></li>`).join('') +
          '</ol>'
        : '<p>No scores yet — be the first!</p>';
    } catch {
      leaderboardBox.innerHTML = '<p>Could not load scores.</p>';
    }
  }

  /*****************
   *  Audio setup  *
   *****************/
  let audioCtx = null;
  let muted = (localStorage.getItem('breakout_muted') === '1');

  function ensureAudio(){
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { return; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function tone(freq=440, dur=0.08, type='sine', vol=0.05){
    if (muted || !audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    o.start(now);
    o.stop(now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  }
  const sPaddle = () => tone(420, 0.06, 'sine', 0.06);
  const sBrick  = () => tone(660, 0.05, 'triangle', 0.05);
  const sBeep   = (i) => {
    if (i === 3) tone(360, 0.10, 'square', 0.06);
    else if (i === 2) tone(520, 0.10, 'square', 0.06);
    else if (i === 1) tone(760, 0.12, 'square', 0.07);
    else if (i === 0) tone(980, 0.14, 'sawtooth', 0.07);
  };

  /******************
   *  Game state    *
   ******************/
  const W = canvas.width;
  const H = canvas.height;

  let running = false;
  let paused  = false;

  let score = 0;
  let lives = 3;
  let level = 1;

  // countdown before each serve
  let controlsLocked   = true;
  let countdown        = 3;
  let countdownFrames  = 0;
  const PULSE_FRAMES   = 60;
  const PULSE_COLORS   = ['#ef4444','#f59e0b','#22c55e'];

  // paddle / ball / bricks
  const paddle = { w: 160, h: 16, x: (W-160)/2, y: H-36, speed: 7 };
  const ball   = { x: W/2, y: H-80, r: 8, vx: 0, vy: 0 };

  let cols  = 14;
  let rows  = 4;
  let brickW= (W - 80) / cols;
  let brickH= 22;
  let bricks= [];
  const margin = 50;

  // difficulty knobs
  let MAX_SPEED     = 4.2;
  let SPEED_UP_HIT  = 0.015;
  let EDGE_MULT     = 3.0;

  // popups
  const popups = [];
  let bonusToast = null;

  // input
  const keys = new Set();

  /*************************
   *  Local high-scores    *
   *************************/
  function getHS(){
    try { const a = JSON.parse(localStorage.getItem('breakout_highscores_v2') || '[]'); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function saveHS(arr){ localStorage.setItem('breakout_highscores_v2', JSON.stringify(arr)); }
  function isTop10(sc){ const a = getHS(); return a.length < 10 || sc > a[a.length-1].s; }
  function pushHS(sc, name){
    let a = getHS();
    a.push({ n: (name || '???').toUpperCase().slice(0,3), s: Number(sc)||0 });
    a = a.filter(o => Number.isFinite(o.s) && typeof o.n === 'string');
    a.sort((x,y)=>y.s-x.s);
    a = a.slice(0,10);
    saveHS(a); return a;
  }
  function renderLocalHS(){
    if (!localHSList) return;
    try {
      const a = getHS();
      localHSList.innerHTML = a.length
        ? a.map((o,i)=>`<li>#${i+1} — ${escapeHtml(o.n)} — ${o.s.toLocaleString()}</li>`).join('')
        : '<li>No scores yet</li>';
    } catch {
      localHSList.innerHTML = '<li>No scores yet</li>';
    }
  }

  // best
  function updateBest(newScore){
    const prev = Number(localStorage.getItem('breakout_best') || 0);
    const next = Math.max(prev, Number(newScore)||0);
    localStorage.setItem('breakout_best', next);
    if (bestEl) bestEl.textContent = next;
    return next;
  }
  // init best label
  updateBest(0);

  /*******************
   *  Level setup    *
   *******************/
  function settingsForLevel(l){
    if (l <= 1) return { paddleW: 180, rows: 4, init: 1.6, max: 4.2, hit: 0.015, edge: 3.0 };
    if (l === 2) return { paddleW: 160, rows: 5, init: 1.8, max: 4.6, hit: 0.02,  edge: 3.2 };
    const g = Math.min(l-2, 5);
    return {
      paddleW: Math.max(140 - g*6, 120),
      rows   : Math.min(4 + l, 8),
      init   : Math.min(1.8 + g*0.15, 3.0),
      max    : Math.min(4.6 + g*0.25, 6.0),
      hit    : Math.min(0.02 + g*0.005, 0.04),
      edge   : Math.min(3.0 + g*0.2, 4.0)
    };
  }

  let launchSpeed = 0;
  let launchDir   = 1;

  function applyLevel(){
    const s = settingsForLevel(level);
    paddle.w = s.paddleW; paddle.x = (W - paddle.w) / 2;
    rows = s.rows; brickW = (W - 80) / cols;
    MAX_SPEED   = s.max; SPEED_UP_HIT = s.hit; EDGE_MULT = s.edge;

    // bricks
    bricks = [];
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const x = 40 + c*brickW, y = margin + r*(brickH+8);
        const rank = (rows - r);
        bricks.push({ x, y, w: brickW - 6, h: brickH, alive: true, val: rank*10, rank });
      }
    }

    // ball
    ball.x = W/2; ball.y = H-80; ball.vx = 0; ball.vy = 0;
    launchDir = (Math.random() > 0.5 ? 1 : -1);
    launchSpeed = s.init;

    controlsLocked  = true;
    countdown       = 3;
    countdownFrames = 0;
    sBeep(3);

    if (levelEl) levelEl.textContent = level;
    if (scoreEl) scoreEl.textContent = String(score);
    if (livesEl) livesEl.textContent = String(lives);
  }

  function nextLevel(){
    const bonus = level * 200;
    score += bonus;
    if (scoreEl) scoreEl.textContent = String(score);
    bonusToast = { text: `BONUS +${bonus}`, life: 90 };
    level++;
    applyLevel();
  }

  /*****************
   *  Rendering    *
   *****************/
  function roundRect(x,y,w,h,r,fill){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y, x+w,y+h, r);
    ctx.arcTo(x+w,y+h, x,y+h, r);
    ctx.arcTo(x,y+h, x,y, r);
    ctx.arcTo(x,y, x+w,y, r);
    if (fill) ctx.fill();
  }

  function brickColor(rank){
    const t = rank / Math.max(1, rows);
    const g = Math.floor(160 + 80 * t);
    const bl= Math.floor(200 - 60 * t);
    return `rgb(30, ${g}, ${bl})`;
  }

  function render(){
    // bg
    ctx.fillStyle = '#02060d'; ctx.fillRect(0,0,W,H);
    for (let i=0;i<60;i++){
      ctx.fillStyle = 'rgba(124,231,162,.07)';
      const x = (i * 157) % W, y = (i * 73) % H;
      ctx.fillRect(x,y,2,2);
    }

    // paddle
    ctx.fillStyle = '#12d68d'; roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 8, true);

    // ball
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.fillStyle = '#7ce7a2'; ctx.fill();

    // bricks
    for (const b of bricks){
      if (!b.alive) continue;
      ctx.fillStyle = brickColor(b.rank);
      roundRect(b.x, b.y, b.w, b.h, 6, true);
    }

    // popups
    for (let i=popups.length-1; i>=0; i--){
      const p = popups[i];
      const t = p.life / 70;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = '#e6edf3';
      ctx.font = (14 + (1-t)*6) + 'px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
      p.y -= 1.2;
      p.life -= 1;
      if (p.life <= 0) popups.splice(i,1);
    }

    // bonus toast
    if (bonusToast){
      const t = bonusToast.life / 90;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = '#7ce7a2';
      ctx.font = (28 + (1-t)*10) + 'px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(bonusToast.text, W/2, H*0.35);
      ctx.globalAlpha = 1;
      bonusToast.life -= 1;
      if (bonusToast.life <= 0) bonusToast = null;
    }

    // pause overlay
    if (paused){
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#e6edf3'; ctx.font = '24px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Paused — Space resume • R restart • Enter start', W/2, H/2);
    }

    // countdown overlay
    if (countdown > 0){
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0,0,W,H);
      const stageIndex = Math.max(0, 3 - countdown); // 0/1/2
      const color = PULSE_COLORS[stageIndex];
      const t = countdownFrames / PULSE_FRAMES; // 0..1
      const maxR = Math.min(W,H) * 0.35;
      const r = maxR * t;
      ctx.beginPath(); ctx.arc(W/2, H/2, r, 0, Math.PI*2);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.25 * (1-t);
      ctx.lineWidth = 8 * (1-t); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.font = (34*(1+0.3*(1-t))) + 'px Inter'; ctx.textAlign = 'center';
      ctx.fillText(`Level ${level}`, W/2, H/2 + (8*(1-t)));
    }
  }

  /****************
   *  Game loop   *
   ****************/
  function clampSpeed(){
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > MAX_SPEED){
      const k = MAX_SPEED / s;
      ball.vx *= k; ball.vy *= k;
    }
  }

  function update(){
    // paddle
    if (!controlsLocked){
      if (keys.has('ArrowLeft'))  paddle.x -= paddle.speed;
      if (keys.has('ArrowRight')) paddle.x += paddle.speed;
    }
    paddle.x = Math.max(10, Math.min(W - paddle.w - 10, paddle.x));

    // countdown
    if (countdown > 0){
      countdownFrames++;
      if (countdownFrames >= PULSE_FRAMES){
        countdown--; countdownFrames = 0;
        if (countdown > 0) sBeep(countdown);
        if (countdown === 0){
          sBeep(0);
          ball.vx = launchSpeed * (launchDir || 1);
          ball.vy = -launchSpeed;
          controlsLocked = false;
        }
      }
      return;
    }

    // move ball
    ball.x += ball.vx; ball.y += ball.vy;

    // walls
    if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
    if (ball.y < ball.r) ball.vy *= -1;

    // paddle collision
    if (ball.y + ball.r >= paddle.y && ball.x > paddle.x && ball.x < paddle.x + paddle.w && ball.vy > 0){
      const hit = (ball.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
      ball.vx = hit * EDGE_MULT;
      ball.vy = -Math.max(Math.abs(ball.vy), 1.5);
      sPaddle();
      ball.y = paddle.y - ball.r - 1;
      clampSpeed();
    }

    // bricks
    for (const b of bricks){
      if (!b.alive) continue;
      if (ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.h){
        b.alive = false;
        const gained = b.val;
        score += gained;
        if (scoreEl) scoreEl.textContent = String(score);
        popups.push({ x: b.x + b.w/2, y: b.y + b.h/2, text: `+${gained}`, life: 70 });
        sBrick();
        ball.vy *= -1;
        break;
      }
    }

    // cleared?
    if (bricks.every(b => !b.alive)) { nextLevel(); }

    // fell off?
    if (ball.y - ball.r > H){
      lives--;
      if (livesEl) livesEl.textContent = String(lives);
      if (lives <= 0){
        endRun(false);
      } else {
        // re-serve
        controlsLocked  = true;
        countdown       = 3;
        countdownFrames = 0;
        ball.x = W/2; ball.y = H-80; ball.vx = 0; ball.vy = 0;
        sBeep(3);
      }
    }
  }

  function loop(){
    if (!running) return;
    if (!paused) update();
    render();
    requestAnimationFrame(loop);
  }

  /*****************
   *  End-of-run   *
   *****************/
  let enteringInitials = false;
  let initials = '';
  let pendingScore = 0;

  function endRun(/* won */){
    paused = true;
    running = true; // keep draw loop for overlay
    updateBest(score);

    // fire-and-forget cloud submit (guarded)
    submitBreakoutScore(score);

    if (isTop10(score)){
      enteringInitials = true;
      initials = '';
      pendingScore = score;
      controlsLocked = true;
    } else {
      renderLocalHS();
      loadLeaderboard();
    }
  }

  function finishInitials(){
    enteringInitials = false;
    const name = (initials && initials.trim()) ? initials : '???';
    localStorage.setItem('player_name', name);
    pushHS(pendingScore, name);
    renderLocalHS();
    // Already posted above via submitBreakoutScore(score)
    loadLeaderboard();
  }

  // expose a simple hook (for external calls if needed)
  window.breakoutHooks = {
    endRun: (finalScore) => {
      // optional external trigger; if score passed, override
      if (typeof finalScore === 'number') score = finalScore;
      endRun(false);
    }
  };

  /*****************
   *  Input bind   *
   *****************/
  window.addEventListener('keydown', (e) => {
    // initials entry
    if (enteringInitials){
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)){
        if (initials.length < 3) initials += e.key.toUpperCase();
        e.preventDefault(); return;
      }
      if (e.key === 'Backspace'){ initials = initials.slice(0,-1); e.preventDefault(); return; }
      if (e.key === 'Enter'){ finishInitials(); e.preventDefault(); return; }
      if (e.key === 'Escape'){ initials = ''; finishInitials(); e.preventDefault(); return; }
      e.preventDefault(); return;
    }

    // normal controls
    if (['ArrowLeft','ArrowRight',' ','Enter','r','R','m','M','f','F','Escape'].includes(e.key)) e.preventDefault();

    if ([' ','Enter','r','R','m','M','f','F'].includes(e.key)) ensureAudio();

    if (e.key === 'f' || e.key === 'F') { toggleFs(); return; }
    if (e.key === 'Escape') { paused = !paused; updatePauseUI(); return; }

    keys.add(e.key);

    if (e.key === ' ') {
      if (!running) { running = true; loop(); }
      else { paused = !paused; updatePauseUI(); }
    }
    if (e.key === 'Enter'){
      if (!running) { running = true; loop(); }
      paused = false; updatePauseUI();
    }
    if (e.key === 'r' || e.key === 'R'){
      // reset same level
      applyLevel();
      paused = false; updatePauseUI();
      if (!running) { running = true; loop(); }
    }
    if (e.key === 'm' || e.key === 'M'){
      setMute(!muted);
    }
  });

  window.addEventListener('keyup', (e) => keys.delete(e.key));

  // Touch to unlock audio
  canvas.addEventListener('pointerdown', () => { ensureAudio(); }, { passive: true });

  /*****************
   *  Fullscreen   *
   *****************/
  function isFs(){ return document.fullscreenElement || document.webkitFullscreenElement; }
  function updateFsBtn(){ if (fsBtn) fsBtn.textContent = isFs() ? '🗗 Windowed' : '⛶ Fullscreen'; }
  async function enterFs(){
    try {
      if (gameWrap.requestFullscreen) await gameWrap.requestFullscreen();
      else if (gameWrap.webkitRequestFullscreen) await gameWrap.webkitRequestFullscreen();
    } catch {}
    updateFsBtn();
  }
  async function exitFs(){
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch {}
    updateFsBtn();
  }
  function toggleFs(){ ensureAudio(); if (isFs()) exitFs(); else enterFs(); }
  if (fsBtn) fsBtn.addEventListener('click', toggleFs);
  document.addEventListener('fullscreenchange', updateFsBtn);
  document.addEventListener('webkitfullscreenchange', updateFsBtn);

  // Nav buttons
  if (startBtn) startBtn.addEventListener('click', () => {
    ensureAudio();
    if (!running) { running = true; loop(); }
    else { paused = !paused; }
    updatePauseUI();
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    ensureAudio();
    applyLevel();
    paused = false;
    updatePauseUI();
  });
  if (muteBtn) muteBtn.addEventListener('click', () => {
    ensureAudio();
    setMute(!muted);
  });
  if (quitBtn) quitBtn.addEventListener('click', () => {
    running = false;
    window.location.assign('../../');
  });
  if (brandLink) brandLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.assign('../../');
  });

  function setMute(m){
    muted = m;
    localStorage.setItem('breakout_muted', m ? '1' : '0');
    if (muteBtn) muteBtn.textContent = m ? '🔇 Sound Off' : '🔊 Sound On';
  }

  function updatePauseUI(){
    if (quitBtn) quitBtn.style.display = paused ? 'inline-block' : 'none';
  }

  /**************
   *  Boot      *
   **************/
  function start(){
    // labels
    if (scoreEl) scoreEl.textContent = String(score);
    if (livesEl) livesEl.textContent = String(lives);
    if (levelEl) levelEl.textContent = String(level);

    renderLocalHS();
    loadLeaderboard();
    applyLevel();
    render(); // first frame
  }

  start();
})();
