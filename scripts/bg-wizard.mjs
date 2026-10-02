// Génère l'illustration pixel art de wizard.html : sorcier en contre-plongée qui foudroie une icône PDF.
// Rendu à 320 × 180 (affiché sans lissage), palette violette limitée, tramage Bayer 4 × 4.
// Usage : node scripts/bg-wizard.mjs  → public/bg-wizard.png
import * as mupdf from "mupdf";
import fs from "node:fs";

const W = 320, H = 180;
const img = new Uint8Array(W * H * 3);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const set = (x, y, c) => {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  img.set(c, (y * W + x) * 3);
};

// Hasard reproductible : même image à chaque génération.
let seed = 1337;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const pick = (pal, v, x, y) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * (pal.length - 1) + dither(x, y))))];

// Bruit de valeur + fbm pour nuages, roches et montagnes.
const perm = Array.from({ length: 512 }, () => rand());
const lattice = (x, y) => perm[(((x * 73 + y * 151) % 512) + 512) % 512];
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = lattice(xi, yi), b = lattice(xi + 1, yi), c = lattice(xi, yi + 1), d = lattice(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x, y, o = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * noise(x * f, y * f); f *= 2; a /= 2; } return v / (1 - 2 ** -o); };

const SKY = ["#06040d", "#0d0820", "#160c33", "#211248", "#2e185f", "#3d1f78", "#512a92", "#6b39ad", "#8c52c9", "#b583e3"].map(hex);
const ROCK = ["#050308", "#0c0912", "#15101d", "#211a2b", "#30263d", "#463653"].map(hex);
const RIM = hex("#9a6ad6"), RIM_DIM = hex("#4f3480");
const MOUNT = ["#0e0a1c", "#160f2b", "#20173b"].map(hex);

// Lueurs (mains levées, impact sur le PDF) : servent au ciel, aux nuages et au rim light.
const HANDS = [[112, 34], [188, 34]];
const IMPACT = [242, 78];
const glowAt = (x, y) => {
  let g = 0;
  for (const [hx, hy] of HANDS) g += Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / 1800);
  g += 0.9 * Math.exp(-((x - IMPACT[0]) ** 2 + (y - IMPACT[1]) ** 2) / 900);
  return Math.min(1, g);
};

// 1. Ciel d'orage : dégradé, nuages en fbm étirés, éclairés par les lueurs.
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const g = glowAt(x, y);
    let v = 0.08 + 0.22 * (y / H) + 0.35 * g;
    const n = fbm(x / 70, y / 22 + 3);
    const cloud = n - 0.42 - 0.12 * (y / H);
    if (cloud > 0) v += Math.min(0.35, cloud * 1.6) * (0.35 + g) + 0.08 * fbm(x / 9, y / 5);
    else v -= 0.05;
    set(x, y, pick(SKY, v, x, y));
  }

// 2. Montagnes lointaines, crête éclairée.
function ridge(base, amp, scale, pal, off) {
  for (let x = 0; x < W; x++) {
    const top = Math.round(base - amp * (fbm(x / scale + off, off) - 0.3) - 10 * Math.abs(Math.sin(x / scale * 2.3 + off)));
    for (let y = top; y < H; y++) set(x, y, y === top ? pick(SKY, 0.35 + glowAt(x, y), x, y) : pick(pal, 0.4 + 0.3 * fbm(x / 12, y / 12), x, y));
  }
}
ridge(132, 40, 40, MOUNT.slice(1), 5);
ridge(146, 26, 26, MOUNT, 11);

// Remplissage de polygone (scanline, pair-impair). Le masque sert au rim light du sorcier.
function fillPoly(pts, color, mask, id) {
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
        const c = typeof color === "function" ? color(x, y) : color;
        set(x, y, c);
        if (mask) mask[y * W + x] = id;
      }
  }
}

// 3. Rochers au premier plan (contre-plongée : énormes en bas, plateau sous le sorcier).
const rockMask = new Uint8Array(W * H);
const rockShade = (x, y) => pick(ROCK, 0.15 + 0.55 * Math.floor(fbm(x / 14, y / 9) * 4) / 4 + 0.25 * glowAt(x, y), x, y);
const ROCKS = [
  [[0, 180], [0, 132], [14, 122], [30, 120], [46, 128], [66, 142], [88, 152], [104, 180]],
  [[70, 180], [94, 158], [118, 152], [150, 151], [184, 152], [204, 147], [222, 140], [246, 136], [268, 140], [290, 132], [306, 124], [320, 126], [320, 180]],
  [[196, 180], [214, 160], [238, 156], [262, 162], [282, 180]],
];
for (const r of ROCKS) fillPoly(r, rockShade, rockMask, 1);
// Arêtes supérieures accrochées par la lumière violette.
for (let y = 1; y < H; y++)
  for (let x = 0; x < W; x++)
    if (rockMask[y * W + x] && !rockMask[(y - 1) * W + x] && rand() < 0.85) set(x, y, glowAt(x, y) > 0.08 ? RIM : RIM_DIM);
// Fissures.
for (let i = 0; i < 26; i++) {
  let x = 10 + rand() * 300, y = 150 + rand() * 30;
  for (let s = 0; s < 8; s++) { if (rockMask[(y | 0) * W + (x | 0)]) set(x, y, ROCK[0]); x += rand() * 2 - 0.6; y += rand() * 2 - 1; }
}

// 4. Le sorcier, vu d'en bas, bras levés.
const wiz = new Uint8Array(W * H);
const ROBE = ["#0c0716", "#160e26", "#21153a", "#2f1e50"].map(hex);
const robe = (x, y) => pick(ROBE, 0.25 + 0.5 * fbm(x / 3, y / 16) + 0.15 * glowAt(x, y), x, y);
const BEARD = ["#6f6680", "#a39bb5", "#d4cde0", "#f2eef8"].map(hex);
const beard = (x, y) => pick(BEARD, 0.35 + 0.5 * fbm(x / 1.5, y / 6) + 0.2 * glowAt(x, y) - (y - 78) / 60, x, y);
const SKIN = ["#5e3c3a", "#8f6156", "#c08a78"].map(hex);
const skin = (x, y) => pick(SKIN, 0.3 + 0.6 * glowAt(x, y), x, y);

fillPoly([[122, 153], [128, 128], [134, 104], [138, 86], [150, 82], [162, 86], [168, 104], [176, 126], [186, 150], [176, 154], [150, 155]], robe, wiz, 1); // robe
fillPoly([[162, 88], [176, 100], [190, 126], [206, 148], [196, 150], [182, 146], [170, 120]], robe, wiz, 1); // cape au vent
fillPoly([[138, 88], [128, 104], [116, 140], [112, 152], [124, 152]], robe, wiz, 1);
// Bras levés, manches évasées qui retombent.
fillPoly([[136, 88], [126, 70], [114, 42], [110, 38], [116, 36], [124, 50], [136, 72], [144, 84]], robe, wiz, 1);
fillPoly([[164, 88], [174, 70], [186, 42], [190, 38], [184, 36], [176, 50], [164, 72], [156, 84]], robe, wiz, 1);
fillPoly([[132, 82], [124, 64], [118, 56], [122, 78], [128, 92]], robe, wiz, 1);
fillPoly([[168, 82], [176, 64], [182, 56], [178, 78], [172, 92]], robe, wiz, 1);
// Mains ouvertes.
fillPoly([[109, 38], [106, 30], [108, 29], [110, 33], [110, 27], [112, 27], [113, 32], [114, 28], [116, 29], [116, 37]], skin, wiz, 2);
fillPoly([[191, 38], [194, 30], [192, 29], [190, 33], [190, 27], [188, 27], [187, 32], [186, 28], [184, 29], [184, 37]], skin, wiz, 2);
// Tête, cheveux et grande barbe.
fillPoly([[145, 64], [155, 64], [155, 71], [150, 74], [145, 71]], skin, wiz, 2);
fillPoly([[143, 72], [143, 63], [146, 59], [150, 58], [154, 59], [157, 63], [157, 72], [161, 92], [156, 86], [155, 65], [145, 65], [144, 86], [139, 92]], beard, wiz, 3);
fillPoly([[144, 71], [156, 71], [159, 82], [156, 96], [150, 112], [144, 96], [141, 82]], beard, wiz, 3);
for (const x of [146, 147, 152, 153]) set(x, 66, BEARD[3]); // sourcils
set(147, 67, hex("#120a10")); set(152, 67, hex("#120a10")); // yeux
set(150, 69, SKIN[2]); set(150, 70, SKIN[1]); // nez
for (let x = 146; x <= 154; x++) set(x, 72, BEARD[x % 2 ? 2 : 3]); // moustache
// Ceinture.
for (let x = 137; x < 164; x++) if (wiz[114 * W + x] === 1) set(x, 114, hex("#4a3b2a"));
set(150, 114, hex("#c9a95a"));
// Plis de la robe : traits clairs tramés de la taille à l'ourlet.
for (const [fx, spread] of [[140, -0.18], [146, -0.08], [155, 0.1], [161, 0.2], [170, 0.32]])
  for (let y = 100; y < 156; y++) {
    const x = Math.round(fx + (y - 100) * spread);
    if (wiz[y * W + x] === 1 && dither(x, y) < 0.6) set(x, y, ROBE[3]);
  }
// Rim light : bords du sorcier exposés vers le haut et les côtés.
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++)
    if (wiz[y * W + x] === 1 && (!wiz[(y - 1) * W + x] || !wiz[y * W + x - 1] || !wiz[y * W + x + 1])) set(x, y, glowAt(x, y) > 0.12 ? RIM : RIM_DIM);

// Rebord rocheux au premier plan : il coupe le bas de la robe (effet contre-plongée).
const lip = new Uint8Array(W * H);
fillPoly([[80, 180], [98, 162], [120, 156], [138, 158], [150, 156], [166, 158], [182, 155], [204, 160], [222, 180]], rockShade, lip, 1);
for (let y = 1; y < H; y++)
  for (let x = 0; x < W; x++)
    if (lip[y * W + x] && !lip[(y - 1) * W + x]) { set(x, y, RIM_DIM); if (rand() < 0.5) set(x, y + 1, ROCK[4]); }

// 5. Éclairs : déplacement de point médian + ramifications.
const BOLT_CORE = hex("#ffffff"), BOLT = hex("#e7c8ff"), BOLT_GLOW = hex("#a865f0");
function line(x0, y0, x1, y1, fn) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}
function bolt(x0, y0, x1, y1, disp, width, branches) {
  let pts = [[x0, y0], [x1, y1]];
  for (let d = disp; d > 1.5; d /= 2) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      next.push(pts[i], [(ax + bx) / 2 + (rand() - 0.5) * d, (ay + by) / 2 + (rand() - 0.5) * d * 0.5]);
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
    const ang = Math.atan2(y1 - y0, x1 - x0) + (rand() - 0.5) * 1.6, len = 12 + rand() * 26;
    bolt(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, disp / 3, 1, 0);
  }
}
bolt(40, 0, 112, 30, 40, 1, 4);
bolt(118, 0, 110, 28, 24, 1, 3);
bolt(212, 0, 188, 30, 30, 1, 3);
bolt(300, 6, 190, 28, 44, 1, 5);
bolt(150, 0, 112, 30, 30, 1, 2);
bolt(189, 30, IMPACT[0], IMPACT[1], 26, 2, 3); // la foudre qui frappe le PDF

// 6. Icône PDF foudroyée : page à bordure rouge, coin corné, roussie au point d'impact.
const PX = 224, PY = 80, PW = 38, PH = 48, FOLD = 10;
const RED = hex("#e3242b"), RED_D = hex("#9e1418"), PAGE = hex("#f1eff5"), PAGE_D = hex("#c9c4d4"), INK = hex("#2b2630");
for (let y = PY - 30; y < PY + PH + 30; y++)
  for (let x = PX - 30; x < PX + PW + 30; x++) {
    const d = Math.hypot(x - (PX + PW / 2), (y - (PY + PH / 2)) * 0.85) / 50;
    if (d < 1 && dither(x, y) < (1 - d) ** 2 * 0.6 && !rockMask[y * W + x]) set(x, y, d < 0.55 ? SKY[7] : SKY[6]);
  }
const pdf = [[PX, PY], [PX + PW - FOLD, PY], [PX + PW, PY + FOLD], [PX + PW, PY + PH], [PX, PY + PH]];
fillPoly(pdf, RED);
fillPoly([[PX + 3, PY + 3], [PX + PW - FOLD - 1, PY + 3], [PX + PW - 3, PY + FOLD + 1], [PX + PW - 3, PY + PH - 3], [PX + 3, PY + PH - 3]], (x, y) => (x + y) % 9 === 0 && y > PY + PH - 14 ? PAGE_D : PAGE);
fillPoly([[PX + PW - FOLD, PY], [PX + PW - FOLD, PY + FOLD], [PX + PW, PY + FOLD]], RED_D);
// Ombre portée sur le bord droit et le bas.
for (let y = PY + FOLD; y <= PY + PH; y++) set(PX + PW, y, RED_D);
for (let x = PX; x <= PX + PW; x++) set(x, PY + PH, RED_D);
// « PDF » en police pixel 5 × 7.
const GLYPHS = {
  P: ["1111.", "1...1", "1...1", "1111.", "1....", "1....", "1...."],
  D: ["111..", "1..1.", "1...1", "1...1", "1...1", "1..1.", "111.."],
  F: ["11111", "1....", "1....", "1111.", "1....", "1....", "1...."],
};
[..."PDF"].forEach((ch, i) =>
  GLYPHS[ch].forEach((row, gy) => [...row].forEach((b, gx) => {
    if (b === "1") { set(PX + 6 + i * 9 + gx, PY + 32 + gy, INK); set(PX + 7 + i * 9 + gx, PY + 32 + gy, INK); }
  })),
);
// Brûlure et fissure à l'impact.
const BURN = ["#1b1214", "#4a2a26", "#8a5a3a"].map(hex);
for (let i = 0; i < 160; i++) {
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 9;
  const x = IMPACT[0] + Math.cos(a) * r, y = IMPACT[1] + 3 + Math.sin(a) * r * 0.7;
  if (x > PX && x < PX + PW && y > PY) set(x, y, BURN[Math.min(2, Math.floor(r / 3.2))]);
}
let cx = IMPACT[0], cy = IMPACT[1] + 2;
for (let s = 0; s < 24; s++) { set(cx, cy, BURN[0]); cx += rand() < 0.5 ? -1 : 0; cy += 1; if (s % 5 === 4) cx += 2; }

// 7. Étincelles autour de l'impact et lueur tramée.
const SPARK = ["#ffffff", "#ffe9a8", "#ffb84d"].map(hex);
for (let i = 0; i < 70; i++) {
  const a = rand() * Math.PI * 2, r = 6 + rand() * 22;
  const x = IMPACT[0] + Math.cos(a) * r, y = IMPACT[1] + Math.sin(a) * r * 0.8;
  set(x, y, SPARK[Math.floor(rand() * 3)]);
  if (rand() < 0.3) set(x + Math.sign(Math.cos(a)), y + Math.sign(Math.sin(a)), SPARK[2]);
}
for (let y = IMPACT[1] - 14; y < IMPACT[1] + 14; y++)
  for (let x = IMPACT[0] - 14; x < IMPACT[0] + 14; x++) {
    const d = Math.hypot(x - IMPACT[0], (y - IMPACT[1]) * 1.2);
    if (d < 6 && dither(x, y) < 1 - d / 6) set(x, y, BOLT_CORE);
  }

// Export PNG via MuPDF (déjà une dépendance du projet).
const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W, H], false);
pix.getPixels().set(img);
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/bg-wizard.png", pix.asPNG());
// Aperçu ×4 pour relecture.
const big = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W * 4, H * 4], false);
const bp = big.getPixels();
for (let y = 0; y < H * 4; y++) for (let x = 0; x < W * 4; x++) bp.set(img.subarray(((y >> 2) * W + (x >> 2)) * 3, ((y >> 2) * W + (x >> 2)) * 3 + 3), (y * W * 4 + x) * 3);
fs.writeFileSync("test/bg-wizard-x4.png", big.asPNG());
console.log("public/bg-wizard.png", W, "×", H);
