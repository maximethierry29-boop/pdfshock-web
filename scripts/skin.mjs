// Habillage pixel art des marges de index.html : sorcier en contre-plongée à gauche, PDF foudroyé à droite.
// Deux panneaux 160 × 270 affichés sans lissage, palette bleu nuit / cyan de la DA du site, tramage Bayer.
// Usage : npm run skin  → public/skin-left.png, public/skin-right.png (+ aperçus ×3 dans test/)
import * as mupdf from "mupdf";
import fs from "node:fs";

const W = 160, H = 270;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Palette alignée sur index.html (--bg #0a0e1c, --accent #4f9dff, --accent-cyan #9fe8ff).
const SKY = ["#04050b", "#070a16", "#0a0e1c", "#0f1630", "#152043", "#1c2a57", "#24376e", "#2f4788", "#3f60a8", "#5b84cc"].map(hex);
const ROCK = ["#020308", "#060811", "#0b0e1b", "#121728", "#1b2238", "#28314d"].map(hex);
const MOUNT = ["#070a16", "#0b1022", "#10172e"].map(hex);
const RIM = hex("#6fb4ff"), RIM_DIM = hex("#2a4378");
const BOLT_CORE = hex("#ffffff"), BOLT = hex("#c9f1ff"), BOLT_GLOW = hex("#4f9dff");

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const pick = (pal, v, x, y) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * (pal.length - 1) + dither(x, y))))];

function canvas(seedValue, glows) {
  const img = new Uint8Array(W * H * 3);
  let seed = seedValue;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const perm = Array.from({ length: 512 }, () => rand());
  const lattice = (x, y) => perm[(((x * 73 + y * 151) % 512) + 512) % 512];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const a = lattice(xi, yi), b = lattice(xi + 1, yi), c = lattice(xi, yi + 1), d = lattice(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  const fbm = (x, y, o = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * noise(x * f, y * f); f *= 2; a /= 2; } return v / (1 - 2 ** -o); };
  const glowAt = (x, y) => Math.min(1, glows.reduce((g, [gx, gy, r, k]) => g + k * Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / r), 0));
  const set = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) img.set(c, (y * W + x) * 3); };

  function fillPoly(pts, color, mask, id = 1) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) {
          set(x, y, typeof color === "function" ? color(x, y) : color);
          if (mask && x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = id;
        }
    }
  }

  // Bords d'un masque exposés vers le haut / les côtés : rim light.
  function rim(mask, id, threshold = 0.1) {
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++)
        if (mask[y * W + x] === id && (mask[(y - 1) * W + x] !== id || mask[y * W + x - 1] !== id || mask[y * W + x + 1] !== id))
          set(x, y, glowAt(x, y) > threshold ? RIM : RIM_DIM);
  }

  function sky() {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const g = glowAt(x, y);
        let v = 0.1 + 0.18 * (y / H) + 0.38 * g;
        const cloud = fbm(x / 60, y / 20 + 3) - 0.42 - 0.1 * (y / H);
        if (cloud > 0) v += Math.min(0.35, cloud * 1.6) * (0.3 + g) + 0.08 * fbm(x / 9, y / 5);
        else v -= 0.05;
        set(x, y, pick(SKY, v, x, y));
      }
  }

  function ridge(base, amp, scale, pal, off) {
    for (let x = 0; x < W; x++) {
      const top = Math.round(base - amp * (fbm(x / scale + off, off) - 0.3) - 8 * Math.abs(Math.sin((x / scale) * 2.3 + off)));
      for (let y = top; y < H; y++) set(x, y, y === top ? pick(SKY, 0.3 + glowAt(x, y), x, y) : pick(pal, 0.4 + 0.3 * fbm(x / 12, y / 12), x, y));
    }
  }

  const rockShade = (x, y) => pick(ROCK, 0.15 + 0.55 * (Math.floor(fbm(x / 14, y / 9) * 4) / 4) + 0.25 * glowAt(x, y), x, y);
  function rocks(polys) {
    const mask = new Uint8Array(W * H);
    for (const p of polys) fillPoly(p, rockShade, mask);
    for (let y = 1; y < H; y++)
      for (let x = 0; x < W; x++)
        if (mask[y * W + x] && !mask[(y - 1) * W + x] && rand() < 0.85) set(x, y, glowAt(x, y) > 0.08 ? RIM : RIM_DIM);
    for (let i = 0; i < 30; i++) {
      let x = rand() * W, y = H - 50 + rand() * 50;
      for (let s = 0; s < 8; s++) { if (mask[(y | 0) * W + (x | 0)]) set(x, y, ROCK[0]); x += rand() * 2 - 0.6; y += rand() * 2 - 1; }
    }
    return mask;
  }

  function line(x0, y0, x1, y1, fn) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  // Éclair : déplacement de point médian + ramifications.
  function bolt(x0, y0, x1, y1, disp, width, branches) {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = disp; d > 1.5; d /= 2) {
      const next = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const nx = -(by - ay), ny = bx - ax, len = Math.hypot(nx, ny) || 1, off = (rand() - 0.5) * d;
        next.push(pts[i], [(ax + bx) / 2 + (nx / len) * off, (ay + by) / 2 + (ny / len) * off]);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }
    const stroke = (fn) => { for (let i = 0; i < pts.length - 1; i++) line(...pts[i], ...pts[i + 1], fn); };
    stroke((x, y) => { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (rand() < 0.7) set(x + dx, y + dy, BOLT_GLOW); });
    if (width > 1) stroke((x, y) => { set(x + 1, y, BOLT); set(x, y + 1, BOLT); });
    stroke((x, y) => set(x, y, width > 1 ? BOLT_CORE : BOLT));
    for (let b = 0; b < branches; b++) {
      const [sx, sy] = pts[2 + Math.floor(rand() * (pts.length - 4))];
      const ang = Math.atan2(y1 - y0, x1 - x0) + (rand() - 0.5) * 1.6, len = 10 + rand() * 24;
      bolt(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, disp / 3, 1, 0);
    }
  }

  return { img, rand, fbm, glowAt, set, fillPoly, rim, sky, ridge, rocks, rockShade, bolt };
}

function save(c, name) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W, H], false);
  pix.getPixels().set(c.img);
  fs.writeFileSync(`public/${name}.png`, pix.asPNG());
  const S = 3, big = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W * S, H * S], false), bp = big.getPixels();
  for (let y = 0; y < H * S; y++)
    for (let x = 0; x < W * S; x++) {
      const i = (((y / S) | 0) * W + ((x / S) | 0)) * 3;
      bp.set(c.img.subarray(i, i + 3), (y * W * S + x) * 3);
    }
  fs.writeFileSync(`test/${name}-x3.png`, big.asPNG());
}

// ———————— Panneau gauche : le sorcier, bras levés, vu d'en bas ————————
{
  // Le sorcier est dessiné dans un repère « 300 × 180 » puis agrandi (k) et posé sur le rocher.
  const k = 1.15, CX = 80, FEET = 238;
  const T = ([x, y]) => [(x - 150) * k + CX, (y - 155) * k + FEET];
  const HANDS = [T([112, 30]), T([188, 30])];
  const c = canvas(1337, [...HANDS.map(([x, y]) => [x, y, 2400, 1]), [CX, 40, 6000, 0.35]]);
  const { set, fillPoly, rim, glowAt, fbm, rand } = c;

  c.sky();
  c.ridge(214, 36, 34, MOUNT.slice(1), 5);
  c.ridge(226, 20, 22, MOUNT, 11);
  c.rocks([
    [[0, 270], [0, 228], [12, 222], [26, 226], [40, 238], [52, 244], [66, 270]],
    [[30, 270], [46, 246], [64, 240], [84, 239], [106, 240], [124, 236], [142, 230], [160, 232], [160, 270]],
  ]);

  const wiz = new Uint8Array(W * H);
  const ROBE = ["#060810", "#0c1120", "#131a31", "#1c2645"].map(hex);
  const robe = (x, y) => pick(ROBE, 0.25 + 0.5 * fbm(x / 4, y / 20) + 0.15 * glowAt(x, y), x, y);
  const BEARD = ["#5f6a85", "#97a3bd", "#cfd8ea", "#f1f5fc"].map(hex);
  const beard = (x, y) => pick(BEARD, 0.4 + 0.5 * fbm(x / 2, y / 8) + 0.2 * glowAt(x, y) - (y - T([0, 78])[1]) / 80, x, y);
  const SKIN = ["#4e3a40", "#866262", "#bb8f84"].map(hex);
  const skin = (x, y) => pick(SKIN, 0.3 + 0.6 * glowAt(x, y), x, y);
  const poly = (pts, color, id = 1) => fillPoly(pts.map(T), color, wiz, id);

  poly([[122, 153], [128, 128], [134, 104], [138, 86], [150, 82], [162, 86], [168, 104], [176, 126], [186, 150], [176, 154], [150, 155]], robe);
  poly([[162, 88], [176, 100], [190, 126], [206, 148], [196, 150], [182, 146], [170, 120]], robe);
  poly([[138, 88], [128, 104], [116, 140], [112, 152], [124, 152]], robe);
  poly([[136, 88], [126, 70], [114, 42], [110, 38], [116, 36], [124, 50], [136, 72], [144, 84]], robe);
  poly([[164, 88], [174, 70], [186, 42], [190, 38], [184, 36], [176, 50], [164, 72], [156, 84]], robe);
  poly([[132, 82], [124, 64], [118, 56], [122, 78], [128, 92]], robe);
  poly([[168, 82], [176, 64], [182, 56], [178, 78], [172, 92]], robe);
  poly([[109, 38], [106, 30], [108, 29], [110, 33], [110, 27], [112, 27], [113, 32], [114, 28], [116, 29], [116, 37]], skin, 2);
  poly([[191, 38], [194, 30], [192, 29], [190, 33], [190, 27], [188, 27], [187, 32], [186, 28], [184, 29], [184, 37]], skin, 2);
  poly([[145, 64], [155, 64], [155, 71], [150, 74], [145, 71]], skin, 2);
  poly([[143, 72], [143, 63], [146, 59], [150, 58], [154, 59], [157, 63], [157, 72], [161, 92], [156, 86], [155, 65], [145, 65], [144, 86], [139, 92]], beard, 3);
  poly([[144, 71], [156, 71], [159, 82], [156, 96], [150, 112], [144, 96], [141, 82]], beard, 3);
  // Détails du visage (repère agrandi).
  const [ex, ey] = T([147, 67]), [ex2] = T([153, 67]);
  for (const x of [ex, ex2]) { set(x, ey - 1, BEARD[3]); set(x + 1, ey - 1, BEARD[3]); set(x, ey, hex("#0a0610")); }
  const [nx, ny] = T([150, 69]); set(nx, ny, SKIN[2]); set(nx, ny + 1, SKIN[1]);
  const [mx0, my] = T([146, 72]), [mx1] = T([154, 72]);
  for (let x = Math.round(mx0); x <= mx1; x++) set(x, my, BEARD[x % 2 ? 2 : 3]);
  // Plis de la robe.
  for (const [fx, spread] of [[140, -0.18], [146, -0.08], [155, 0.1], [161, 0.2], [170, 0.32]])
    for (let y = 100; y < 156; y += 0.5) {
      const [x, yy] = T([fx + (y - 100) * spread, y]).map(Math.round);
      if (wiz[yy * W + x] === 1 && c.rand() < 0.6) set(x, yy, ROBE[3]);
    }
  rim(wiz, 1, 0.12);

  // Rebord rocheux devant les pieds : renforce la contre-plongée.
  const lip = new Uint8Array(W * H);
  fillPoly([[22, 270], [40, 250], [62, 244], [84, 246], [104, 243], [124, 248], [146, 270]], c.rockShade, lip);
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (lip[y * W + x] && !lip[(y - 1) * W + x]) set(x, y, RIM_DIM);

  // Foudre qui descend dans les mains, et le grand éclair qui part vers la droite (vers le PDF).
  const [L, R] = HANDS;
  c.bolt(10, 0, L[0], L[1], 36, 1, 4);
  c.bolt(54, 0, L[0], L[1], 24, 1, 2);
  c.bolt(118, 0, R[0], R[1], 26, 1, 3);
  c.bolt(160, 20, R[0], R[1], 30, 1, 2);
  c.bolt(R[0], R[1], 160, 70, 22, 2, 2);
  save(c, "skin-left");
}

// ———————— Panneau droit : l'icône PDF foudroyée ————————
{
  const IMPACT = [76, 108];
  const c = canvas(4242, [[IMPACT[0], IMPACT[1], 2600, 1], [0, 60, 2000, 0.5]]);
  const { set, fillPoly, rand } = c;

  c.sky();
  c.ridge(208, 34, 30, MOUNT.slice(1), 3);
  c.ridge(222, 22, 20, MOUNT, 9);
  const rockMask = c.rocks([
    [[0, 270], [0, 236], [20, 230], [40, 236], [58, 228], [80, 224], [104, 230], [126, 222], [146, 228], [160, 224], [160, 270]],
    [[90, 270], [108, 248], [132, 242], [160, 246], [160, 270]],
  ]);

  // Halo tramé derrière la page.
  const PX = 50, PY = 110, PW = 54, PH = 68, FOLD = 14;
  for (let y = PY - 40; y < PY + PH + 40; y++)
    for (let x = PX - 40; x < PX + PW + 40; x++) {
      const d = Math.hypot(x - (PX + PW / 2), (y - (PY + PH / 2)) * 0.85) / 66;
      if (d < 1 && dither(x, y) < (1 - d) ** 2 * 0.6 && !rockMask[y * W + x]) set(x, y, d < 0.55 ? SKY[8] : SKY[7]);
    }

  // Page à bordure rouge, coin corné.
  const RED = hex("#e3242b"), RED_D = hex("#9e1418"), PAGE = hex("#f1f2f7"), PAGE_D = hex("#c8cbd8"), INK = hex("#262a33");
  fillPoly([[PX, PY], [PX + PW - FOLD, PY], [PX + PW, PY + FOLD], [PX + PW, PY + PH], [PX, PY + PH]], RED);
  fillPoly([[PX + 4, PY + 4], [PX + PW - FOLD - 1, PY + 4], [PX + PW - 4, PY + FOLD + 1], [PX + PW - 4, PY + PH - 4], [PX + 4, PY + PH - 4]], (x, y) => ((x + y) % 9 === 0 && y > PY + PH - 18 ? PAGE_D : PAGE));
  fillPoly([[PX + PW - FOLD, PY], [PX + PW - FOLD, PY + FOLD], [PX + PW, PY + FOLD]], RED_D);
  for (let y = PY + FOLD; y <= PY + PH; y++) set(PX + PW, y, RED_D);
  for (let x = PX; x <= PX + PW; x++) set(x, PY + PH, RED_D);
  // « PDF » 5 × 7 en gras (×2 horizontal, ×2 vertical).
  const GLYPHS = {
    P: ["1111.", "1...1", "1...1", "1111.", "1....", "1....", "1...."],
    D: ["111..", "1..1.", "1...1", "1...1", "1...1", "1..1.", "111.."],
    F: ["11111", "1....", "1....", "1111.", "1....", "1....", "1...."],
  };
  [..."PDF"].forEach((ch, i) =>
    GLYPHS[ch].forEach((row, gy) => [...row].forEach((b, gx) => {
      if (b !== "1") return;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(PX + 8 + i * 13 + gx * 2 + dx, PY + 42 + gy * 2 + dy, INK);
    })),
  );
  // Brûlure et fissure à l'impact.
  const BURN = ["#120d10", "#3d2622", "#7a5036"].map(hex);
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 12;
    const x = IMPACT[0] + Math.cos(a) * r, y = IMPACT[1] + 4 + Math.sin(a) * r * 0.7;
    if (x > PX && x < PX + PW && y > PY) set(x, y, BURN[Math.min(2, Math.floor(r / 4.2))]);
  }
  let cx = IMPACT[0], cy = IMPACT[1] + 3;
  for (let s = 0; s < 34; s++) { set(cx, cy, BURN[0]); cx += rand() < 0.5 ? -1 : 0; cy += 1; if (s % 6 === 5) cx += 2; }

  // L'éclair arrive de la gauche (du sorcier, à travers la page) et frappe le PDF.
  c.bolt(0, 70, IMPACT[0], IMPACT[1], 30, 2, 3);
  c.bolt(40, 0, IMPACT[0], IMPACT[1] - 2, 28, 1, 2);
  // Étincelles et éclat tramé.
  const SPARK = ["#ffffff", "#ffe9a8", "#ffb84d"].map(hex);
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = 6 + rand() * 28;
    const x = IMPACT[0] + Math.cos(a) * r, y = IMPACT[1] + Math.sin(a) * r * 0.8;
    set(x, y, SPARK[Math.floor(rand() * 3)]);
    if (rand() < 0.3) set(x + Math.sign(Math.cos(a)), y + Math.sign(Math.sin(a)), SPARK[2]);
  }
  for (let y = IMPACT[1] - 10; y < IMPACT[1] + 10; y++)
    for (let x = IMPACT[0] - 10; x < IMPACT[0] + 10; x++) {
      const d = Math.hypot(x - IMPACT[0], (y - IMPACT[1]) * 1.2);
      if (d < 7 && dither(x, y) < 1 - d / 7) set(x, y, BOLT_CORE);
    }
  save(c, "skin-right");
}
console.log("public/skin-left.png, public/skin-right.png", W, "×", H);
