// Canvas-drawn textures: panelled walls, floors, stone, books, foliage, portraits and paintings.
// Each texture records how many metres one repeat covers (userData.scale) so the
// house builder can map it in world space.

import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, scale) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.scale = scale;
  return t;
}

function grime(ctx, size, r, amount = 0.08, dark = '0,0,0') {
  for (let i = 0; i < size * 1.5; i++) {
    ctx.fillStyle = `rgba(${dark},${r() * amount})`;
    const s = r() * 3 + 1;
    ctx.fillRect(r() * size, r() * size, s, s);
  }
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

const painters = {
  damask(ctx, s, r, [base, pat]) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = pat;
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      const cx = x * s / 2 + (y % 2 ? s / 4 : 0) + s / 8;
      const cy = y * s / 2 + s / 4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s / 14, s / 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx, cy - s / 7, s / 22, s / 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - s / 9, cy); ctx.quadraticCurveTo(cx, cy - s / 10, cx + s / 9, cy); ctx.lineWidth = 3; ctx.strokeStyle = pat; ctx.stroke();
    }
    grime(ctx, s, r, 0.12);
  },
  stripes(ctx, s, r, [a, b]) {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i * s / 8, 0, s / 8, s); }
    grime(ctx, s, r, 0.1);
  },
  birds(ctx, s, r) {
    ctx.fillStyle = '#c9a94a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = r() * s, y = r() * s, k = 6 + r() * 6;
      ctx.strokeStyle = ['#5d6b3a', '#7a4b2c', '#3f5a63'][i % 3];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - k, y); ctx.quadraticCurveTo(x - k / 2, y - k * 0.7, x, y);
      ctx.quadraticCurveTo(x + k / 2, y - k * 0.7, x + k, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(80,60,20,0.25)';
      ctx.beginPath(); ctx.arc(x + r() * 20 - 10, y + 14, 2, 0, Math.PI * 2); ctx.fill();
    }
    grime(ctx, s, r, 0.2, '60,40,10');
  },
  nursery(ctx, s, r) {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#b9c4c9' : '#cdd3cf'; ctx.fillRect(i * s / 8, 0, s / 8, s); }
    ctx.fillStyle = '#e8e2c4';
    for (let i = 0; i < 16; i++) {
      const x = r() * s, y = r() * s;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, rad = k % 2 ? 2.5 : 6;
        ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      ctx.fill();
    }
    grime(ctx, s, r, 0.18);
  },
  panel(ctx, s, r, [base = '#4a2e1c']) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2; i++) {
      const x = i * s / 2 + 12;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 6;
      ctx.strokeRect(x, 14, s / 2 - 24, s - 28);
      ctx.strokeStyle = 'rgba(255,220,170,0.12)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, 18, s / 2 - 32, s - 36);
    }
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(20,10,0,${r() * 0.15})`;
      ctx.beginPath(); const y = r() * s; ctx.moveTo(0, y); ctx.lineTo(s, y + r() * 6 - 3); ctx.stroke();
    }
  },
  wood(ctx, s, r, [base = '#5a3a22']) {
    const planks = 6;
    for (let i = 0; i < planks; i++) {
      const shade = 0.8 + r() * 0.35;
      ctx.fillStyle = base; ctx.fillRect(0, i * s / planks, s, s / planks);
      ctx.fillStyle = `rgba(${shade > 1 ? '255,230,200' : '0,0,0'},${Math.abs(1 - shade) * 0.6})`;
      ctx.fillRect(0, i * s / planks, s, s / planks);
      for (let k = 0; k < 14; k++) {
        ctx.strokeStyle = `rgba(30,15,5,${0.08 + r() * 0.12})`;
        ctx.beginPath(); const y = i * s / planks + r() * s / planks; ctx.moveTo(0, y); ctx.bezierCurveTo(s / 3, y + r() * 4 - 2, s * 2 / 3, y + r() * 4 - 2, s, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, i * s / planks, s, 2);
      const seam = r() * s; ctx.fillRect(seam, i * s / planks, 2, s / planks);
    }
    grime(ctx, s, r, 0.1);
  },
  checker(ctx, s, r, [a, b]) {
    const n = 4;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { ctx.fillStyle = (x + y) % 2 ? a : b; ctx.fillRect(x * s / n, y * s / n, s / n, s / n); }
    grime(ctx, s, r, 0.18);
  },
  tiles(ctx, s, r, [tile, grout, n = 8]) {
    ctx.fillStyle = grout; ctx.fillRect(0, 0, s, s);
    const k = s / n;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      ctx.fillStyle = tile; ctx.fillRect(x * k + 1.5, y * k + 1.5, k - 3, k - 3);
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.08})`; ctx.fillRect(x * k + 1.5, y * k + 1.5, k - 3, k - 3);
    }
    grime(ctx, s, r, 0.12);
  },
  carpet(ctx, s, r, [base, edge]) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = edge; ctx.lineWidth = 6;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(s / 2, s / 2, 20 + i * 26, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(0,0,0,${r() * 0.12})`; ctx.fillRect(r() * s, r() * s, 1, 1); }
  },
  plaster(ctx, s, r, [base = '#bdb3a0']) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    grime(ctx, s, r, 0.14);
    ctx.strokeStyle = 'rgba(40,30,20,0.25)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); let x = r() * s, y = r() * s; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) ctx.lineTo(x += r() * 20 - 10, y += r() * 20 - 10); ctx.stroke(); }
  },
  stone(ctx, s, r, [base = '#58544d']) {
    ctx.fillStyle = '#2a2724'; ctx.fillRect(0, 0, s, s);
    const rows = 5;
    for (let y = 0; y < rows; y++) {
      let x = y % 2 ? -s / 8 : 0;
      while (x < s) {
        const w = s / 4 + r() * s / 8;
        const v = 0.75 + r() * 0.3;
        ctx.fillStyle = base; ctx.globalAlpha = 1; ctx.fillRect(x + 2, y * s / rows + 2, w - 4, s / rows - 4);
        ctx.fillStyle = `rgba(0,0,0,${1 - v})`; ctx.fillRect(x + 2, y * s / rows + 2, w - 4, s / rows - 4);
        x += w;
      }
    }
    grime(ctx, s, r, 0.25, '20,30,10');
  },
  flagstone(ctx, s, r) { painters.stone(ctx, s, r, ['#4b4741']); },
  brick(ctx, s, r) {
    ctx.fillStyle = '#2b201b'; ctx.fillRect(0, 0, s, s);
    const rows = 12, w = s / 4;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 5; x++) {
      ctx.fillStyle = `hsl(${8 + r() * 10},${25 + r() * 15}%,${18 + r() * 8}%)`;
      ctx.fillRect(x * w + (y % 2) * w / 2 + 2, y * s / rows + 2, w - 4, s / rows - 4);
    }
    grime(ctx, s, r, 0.3, '10,20,10');
  },
  grass(ctx, s, r) {
    ctx.fillStyle = '#1d2618'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      ctx.strokeStyle = `hsla(${80 + r() * 30},${20 + r() * 20}%,${10 + r() * 15}%,0.8)`;
      const x = r() * s, y = r() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r() * 4 - 2, y - 3 - r() * 5); ctx.stroke();
    }
  },
  glass(ctx, s, r) {
    ctx.fillStyle = '#1c2422'; ctx.fillRect(0, 0, s, s);
    const n = 3;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const g = ctx.createLinearGradient(x * s / n, y * s / n, (x + 1) * s / n, (y + 1) * s / n);
      g.addColorStop(0, '#2f3d3b'); g.addColorStop(0.5, '#41524f'); g.addColorStop(1, '#253230');
      ctx.fillStyle = g; ctx.fillRect(x * s / n + 5, y * s / n + 5, s / n - 10, s / n - 10);
    }
    grime(ctx, s, r, 0.3, '30,40,20');
  },
  books(ctx, s, r) {
    ctx.fillStyle = '#21140c'; ctx.fillRect(0, 0, s, s);
    const shelves = 4;
    for (let sh = 0; sh < shelves; sh++) {
      const top = sh * s / shelves + 6, h = s / shelves - 14;
      let x = 4;
      while (x < s - 4) {
        const w = 6 + r() * 10, bh = h * (0.7 + r() * 0.3);
        ctx.fillStyle = `hsl(${r() * 40 + (r() > 0.5 ? 0 : 200)},${30 + r() * 30}%,${14 + r() * 16}%)`;
        ctx.fillRect(x, top + h - bh, w - 1, bh);
        ctx.fillStyle = 'rgba(220,190,120,0.35)'; ctx.fillRect(x + 1, top + h - bh + 6, w - 3, 2);
        x += w;
      }
      ctx.fillStyle = '#3a2416'; ctx.fillRect(0, top + h, s, 8);
    }
  },
  fabric(ctx, s, r, [base]) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`; ctx.fillRect(r() * s, r() * s, 2, 1); }
  },
  boards(ctx, s, r) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(s / 2, i * s / 5 + s / 10); ctx.rotate((r() - 0.5) * 0.25);
      ctx.fillStyle = `hsl(25,${25 + r() * 10}%,${18 + r() * 8}%)`; ctx.fillRect(-s / 2 - 10, -s / 14, s + 20, s / 7);
      ctx.fillStyle = '#777'; ctx.fillRect(-s / 2 + 6, -3, 5, 5); ctx.fillRect(s / 2 - 12, -3, 5, 5);
      ctx.restore();
    }
  },
  roses(ctx, s, r, [bloom = '#8a1420']) {
    ctx.fillStyle = '#16200f'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `hsl(${95 + r() * 30},${25 + r() * 20}%,${8 + r() * 12}%)`;
      ctx.beginPath(); ctx.ellipse(r() * s, r() * s, 6 + r() * 6, 3 + r() * 3, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 18; i++) {
      const x = r() * s, y = r() * s, rad = 7 + r() * 6;
      ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, rad * 0.55, 0.5, 5.5); ctx.stroke();
    }
  },
  plain(ctx, s, r, [base]) { ctx.fillStyle = base; ctx.fillRect(0, 0, s, s); grime(ctx, s, r, 0.08); },

  // A whole wall, floor to ceiling, one repeat = 3.4 m (the storey height): skirting,
  // raised-panel wainscot, chair rail, framed wallpaper (or tall panels), frieze.
  manor(ctx, s, r, [base, pat, wood = '#2a1a10', motif = 'damask', gild = '#9a7a3a']) {
    const Y = (m) => Math.round(s - (m / 3.4) * s);
    const px = s / 1024;
    if (motif === 'wood') {
      woodGrain(ctx, 0, 0, s, s, wood, r, true);
      const pw = s / 4;
      for (let i = 0; i < 4; i++) raisedPanel(ctx, i * pw + pw * 0.07, Y(2.78), pw * 0.86, Y(1.12) - Y(2.78), wood, r);
    } else {
      const ts = Math.round(s / 4);
      const [tc, tctx] = canvas(ts);
      painters[motif](tctx, ts, rng(ts + motif.length), [base, pat]);
      ctx.fillStyle = ctx.createPattern(tc, 'repeat');
      ctx.fillRect(0, 0, s, Y(0.9));
      // framed panels on the paper, three per repeat
      for (let i = 0; i < 3; i++) {
        const x = i * s / 3 + s * 0.03, w = s / 3 - s * 0.06, y = Y(2.74), h = Y(1.2) - Y(2.74);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 7 * px; ctx.strokeRect(x, y, w, h);
        ctx.globalAlpha = 0.5; ctx.strokeStyle = gild; ctx.lineWidth = 2.5 * px; ctx.strokeRect(x + 5 * px, y + 5 * px, w - 10 * px, h - 10 * px); ctx.globalAlpha = 1;
      }
      decay(ctx, s, r, Y(2.9), Y(1.02));
    }
    // frieze with a row of dentils
    woodGrain(ctx, 0, 0, s, Y(2.86), shade(wood, -0.15), r);
    const dy = Y(3.02), dh = Y(2.94) - Y(3.02);
    for (let x = 0; x < s; x += 22 * px) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 12 * px, dy, 10 * px, dh); ctx.fillStyle = 'rgba(255,220,170,0.08)'; ctx.fillRect(x, dy, 3 * px, dh); }
    moulding(ctx, Y(2.9), Y(2.84) - Y(2.9), wood, s, r);
    // chair rail
    moulding(ctx, Y(1.03), Y(0.93) - Y(1.03), wood, s, r);
    // wainscot: six raised panels per repeat
    woodGrain(ctx, 0, Y(0.93), s, Y(0) - Y(0.93), wood, r, true);
    const pw = s / 6;
    for (let i = 0; i < 6; i++) raisedPanel(ctx, i * pw + pw * 0.08, Y(0.86), pw * 0.84, Y(0.26) - Y(0.86), wood, r);
    // skirting
    moulding(ctx, Y(0.2), Y(0) - Y(0.2), shade(wood, -0.35), s, r);
    // grime: dark at the floor and up under the ceiling
    let g = ctx.createLinearGradient(0, Y(0.5), 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, Y(0.5), s, s - Y(0.5));
    g = ctx.createLinearGradient(0, 0, 0, Y(2.4));
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, Y(2.4));
  },
  parquet(ctx, s, r, [base = '#4a2e1b']) {
    // Basket-weave blocks of three planks, worn and dusty
    const n = 8, c = s / n;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const across = (x + y) % 2 === 0;
      for (let k = 0; k < 3; k++) {
        const v = (r() - 0.5) * 0.25;
        const [px, py, pw, ph] = across ? [x * c, y * c + k * c / 3, c, c / 3] : [x * c + k * c / 3, y * c, c / 3, c];
        woodGrain(ctx, px, py, pw, ph, shade(base, v), r, !across);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = r() * s, y = r() * s, rad = s * (0.08 + r() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(150,130,100,${0.05 + r() * 0.08})`); g.addColorStop(1, 'rgba(150,130,100,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    grime(ctx, s, r, 0.12);
  },
  coffer(ctx, s, r, [wood = '#21140b', inner = '#2b1f17']) {
    woodGrain(ctx, 0, 0, s, s, wood, r);
    const n = 2, c = s / n, b = c * 0.13;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const x0 = x * c + b, y0 = y * c + b, w = c - 2 * b;
      for (let k = 0; k < 3; k++) {
        const inset = k * b * 0.28;
        ctx.fillStyle = shade(inner, -0.1 * k);
        ctx.fillRect(x0 + inset, y0 + inset, w - 2 * inset, w - 2 * inset);
        ctx.strokeStyle = k === 2 ? 'rgba(170,130,60,0.35)' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
        ctx.strokeRect(x0 + inset, y0 + inset, w - 2 * inset, w - 2 * inset);
      }
      const cx = x * c + c / 2, cy = y * c + c / 2;
      ctx.fillStyle = 'rgba(150,115,55,0.35)';
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * c * 0.06, cy + Math.sin(a) * c * 0.06, c * 0.05, c * 0.02, a, 0, Math.PI * 2); ctx.fill(); }
    }
    grime(ctx, s, r, 0.2);
  },
  gilt(ctx, s, r) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#5c4319'); g.addColorStop(0.35, '#a3823f'); g.addColorStop(0.6, '#6e5222'); g.addColorStop(1, '#8f7034');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '255,230,160' : '30,20,5'},${r() * 0.25})`;
      ctx.beginPath(); ctx.arc(r() * s, r() * s, 2 + r() * 6, 0, Math.PI * 2); ctx.fill();
    }
    grime(ctx, s, r, 0.35);
  },
  velvet(ctx, s, r, [base = '#3a1416']) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x++) {
      const v = Math.sin((x / s) * Math.PI * 2 * 5 + Math.sin(x * 0.05) * 0.6);
      ctx.fillStyle = v > 0 ? `rgba(255,200,180,${v * 0.1})` : `rgba(0,0,0,${-v * 0.5})`;
      ctx.fillRect(x, 0, 1, s);
    }
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(120,110,90,0)'); g.addColorStop(1, 'rgba(120,110,90,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  },
  runner(ctx, s, r, [base = '#4a1012', line = '#8a6a30']) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = line; ctx.globalAlpha = 0.35; ctx.lineWidth = s / 64;
    const n = 4, c = s / n;
    for (let x = 0; x <= n; x++) for (let y = 0; y <= n; y++) {
      ctx.beginPath(); ctx.moveTo(x * c, y * c - c / 2); ctx.lineTo(x * c + c / 2, y * c); ctx.lineTo(x * c, y * c + c / 2); ctx.lineTo(x * c - c / 2, y * c); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(0,0,0,${r() * 0.15})`; ctx.fillRect(r() * s, r() * s, 1, 1); }
    grime(ctx, s, r, 0.15);
  },
  sheet(ctx, s, r) {
    ctx.fillStyle = '#9c968a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(${r() > 0.5 ? '255,255,245' : '40,35,30'},${0.05 + r() * 0.1})`;
      ctx.lineWidth = 2 + r() * 8;
      ctx.beginPath(); const x = r() * s; ctx.moveTo(x, 0); ctx.bezierCurveTo(x + r() * 60 - 30, s / 3, x + r() * 60 - 30, s * 2 / 3, x + r() * 40 - 20, s); ctx.stroke();
    }
    grime(ctx, s, r, 0.25, '50,40,25');
  },
  bark(ctx, s, r, [base = '#2a221b']) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(${r() > 0.6 ? '120,110,95' : '5,4,3'},${0.2 + r() * 0.4})`;
      ctx.lineWidth = 1 + r() * 4;
      ctx.beginPath(); let x = r() * s, y = -10; ctx.moveTo(x, y);
      while (y < s + 10) { y += 10 + r() * 20; x += r() * 8 - 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  gravel(ctx, s, r) {
    ctx.fillStyle = '#3b3833'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const v = 30 + r() * 50;
      ctx.fillStyle = `rgb(${v + 6},${v + 3},${v})`;
      ctx.beginPath(); ctx.ellipse(r() * s, r() * s, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    grime(ctx, s, r, 0.3, '10,15,5');
  },
  // Transparent sprites for foliage (no background)
  leaves(ctx, s, r, [c1 = '#16230f', c2 = '#3a4d22', count = 70, size = 1]) {
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s * 0.4;
      const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
      const L = s * (0.07 + r() * 0.06) * size, W = L * (0.35 + r() * 0.15);
      const rot = a + (r() - 0.5) * 1.2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = mix(c1, c2, (1 - d / (s * 0.4)) * 0.6 + r() * 0.4);
      ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -W, L / 2, 0); ctx.quadraticCurveTo(0, W, -L / 2, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
      ctx.restore();
    }
  },
  blades(ctx, s, r) {
    for (let i = 0; i < 46; i++) {
      const x = s * (0.2 + r() * 0.6), h = s * (0.45 + r() * 0.5), lean = (r() - 0.5) * s * 0.5, w = 2 + r() * 4;
      ctx.fillStyle = mix('#1a2412', r() > 0.75 ? '#6b6a3a' : '#33441f', r());
      ctx.beginPath(); ctx.moveTo(x - w, s); ctx.quadraticCurveTo(x + lean * 0.3, s - h * 0.6, x + lean, s - h); ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.5, s - h * 0.6, x + w, s); ctx.fill();
    }
  },
  fern(ctx, s, r) {
    ctx.strokeStyle = '#2a3a18'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s / 2, s); ctx.quadraticCurveTo(s * 0.52, s * 0.5, s / 2, 4); ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const t = i / 26, y = s - t * (s - 8), L = s * 0.32 * Math.sin(Math.PI * (0.15 + t * 0.85));
      for (const side of [-1, 1]) {
        ctx.fillStyle = mix('#1d2c12', '#45602a', r());
        ctx.beginPath(); ctx.moveTo(s / 2, y); ctx.quadraticCurveTo(s / 2 + side * L * 0.6, y - 10, s / 2 + side * L, y - 4 - t * 6); ctx.quadraticCurveTo(s / 2 + side * L * 0.5, y + 3, s / 2, y + 2); ctx.fill();
      }
    }
  },
};

function shade(hex, v) {
  const c = new THREE.Color(hex);
  if (v >= 0) c.lerp(new THREE.Color(1, 0.9, 0.75), v); else c.multiplyScalar(1 + v);
  return `#${c.getHexString()}`;
}

function mix(a, b, t) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHexString()}`;
}

function woodGrain(ctx, x, y, w, h, base, r, vertical = false) {
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  const n = Math.max(4, Math.floor((vertical ? w : h) / 2.5));
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = `rgba(${r() > 0.5 ? '255,225,190' : '15,8,2'},${0.03 + r() * 0.07})`;
    ctx.lineWidth = 0.8 + r() * 1.2;
    ctx.beginPath();
    if (vertical) {
      const gx = x + r() * w;
      ctx.moveTo(gx, y); ctx.bezierCurveTo(gx + r() * 4 - 2, y + h / 3, gx + r() * 4 - 2, y + (2 * h) / 3, gx + r() * 3 - 1.5, y + h);
    } else {
      const gy = y + r() * h;
      ctx.moveTo(x, gy); ctx.bezierCurveTo(x + w / 3, gy + r() * 4 - 2, x + (2 * w) / 3, gy + r() * 4 - 2, x + w, gy + r() * 3 - 1.5);
    }
    ctx.stroke();
  }
}

function raisedPanel(ctx, x, y, w, h, base, r) {
  const b = Math.max(3, Math.round(Math.min(w, h) * 0.09));
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, h);
  woodGrain(ctx, x + b * 0.4, y + b * 0.4, w - b * 0.8, h - b * 0.8, shade(base, -0.1), r, true);
  ctx.fillStyle = 'rgba(255,215,160,0.1)';
  ctx.fillRect(x + b * 0.4, y + b * 0.4, w - b * 0.8, b); ctx.fillRect(x + b * 0.4, y + b * 0.4, b, h - b * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x + b * 0.4, y + h - b * 1.4, w - b * 0.8, b); ctx.fillRect(x + w - b * 1.4, y + b * 0.4, b, h - b * 0.8);
  woodGrain(ctx, x + b * 1.6, y + b * 1.6, w - b * 3.2, h - b * 3.2, shade(base, 0.04), r, true);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.strokeRect(x + b * 1.6, y + b * 1.6, w - b * 3.2, h - b * 3.2);
}

function moulding(ctx, y, h, base, s, r) {
  woodGrain(ctx, 0, y, s, h, base, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,220,170,0.2)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, y, s, h);
}

// Water stains running down from the ceiling, peeling paper and mould.
function decay(ctx, s, r, y0, y1) {
  for (let i = 0; i < 14; i++) {
    const x = r() * s, w = 3 + r() * s * 0.02, len = (y1 - y0) * (0.2 + r() * 0.8);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(25,18,10,${0.2 + r() * 0.25})`); g.addColorStop(1, 'rgba(25,18,10,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, w, len);
  }
  for (let i = 0; i < 4; i++) {
    const cx = r() * s, cy = y0 + r() * (y1 - y0), rad = s * (0.02 + r() * 0.04);
    ctx.fillStyle = '#5f5546';
    ctx.beginPath();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, d = rad * (0.5 + r() * 0.7); ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 1.4); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = r() * s, y = y0 + r() * (y1 - y0) * 0.3, rad = s * (0.04 + r() * 0.08);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(10,14,6,0.45)'); g.addColorStop(1, 'rgba(10,14,6,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** Get (cached) texture by painter name and arguments; `scale` is metres per repeat. */
export function tex(kind, args = [], scale = 2, size = 256) {
  const key = `${kind}|${args.join(',')}|${scale}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(size);
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  painters[kind](ctx, size, rng(seed), args);
  const t = finish(c, scale);
  cache.set(key, t);
  return t;
}

/**
 * A photograph for a 3D frame: sepia, vignette and grime. userData.ready resolves once the
 * image has loaded; userData.toCanvas(x, y) maps a pixel of the source image onto the canvas.
 */
export function portrait(url, { W = 512, H = 640 } = {}) {
  const [c, ctx] = canvas(W);
  c.height = H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.canvas = c;
  ctx.fillStyle = '#1a120a'; ctx.fillRect(0, 0, W, H);
  t.userData.ready = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ar = img.width / img.height, boxAr = W / H;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ar > boxAr) { sw = img.height * boxAr; sx = (img.width - sw) / 2; } else { sh = img.width / boxAr; sy = (img.height - sh) * 0.2; }
      ctx.filter = 'sepia(0.55) contrast(1.08) brightness(0.82)';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      ctx.filter = 'none';
      const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.78);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      const k = W / sw;
      t.userData.toCanvas = (x, y) => [(x - sx) * k, (y - sy) * k, k];
      t.needsUpdate = true;
      resolve(t);
    };
    img.src = url;
  });
  return t;
}

/** Old oil paintings with no people in them: a moonlit moor, a storm at sea, the manor itself. */
export function painting(kind) {
  const W = 384, H = 288;
  const [c, ctx] = canvas(W);
  c.height = H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const r = rng(kind.length * 977);
  const look = kind.startsWith('moor') ? 'moor' : kind;
  const varnish = () => {
    ctx.fillStyle = 'rgba(120,85,20,0.22)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6;
    for (let i = 0; i < 90; i++) { ctx.beginPath(); let x = r() * W, y = r() * H; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) ctx.lineTo(x += r() * 24 - 12, y += r() * 24 - 12); ctx.stroke(); }
    const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    t.needsUpdate = true;
  };
  if (look === 'manor') {
    ctx.fillStyle = '#1a1612'; ctx.fillRect(0, 0, W, H);
    const img = new Image();
    img.onload = () => {
      ctx.filter = 'sepia(0.6) contrast(1.15) brightness(0.8) blur(0.6px)';
      const sh = img.width * (H / W);
      ctx.drawImage(img, 0, (img.height - sh) * 0.3, img.width, sh, 0, 0, W, H);
      ctx.filter = 'none';
      varnish();
    };
    img.src = 'assets/manor.jpg';
    return t;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, look === 'moor' ? '#151c22' : '#1b2228'); sky.addColorStop(1, look === 'moor' ? '#3a3a30' : '#4a4c44');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${r() > 0.5 ? '90,95,90' : '10,12,14'},${0.15 + r() * 0.2})`;
    ctx.beginPath(); ctx.ellipse(r() * W, r() * H * 0.5, 30 + r() * 70, 8 + r() * 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (look === 'moor') {
    const g = ctx.createRadialGradient(W * 0.72, H * 0.24, 2, W * 0.72, H * 0.24, 50);
    g.addColorStop(0, 'rgba(230,220,180,0.95)'); g.addColorStop(0.2, 'rgba(200,190,150,0.5)'); g.addColorStop(1, 'rgba(200,190,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const [y, col] of [[0.62, '#202418'], [0.72, '#171a12'], [0.84, '#0e100b']]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * y + Math.sin(x * 0.02 + y * 9) * 14 + r() * 4);
      ctx.lineTo(W, H); ctx.fill();
    }
    // a dead tree on the rise
    ctx.strokeStyle = '#080806'; ctx.lineCap = 'round';
    const branch = (x, y, a, len, w) => {
      if (len < 4) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      branch(x2, y2, a - 0.3 - r() * 0.4, len * 0.72, w * 0.68);
      branch(x2, y2, a + 0.25 + r() * 0.4, len * 0.66, w * 0.66);
    };
    branch(W * 0.3, H * 0.66, -Math.PI / 2, 42, 7);
  } else {
    ctx.fillStyle = '#0f1310'; ctx.beginPath(); ctx.moveTo(0, H * 0.35); ctx.lineTo(W * 0.22, H * 0.4); ctx.lineTo(W * 0.3, H); ctx.lineTo(0, H); ctx.fill();
    for (let y = H * 0.55; y < H; y += 6) {
      ctx.strokeStyle = `rgba(${r() > 0.7 ? '170,175,160' : '20,28,30'},${0.3 + r() * 0.4})`;
      ctx.lineWidth = 1 + r() * 3; ctx.beginPath(); ctx.moveTo(W * 0.25, y);
      for (let x = W * 0.25; x < W; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.07 + y) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#d8d0b0'; ctx.fillRect(W * 0.1, H * 0.25, 5, 22);
  }
  varnish();
  return t;
}

/** An engraved brass name plate for under a portrait. */
export function plaque(text) {
  const W = 512, H = 80;
  const [c, ctx] = canvas(W);
  c.height = H;
  const draw = () => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#c9a65a'); g.addColorStop(0.5, '#8a6a2c'); g.addColorStop(1, '#5e4519');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(40,25,5,0.8)'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, W - 12, H - 12);
    let size = 36;
    ctx.font = `${size}px 'IM Fell English', Georgia, serif`;
    while (ctx.measureText(text).width > W - 40 && size > 18) ctx.font = `${--size}px 'IM Fell English', Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,235,180,0.5)'; ctx.fillText(text, W / 2 + 1, H / 2 + 2);
    ctx.fillStyle = '#2a1a06'; ctx.fillText(text, W / 2, H / 2);
    t.needsUpdate = true;
  };
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  draw();
  document.fonts?.load(`36px 'IM Fell English'`).then(draw).catch(() => {});
  return t;
}

/** Text drawn on a transparent canvas, used for name tags and ping labels. */
export function label(text, color = '#fff', size = 48) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${size}px 'Special Elite', monospace`;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  c.width = w; c.height = size + 20;
  ctx.font = `${size}px 'Special Elite', monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, c.height);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.aspect = w / c.height;
  return t;
}
