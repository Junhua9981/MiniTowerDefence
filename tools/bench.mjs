// 模擬耗時量測（純 Node，無渲染）。用法：node tools/bench.mjs [敵人數=12000] [量測步數=900] [額外子彈數=0]
import { World } from '../src/sim/world.js';
import { performance } from 'node:perf_hooks';

const N = +(process.argv[2] ?? 12000);
const STEPS = +(process.argv[3] ?? 900);
const BULLETS = +(process.argv[4] ?? 0);
const WARM = 300;

const w = new World({ enemyCap: Math.max(32768, N * 2), bulletCap: Math.max(32768, BULLETS * 2) });
w.initBench(N, BULLETS);
for (let i = 0; i < WARM; i++) w.step();

const times = new Float64Array(STEPS);
let enemies = 0, bullets = 0, maxBullets = 0;
w.prof.flow = 0; w.prof.flowCount = 0;
const kills0 = w.stats.kills;
for (let i = 0; i < STEPS; i++) {
  const t0 = performance.now();
  w.step();
  times[i] = performance.now() - t0;
  enemies += w.n; bullets += w.nb; if (w.nb > maxBullets) maxBullets = w.nb;
}
const sorted = Array.from(times).sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / STEPS;
const pct = p => sorted[Math.min(STEPS - 1, Math.floor(p * STEPS))];
const r = x => x.toFixed(3);
console.log(JSON.stringify({
  node: process.version, targetEnemies: N, steps: STEPS,
  avgEnemies: Math.round(enemies / STEPS), avgBullets: Math.round(bullets / STEPS), maxBullets,
  killsPerSec: Math.round((w.stats.kills - kills0) / (STEPS / 60)),
  stepMs: { mean: r(mean), p50: r(pct(0.5)), p95: r(pct(0.95)), p99: r(pct(0.99)), max: r(sorted[STEPS - 1]) },
  flowRecompute: { count: w.prof.flowCount, avgMs: r(w.prof.flowCount ? w.prof.flow / w.prof.flowCount : 0) },
  budgetMs: 6, withinBudget: mean < 6,
}, null, 1));
