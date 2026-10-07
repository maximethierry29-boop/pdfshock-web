// Mini-jeu d'attente, façon dinosaure de Chrome : le sorcier saute par-dessus des PDF trop lourds.
// Rendu pixel art dans un canvas basse définition (agrandi sans lissage par le CSS), sans image.
// Les textes (score, consignes) restent en HTML pour rester nets.

const W = 160, H = 46, GROUND = 39;
const GRAVITY = 0.4, JUMP = -4.3; // saut d'environ 23 px, assez pour une tour de deux PDF (20 px)
const WX = 12; // abscisse fixe du sorcier
const BEST_KEY = "pdfshock-best";

const PALETTE = {
  K: "#05060d", // contour
  H: "#4f9dff", h: "#2f5fb8", // chapeau
  Y: "#ffe14d", // étoile
  S: "#f2c29b", // peau
  W: "#e7ecfb", // barbe
  R: "#2c3a66", r: "#202c52", // robe
  B: "#8a5a2b", // bâton
  O: "#9fe8ff", // orbe
  P: "#f1f2f7", X: "#e3242b", g: "#c8cbd8", // PDF
};

// 12 × 16, deux images de course (jambes alternées).
const WIZ_TOP = [
  ".....KK.....",
  "....KHHK....",
  "...KHYHhK...",
  "..KHHHHHhK..",
  ".KKKKKKKKKK.",
  "...KSSSSK..O",
  "...KSKSKK.KB",
  "...KWWWWK..B",
  "..KRWWWWRK.B",
  ".KRRRWWRRSSB",
  ".KRRRRRRRK.B",
  ".KrRRRRRrK.B",
  ".KrRRRRRrK.B",
];
const WIZ_LEGS = [
  ["..KK...KK...", "..KK....KK..", "............"],
  ["...KK.KK....", "....KKK.....", "............"],
];
// PDF lourd : 8 × 10 (simple) ; les variantes en empilent ou en alignent plusieurs.
const DOC = [
  "KKKKKK..",
  "KPPPPKK.",
  "KPPPPKgK",
  "KPgggPPK",
  "KPPPPPPK",
  "KXXXXXXK",
  "KXPXPXXK",
  "KXXXXXXK",
  "KPPPPPPK",
  "KKKKKKKK",
];

function drawSprite(ctx, rows, x, y) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === ".") continue;
      ctx.fillStyle = PALETTE[c];
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  });
}

export function mountGame({ canvas, caption }) {
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    /* stockage indisponible (navigation privée) : le record reste en mémoire */
  }

  // Étoiles fixes, tirées une fois.
  const stars = Array.from({ length: 22 }, () => [Math.random() * W, Math.random() * (GROUND - 18)]);

  let state = "idle"; // idle | running | paused | over
  let wizard, obstacles, speed, distance, frame, spawnIn, raf;

  function reset() {
    wizard = { y: GROUND - 16, vy: 0 };
    obstacles = [];
    speed = 1.6;
    distance = 0;
    frame = 0;
    spawnIn = 60;
  }
  reset();

  const score = () => Math.floor(distance / 6);
  function updateCaption() {
    const bestText = best ? ` · Best ${best} MB` : "";
    caption.textContent =
      state === "running"
        ? `${score()} MB zapped${bestText}`
        : state === "over"
          ? `The PDF won this round: ${score()} MB${bestText}. Space or tap to retry.`
          : state === "paused"
            ? `Paused at ${score()} MB. Space or tap to resume.`
          : `Bored? Press Space or tap to help the wizard jump over heavy PDFs.${bestText}`;
  }

  function spawn() {
    const kind = Math.random();
    // Simple, tour de deux PDF, ou paire côte à côte.
    const parts = kind < 0.55 ? [[0, 0]] : kind < 0.8 ? [[0, 0], [0, -10]] : [[0, 0], [9, 0]];
    const w = Math.max(...parts.map(([dx]) => dx)) + 8;
    const h = -Math.min(...parts.map(([, dy]) => dy)) + 10;
    obstacles.push({ x: W + 4, parts, w, h });
    spawnIn = 55 + Math.random() * 70 - Math.min(30, distance / 300);
  }

  function jump() {
    if (state !== "running") {
      if (state === "over") reset(); // en pause, la partie reprend là où elle s'était arrêtée
      state = "running";
      updateCaption();
      loop();
      return;
    }
    if (wizard.y >= GROUND - 16) wizard.vy = JUMP;
  }

  function step() {
    frame++;
    distance += speed;
    speed = Math.min(4.2, 1.6 + distance / 2500);
    wizard.vy += GRAVITY;
    wizard.y = Math.min(GROUND - 16, wizard.y + wizard.vy);
    if (wizard.y === GROUND - 16) wizard.vy = 0;

    if (--spawnIn <= 0) spawn();
    obstacles.forEach((o) => (o.x -= speed));
    obstacles = obstacles.filter((o) => o.x + o.w > -2);

    // Collision avec une boîte un peu plus petite que le sprite : plus juste à l'œil.
    const wx0 = WX + 2, wx1 = WX + 10, wy0 = wizard.y + 3, wy1 = wizard.y + 15;
    for (const o of obstacles) {
      const ox0 = o.x + 1, ox1 = o.x + o.w - 1, oy0 = GROUND - o.h + 1, oy1 = GROUND;
      if (wx1 > ox0 && wx0 < ox1 && wy1 > oy0 && wy0 < oy1) {
        state = "over";
        if (score() > best) {
          best = score();
          try {
            localStorage.setItem(BEST_KEY, String(best));
          } catch {
            /* ignoré */
          }
        }
      }
    }
  }

  function draw() {
    ctx.fillStyle = "#0a0e1c";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2c3a66";
    for (const [sx, sy] of stars) ctx.fillRect(Math.round((sx - distance * 0.1 + W * 10) % W), Math.round(sy), 1, 1);
    // Sol pointillé qui défile.
    ctx.fillStyle = "#2c3a66";
    ctx.fillRect(0, GROUND, W, 1);
    ctx.fillStyle = "#202c52";
    for (let x = -(Math.floor(distance) % 12); x < W; x += 12) ctx.fillRect(x, GROUND + 3, 4, 1);
    for (let x = -(Math.floor(distance * 1.3) % 19); x < W; x += 19) ctx.fillRect(x + 7, GROUND + 6, 2, 1);

    for (const o of obstacles) for (const [dx, dy] of o.parts) drawSprite(ctx, DOC, o.x + dx, GROUND - 10 + dy);

    const onGround = wizard.y >= GROUND - 16;
    const legs = WIZ_LEGS[onGround && state === "running" ? Math.floor(frame / 6) % 2 : 1];
    drawSprite(ctx, WIZ_TOP, WX, wizard.y);
    drawSprite(ctx, legs, WX, wizard.y + WIZ_TOP.length);

    if (state === "over") {
      // Petit éclair de défaite au-dessus du sorcier.
      ctx.fillStyle = "#ffe14d";
      [[WX + 8, -5], [WX + 7, -4], [WX + 8, -3], [WX + 7, -2]].forEach(([x, y]) => ctx.fillRect(x, Math.round(wizard.y) + y, 1, 1));
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (state !== "running") {
        draw();
        updateCaption();
        return;
      }
      step();
      draw();
      if (frame % 10 === 0) updateCaption();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.focus();
    jump();
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault(); // pas de défilement de page
      jump();
    }
  });
  // Onglet masqué : pause, pour ne pas perdre la partie en allant voir ailleurs.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") {
      state = "paused";
      loop();
    }
  });

  draw();
  updateCaption();
  return {
    focus: () => canvas.focus({ preventScroll: true }),
  };
}
