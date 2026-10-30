import { MAP_W, MAP_H, N_CELLS, CORE_X0, CORE_Y0, CORE_SIZE, CORE_CX, CORE_CY } from './defs.js';

export const T_EMPTY = 0, T_ROCK = 1, T_VEIN = 2;

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const coreDist = (x, y) => Math.hypot(x + 0.5 - CORE_CX, y + 0.5 - CORE_CY);

/** 產生地形：岩石團、晶脈。terrain 會被就地填寫。回傳晶脈團清單。 */
export function generateMap(seed, terrain) {
  const rng = makeRng(seed);
  terrain.fill(T_EMPTY);
  const W = MAP_W, H = MAP_H;
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // 岩石：隨機漫步團塊，避開核心四周 12 格與邊緣 2 格
  const rockClusters = 22 + Math.floor(rng() * 6);
  for (let k = 0; k < rockClusters; k++) {
    let x, y, tries = 0;
    do {
      x = 3 + Math.floor(rng() * (W - 6));
      y = 3 + Math.floor(rng() * (H - 6));
    } while (coreDist(x, y) < 13 && ++tries < 50);
    const size = 5 + Math.floor(rng() * 16);
    for (let s = 0; s < size; s++) {
      if (inb(x, y) && coreDist(x, y) >= 11 && x >= 2 && y >= 2 && x < W - 2 && y < H - 2) {
        terrain[idx(x, y)] = T_ROCK;
        if (rng() < 0.45) {
          const ox = x + (rng() < 0.5 ? 1 : -1);
          if (inb(ox, y) && coreDist(ox, y) >= 11 && ox >= 2 && ox < W - 2) terrain[idx(ox, y)] = T_ROCK;
        }
      }
      const d = Math.floor(rng() * 4);
      if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
    }
  }

  // 晶脈：6–10 團，離核心越遠越大
  const veins = [];
  const nVeins = 6 + Math.floor(rng() * 5);
  const maxD = Math.hypot(W / 2, H / 2);
  for (let k = 0; k < nVeins; k++) {
    let x, y, tries = 0;
    do {
      x = 4 + Math.floor(rng() * (W - 8));
      y = 4 + Math.floor(rng() * (H - 8));
      tries++;
    } while ((coreDist(x, y) < 9 || terrain[idx(x, y)] !== T_EMPTY ||
      veins.some(v => Math.hypot(v.x - x, v.y - y) < 10)) && tries < 200);
    const far = Math.min(1, Math.max(0, (coreDist(x, y) - 9) / (maxD - 9)));
    const size = Math.max(3, Math.min(8, Math.round(3 + far * 5 + (rng() - 0.5) * 1.5)));
    const cells = [];
    let cx = x, cy = y, guard = 0;
    while (cells.length < size && guard++ < 200) {
      if (inb(cx, cy) && terrain[idx(cx, cy)] === T_EMPTY) { terrain[idx(cx, cy)] = T_VEIN; cells.push(idx(cx, cy)); }
      const d = Math.floor(rng() * 4);
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (inb(nx, ny) && terrain[idx(nx, ny)] !== T_ROCK) { cx = nx; cy = ny; }
    }
    veins.push({ x, y, cells });
  }

  // 核心區保證淨空
  for (let y = CORE_Y0 - 1; y <= CORE_Y0 + CORE_SIZE; y++)
    for (let x = CORE_X0 - 1; x <= CORE_X0 + CORE_SIZE; x++) terrain[idx(x, y)] = T_EMPTY;

  // 封閉口袋（從核心走不到的空地）填成岩石，保證所有可走格都連通
  const seen = new Uint8Array(N_CELLS);
  const q = new Int32Array(N_CELLS);
  let qh = 0, qt = 0;
  q[qt++] = idx(CORE_X0, CORE_Y0); seen[q[0]] = 1;
  while (qh < qt) {
    const c = q[qh++], cx = c % W, cy = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!inb(nx, ny)) continue;
      const n = idx(nx, ny);
      if (seen[n] || terrain[n] === T_ROCK) continue;
      seen[n] = 1; q[qt++] = n;
    }
  }
  for (let i = 0; i < N_CELLS; i++) if (!seen[i] && terrain[i] !== T_ROCK) terrain[i] = T_ROCK;
  for (const v of veins) v.cells = v.cells.filter(c => terrain[c] === T_VEIN);
  return veins.filter(v => v.cells.length > 0);
}
