// 自動玩家平衡測試：依固定建造順序（含升級、晶礦、核心升級）跑完整局。
// 用法：node tools/autoplay.mjs [種子數=5] [profile=full,lean,none]
//   full       完整順序
//   lean       攻擊塔數量減半
//   noupgrade  完全不升級（只蓋白色建築）
//   none       完全不防守
import { World } from '../src/sim/world.js';
import {
  MAP_W, CORE_X0, CORE_Y0, CORE_SIZE, CORE_CX, CORE_CY, HZ, P_DUSK, P_DAWN, EV_BDESTROY,
  B_WALL, B_GOLD, B_CRYSTAL, B_ARROW, B_SCATTER, B_CANNON, B_FROST, B_PRISM, B_AMP,
} from '../src/sim/defs.js';
import { T_VEIN } from '../src/sim/map.js';
import { CARD_BY_ID } from '../src/sim/cards.js';
import { CORE_TYPES, ATTACK_TOWERS, BAL, B_LIGHT, RESEARCH } from '../src/sim/defs.js';
import { performance } from 'node:perf_hooks';

function ring(R) {
  const out = [];
  const x0 = CORE_X0 - R, x1 = CORE_X0 + CORE_SIZE + R - 1, y0 = CORE_Y0 - R, y1 = CORE_Y0 + CORE_SIZE + R - 1;
  for (let x = x0; x <= x1; x++) out.push([x, y0]);
  for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
  for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
  for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
  return out;
}
/** 黃金比例重排，讓前幾個平均分佈在一圈上 */
function spread(arr) {
  const order = [], used = new Set();
  for (let k = 0; k < arr.length; k++) {
    let j = Math.floor(((k * 0.618034) % 1) * arr.length);
    while (used.has(j)) j = (j + 1) % arr.length;
    used.add(j); order.push(arr[j]);
  }
  return order;
}
const every = (arr, k, off = 0) => arr.filter((_, i) => (i + off) % k === 0);

/**
 * 產生行動佇列。行動：
 *  { b: type, x, y }               蓋建築
 *  { core: true }                  升級核心
 *  { up: type, tier, branch }      把所有該類建築升到 tier
 */
export function makePlan(w, profile) {
  const lean = profile === 'lean', noUp = profile === 'noupgrade';
  const pools = {
    arrows: spread(every(ring(5), 2)),
    mines: spread(ring(2).concat(ring(3))),
    cannons: spread(every(ring(4), 3, 1)),
    frost: spread(every(ring(6), 6, 2)),
    prism: spread(every(ring(5), 2, 1)),
    amp: spread(every(ring(3), 4, 2)),
    scatter: spread(every(ring(7), 5, 3)),
    walls: ring(8), walls2: ring(9),
  };
  const veins = [];
  for (let c = 0; c < w.terrain.length; c++) if (w.terrain[c] === T_VEIN) veins.push([c % MAP_W, (c / MAP_W) | 0]);
  veins.sort((a, b) => Math.hypot(a[0] - CORE_CX, a[1] - CORE_CY) - Math.hypot(b[0] - CORE_CX, b[1] - CORE_CY));
  pools.veins = veins;
  // 燈塔：沿著核心 → 晶脈的方向一路點亮（模擬光域，算出要蓋在哪）
  const lit = Uint8Array.from(w.lit), W = MAP_W, H = w.lit.length / MAP_W, lights = [];
  const light = (cx, cy, R) => { for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, cy + R); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, cx + R); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= R * R) lit[y * W + x] = 1; };
  for (const [vx, vy] of veins.slice(0, 10)) {
    let guard = 0;
    while (!lit[vy * W + vx] && guard++ < 8) {
      const dx = vx + 0.5 - CORE_CX, dy = vy + 0.5 - CORE_CY, L = Math.hypot(dx, dy);
      let best = null;
      for (let t = 0; t < L; t += 0.5) {
        const x = Math.floor(CORE_CX + dx / L * t), y = Math.floor(CORE_CY + dy / L * t), c = y * W + x;
        if (!lit[c]) break;
        if (!w.rock[c] && w.terrain[c] !== T_VEIN) best = [x, y];
      }
      if (!best) break;
      lights.push(best); light(best[0] + 0.5, best[1] + 0.5, 9);
    }
  }
  pools.lights = lights;

  const q = [];
  const take = (type, pool, n) => {
    if (lean && type !== B_GOLD && type !== B_CRYSTAL && type !== B_WALL) n = Math.ceil(n / 2);
    for (const c of pools[pool].splice(0, n)) q.push({ b: type, x: c[0], y: c[1] });
  };
  const core = () => { if (!noUp) q.push({ core: true }); };
  const up = (type, tier, branch = 0) => { if (!noUp) q.push({ up: type, tier, branch }); };

  take(B_ARROW, 'arrows', 3); take(B_GOLD, 'mines', 3);
  take(B_GOLD, 'mines', 4); take(B_ARROW, 'arrows', 3);
  take(B_CRYSTAL, 'veins', 2);
  take(B_GOLD, 'mines', 5);
  take(B_WALL, 'walls', 999);
  take(B_CANNON, 'cannons', 3); take(B_ARROW, 'arrows', 4);
  take(B_LIGHT, 'lights', 3); take(B_CRYSTAL, 'veins', 2);
  core();
  take(B_LIGHT, 'lights', 99);
  take(B_GOLD, 'mines', 8); take(B_CRYSTAL, 'veins', 3);
  take(B_FROST, 'frost', 3); take(B_CANNON, 'cannons', 3);
  up(B_ARROW, 1); up(B_CANNON, 1); up(B_GOLD, 1);
  core();
  take(B_PRISM, 'prism', 4); take(B_AMP, 'amp', 2); take(B_ARROW, 'arrows', 6);
  up(B_WALL, 1); up(B_ARROW, 2); up(B_CANNON, 2); up(B_FROST, 1);
  take(B_SCATTER, 'scatter', 4); take(B_CRYSTAL, 'veins', 3);
  up(B_GOLD, 2); up(B_PRISM, 1);
  core();
  up(B_CANNON, 3, 1); up(B_ARROW, 3, 1); up(B_FROST, 2);
  take(B_WALL, 'walls2', 999);
  up(B_PRISM, 2); up(B_WALL, 2); take(B_CANNON, 'cannons', 6);
  up(B_PRISM, 3, 2); up(B_CANNON, 3, 1); up(B_FROST, 3, 1); up(B_SCATTER, 2); up(B_AMP, 2);
  take(B_PRISM, 'prism', 6); up(B_PRISM, 3, 2); up(B_WALL, 3, 2); up(B_SCATTER, 3, 2);
  take(B_ARROW, 'arrows', 99); up(B_ARROW, 3, 1); take(B_CANNON, 'cannons', 99); up(B_CANNON, 3, 1);
  return q;
}

const RESEARCH_ORDER = ['r_range', 'r_beacon', 'r_mine', 'r_trap', 'r_wall', 'r_tesla', 'r_socket', 'r_reso', 'r_rate', 'r_repair', 'r_works', 'r_plat'];
export function runGame({ seed, profile = 'full', mode = 'normal', coreType = 0, cards = true, burst = true, maxDays = 60, research = true }) {
  const w = new World({ seed, events: true, mode, coreType });
  const queue = profile === 'none' ? [] : makePlan(w, profile);
  let destroyed = 0; const destroyedPerNight = [];
  const dmgPerNight = []; let hpAtDusk = -1;
  const tierLog = [];
  const act = () => {
    let guard = 0;
    while (queue.length && guard++ < 400) {
      const a = queue[0];
      if (a.core) {
        const r = w.upgrade(w.core);
        if (r === '已是最高階級') { queue.shift(); continue; }
        if (r) break;
        queue.shift(); tierLog.push(`d${w.day}:${w.coreTier}`); continue;
      }
      if (a.up !== undefined) {
        let pending = false, blocked = false;
        for (let b = 1; b < w.bHigh && !blocked; b++) {
          if (!w.balive[b] || w.bt[b] !== a.up || w.btier[b] >= a.tier) continue;
          const r = w.upgrade(b, a.branch || 1);
          if (r) { pending = true; if (r === '金不足' || r === '晶不足' || r.startsWith('核心')) blocked = true; }
        }
        if (blocked) break;
        if (!pending) queue.shift();
        else break;
        continue;
      }
      const why = w.canPlace(a.b, a.x, a.y);
      if (why === '金不足') break;
      queue.shift();
      if (why === '有敵人在此格') { queue.push(a); continue; }
      if (why) continue;
      w.place(a.b, a.x, a.y);
    }
  };
  const school = CORE_TYPES[coreType].school;
  const smart = () => {
    // 選卡：偏好自己流派、進化卡與傳說卡優先
    while (w.offers.length) {
      const o = w.offers[0];
      if (!cards) { w.offers.shift(); continue; }
      const score = id => { const c = CARD_BY_ID[id]; return (c.school === 'evo' || c.school === 'legend' ? 3 : 0) + (c.school === school ? 2 : 0) + (c.school === 'neutral' ? 0.5 : 0); };
      const best = [...o.cards].sort((a, b) => score(b) - score(a))[0];
      w.pickCard(best);
    }
    if (burst && w.phase >= P_DUSK && w.bhp[w.core] < w.bmax[w.core] * 0.5 && !w.canBurst()) w.lightBurst();
    if (w.tick % 300 === 0) {
      for (let b = 1; b < w.bHigh; b++) if (w.balive[b] && w.btier[b] === 3 && w.bstars[b] === 5 && !w.ascendInfo(b).reason) w.ascend(b);
      // 研究：晶有餘裕就照順序研究
      if (research && w.day >= 3) for (const id of RESEARCH_ORDER) {
        const r = RESEARCH.find(x => x.id === id);
        if (w.research.has(id)) continue;
        if (w.crystal >= r.cost + 120) w.doResearch(id);
        break;
      }
      // 晶核：鑲進空的槽
      for (let b = 1; b < w.bHigh && w.gems.length; b++) {
        const n = w.gemSlots(b);
        for (let k = 0; k < n && w.gems.length; k++) if (!(k ? w.bgem1 : w.bgem0)[b]) w.socketGem(b, k, 0);
      }
    }
  };
  act();
  w.start();
  const t0 = performance.now();
  let steps = 0;
  while (w.state === 'run' && steps < HZ * 6000 && w.day <= maxDays) {
    if (steps % 30 === 0) { act(); smart(); }
    w.step(); steps++;
    for (let e = 0; e < w.evN; e++) if (w.evT[e] === EV_BDESTROY) destroyed++;
    w.evN = 0;
    if (w.phase === P_DUSK && hpAtDusk < 0) hpAtDusk = w.stats.coreDmg;
    if (w.phase === P_DAWN && hpAtDusk >= 0) {
      dmgPerNight.push(Math.round(100 * (w.stats.coreDmg - hpAtDusk) / w.bmax[w.core])); hpAtDusk = -1;
      destroyedPerNight.push(destroyed); destroyed = 0;
    }
  }
  if (hpAtDusk >= 0) { dmgPerNight.push(Math.round(100 * (w.stats.coreDmg - hpAtDusk) / w.bmax[w.core])); destroyedPerNight.push(destroyed); }
  let bld = 0; for (let b = 1; b < w.bHigh; b++) bld += w.balive[b];
  return {
    seed, profile, result: w.state === 'won' ? '破曉' : '陷落', day: w.day,
    coreHpAtDawn: w.stats.coreHpAtDawn, dmgPctPerNight: dmgPerNight, destroyedPerNight,
    peak: w.stats.peak, kills: w.stats.kills, buildingsAlive: bld, queueLeft: queue.length, coreTiers: tierLog.join(' '),
    revived: w.stats.revived, lordKilled: !!w.stats.lordKilledDay, lordKills: w.stats.lordKills, bosses: w.stats.bossKilled.join(','), cards: w.cards.join(','),
    purified: Math.round(w.stats.purified), maxStars: w.stats.maxStars, bursts: w.stats.bursts, core: coreType,
    research: w.research.size, gems: w.gems.length, ruins: w.ruins.filter(r => r.claimed).length, lights: w.typeCount[B_LIGHT], gold: Math.round(w.gold), goldRate: Math.round(w.goldRate),
    mode, simSeconds: Math.round(steps / HZ), wallMs: Math.round(performance.now() - t0),
  };
}

if (process.argv[1]?.endsWith('autoplay.mjs')) {
  const seeds = +(process.argv[2] ?? 5);
  const profiles = process.argv[3] ? process.argv[3].split(',') : ['full', 'lean', 'none'];
  const mode = process.argv[4] || 'normal';
  const cores = process.argv[5] ? process.argv[5].split(',').map(Number) : [0];
  const noCards = process.argv.includes('--nocards');
  const balArg = process.argv.find(x => x.startsWith('--bal='));
  if (balArg) Object.assign(BAL, JSON.parse(balArg.slice(6)));
  for (let s = 0; s < seeds; s++) {
    const seed = 20261022 + s * 7919;
    for (const coreType of cores) for (const profile of profiles) {
      const r = runGame({ seed, profile, mode, coreType, cards: !noCards });
      console.log(JSON.stringify({ seed: r.seed, core: r.core, profile: r.profile, result: r.result, day: r.day, dmg: r.dmgPctPerNight.join(' '), lost: r.destroyedPerNight.join(' '),
        bosses: r.bosses, lord: r.lordKills, purified: r.purified, research: r.research, gems: r.gems, ruins: r.ruins, lights: r.lights, gold: r.gold, goldRate: r.goldRate, peak: r.peak, ms: r.wallMs }));
    }
  }
}
