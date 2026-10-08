// Logique du mini-jeu, sans affichage : partagée par le jeu (game.js) et par le test de
// franchissabilité (test/game.mjs). Une étape = 1/60 s, quelle que soit la fréquence de l'écran.

export const W = 160, H = 50, GROUND = 43;
export const GRAVITY = 0.3, JUMP = -4.0; // saut d'environ 25 px, ~27 étapes en l'air
export const WX = 12; // abscisse fixe du sorcier
export const WIZ_H = 16; // hauteur du sprite
export const START_SPEED = 1.6, MAX_SPEED = 4.2;
// Écart minimal entre deux obstacles, en étapes : un saut complet plus de quoi reprendre appel.
export const MIN_GAP = 34;

// Obstacles : un PDF (8 × 10), une tour de deux, ou deux côte à côte.
export const KINDS = {
  single: [[0, 0]],
  tower: [[0, 0], [0, -10]],
  pair: [[0, 0], [9, 0]],
};

export function makeObstacle(kind, x) {
  const parts = KINDS[kind];
  return {
    kind,
    x,
    parts,
    w: Math.max(...parts.map(([dx]) => dx)) + 8,
    h: -Math.min(...parts.map(([, dy]) => dy)) + 10,
  };
}

export function newWorld() {
  return { y: GROUND - WIZ_H, vy: 0, obstacles: [], speed: START_SPEED, distance: 0, frame: 0, spawnIn: 60, over: false };
}

export const onGround = (world) => world.y >= GROUND - WIZ_H;

export function jump(world) {
  if (onGround(world)) world.vy = JUMP;
}

// Une étape de jeu. Pour les tests : `rand` injectable, `spawn: false` laisse placer les obstacles
// à la main, `fixedSpeed` fige la vitesse.
export function step(world, { rand = Math.random, spawn = true, fixedSpeed } = {}) {
  world.frame++;
  world.distance += world.speed;
  world.speed = fixedSpeed ?? Math.min(MAX_SPEED, START_SPEED + world.distance / 2500);
  world.vy += GRAVITY;
  world.y = Math.min(GROUND - WIZ_H, world.y + world.vy);
  if (onGround(world)) world.vy = 0;

  if (spawn && --world.spawnIn <= 0) {
    const r = rand();
    world.obstacles.push(makeObstacle(r < 0.55 ? "single" : r < 0.8 ? "tower" : "pair", W + 4));
    world.spawnIn = MIN_GAP + rand() * 60 * Math.max(0.4, 1 - world.distance / 6000);
  }
  for (const o of world.obstacles) o.x -= world.speed;
  world.obstacles = world.obstacles.filter((o) => o.x + o.w > -2);
  if (world.obstacles.some((o) => collides(world, o))) world.over = true;
  return world;
}

// Boîte de collision un peu plus petite que les sprites : plus juste à l'œil.
export function collides(world, o) {
  const wx0 = WX + 2, wx1 = WX + 10, wy0 = world.y + 3, wy1 = world.y + 15;
  const ox0 = o.x + 1, ox1 = o.x + o.w - 1, oy0 = GROUND - o.h + 1, oy1 = GROUND;
  return wx1 > ox0 && wx0 < ox1 && wy1 > oy0 && wy0 < oy1;
}

export const score = (world) => Math.floor(world.distance / 6);
