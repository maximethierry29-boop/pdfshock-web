// Mini-jeu d'attente, façon dinosaure de Chrome : le sorcier saute par-dessus des PDF trop lourds.
// Affichage et commandes ici ; la logique (testée par test/game.mjs) vit dans game-core.js.
// Rendu pixel art dans un canvas basse définition agrandi sans lissage ; textes en HTML.
import * as G from "./game-core.js";

const BEST_KEY = "pdfshock-best";
const STEP_MS = 1000 / 60;
const NAME_KEY = "pdfshock-name";

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

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null; // navigation privée : rien n'est retenu
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignoré */
    }
  },
};

// `leaderboard` : { top(): Promise<liste|null>, submit(name, score): Promise<liste|null> }.
// Une liste null = classement injoignable : le jeu reste jouable, avec le record local.
export function mountGame({ canvas, caption, panel, leaderboard, onStart = () => {} }) {
  const ctx = canvas.getContext("2d");
  canvas.width = G.W;
  canvas.height = G.H;
  const $ = (sel) => panel.querySelector(sel);
  const over = $("#gameOver"), list = $("#scoreList"), table = $("#scoreTable"), form = $("#scoreForm");
  const nameInput = $("#scoreName"), title = $("#goTitle"), retry = $("#retry");

  let best = Number(store.get(BEST_KEY)) || 0;
  const stars = Array.from({ length: 22 }, () => [Math.random() * G.W, Math.random() * (G.GROUND - 18)]);

  let state = "idle"; // idle | running | paused | over
  let world = G.newWorld();
  let raf, last, acc;
  let finalScore = 0;

  function updateCaption() {
    const bestText = best ? ` · Best ${best} MB` : "";
    caption.textContent =
      state === "running"
        ? `${G.score(world)} MB zapped${bestText}`
        : state === "over"
          ? `The PDF won this round: ${finalScore} MB${bestText}.`
          : state === "paused"
            ? `Paused at ${G.score(world)} MB. Space or tap to resume.`
            : `Bored? Press Space or tap to help the wizard jump over heavy PDFs.${bestText}`;
  }

  function start() {
    if (state === "over" || state === "idle") {
      world = G.newWorld();
      onStart();
    }
    over.hidden = true;
    retry.hidden = true;
    state = "running";
    updateCaption();
    canvas.focus({ preventScroll: true });
    loop();
  }

  function press() {
    if (state === "running") G.jump(world);
    else if (state !== "over" || over.hidden || form.hidden) start(); // pendant la saisie du nom, Espace ne relance pas
  }

  // Tableau des scores façon borne d'arcade : 10 rangs toujours affichés, places vides en tirets,
  // une couleur par rang (dans le CSS). Un score qui entre dans le top 10 ouvre « New highscore ».
  const RANKS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
  const RANK_COLORS = ["#ffe14d", "#ff5c5c", "#ff9f5a", "#ffd1a6", "#ffd1a6", "#ffb3c7", "#6be37a", "#6be37a", "#9fe8ff", "#9fe8ff"];

  function showTable(entries, highlight) {
    title.textContent = "High scores";
    title.classList.remove("new");
    form.hidden = true;
    table.hidden = false;
    list.innerHTML = "";
    if (!entries) {
      list.innerHTML = '<tr class="offline"><td colspan="3">The hall of zappers is offline. Your best stays on this device.</td></tr>';
      return;
    }
    RANKS.forEach((rank, i) => {
      const e = entries[i];
      const tr = document.createElement("tr");
      tr.style.color = RANK_COLORS[i];
      if (e && highlight && e.name === highlight.name && e.score === highlight.score) tr.className = "me";
      tr.innerHTML = "<td></td><td></td><td></td>";
      tr.cells[0].textContent = rank;
      tr.cells[1].textContent = e ? String(e.score) : "---";
      tr.cells[2].textContent = e ? e.name : "-----"; // texte brut : un nom ne peut pas injecter de HTML
      list.append(tr);
    });
  }

  function showNewHighscore() {
    title.textContent = "New highscore";
    title.classList.add("new");
    table.hidden = true;
    form.hidden = false;
    $("#goScore").textContent = `${finalScore} MB`;
    nameInput.value = store.get(NAME_KEY) || "";
    nameInput.focus({ preventScroll: true });
    nameInput.select();
  }

  async function gameOver() {
    finalScore = G.score(world);
    if (finalScore > best) {
      best = finalScore;
      store.set(BEST_KEY, String(best));
    }
    updateCaption();
    retry.hidden = false;
    over.hidden = false;
    form.hidden = true;
    table.hidden = false;
    title.textContent = "High scores";
    title.classList.remove("new");
    list.innerHTML = '<tr class="offline"><td colspan="3">Loading…</td></tr>';
    const entries = await leaderboard.top();
    const qualifies = entries && finalScore > 0 && (entries.length < 10 || finalScore > entries[entries.length - 1].score);
    if (qualifies) showNewHighscore();
    else {
      showTable(entries);
      retry.focus({ preventScroll: true });
    }
  }

  nameInput.addEventListener("input", () => {
    nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value;
    if (!name) return nameInput.focus();
    store.set(NAME_KEY, name);
    const entries = await leaderboard.submit(name, finalScore);
    showTable(entries, { name, score: finalScore });
    retry.focus({ preventScroll: true });
  });
  retry.addEventListener("click", start);

  function draw() {
    ctx.fillStyle = "#0a0e1c";
    ctx.fillRect(0, 0, G.W, G.H);
    ctx.fillStyle = "#2c3a66";
    for (const [sx, sy] of stars) ctx.fillRect(Math.round((sx - world.distance * 0.1 + G.W * 10) % G.W), Math.round(sy), 1, 1);
    ctx.fillRect(0, G.GROUND, G.W, 1);
    ctx.fillStyle = "#202c52";
    for (let x = -(Math.floor(world.distance) % 12); x < G.W; x += 12) ctx.fillRect(x, G.GROUND + 3, 4, 1);
    for (let x = -(Math.floor(world.distance * 1.3) % 19); x < G.W; x += 19) ctx.fillRect(x + 7, G.GROUND + 5, 2, 1);

    for (const o of world.obstacles) for (const [dx, dy] of o.parts) drawSprite(ctx, DOC, o.x + dx, G.GROUND - 10 + dy);

    const legs = WIZ_LEGS[G.onGround(world) && state === "running" ? Math.floor(world.frame / 6) % 2 : 1];
    drawSprite(ctx, WIZ_TOP, G.WX, world.y);
    drawSprite(ctx, legs, G.WX, world.y + WIZ_TOP.length);

    if (state === "over") {
      ctx.fillStyle = "#ffe14d"; // petit éclair de défaite au-dessus du sorcier
      [[8, -5], [7, -4], [8, -3], [7, -2]].forEach(([x, y]) => ctx.fillRect(G.WX + x, Math.round(world.y) + y, 1, 1));
    }
  }

  // Pas fixe de 1/60 s : même vitesse de jeu sur un écran 60, 120 ou 144 Hz.
  function loop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    acc = 0;
    const tick = (now) => {
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= STEP_MS && state === "running") {
        G.step(world);
        acc -= STEP_MS;
        if (world.over) {
          state = "over";
          gameOver();
        }
      }
      draw();
      if (state === "running") {
        if (world.frame % 10 === 0) updateCaption();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    press();
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault(); // pas de défilement de page
      press();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") {
      state = "paused"; // onglet masqué : pause, la partie n'est pas perdue
      updateCaption();
    }
  });

  draw();
  updateCaption();
  // Développement seulement (retiré du build) : provoque une fin de partie à un score donné,
  // pour tester le tableau des scores sans jouer.
  if (import.meta.env.DEV)
    window.__pdfshockGameOver = (mb) => {
      world.distance = mb * 6;
      state = "over";
      draw();
      gameOver();
    };
  return { focus: () => canvas.focus({ preventScroll: true }) };
}
