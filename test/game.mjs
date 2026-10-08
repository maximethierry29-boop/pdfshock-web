// Test de franchissabilité du mini-jeu : pour chaque vitesse et chaque obstacle, seul ou suivi
// d'un autre à l'écart minimal, on cherche au moins un moment de saut qui passe sans collision.
import * as G from "../src/game-core.js";

const kinds = Object.keys(G.KINDS);

// Monde à vitesse figée avec des obstacles placés à la main ; `jumps` = étapes où l'on appuie.
function run(speed, layout, jumps) {
  const w = G.newWorld();
  w.speed = speed;
  w.obstacles = layout.map(([kind, x]) => G.makeObstacle(kind, x));
  for (let f = 0; f < 400 && !w.over && w.obstacles.length; f++) {
    if (jumps.has(f)) G.jump(w);
    G.step(w, { spawn: false, fixedSpeed: speed });
  }
  return !w.over;
}

let failures = 0;
for (let speed = G.START_SPEED; speed <= G.MAX_SPEED + 1e-9; speed += 0.1) {
  const gapPx = G.MIN_GAP * speed; // écart minimal entre deux obstacles, en pixels
  for (const a of kinds) {
    // Seul : un saut suffit-il ?
    const startX = 60;
    const ok1 = Array.from({ length: 60 }, (_, f) => f).some((f) => run(speed, [[a, startX]], new Set([f])));
    if (!ok1) { failures++; console.log(`ÉCHEC ${a} seul à ${speed.toFixed(1)} px/étape`); }
    for (const b of kinds) {
      // Deux obstacles à l'écart minimal : deux sauts, chacun cherché dans une fenêtre.
      const layout = [[a, startX], [b, startX + gapPx]];
      let ok2 = false;
      for (let f1 = 0; f1 < 60 && !ok2; f1++) for (let f2 = f1 + 1; f2 < f1 + 120 && !ok2; f2++) ok2 = run(speed, layout, new Set([f1, f2]));
      if (!ok2) { failures++; console.log(`ÉCHEC ${a} puis ${b} à ${speed.toFixed(1)} px/étape`); }
    }
  }
}
console.log(failures ? `${failures} cas infranchissables` : "Tous les obstacles et enchaînements sont franchissables, de 1.6 à 4.2 px/étape.");
process.exit(failures ? 1 : 0);
