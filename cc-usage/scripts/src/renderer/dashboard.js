/**
 * dashboard.js - Context space visualization dashboard
 * Extracted from docs/mock-dashboard.html
 */

function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : '' + n; }

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ============================================================
// COSMOS VIEW
// ============================================================
class CosmosView {
  constructor(canvas, overlayEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlay = overlayEl;
    this.running = false;
    this.nebulae = [];
    this.stars = [];
    this.dust = [];
    this.labelEls = [];
    this.orbitCenter = { x: 0, y: 0 };
    this.data = null;
    this.viewAngle = 0;
  }

  init(data) {
    this.data = data;
    const CW = this.canvas.width, CH = this.canvas.height;
    console.log('[cosmos] init: canvas=', CW, 'x', CH, 'categories=', data.categories.length);
    this.orbitCenter = { x: CW * 0.48, y: CH / 2 };

    // Stars
    this.stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * CW, y: Math.random() * CH,
      r: Math.random() * 1.2 + 0.3,
      brightness: Math.random() * 0.4 + 0.1,
      twinkleSpeed: Math.random() * 2 + 0.5,
      twinkleOffset: Math.random() * Math.PI * 2,
    }));

    // Dust
    this.dust = Array.from({ length: 60 }, () => ({
      x: Math.random() * CW, y: Math.random() * CH,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.1,
      size: Math.random() * 1.5 + 0.3, alpha: Math.random() * 0.15 + 0.03,
    }));

    // Build nebulae from data
    this._buildNebulae(data);
    this._buildLabels(data);
  }

  _buildNebulae(data) {
    const CW = this.canvas.width, CH = this.canvas.height;
    const cats = data.categories;
    const maxTokens = Math.max(...cats.map(c => c.tokens));
    const BASE_R = 22, MAX_R = 130;

    function tokenToRadius(tokens) {
      return BASE_R + (MAX_R - BASE_R) * Math.pow(tokens / maxTokens, 0.5);
    }

    const oc = this.orbitCenter;

    // Fixed position map: consistent layout regardless of data
    // Key matching is case-insensitive substring
    const positionMap = {
      messages:        { x: oc.x + 30,  y: oc.y },            // center
      memory:          { x: oc.x + 250, y: oc.y - 60 },       // far right
      'system prompt': { x: oc.x - 180, y: oc.y + 200 },      // bottom-left
      'system tool':   { x: oc.x + 180, y: oc.y + 200 },      // bottom-right
      skill:           { x: oc.x - 260, y: oc.y - 40 },       // far left
      autocompact:     { x: oc.x - 120, y: oc.y - 240 },      // top-left
    };

    const placed = cats.map(c => {
      const r = tokenToRadius(c.tokens);
      const name = (c.name || '').toLowerCase();
      // Find matching fixed position
      let pos = null;
      for (const [key, p] of Object.entries(positionMap)) {
        if (name.includes(key)) { pos = p; break; }
      }
      if (!pos) pos = { x: oc.x, y: oc.y }; // fallback
      return { ...c, r, x: pos.x, y: pos.y };
    });

    // Clamp within canvas
    for (const p of placed) {
      const m = p.r + 10;
      p.x = Math.max(m, Math.min(CW - m, p.x));
      p.y = Math.max(15, Math.min(CH - m - 10, p.y));
    }

    this.nebulae = placed.map((n, i) => {
      const dx = n.x - oc.x, dy = n.y - oc.y;
      const orbitRadius = Math.hypot(dx, dy);
      const orbitAngle0 = Math.atan2(dy, dx);
      const orbitSpeed = 0; // Fixed positions, no orbital movement

      return {
        ...n, orbitRadius, orbitAngle0, orbitSpeed, orbitEllipse: 0.7,
        particles: Array.from({ length: Math.floor(n.r * 2.5) }, () => ({
          angle: Math.random() * Math.PI * 2,
          dist: Math.random(),
          speed: (Math.random() - 0.5) * 0.25,
          size: Math.random() * 2.5 + 0.5,
          brightness: Math.random() * 0.5 + 0.3,
        })),
        tendrils: [], // removed
        pulseOffset: Math.random() * Math.PI * 2,
      };
    });
  }

  _buildLabels(data) {
    this.overlay.innerHTML = '';
    this.labelEls = [];
    const TOT = data.totalTokens;
    for (const n of this.nebulae) {
      const pct = ((n.tokens / TOT) * 100).toFixed(1);
      const lbl = document.createElement('div');
      lbl.className = 'cosmos-label';
      lbl.style.width = '100px';
      lbl.style.color = n.color;
      lbl.style.padding = '6px 0';
      lbl.innerHTML = `<div class="cl-name">${n.name}</div>
        <div class="cl-val">${fmt(n.tokens)} (${pct}%)</div>
        <div class="cl-tip">${n.ja}: ${n.desc}</div>`;
      this.overlay.appendChild(lbl);
      this.labelEls.push({ el: lbl, n });
    }
  }

  start() {
    console.log('[cosmos] start: nebulae=', this.nebulae.length, 'stars=', this.stars.length);
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    const t = performance.now() / 1000;
    this._draw(t);
    this._updateLabels(t);
    requestAnimationFrame(() => this._loop());
  }

  _updateLabels(t) {
    const CW = this.canvas.width, CH = this.canvas.height;
    const scaleX = this.canvas.clientWidth / CW;
    const scaleY = this.canvas.clientHeight / CH;
    const overlayW = this.canvas.clientWidth;
    const overlayH = this.canvas.clientHeight;
    const oc = this.orbitCenter;
    for (const { el, n } of this.labelEls) {
      const orbAngle = n.orbitAngle0 + t * n.orbitSpeed ;
      const cx = oc.x + Math.cos(orbAngle) * n.orbitRadius;
      const cy = oc.y + Math.sin(orbAngle) * n.orbitRadius * n.orbitEllipse;
      // Clamp position within overlay bounds
      const labelW = 100;
      let lx = cx * scaleX - labelW / 2;
      let ly = cy * scaleY + n.r * scaleY * 0.35;
      lx = Math.max(0, Math.min(lx, overlayW - labelW));
      ly = Math.max(0, Math.min(ly, overlayH - 40));
      el.style.left = lx + 'px';
      el.style.top = ly + 'px';
    }
  }

  _draw(t) {
    const ctx = this.ctx;
    const CW = this.canvas.width, CH = this.canvas.height;
    const oc = this.orbitCenter;
    const data = this.data;
    const TOT = data.totalTokens;
    const usedPct = data.usagePercent;

    ctx.clearRect(0, 0, CW, CH);

    // === Deep space background with multiple gradient layers ===
    const bg = ctx.createRadialGradient(CW * 0.3, CH * 0.4, 0, CW / 2, CH / 2, CW * 0.8);
    bg.addColorStop(0, 'rgba(25, 12, 45, 1)');
    bg.addColorStop(0.3, 'rgba(12, 8, 28, 1)');
    bg.addColorStop(0.7, 'rgba(6, 4, 16, 1)');
    bg.addColorStop(1, 'rgba(2, 1, 6, 1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    // Secondary galactic glow
    const bg2 = ctx.createRadialGradient(CW * 0.65, CH * 0.55, 0, CW * 0.6, CH * 0.5, CW * 0.5);
    bg2.addColorStop(0, 'rgba(20, 8, 40, 0.4)');
    bg2.addColorStop(0.5, 'rgba(8, 4, 20, 0.2)');
    bg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg2;
    ctx.fillRect(0, 0, CW, CH);

    // === Ambient nebula hazes (richer, more layers) ===
    const hazeT = t * 0.03;
    const hazes = [
      { x: CW * 0.2, y: CH * 0.55, r: 280, color: '90, 30, 140', a: 0.025 },
      { x: CW * 0.75, y: CH * 0.25, r: 220, color: '20, 60, 120', a: 0.02 },
      { x: CW * 0.5, y: CH * 0.85, r: 200, color: '120, 40, 30', a: 0.018 },
      { x: CW * 0.1, y: CH * 0.2, r: 160, color: '40, 80, 60', a: 0.012 },
      { x: CW * 0.85, y: CH * 0.7, r: 180, color: '60, 20, 80', a: 0.015 },
    ];
    for (const hz of hazes) {
      const hx = hz.x + Math.sin(hazeT + hz.x * 0.01) * 25;
      const hy = hz.y + Math.cos(hazeT + hz.y * 0.01) * 20;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hz.r);
      hg.addColorStop(0, `rgba(${hz.color}, ${hz.a})`);
      hg.addColorStop(0.4, `rgba(${hz.color}, ${hz.a * 0.5})`);
      hg.addColorStop(0.8, `rgba(${hz.color}, ${hz.a * 0.1})`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(hx, hy, hz.r, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
    }

    // === Stars with color variety and glow ===
    const starColors = [
      [220, 225, 255],  // blue-white
      [255, 240, 220],  // warm white
      [255, 200, 180],  // orange tint
      [180, 200, 255],  // blue
      [255, 220, 200],  // yellow-white
    ];
    for (const s of this.stars) {
      const twinkle = Math.sin(t * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7;
      const sc = starColors[Math.floor(s.twinkleOffset * 10) % starColors.length];
      const alpha = s.brightness * twinkle;
      // Glow for brighter stars
      if (s.r > 0.8 && alpha > 0.3) {
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
        glow.addColorStop(0, `rgba(${sc[0]},${sc[1]},${sc[2]}, ${alpha * 0.3})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${sc[0]},${sc[1]},${sc[2]}, ${alpha})`; ctx.fill();
    }

    // === Dust with subtle drift ===
    for (const d of this.dust) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = CW; if (d.x > CW) d.x = 0;
      if (d.y < 0) d.y = CH; if (d.y > CH) d.y = 0;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 170, 210, ${d.alpha})`; ctx.fill();
    }

    // === Ring gauge ===
    this._drawRingGauge(ctx, t, CW, CH, usedPct);

    // === Aurora plasma streams between nebulae ===
    if (this.nebulae.length > 1) {
      for (let i = 0; i < this.nebulae.length; i++) {
        const a = this.nebulae[i];
        const b = this.nebulae[(i + 1) % this.nebulae.length];
        const aAngle = a.orbitAngle0 + t * a.orbitSpeed;
        const bAngle = b.orbitAngle0 + t * b.orbitSpeed;
        const ax = oc.x + Math.cos(aAngle) * a.orbitRadius;
        const ay = oc.y + Math.sin(aAngle) * a.orbitRadius * a.orbitEllipse;
        const bx = oc.x + Math.cos(bAngle) * b.orbitRadius;
        const by = oc.y + Math.sin(bAngle) * b.orbitRadius * b.orbitEllipse;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const perpX = -(by - ay), perpY = (bx - ax);
        const dist = Math.hypot(bx - ax, by - ay);

        // Draw 3 layered ribbon strands (aurora effect)
        for (let strand = 0; strand < 3; strand++) {
          const strandPhase = strand * 2.1 + i * 1.7;
          const waveFactor = 0.15 + strand * 0.08;
          const wave1 = Math.sin(t * 0.3 + strandPhase) * waveFactor;
          const wave2 = Math.cos(t * 0.22 + strandPhase + 1.2) * waveFactor * 0.7;
          const cpx1 = ax + (bx - ax) * 0.33 + perpX * wave1 + Math.sin(t * 0.5 + strandPhase) * 8;
          const cpy1 = ay + (by - ay) * 0.33 + perpY * wave1 + Math.cos(t * 0.4 + strandPhase) * 6;
          const cpx2 = ax + (bx - ax) * 0.66 + perpX * wave2 + Math.cos(t * 0.45 + strandPhase) * 8;
          const cpy2 = ay + (by - ay) * 0.66 + perpY * wave2 + Math.sin(t * 0.35 + strandPhase) * 6;

          const ribbonAlpha = (0.025 - strand * 0.006) * (0.8 + Math.sin(t * 0.5 + strandPhase) * 0.2);
          const ribbonWidth = 12 - strand * 3;

          // Diffuse glow ribbon
          ctx.beginPath(); ctx.moveTo(ax, ay);
          ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, bx, by);
          const rGrad = ctx.createLinearGradient(ax, ay, bx, by);
          rGrad.addColorStop(0, hexToRgba(a.color, 0));
          rGrad.addColorStop(0.15, hexToRgba(a.color, ribbonAlpha));
          rGrad.addColorStop(0.5, `rgba(200,210,255,${ribbonAlpha * 0.6})`);
          rGrad.addColorStop(0.85, hexToRgba(b.color, ribbonAlpha));
          rGrad.addColorStop(1, hexToRgba(b.color, 0));
          ctx.strokeStyle = rGrad; ctx.lineWidth = ribbonWidth; ctx.lineCap = 'round'; ctx.stroke();
        }

        // Drifting plasma particles along the path
        for (let p = 0; p < 8; p++) {
          const flow = ((t * 0.08 + p * 0.125 + i * 0.2) % 1);
          const ft = flow, inv = 1 - ft;
          // Cubic bezier interpolation (use middle strand control points)
          const wave = Math.sin(t * 0.3 + i * 1.7) * 0.15;
          const c1x = ax + (bx - ax) * 0.33 + perpX * wave;
          const c1y = ay + (by - ay) * 0.33 + perpY * wave;
          const c2x = ax + (bx - ax) * 0.66 + perpX * wave * 0.7;
          const c2y = ay + (by - ay) * 0.66 + perpY * wave * 0.7;
          const px = inv*inv*inv*ax + 3*inv*inv*ft*c1x + 3*inv*ft*ft*c2x + ft*ft*ft*bx;
          const py = inv*inv*inv*ay + 3*inv*inv*ft*c1y + 3*inv*ft*ft*c2y + ft*ft*ft*by;
          // Slight perpendicular drift
          const drift = Math.sin(t * 0.7 + p * 2.3 + i) * 6;
          const dpx = px + (perpX / (dist || 1)) * drift;
          const dpy = py + (perpY / (dist || 1)) * drift;
          const fade = Math.sin(flow * Math.PI) * 0.35;
          const pSize = 2 + Math.sin(t * 1.2 + p) * 1.5;
          const mixR = Math.round(parseInt(a.color.slice(1,3),16) * inv + parseInt(b.color.slice(1,3),16) * ft);
          const mixG = Math.round(parseInt(a.color.slice(3,5),16) * inv + parseInt(b.color.slice(3,5),16) * ft);
          const mixB = Math.round(parseInt(a.color.slice(5,7),16) * inv + parseInt(b.color.slice(5,7),16) * ft);
          const pg = ctx.createRadialGradient(dpx, dpy, 0, dpx, dpy, pSize * 3);
          pg.addColorStop(0, `rgba(${mixR},${mixG},${mixB},${fade})`);
          pg.addColorStop(0.4, `rgba(${mixR},${mixG},${mixB},${fade * 0.3})`);
          pg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath(); ctx.arc(dpx, dpy, pSize * 3, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
        }
      }
    }

    // === Nebulae ===
    for (const n of this.nebulae) {
      const breath = 1
        + Math.sin(t * 0.6 + n.pulseOffset) * 0.05
        + Math.sin(t * 1.1 + n.pulseOffset * 2.3) * 0.03
        + Math.sin(t * 0.25 + n.pulseOffset * 0.7) * 0.02;
      const r = n.r * breath;

      const orbAngle = n.orbitAngle0 + t * n.orbitSpeed;
      const nx = oc.x + Math.cos(orbAngle) * n.orbitRadius + Math.sin(t * 0.15 + n.pulseOffset) * 4;
      const ny = oc.y + Math.sin(orbAngle) * n.orbitRadius * n.orbitEllipse + Math.cos(t * 0.12 + n.pulseOffset) * 3;

      const coreBeat = 0.35 + Math.sin(t * 1.5 + n.pulseOffset) * 0.12
        + Math.max(0, Math.sin(t * 3.0 + n.pulseOffset)) * 0.18;

      // Outer halo (wide, ethereal)
      const haloShift = Math.sin(t * 0.15 + n.pulseOffset) * r * 0.12;
      const halo = ctx.createRadialGradient(nx + haloShift, ny - haloShift * 0.4, r * 0.05, nx, ny, r * 2.5);
      halo.addColorStop(0, hexToRgba(n.color, 0.2));
      halo.addColorStop(0.2, hexToRgba(n.color, 0.1));
      halo.addColorStop(0.5, hexToRgba(n.color, 0.04));
      halo.addColorStop(0.8, hexToRgba(n.color, 0.01));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(nx, ny, r * 2.5, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();



      // Gas cloud layers (7 layers for depth)
      for (let layer = 0; layer < 7; layer++) {
        const lr = r * (1.0 - layer * 0.1);
        const rotSpeed = 0.05 + layer * 0.015;
        const la = layer * 0.9 + t * rotSpeed * (layer % 2 === 0 ? 1 : -1);
        const wobble = Math.sin(t * 0.25 + layer * 1.3 + n.pulseOffset) * r * 0.08;
        const ox = Math.cos(la) * (r * 0.05 * layer + wobble);
        const oy = Math.sin(la) * (r * 0.04 * layer + wobble * 0.7);
        const gas = ctx.createRadialGradient(nx + ox, ny + oy, 0, nx + ox, ny + oy, lr);
        const baseAlpha = (0.08 + (6 - layer) * 0.025) * (0.85 + Math.sin(t * 0.6 + layer + n.pulseOffset) * 0.15);
        gas.addColorStop(0, hexToRgba(n.color, baseAlpha * 1.8));
        gas.addColorStop(0.25, hexToRgba(n.color, baseAlpha * 1.0));
        gas.addColorStop(0.55, hexToRgba(n.color, baseAlpha * 0.4));
        gas.addColorStop(0.85, hexToRgba(n.color, baseAlpha * 0.08));
        gas.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(nx + ox, ny + oy, lr, 0, Math.PI * 2); ctx.fillStyle = gas; ctx.fill();
      }

      // Inner bright core with bloom
      const coreR = r * (0.18 + coreBeat * 0.12);
      const bloom = ctx.createRadialGradient(nx, ny, 0, nx, ny, coreR * 2);
      bloom.addColorStop(0, hexToRgba('#ffffff', Math.min(0.5, coreBeat * 0.8)));
      bloom.addColorStop(0.15, hexToRgba(n.color, Math.min(0.6, coreBeat * 1.2)));
      bloom.addColorStop(0.5, hexToRgba(n.color, 0.08));
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(nx, ny, coreR * 2, 0, Math.PI * 2); ctx.fillStyle = bloom; ctx.fill();

      // Sharp core point
      const core = ctx.createRadialGradient(nx, ny, 0, nx, ny, coreR);
      core.addColorStop(0, hexToRgba('#ffffff', Math.min(0.8, coreBeat + 0.3)));
      core.addColorStop(0.2, hexToRgba('#ffffff', Math.min(0.5, coreBeat * 0.7)));
      core.addColorStop(0.5, hexToRgba(n.color, Math.min(0.7, coreBeat * 1.5)));
      core.addColorStop(1, hexToRgba(n.color, 0.0));
      ctx.beginPath(); ctx.arc(nx, ny, coreR, 0, Math.PI * 2); ctx.fillStyle = core; ctx.fill();

      // Orbiting particles
      for (const p of n.particles) {
        p.angle += p.speed * 0.012 * (0.7 + p.dist * 0.6);
        const ellipse = 0.7 + p.dist * 0.2;
        const pd = p.dist * r;
        const px = nx + Math.cos(p.angle) * pd;
        const py = ny + Math.sin(p.angle) * pd * ellipse;
        const distFromCenter = Math.hypot(px - nx, py - ny) / r;
        const twinkle = 0.6 + Math.sin(t * 3 + p.angle * 5) * 0.4;
        const pa = p.brightness * (1 - distFromCenter * 0.5) * twinkle;
        const pr = p.size * (0.8 + Math.sin(t * 2 + p.angle) * 0.2);
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(n.color, pa); ctx.fill();
        // Cross flare on bright particles
        if (p.size > 1.8 && p.brightness > 0.55) {
          const flareLen = p.size * (2.5 + Math.sin(t * 4 + p.angle) * 1.2);
          ctx.globalAlpha = pa * 0.4;
          ctx.beginPath();
          ctx.moveTo(px - flareLen, py); ctx.lineTo(px + flareLen, py);
          ctx.moveTo(px, py - flareLen * 0.7); ctx.lineTo(px, py + flareLen * 0.7);
          ctx.strokeStyle = hexToRgba(n.color, 0.8); ctx.lineWidth = 0.4; ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Territory ring (animated dashes)
      const dashRot = t * 0.08 + n.pulseOffset;
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(dashRot);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(n.color, 0.06 + Math.sin(t * 0.5 + n.pulseOffset) * 0.03);
      ctx.lineWidth = 0.6; ctx.setLineDash([4, 12]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }

    // === Shooting stars (more frequent, colored) ===
    const shootFreq = Math.sin(t * 0.5) * 0.5 + Math.sin(t * 1.3) * 0.3 + Math.sin(t * 2.7) * 0.2;
    if (shootFreq > 0.92) {
      const sx = Math.random() * CW * 0.7 + CW * 0.15, sy = Math.random() * CH * 0.4;
      const sLen = 40 + Math.random() * 60;
      const sAngle = 0.3 + Math.random() * 0.4;
      const sGrad = ctx.createLinearGradient(sx, sy, sx + sLen, sy + sLen * sAngle);
      const colors = ['200,220,255', '255,220,180', '180,255,220'];
      const sc = colors[Math.floor(Math.random() * colors.length)];
      sGrad.addColorStop(0, `rgba(${sc},0.7)`); sGrad.addColorStop(0.3, `rgba(${sc},0.3)`); sGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sLen, sy + sLen * sAngle);
      ctx.strokeStyle = sGrad; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // === Title ===
    ctx.font = '600 20px "Noto Sans JP"';
    ctx.fillStyle = 'rgba(200, 220, 245, 0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u7A7A\u9593', CW / 2, 50);

    // === Usage top-right ===
    ctx.font = '700 18px "Noto Sans JP"';
    ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(`\u4F7F\u7528\u7387 ${usedPct}%`, CW - 16, 28);
  }

  _drawRingGauge(ctx, t, CW, CH, usedPct) {
    const cx = CW / 2, cy = CH / 2;
    const rx = CW / 2 - 6, ry = CH / 2 - 6;

    // Background ring
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.stroke();

    const usedAngle = (usedPct / 100) * Math.PI * 2;

    // Glow layer (wider, softer)
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + usedAngle);
    const glowGrad = ctx.createLinearGradient(0, 0, CW, 0);
    glowGrad.addColorStop(0, 'rgba(74, 222, 128, 0.15)'); glowGrad.addColorStop(1, 'rgba(210, 140, 80, 0.15)');
    ctx.strokeStyle = glowGrad; ctx.lineWidth = 8; ctx.stroke();

    // Main arc
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + usedAngle);
    const grad = ctx.createLinearGradient(0, 0, CW, 0);
    grad.addColorStop(0, 'rgba(74, 222, 128, 0.5)'); grad.addColorStop(1, 'rgba(210, 140, 80, 0.5)');
    ctx.strokeStyle = grad; ctx.lineWidth = 2.5; ctx.stroke();

    // Dot with glow
    const dotAngle = -Math.PI / 2 + usedAngle;
    const dotX = cx + rx * Math.cos(dotAngle), dotY = cy + ry * Math.sin(dotAngle);
    const dotR = 4 + Math.sin(t * 3) * 1.5;
    // Dot glow
    const dotGlow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotR * 4);
    dotGlow.addColorStop(0, 'rgba(74, 222, 128, 0.4)');
    dotGlow.addColorStop(0.5, 'rgba(74, 222, 128, 0.1)');
    dotGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(dotX, dotY, dotR * 4, 0, Math.PI * 2); ctx.fillStyle = dotGlow; ctx.fill();
    // Dot
    ctx.beginPath(); ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.9)'; ctx.fill();

    // Percentage label near the dot
    const labelOffsetX = (cx - dotX) * 0.06;
    const labelOffsetY = (cy - dotY) * 0.06;
    ctx.font = '700 18px "Noto Sans JP"';
    ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(`${usedPct}%`, dotX + labelOffsetX, dotY + labelOffsetY + 18);
  }
}

// ============================================================
// TREEMAP VIEW
// ============================================================
class TreemapView {
  constructor(containerEl) {
    this.container = containerEl;
  }

  render(data) {
    this.container.innerHTML = '';
    const W = this.container.clientWidth || 408, H = 300;
    const TOT = data.totalTokens;
    const allItems = [
      { name: 'Free Space', value: data.freeSpace.tokens, color: '#1a1a1a', isFree: true },
      ...data.categories.map(c => ({ name: c.name, value: c.tokens, color: c.color })),
    ].sort((a, b) => b.value - a.value);

    const rects = this._layout(allItems, 0, 0, W, H);
    for (const r of rects) {
      const block = document.createElement('div');
      block.className = 'tm-block' + (r.isFree ? ' tm-free' : '');
      block.style.left = r.x + 'px'; block.style.top = r.y + 'px';
      block.style.width = Math.max(0, r.w - 1) + 'px'; block.style.height = Math.max(0, r.h - 1) + 'px';
      block.style.background = r.color;
      const pct = ((r.value / TOT) * 100).toFixed(1);
      block.title = `${r.name}: ${fmt(r.value)} tokens (${pct}%)`;
      if (r.w > 60 && r.h > 50) {
        block.innerHTML = `<span class="tm-pct">${pct}%</span><span class="tm-name">${r.name}</span><span class="tm-val">${fmt(r.value)} tokens</span>`;
      } else if (r.w > 40 && r.h > 30) {
        block.innerHTML = `<span class="tm-name">${r.name}</span><span class="tm-val">${fmt(r.value)}</span>`;
      } else if (r.w > 25 && r.h > 18) {
        block.innerHTML = `<span class="tm-val">${fmt(r.value)}</span>`;
      }
      this.container.appendChild(block);
    }
  }

  _layout(items, x, y, w, h) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const rects = [];
    const remaining = items.map(i => ({ ...i, area: (i.value / total) * w * h }));

    function layoutRow(row, rx, ry, rw, rh, vertical) {
      const rowArea = row.reduce((s, i) => s + i.area, 0);
      let offset = 0;
      for (const item of row) {
        const ratio = item.area / rowArea;
        if (vertical) {
          const bw = rowArea / rh, bh = rh * ratio;
          rects.push({ ...item, x: rx, y: ry + offset, w: bw, h: bh }); offset += bh;
        } else {
          const bh = rowArea / rw, bw = rw * ratio;
          rects.push({ ...item, x: rx + offset, y: ry, w: bw, h: bh }); offset += bw;
        }
      }
      if (vertical) return { x: rx + rowArea / rh, y: ry, w: rw - rowArea / rh, h: rh };
      return { x: rx, y: ry + rowArea / rw, w: rw, h: rh - rowArea / rw };
    }

    function worstRatio(row, sideLen) {
      const rowArea = row.reduce((s, i) => s + i.area, 0);
      let worst = 0;
      for (const item of row) {
        const bw = rowArea / sideLen, bh = item.area / bw;
        const r = Math.max(bw / bh, bh / bw);
        if (r > worst) worst = r;
      }
      return worst;
    }

    let cx = x, cy = y, cw = w, ch = h, idx = 0;
    while (idx < remaining.length) {
      const vertical = cw >= ch;
      const sideLen = vertical ? ch : cw;
      let row = [remaining[idx]];
      let bestWorst = worstRatio(row, sideLen);
      idx++;
      while (idx < remaining.length) {
        const candidate = [...row, remaining[idx]];
        const cw2 = worstRatio(candidate, sideLen);
        if (cw2 <= bestWorst) { row = candidate; bestWorst = cw2; idx++; } else break;
      }
      const rem = layoutRow(row, cx, cy, cw, ch, vertical);
      cx = rem.x; cy = rem.y; cw = rem.w; ch = rem.h;
    }
    return rects;
  }
}

// ============================================================
// CHART VIEW (donut + legend)
// ============================================================
class ChartView {
  constructor(donutCanvas, legendEl) {
    this.canvas = donutCanvas;
    this.ctx = donutCanvas.getContext('2d');
    this.legendEl = legendEl;
  }

  render(data) {
    this._drawDonut(data);
    this._drawLegend(data);
  }

  _drawDonut(data) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2, oR = 140, iR = 90;
    const TOT = data.totalTokens;
    ctx.clearRect(0, 0, W, H);

    ctx.beginPath(); ctx.arc(cx, cy, oR, 0, Math.PI * 2);
    ctx.arc(cx, cy, iR, Math.PI * 2, 0, true);
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();

    let a = -Math.PI / 2;
    for (const c of data.categories) {
      const sw = (c.tokens / TOT) * Math.PI * 2;
      if (sw < 0.003) { a += sw; continue; }
      ctx.beginPath(); ctx.arc(cx, cy, oR, a, a + sw);
      ctx.arc(cx, cy, iR, a + sw, a, true); ctx.closePath();
      ctx.fillStyle = c.color; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, oR, a + sw - 0.008, a + sw + 0.008);
      ctx.arc(cx, cy, iR, a + sw + 0.008, a + sw - 0.008, true);
      ctx.fillStyle = 'rgba(28,24,20,0.94)'; ctx.fill();
      a += sw;
    }
    ctx.beginPath(); ctx.arc(cx, cy, oR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74,222,128,0.12)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  _drawLegend(data) {
    const TOT = data.totalTokens;
    this.legendEl.innerHTML = '';
    for (const c of data.categories) {
      const pct = ((c.tokens / TOT) * 100).toFixed(1);
      const d = document.createElement('div'); d.className = 'li';
      d.innerHTML = `<div class="d" style="background:${c.color}"></div>
        <span class="n">${c.name}</span><span class="v">${fmt(c.tokens)}</span>
        <span class="pc">${pct}%</span>`;
      this.legendEl.appendChild(d);
    }
    const f = document.createElement('div'); f.className = 'li'; f.style.opacity = '0.45';
    f.innerHTML = `<div class="d" style="background:#555;border:1px solid #666"></div>
      <span class="n">Free Space</span><span class="v">${fmt(data.freeSpace.tokens)}</span>
      <span class="pc">${((data.freeSpace.tokens / TOT) * 100).toFixed(1)}%</span>`;
    this.legendEl.appendChild(f);
  }
}

// ============================================================
// DASHBOARD CONTROLLER
// ============================================================
export class ContextDashboard {
  constructor(panelEl) {
    this.panel = panelEl;
    this.cosmosView = null;
    this.treemapView = null;
    this.chartView = null;
    this.currentView = 'cosmos';
    this._initViews();
    this._initTabs();
    this._initViewToggle();
  }

  _initViews() {
    const cosmosCanvas = this.panel.querySelector('#cosmosCanvas');
    const cosmosOverlay = this.panel.querySelector('#cosmosOverlay');
    if (cosmosCanvas && cosmosOverlay) {
      this.cosmosView = new CosmosView(cosmosCanvas, cosmosOverlay);
    }

    const treemapEl = this.panel.querySelector('#treemap');
    if (treemapEl) this.treemapView = new TreemapView(treemapEl);

    const donutCanvas = this.panel.querySelector('#dCvs');
    const legendEl = this.panel.querySelector('#legEl');
    if (donutCanvas && legendEl) this.chartView = new ChartView(donutCanvas, legendEl);
  }

  _initTabs() {
    this.panel.querySelectorAll('.tb').forEach(btn => {
      btn.addEventListener('click', () => {
        this.panel.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));
        this.panel.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        this.panel.querySelector('#tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  _initViewToggle() {
    const btns = this.panel.querySelectorAll('.vt-btn');
    const panels = this.panel.querySelectorAll('.view-panel');
    console.log('[dashboard] initViewToggle: buttons=', btns.length, 'panels=', panels.length);
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent drag from capturing
        const view = btn.dataset.view;
        console.log('[dashboard] view toggle clicked:', view);
        btns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = this.panel.querySelector('#view-' + view);
        console.log('[dashboard] target panel:', target ? 'found' : 'NOT FOUND');
        if (target) target.classList.add('active');
        this.currentView = view;
        if (this.currentView === 'cosmos' && this.cosmosView) this.cosmosView.start();
        else if (this.cosmosView) this.cosmosView.stop();
      });
    });
  }

  show(data) {
    if (!data) return;
    this.panel.style.display = 'block';

    // Update all views
    if (this.chartView) this.chartView.render(data);
    if (this.treemapView) this.treemapView.render(data);
    if (this.cosmosView) {
      this.cosmosView.init(data);
      if (this.currentView === 'cosmos') this.cosmosView.start();
    }

    // Stacked bar
    this._drawStackedBar(data);
    // Summary cards
    this._updateSummary(data);
    // Detail tabs
    this._fillDetails(data);
  }

  hide() {
    this.panel.style.display = 'none';
    if (this.cosmosView) this.cosmosView.stop();
  }

  _drawStackedBar(data) {
    const bar = this.panel.querySelector('#sBar');
    if (!bar) return;
    bar.innerHTML = '';
    const TOT = data.totalTokens;
    [...data.categories, data.freeSpace].forEach(c => {
      const pct = ((c.tokens || 0) / TOT) * 100;
      if (pct < 0.2) return;
      const s = document.createElement('div'); s.className = 'sbar-s';
      s.style.width = pct + '%'; s.style.background = c.color || '#222';
      s.title = `${c.name || 'Free Space'}: ${fmt(c.tokens)} (${pct.toFixed(1)}%)`;
      bar.appendChild(s);
    });
  }

  _updateSummary(data) {
    const cards = this.panel.querySelectorAll('.stat-card .sv');
    if (cards.length >= 4) {
      cards[0].textContent = fmt(data.freeSpace.tokens);
      cards[1].textContent = fmt(data.categories.find(c => c.key === 'autocompact')?.tokens || 0);
      cards[2].textContent = (data.mcpTools || []).length;
      cards[3].textContent = data.memoryFileDetails.length;
    }
  }

  _fillDetails(data) {
    const memL = this.panel.querySelector('#memL');
    const skL = this.panel.querySelector('#skL');
    const mcpL = this.panel.querySelector('#mcpL');

    if (memL) {
      const sorted = [...data.memoryFileDetails].sort((a, b) => b.tokens - a.tokens);
      const mx = Math.max(...sorted.map(m => m.tokens));
      memL.innerHTML = sorted.map(m =>
        `<div class="di"><span class="tr">\u2514</span><span class="nm">${m.path}</span>
         <div class="br"><div class="bf" style="width:${(m.tokens / mx) * 100}%;background:#FFB347"></div></div>
         <span class="tk">${fmt(m.tokens)}</span></div>`).join('');
    }

    if (skL) {
      const sorted = [...data.skillDetails].sort((a, b) => b.tokens - a.tokens);
      const mx = Math.max(...sorted.map(s => s.tokens));
      skL.innerHTML = sorted.map(s =>
        `<div class="di"><span class="tr">\u2514</span><span class="nm">${s.name}</span>
         <div class="br"><div class="bf" style="width:${(s.tokens / mx) * 100}%;background:#FF6B6B"></div></div>
         <span class="tk">${s.tokens}</span></div>`).join('');
    }

    if (mcpL) {
      const tools = [...(data.mcpTools || [])].sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
      const mxMcp = Math.max(...tools.map(t => t.tokens || 0), 1);
      mcpL.innerHTML = tools.map(t =>
        `<div class="di"><span class="tr">\u2514</span><span class="nm">${t.name || t}</span>
         ${t.tokens ? `<div class="br"><div class="bf" style="width:${(t.tokens / mxMcp) * 100}%;background:#2EE89E"></div></div>
         <span class="tk">${t.tokens}</span>` : ''}</div>`).join('');
    }
  }
}
