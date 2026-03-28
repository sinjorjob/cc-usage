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
    const TOT = data.totalTokens;
    const maxTokens = Math.max(...cats.map(c => c.tokens));
    const BASE_R = 22, MAX_R = 150;

    function tokenToRadius(tokens) {
      return BASE_R + (MAX_R - BASE_R) * Math.pow(tokens / maxTokens, 0.5);
    }

    const sorted = [...cats].sort((a, b) => b.tokens - a.tokens);
    const placed = [];
    const oc = this.orbitCenter;

    // Largest at center
    placed.push({ ...sorted[0], x: oc.x, y: oc.y, r: tokenToRadius(sorted[0].tokens) });

    // Rest at equal angles
    const others = sorted.slice(1);
    for (let i = 0; i < others.length; i++) {
      const c = others[i];
      const r = tokenToRadius(c.tokens);
      const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
      const dist = placed[0].r + r + 50 + r * 0.5;
      placed.push({
        ...c, r,
        x: oc.x + Math.cos(angle) * dist,
        y: oc.y + Math.sin(angle) * dist * 0.72,
      });
    }

    this.nebulae = placed.map((n, i) => {
      const dx = n.x - oc.x, dy = n.y - oc.y;
      const orbitRadius = Math.hypot(dx, dy);
      const orbitAngle0 = Math.atan2(dy, dx);
      const orbitSpeed = i === 0 ? 0.003 : 0.012 / (1 + i * 0.3);

      return {
        ...n, orbitRadius, orbitAngle0, orbitSpeed, orbitEllipse: 0.7,
        particles: Array.from({ length: Math.floor(n.r * 2.5) }, () => ({
          angle: Math.random() * Math.PI * 2,
          dist: Math.random(),
          speed: (Math.random() - 0.5) * 0.25,
          size: Math.random() * 2.5 + 0.5,
          brightness: Math.random() * 0.5 + 0.3,
        })),
        tendrils: n.r > 50 ? Array.from({ length: Math.floor(n.r / 8) }, () => ({
          angle: Math.random() * Math.PI * 2,
          length: 0.6 + Math.random() * 0.8,
          width: 2 + Math.random() * 4,
          curve: (Math.random() - 0.5) * 0.8,
          alpha: 0.04 + Math.random() * 0.08,
        })) : [],
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
      const orbAngle = n.orbitAngle0 + t * n.orbitSpeed;
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

    // Background
    const bg = ctx.createRadialGradient(CW * 0.35, CH * 0.45, 30, CW / 2, CH / 2, CW * 0.75);
    bg.addColorStop(0, 'rgba(22, 15, 35, 1)');
    bg.addColorStop(0.4, 'rgba(10, 8, 20, 1)');
    bg.addColorStop(1, 'rgba(4, 3, 10, 1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    // Ambient haze
    const hazeT = t * 0.03;
    const hazes = [
      { x: CW * 0.25, y: CH * 0.6, r: 250, color: '80, 40, 120', a: 0.018 },
      { x: CW * 0.7, y: CH * 0.3, r: 200, color: '30, 60, 100', a: 0.015 },
      { x: CW * 0.5, y: CH * 0.8, r: 180, color: '100, 50, 40', a: 0.012 },
    ];
    for (const hz of hazes) {
      const hx = hz.x + Math.sin(hazeT + hz.x * 0.01) * 20;
      const hy = hz.y + Math.cos(hazeT + hz.y * 0.01) * 15;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hz.r);
      hg.addColorStop(0, `rgba(${hz.color}, ${hz.a})`);
      hg.addColorStop(0.5, `rgba(${hz.color}, ${hz.a * 0.4})`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(hx, hy, hz.r, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
    }

    // Stars
    for (const s of this.stars) {
      const twinkle = Math.sin(t * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 210, 240, ${s.brightness * twinkle})`; ctx.fill();
    }

    // Dust
    for (const d of this.dust) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = CW; if (d.x > CW) d.x = 0;
      if (d.y < 0) d.y = CH; if (d.y > CH) d.y = 0;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 170, 200, ${d.alpha})`; ctx.fill();
    }

    // Ring gauge
    this._drawRingGauge(ctx, t, CW, CH, usedPct);

    // Nebulae
    if (!this._loggedOnce) {
      console.log('[cosmos] drawing nebulae:', this.nebulae.length);
      for (const nb of this.nebulae) {
        console.log(`  ${nb.name}: r=${nb.r.toFixed(0)} pos=(${nb.x.toFixed(0)},${nb.y.toFixed(0)}) color=${nb.color} orbit=${nb.orbitRadius.toFixed(0)}`);
      }
      this._loggedOnce = true;
    }
    // DEBUG: draw bright circles at nebula positions to verify rendering
    for (const n of this.nebulae) {
      const orbAngle = n.orbitAngle0 + t * n.orbitSpeed;
      const debugX = oc.x + Math.cos(orbAngle) * n.orbitRadius;
      const debugY = oc.y + Math.sin(orbAngle) * n.orbitRadius * n.orbitEllipse;
      ctx.beginPath();
      ctx.arc(debugX, debugY, 5, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();
    }

    for (const n of this.nebulae) {
      const breath = 1
        + Math.sin(t * 0.6 + n.pulseOffset) * 0.04
        + Math.sin(t * 1.1 + n.pulseOffset * 2.3) * 0.025
        + Math.sin(t * 0.25 + n.pulseOffset * 0.7) * 0.015;
      const r = n.r * breath;

      const orbAngle = n.orbitAngle0 + t * n.orbitSpeed;
      const nx = oc.x + Math.cos(orbAngle) * n.orbitRadius + Math.sin(t * 0.15 + n.pulseOffset) * 5;
      const ny = oc.y + Math.sin(orbAngle) * n.orbitRadius * n.orbitEllipse + Math.cos(t * 0.12 + n.pulseOffset) * 4;

      const coreBeat = 0.3 + Math.sin(t * 1.5 + n.pulseOffset) * 0.1
        + Math.max(0, Math.sin(t * 3.0 + n.pulseOffset)) * 0.15;

      // Halo (ethereal, translucent)
      const haloShift = Math.sin(t * 0.15 + n.pulseOffset) * r * 0.15;
      const halo = ctx.createRadialGradient(nx + haloShift, ny - haloShift * 0.5, r * 0.1, nx, ny, r * 2.2);
      halo.addColorStop(0, hexToRgba(n.color, 0.16));
      halo.addColorStop(0.3, hexToRgba(n.color, 0.07));
      halo.addColorStop(0.7, hexToRgba(n.color, 0.025));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(nx, ny, r * 2.2, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();

      // Tendrils
      for (const td of n.tendrils) {
        const ta = td.angle + Math.sin(t * 0.15 + td.angle) * 0.3;
        const sway = Math.sin(t * 0.4 + td.angle * 2) * 0.2;
        const curLen = td.length + Math.sin(t * 0.3 + td.angle) * 0.15;
        const sx = nx + Math.cos(ta) * r * 0.3, sy = ny + Math.sin(ta) * r * 0.3;
        const ex = nx + Math.cos(ta + sway) * r * curLen, ey = ny + Math.sin(ta + sway) * r * curLen;
        const cpx = (sx + ex) / 2 + Math.cos(ta + Math.PI / 2) * r * (td.curve + Math.sin(t * 0.5 + td.angle) * 0.2);
        const cpy = (sy + ey) / 2 + Math.sin(ta + Math.PI / 2) * r * (td.curve + Math.cos(t * 0.4 + td.angle) * 0.15);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpx, cpy, ex, ey);
        ctx.strokeStyle = hexToRgba(n.color, td.alpha * 1.5 + Math.sin(t * 0.8 + td.angle) * 0.03);
        ctx.lineWidth = td.width * (0.8 + Math.sin(t * 0.6 + td.angle) * 0.2);
        ctx.lineCap = 'round'; ctx.stroke();
      }

      // Gas cloud layers
      for (let layer = 0; layer < 5; layer++) {
        const lr = r * (0.95 - layer * 0.12);
        const rotSpeed = 0.06 + layer * 0.02;
        const la = layer * 0.8 + t * rotSpeed * (layer % 2 === 0 ? 1 : -1);
        const wobble = Math.sin(t * 0.3 + layer * 1.5 + n.pulseOffset) * r * 0.1;
        const ox = Math.cos(la) * (r * 0.06 * layer + wobble);
        const oy = Math.sin(la) * (r * 0.05 * layer + wobble * 0.7);
        const gas = ctx.createRadialGradient(nx + ox, ny + oy, 0, nx + ox, ny + oy, lr);
        const baseAlpha = (0.07 + (4 - layer) * 0.035) * (0.85 + Math.sin(t * 0.7 + layer + n.pulseOffset) * 0.15);
        gas.addColorStop(0, hexToRgba(n.color, baseAlpha * 1.5));
        gas.addColorStop(0.35, hexToRgba(n.color, baseAlpha * 0.7));
        gas.addColorStop(0.75, hexToRgba(n.color, baseAlpha * 0.2));
        gas.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(nx + ox, ny + oy, lr, 0, Math.PI * 2); ctx.fillStyle = gas; ctx.fill();
      }

      // Core (soft glow)
      const coreR = r * (0.15 + coreBeat * 0.1);
      const core = ctx.createRadialGradient(nx, ny, 0, nx, ny, coreR);
      core.addColorStop(0, hexToRgba('#ffffff', Math.min(0.6, coreBeat + 0.2)));
      core.addColorStop(0.3, hexToRgba(n.color, Math.min(0.7, coreBeat * 1.3)));
      core.addColorStop(1, hexToRgba(n.color, 0.0));
      ctx.beginPath(); ctx.arc(nx, ny, coreR, 0, Math.PI * 2); ctx.fillStyle = core; ctx.fill();

      // Particles
      for (const p of n.particles) {
        p.angle += p.speed * 0.012 * (0.7 + p.dist * 0.6);
        const ellipse = 0.7 + p.dist * 0.2;
        const pd = p.dist * r;
        const px = nx + Math.cos(p.angle) * pd;
        const py = ny + Math.sin(p.angle) * pd * ellipse;
        const distFromCenter = Math.hypot(px - nx, py - ny) / r;
        const twinkle = 0.6 + Math.sin(t * 3 + p.angle * 5) * 0.4;
        const pa = p.brightness * (1 - distFromCenter * 0.5) * twinkle;
        ctx.beginPath(); ctx.arc(px, py, p.size * (0.8 + Math.sin(t * 2 + p.angle) * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(n.color, pa); ctx.fill();
        if (p.size > 2 && p.brightness > 0.6) {
          const flareLen = p.size * (2 + Math.sin(t * 4 + p.angle) * 1);
          ctx.globalAlpha = pa * 0.35;
          ctx.beginPath();
          ctx.moveTo(px - flareLen, py); ctx.lineTo(px + flareLen, py);
          ctx.moveTo(px, py - flareLen); ctx.lineTo(px, py + flareLen);
          ctx.strokeStyle = hexToRgba(n.color, 0.7); ctx.lineWidth = 0.5; ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Territory ring
      const dashRot = t * 0.1 + n.pulseOffset;
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(dashRot);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(n.color, 0.05 + Math.sin(t * 0.5 + n.pulseOffset) * 0.02);
      ctx.lineWidth = 0.8; ctx.setLineDash([3, 10]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }

    // Shooting star
    if (Math.sin(t * 0.7) > 0.995) {
      const sx = Math.random() * CW * 0.6 + CW * 0.2, sy = Math.random() * CH * 0.3;
      const sLen = 30 + Math.random() * 50;
      const sGrad = ctx.createLinearGradient(sx, sy, sx + sLen, sy + sLen * 0.4);
      sGrad.addColorStop(0, 'rgba(255,255,255,0.6)'); sGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sLen, sy + sLen * 0.4);
      ctx.strokeStyle = sGrad; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // Title
    ctx.font = '600 20px "Noto Sans JP"';
    ctx.fillStyle = 'rgba(200, 220, 245, 0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u7A7A\u9593', CW / 2, 50);

    // Usage top-right
    ctx.font = '700 18px "Noto Sans JP"';
    ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(`\u4F7F\u7528\u7387 ${usedPct}%`, CW - 16, 28);
  }

  _drawRingGauge(ctx, t, CW, CH, usedPct) {
    const cx = CW / 2, cy = CH / 2;
    const rx = CW / 2 - 6, ry = CH / 2 - 6;

    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 3; ctx.stroke();

    const usedAngle = (usedPct / 100) * Math.PI * 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + usedAngle);
    const grad = ctx.createLinearGradient(0, 0, CW, 0);
    grad.addColorStop(0, 'rgba(74, 222, 128, 0.4)'); grad.addColorStop(1, 'rgba(210, 140, 80, 0.4)');
    ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.stroke();

    const dotAngle = -Math.PI / 2 + usedAngle;
    const dotX = cx + rx * Math.cos(dotAngle), dotY = cy + ry * Math.sin(dotAngle);
    ctx.beginPath(); ctx.arc(dotX, dotY, 4 + Math.sin(t * 3) * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.8)'; ctx.fill();

    ctx.font = '700 18px "Noto Sans JP"';
    ctx.fillStyle = 'rgba(74, 222, 128, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(`${usedPct}%`, dotX, dotY + 20);
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
