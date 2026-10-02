// Habillage de test « sorcier » : scène pixel art en SVG pilotée par body[data-state]
// (idle → working → done | error), posé par main.js.
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/700.css";
import "./main.js";

const PALETTE = {
  K: "#05030f", E: "#05030f", // contour, yeux
  H: "#6b3fd1", h: "#4a2a9e", // chapeau
  Y: "#ffe14d", // étoiles
  S: "#f2c29b", s: "#d39b78", // peau
  W: "#eef2fb", w: "#b8c4d6", // barbe
  R: "#3d5bd9", r: "#2b3f9e", // robe
  B: "#8a5a2b", // bâton, bottes
  O: "#9fe8ff", o: "#ffffff", // orbe
  P: "#f4f1ff", f: "#c9c2e8", g: "#b9b2dc", // page PDF
  X: "#e8384f", L: "#ffffff", // bandeau PDF
};

// 28 × 34. L'orbe (col 24, ligne 10) est le point de départ de l'éclair.
const WIZARD = [
  "..........KK................",
  ".........KHHK...............",
  ".........KHhK...............",
  "........KHHHhK..............",
  "........KHYHhK..............",
  ".......KHHHHHhK.............",
  ".......KHHHYHhK.............",
  "......KHHHHHHHhK............",
  "......KHYHHHHHhK.......KKK..",
  ".....KHHHHHHHHHhK.....KOOOK.",
  "..KKKKKKKKKKKKKKKKKK..KOoOK.",
  ".KHHHHHHHHHHHHHHHHHhK.KOOOK.",
  "..KKKKKKKKKKKKKKKKKK...KKK..",
  "....KSSSSSSSSSSK.......KBK..",
  "....KSSESSSSESSK.......KBK..",
  "....KSSSSssSSSSK.......KBK..",
  "....KWWSSSSSSWWK.......KBK..",
  "...KWWWWWWWWWWWWK......KBK..",
  "..KRKWWWWWWWWWWKRK.....KBK..",
  "..KRRKWWWWWWWWKRRRRRRKSSBK..",
  "..KRRKWWWWwWWWKrrrrrrKSSBK..",
  "..KRRRKWWWWWWKKKKKKKK..KBK..",
  "..KRRRKWWWWWWKRRK......KBK..",
  "..KRRRRKWWWWKRRRK......KBK..",
  "..KRRRRRKWWKRRRRK......KBK..",
  "..KRRRRRRKKRRRRRK......KBK..",
  "..KRRRRRRRRRRRRRK......KBK..",
  ".KRRRRRYRRRRRRRRRK.....KBK..",
  ".KRRRRRRRRRRRYRRRK.....KBK..",
  ".KrRRRRRRRRRRRRRrK.....KBK..",
  "KrrRRRRRRRRRRRRRrrK....KBK..",
  "KKKKKKKKKKKKKKKKKKK....KBK..",
  "..KBBK.....KBBK........KBK..",
  "..KKKK.....KKKK........KKK..",
];

// 16 × 22, coin corné et bandeau « PDF » en police 3 × 5.
const DOC = [
  "KKKKKKKKKKK.....",
  "KPPPPPPPPPKK....",
  "KPPPPPPPPPKfK...",
  "KPPPPPPPPPKffK..",
  "KPPPPPPPPPKfffK.",
  "KPPPPPPPPPKKKKKK",
  "KPPPPPPPPPPPPPPK",
  "KPgggggggggggPPK",
  "KPPPPPPPPPPPPPPK",
  "KPggggggggPPPPPK",
  "KPPPPPPPPPPPPPPK",
  "KXXXXXXXXXXXXXXK",
  "KXLLLXLLXXLLLXXK",
  "KXLXLXLXLXLXXXXK",
  "KXLLLXLXLXLLXXXK",
  "KXLXXXLXLXLXXXXK",
  "KXLXXXLLXXLXXXXK",
  "KXXXXXXXXXXXXXXK",
  "KPPPPPPPPPPPPPPK",
  "KPggggggggggPPPK",
  "KPPPPPPPPPPPPPPK",
  "KKKKKKKKKKKKKKKK",
];

const W = 128, H = 56, GROUND = 48;
const WIZ_X = 6, WIZ_Y = GROUND - WIZARD.length;
const DOC_X = 100, DOC_Y = GROUND - DOC.length;
const ORB = { x: WIZ_X + 24, y: WIZ_Y + 10 };
const TARGET = { x: DOC_X + 1, y: DOC_Y + 11 };
const NS = "http://www.w3.org/2000/svg";

// Un <path> par couleur : un sprite de 1 000 pixels reste léger dans le DOM.
function sprite(rows, ox = 0, oy = 0) {
  const width = rows[0].length;
  rows.forEach((r, i) => r.length !== width && console.error(`Sprite : ligne ${i} = ${r.length} px au lieu de ${width}`));
  const byColor = {};
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== ".") (byColor[c] ??= []).push(`M${ox + x} ${oy + y}h1v1h-1z`);
    }),
  );
  return Object.entries(byColor)
    .map(([c, d]) => `<path fill="${PALETTE[c]}" d="${d.join("")}"/>`)
    .join("");
}

function pixels(points, fill) {
  return `<path fill="${fill}" d="${points.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("")}"/>`;
}

// Éclair : segments à décrochements aléatoires, tracés pixel par pixel (Bresenham).
function boltPixels() {
  const steps = 7, pts = [[ORB.x, ORB.y]];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pts.push([
      Math.round(ORB.x + (TARGET.x - ORB.x) * t),
      Math.round(ORB.y + (TARGET.y - ORB.y) * t + (Math.random() - 0.5) * 12),
    ]);
  }
  pts.push([TARGET.x, TARGET.y]);
  const core = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      core.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  const glow = core.flatMap(([x, y]) => [[x, y - 1], [x, y + 1]]);
  return pixels(glow, "#9fe8ff") + pixels(core, "#ffffff");
}

function stars() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 34 }, (_, i) => {
    const x = Math.floor(rand() * W), y = Math.floor(rand() * (GROUND - 8));
    return `<rect class="star${i % 3 ? "" : " twinkle"}" x="${x}" y="${y}" width="1" height="1" style="animation-delay:${(i % 5) * 0.4}s"/>`;
  }).join("");
}

function ground() {
  const tiles = [];
  for (let x = 0; x < W; x++) {
    tiles.push([x, GROUND]);
    if ((x * 7) % 5 === 0) tiles.push([x, GROUND + 2]);
    if ((x * 3) % 11 === 0) tiles.push([x, GROUND + 5]);
  }
  return `<rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" fill="#1a1240"/>` + pixels(tiles, "#2f2478");
}

const sparkles = [[-4, -6], [17, -4], [-6, 8], [19, 10], [7, -9]]
  .map(([dx, dy], i) => `<g class="sparkle" style="animation-delay:${i * 0.15}s">${pixels(
    [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]].map(([x, y]) => [DOC_X + dx + x, DOC_Y + dy + y]), "#ffe14d")}</g>`)
  .join("");

const smoke = [[2, -5], [8, -8], [12, -4]]
  .map(([dx, dy], i) => `<g class="puff" style="animation-delay:${i * 0.2}s">${pixels(
    [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2]].map(([x, y]) => [DOC_X + dx + x, DOC_Y + dy + y]), "#8a83b3")}</g>`)
  .join("");

const scene = document.getElementById("scene");
scene.innerHTML = `
<svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="A pixel wizard zaps a PDF document">
  <rect class="sky" width="${W}" height="${H}"/>
  <rect class="sky-glow" width="${W}" height="${GROUND}"/>
  ${stars()}
  ${ground()}
  <g class="wizard">${sprite(WIZARD, WIZ_X, WIZ_Y)}
    <rect class="orb-glow" x="${ORB.x - 2}" y="${ORB.y - 2}" width="5" height="5"/>
  </g>
  <g class="doc" style="transform-origin:${DOC_X + 8}px ${GROUND}px">${sprite(DOC, DOC_X, DOC_Y)}</g>
  <g class="bolt"></g>
  ${sparkles}${smoke}
  <text class="bubble" x="${DOC_X + 8}" y="${DOC_Y - 3}" text-anchor="middle"></text>
</svg>`;

const boltLayer = scene.querySelector(".bolt");
const bubble = scene.querySelector(".bubble");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let timer;

function zap(on) {
  clearInterval(timer);
  boltLayer.innerHTML = on ? boltPixels() : "";
  // Seul l'éclair (petite surface) change de forme : pas de flash plein écran.
  if (on && !reduced) timer = setInterval(() => (boltLayer.innerHTML = boltPixels()), 90);
}

new MutationObserver(() => {
  const state = document.body.dataset.state;
  zap(state === "working");
  // Après « done », le document est réduit à 55 % : la bulle suit son nouveau sommet.
  bubble.setAttribute("y", state === "done" ? GROUND - Math.round(DOC.length * 0.55) - 3 : DOC_Y - 3);
  bubble.textContent = state === "done" ? document.getElementById("gain").textContent.replace("already optimized", "OK!") : state === "error" ? "?!" : "";
}).observe(document.body, { attributes: true, attributeFilter: ["data-state"] });

// Démo au chargement : un éclair court pour montrer le personnage.
if (!reduced) {
  setTimeout(() => !document.body.dataset.state && zap(true), 900);
  setTimeout(() => !document.body.dataset.state && zap(false), 1500);
}
