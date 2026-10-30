// 邊界情況測試。用法：node --expose-gc tools/edge.mjs
import { World } from '../src/sim/world.js';
import { MAP_W, MAP_H, CORE_X0, CORE_Y0, CORE_SIZE, B_WALL, B_ARROW, B_CANNON, B_GOLD, B_FROST, B_PRISM, B_SCATTER, B_AMP, HZ, PHASE_START, P_DUSK, EV_BDESTROY } from '../src/sim/defs.js';
import { runGame } from './autoplay.mjs';

const results = [];
const check = (name, fn) => {
  try { const info = fn(); results.push({ name, ok: true, ...info }); }
  catch (e) { results.push({ name, ok: false, error: String(e && e.stack || e) }); }
};
const skipTo = (w, dayT) => { while (w.dayT < dayT && w.state === 'run') w.step(); };
const assert = (c, m) => { if (!c) throw new Error(m); };

check('牆完全封死核心', () => {
  const w = new World({ seed: 11, events: true });
  w.gold = 1e6;
  for (let y = CORE_Y0 - 1; y <= CORE_Y0 + CORE_SIZE; y++)
    for (let x = CORE_X0 - 1; x <= CORE_X0 + CORE_SIZE; x++) w.place(B_WALL, x, y);
  w.start();
  skipTo(w, PHASE_START[P_DUSK]);
  let destroyed = 0, attacking = 0;
  for (let s = 0; s < HZ * 75 && w.state === 'run'; s++) {
    w.step();
    for (let e = 0; e < w.evN; e++) if (w.evT[e] === EV_BDESTROY) destroyed++;
    w.evN = 0;
  }
  for (let i = 0; i < w.n; i++) if (w.eatk[i] >= 0) attacking++;
  assert(destroyed > 0 || attacking > 0, '敵人沒有拆牆');
  for (let i = 0; i < w.n; i++) assert(Number.isFinite(w.ex[i]) && Number.isFinite(w.ey[i]), 'NaN 位置');
  return { destroyed, attackingAtEnd: attacking, state: w.state };
});

check('拆光所有建築', () => {
  const w = new World({ seed: 12, events: true });
  w.gold = 1e6; w.lit.fill(1);
  const types = [B_WALL, B_ARROW, B_CANNON, B_GOLD, B_FROST, B_PRISM, B_SCATTER, B_AMP];
  let placedN = 0;
  for (let i = 0; i < 300; i++) if (w.place(types[i % types.length], 30 + (i % 40), 10 + ((i / 40) | 0)) >= 0) placedN++;
  w.start(); skipTo(w, PHASE_START[P_DUSK]);
  for (let b = 1; b < w.bHigh; b++) if (w.balive[b]) w.damageBuilding(b, 1e9);
  let alive = 0; for (let b = 1; b < w.bHigh; b++) alive += w.balive[b];
  assert(alive === 0, '還有建築存活');
  const ghosts = w.ghosts.length;
  assert(ghosts === placedN, `殘影數量不對：${ghosts} / ${placedN}`);
  // 跑到下一個黎明，殘影應該全部復活（核心夠硬才撐得到）
  w.bhp[w.core] = w.bmax[w.core] = 1e9;
  let guard = 0;
  while (!(w.day === 2 && w.sweepR < 0 && w.dayT > 5) && guard++ < HZ * 200 && w.state === 'run') w.step();
  let revived = 0; for (let b = 1; b < w.bHigh; b++) revived += w.balive[b];
  assert(revived === placedN, `黎明只復活了 ${revived} / ${placedN} 座`);
  return { aliveAfterDestroy: alive, ghosts, revivedAtDawn: revived, state: w.state };
});

check('藍圖依序自動建造', () => {
  const w = new World({ seed: 21 });
  w.gold = 0;
  const r1 = w.placeOrBlueprint(B_ARROW, 45, 26), r2 = w.placeOrBlueprint(B_CANNON, 46, 26), r3 = w.placeOrBlueprint(B_WALL, 47, 26);
  assert(r1 === 'blueprint' && r2 === 'blueprint' && r3 === 'blueprint', '應該放成藍圖');
  w.start();
  const order = [];
  for (let s = 0; s < HZ * 120 && w.blueprints.length; s++) {
    w.step();
    for (const [x, t] of [[45, B_ARROW], [46, B_CANNON], [47, B_WALL]]) {
      const b = w.bldAt[26 * 100 + x];
      if (b > 0 && w.bt[b] === t && !order.includes(t)) order.push(t);
    }
  }
  assert(order.join() === [B_ARROW, B_CANNON, B_WALL].join(), `順序錯誤：${order}`);
  return { order: order.join('→'), left: w.blueprints.length };
});

check('升級受核心階級限制、紫色需選分支', () => {
  const w = new World({ seed: 22 });
  w.gold = 1e6; w.crystal = 1e6;
  const b = w.place(B_ARROW, 45, 26);
  const r0 = w.upgrade(b);
  assert(r0.startsWith('核心階級不足'), '應被核心階級擋下：' + r0);
  w.upgrade(w.core); w.upgrade(w.core); w.upgrade(w.core);
  assert(!w.upgrade(b) && !w.upgrade(b), '升到藍失敗');
  assert(w.upgrade(b) === '需要選擇分支', '升紫應要求分支');
  assert(!w.upgrade(b, 2) && w.btier[b] === 3 && w.bstats[b].range === 12, '狙擊分支數值不對');
  return { tier: w.btier[b], branch: w.bbranch[b], range: w.bstats[b].range };
});

check('建築蓋滿全圖', () => {
  const w = new World({ seed: 13, events: true });
  w.gold = 1e9; w.lit.fill(1); // 整張地圖都照亮
  let placed = 0;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (w.place(B_WALL, x, y) >= 0) placed++;
  const t0 = performance.now(); w.recomputeFlow(); const flowMs = performance.now() - t0;
  w.start();
  for (let s = 0; s < HZ * 120 && w.state === 'run'; s++) w.step();
  assert(placed > 4000, '放置數太少');
  return { placed, flowMs: +flowMs.toFixed(3), enemiesAlive: w.n, state: w.state };
});

check('3× 速度連續 10 局（記憶體）', () => {
  const heap = [];
  const out = [];
  for (let g = 0; g < 10; g++) {
    const r = runGame({ seed: 500 + g, profile: g % 3 === 2 ? 'none' : g % 3 === 1 ? 'lean' : 'full' });
    out.push(r.result);
    if (globalThis.gc) globalThis.gc();
    heap.push(+(process.memoryUsage().heapUsed / 1048576).toFixed(1));
  }
  const growth = heap[heap.length - 1] - heap[1];
  assert(growth < 8, `堆積持續成長 ${growth.toFixed(1)} MB`);
  return { results: out.join(','), heapMB: heap.join(' → '), growthMB: +growth.toFixed(1) };
});

check('同一個 World 物件 reset 10 次', () => {
  const w = new World({ seed: 1 });
  if (globalThis.gc) globalThis.gc();
  const h0 = process.memoryUsage().heapUsed;
  for (let g = 0; g < 10; g++) {
    w.reset(100 + g); w.gold = 1e5; w.start();
    for (let s = 0; s < HZ * 150; s++) w.step();
  }
  if (globalThis.gc) globalThis.gc();
  const growth = (process.memoryUsage().heapUsed - h0) / 1048576;
  assert(growth < 4, `reset 後記憶體成長 ${growth.toFixed(1)} MB`);
  return { growthMB: +growth.toFixed(2) };
});

for (const r of results) console.log(JSON.stringify(r));
const fail = results.filter(r => !r.ok).length;
console.log(fail ? `失敗 ${fail} 項` : '全部通過');
process.exit(fail ? 1 : 0);
