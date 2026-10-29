// Canvas-drawn textures: wallpaper, floors, stone, books and the portrait frames.
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
};

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

/** Loads a portrait image into a framed canvas; `scratched` draws gouges over the face. */
export function portrait(url, { scratched = false, label = '' } = {}) {
  const W = 400, H = 500;
  const [c, ctx] = canvas(W);
  c.height = H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    ctx.fillStyle = '#2b1b0f'; ctx.fillRect(0, 0, W, H);
    // gilt frame
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#6b5122'); g.addColorStop(0.5, '#b8964c'); g.addColorStop(1, '#5a421a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a120a'; ctx.fillRect(26, 26, W - 52, H - 52);
    if (img) {
      const ar = img.width / img.height, boxAr = (W - 60) / (H - 60);
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ar > boxAr) { sw = img.height * boxAr; sx = (img.width - sw) / 2; } else { sh = img.width / boxAr; sy = (img.height - sh) * 0.2; }
      ctx.filter = 'sepia(0.55) contrast(1.05) brightness(0.85)';
      ctx.drawImage(img, sx, sy, sw, sh, 30, 30, W - 60, H - 60);
      ctx.filter = 'none';
    } else {
      // painted silhouette for halls without a supplied image
      ctx.fillStyle = '#3a2c1e'; ctx.fillRect(30, 30, W - 60, H - 60);
      ctx.fillStyle = '#120c07';
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.4, 62, 78, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.92, 140, 130, 0, Math.PI, 0); ctx.fill();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v; ctx.fillRect(30, 30, W - 60, H - 60);
    if (scratched) {
      const r = rng(99);
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = i % 3 ? 'rgba(20,10,5,0.9)' : 'rgba(230,210,180,0.7)';
        ctx.lineWidth = 2 + r() * 4;
        ctx.beginPath();
        const x = W * 0.3 + r() * W * 0.4, y = H * 0.18 + r() * H * 0.15;
        ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 120, y + 60 + r() * 90);
        ctx.stroke();
      }
    }
    if (label) {
      ctx.fillStyle = '#c9a85a'; ctx.fillRect(W / 2 - 80, H - 24, 160, 18);
      ctx.fillStyle = '#2a1a08'; ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, H - 10);
    }
    t.needsUpdate = true;
  };
  draw(null);
  if (url) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = url;
  }
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
