// 把模擬狀態轉成形狀實例。只讀取模擬陣列。
import {
  MAP_W, MAP_H, N_CELLS, CORE_CX, CORE_CY, PHASE_START, P_DAWN, P_DAY, P_DUSK, P_NIGHT,
  B_WALL, B_GOLD, B_CRYSTAL, B_ARROW, B_SCATTER, B_CANNON, B_FROST, B_PRISM, B_AMP, B_LIGHT, B_TRAP, B_REPAIR, B_TESLA,
  E_FLYER, E_HEALER, E_SHIELD, E_CLOAK, E_BURROW, GEM_COLORS,
  BUILD_DEFS, statsOf, E_SPIKE, E_HEAVY, E_DIAMOND, E_HEX, E_LORD,
  E_TIDE, E_EATER, E_ECLIPSE, E_BROOD, E_SHADE, IS_BOSS, CORE_TYPES,
} from '../sim/defs.js';
import { T_VEIN } from '../sim/map.js';
import { BK_ARROW, BK_SHELL, BK_PELLET } from '../sim/world.js';
import {
  S_BOX, S_TRI, S_DIAMOND, S_HEX, S_STAR, S_CIRCLE, S_RING, S_CAPSULE, S_GLOW, S_DASHBOX, S_ROUNDBOX,
  hex, mix, pack,
} from './gl.js';

export const TIER_HEX = ['#f4f1e8', '#46c879', '#4b96ee', '#a76cf2', '#9fe8f2'];
const C = {
  bgDay: hex('#efe9dc'), bgDusk: hex('#cf946c'), bgNight: hex('#0f1117'),
  lineDay: hex('#d8cfbd'), lineDusk: hex('#bb825c'), lineNight: hex('#1a1d26'),
  outDay: hex('#e4ddcd'), outNight: hex('#090a0e'),
  edgeDay: hex('#2a2724'), edgeNight: hex('#ece6d8'),
  bldNight: hex('#20232c'),
  rockDay: hex('#c4bba9'), rockNight: hex('#252830'),
  enemyDay: hex('#d9453b'), enemyNight: hex('#ff5244'),
  enemyEdgeDay: hex('#7d211b'), enemyEdgeNight: hex('#ffb0a5'),
  gold: hex('#e3b23c'), cyan: hex('#35c4c8'), danger: hex('#ff3b30'), light: hex('#ffe9b8'),
  tiers: TIER_HEX.map(hex),
};

/** 依時段算出「暗度」0（白晝）..1（夜晚） */
export function darkness(w) {
  const tIn = w.dayT - PHASE_START[w.phase];
  const ss = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  if (w.state === 'won') return w.sweepR >= 0 ? 0.85 * (1 - ss(w.sweepR / w.sweepMax * 1.2)) : 0;
  if (w.phase === P_DAWN) return (w.day === 1 ? 0.15 : 0.85) * (1 - ss(tIn / 12));
  if (w.phase === P_DAY) return 0;
  if (w.phase === P_DUSK) return 0.85 * ss(tIn / 25);
  return 0.85 + 0.15 * ss(tIn / 4);
}
const mix3 = (a, b, c, t) => t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);

export function palette(d) {
  const nightish = Math.min(1, Math.max(0, (d - 0.45) / 0.4));
  const edge = mix(C.edgeDay, C.edgeNight, nightish);
  const tierFill = C.tiers.map(t => pack(mix(mix(t, [1, 1, 1], 0.2), mix(C.bldNight, t, 0.3), nightish)));
  const tierEdge = C.tiers.map((t, i) => pack(i === 0 ? edge : mix(mix(t, [0, 0, 0], 0.35), mix(t, [1, 1, 1], 0.25), nightish)));
  return {
    d, nightish,
    bg: mix3(C.bgDay, C.bgDusk, C.bgNight, d),
    line: mix3(C.lineDay, C.lineDusk, C.lineNight, d),
    outside: mix(C.outDay, C.outNight, d),
    edge: pack(edge), edgeRGB: edge, edgeSoft: pack(edge, 0.3),
    tierFill, tierEdge, tierRGB: C.tiers,
    bldFill: tierFill[0],
    rock: pack(mix(C.rockDay, C.rockNight, d)),
    enemy: pack(mix(C.enemyDay, C.enemyNight, nightish)),
    enemyEdge: pack(mix(C.enemyEdgeDay, C.enemyEdgeNight, nightish)),
    enemyGlow: pack([0.6, 0.06, 0.05], 0.2 * nightish),
    eshot: pack(C.danger, 0.95),
    flash: pack([1, 1, 1]),
    gold: pack(C.gold), cyan: pack(C.cyan), cyanSoft: pack(C.cyan, 0.07), cyanEdge: pack(C.cyan, 0.35),
    vein: pack(C.cyan, 0.5), veinEdge: pack(C.cyan, 0.9),
    danger: pack(C.danger), dangerSoft: pack(C.danger, 0.14),
    light: pack(C.light, 0.9), lightGlow: pack(C.light, 0.13 * nightish), coreGlow: pack(C.light, 0.2 * nightish),
    bullet: pack(mix(C.edgeDay, [1, 0.95, 0.82], nightish)),
    shell: pack(mix(C.edgeDay, [1, 0.82, 0.45], nightish)),
    boom: pack(mix([0.2, 0.18, 0.16], [1, 0.8, 0.45], nightish), 0.9),
    boomFill: pack([1, 0.75, 0.35], 0.35),
    burn: pack(C.gold, 0.22), burnHot: pack([1, 0.55, 0.2], 0.35),
    build: pack(edge, 0.6),
    range: pack(edge, 0.07), rangeEdge: pack(edge, 0.45),
    ok: pack([0.25, 0.75, 0.45], 0.5), bad: pack(C.danger, 0.5),
    hpBack: pack([0, 0, 0], 0.35), hpFill: pack([0.35, 0.85, 0.5]), hpLow: pack(C.danger),
    white: pack([1, 1, 1]),
    sweep: pack(C.light, 0.85), sweepGlow: pack(C.light, 0.25),
    ghost: pack(edge, 0.45), blueprint: pack(C.cyan, 0.8), blueprintFill: pack(C.cyan, 0.08),
    elite: pack(C.gold, 0.9),
    disabled: pack([0.5, 0.5, 0.55], 0.55),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** 畫一座建築的圖示（也用於藍圖與殘影的半透明版本） */
export function drawBuilding(r, P, type, tier, branch, x, y, s, ang, t, fill, edge, ghost = false, kickT = 9) {
  const tf = ghost ? 0 : fill, te = edge;
  const acc = ghost ? edge : te;
  switch (type) {
    case B_WALL:
      r.push(x, y, 0.96 * s, 0.96 * s, 0, S_ROUNDBOX, tf, te);
      if (branch === 1) for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        r.push(x + Math.cos(a) * 0.36 * s, y + Math.sin(a) * 0.36 * s, 0.22 * s, 0.22 * s, a, S_TRI, acc, 0);
      }
      else if (branch === 2) r.push(x, y, 0.36 * s, 0.36 * s, 0, S_CIRCLE, ghost ? 0 : P.hpFill, acc);
      else r.push(x, y, 0.4 * s, 0.4 * s, 0, S_BOX, (acc & 0x00ffffff) | (0x30 << 24), 0);
      break;
    case B_GOLD:
      r.push(x, y, 0.86 * s, 0.86 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.5 * s, 0.5 * s, t * 0.8, S_DIAMOND, ghost ? 0 : P.gold, acc);
      break;
    case B_CRYSTAL:
      r.push(x, y, 0.86 * s, 0.86 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.36 * s, 0.6 * s, 0, S_DIAMOND, ghost ? 0 : P.cyan, acc);
      break;
    case B_ARROW: {
      const kick = Math.max(0, 0.08 - kickT) * 1.2;
      r.push(x, y, 0.86 * s, 0.86 * s, 0, S_ROUNDBOX, tf, te);
      const cx = x - Math.cos(ang) * kick, cy = y - Math.sin(ang) * kick;
      if (branch === 2) {
        r.push(cx + Math.cos(ang) * 0.2, cy + Math.sin(ang) * 0.2, 0.7 * s, 0.14 * s, ang, S_CAPSULE, acc, 0);
        r.push(cx, cy, 0.34 * s, 0.34 * s, ang, S_TRI, acc, 0);
      } else if (branch === 1) {
        const px = -Math.sin(ang) * 0.13, py = Math.cos(ang) * 0.13;
        r.push(cx + px, cy + py, 0.4 * s, 0.4 * s, ang, S_TRI, acc, 0);
        r.push(cx - px, cy - py, 0.4 * s, 0.4 * s, ang, S_TRI, acc, 0);
      } else r.push(cx, cy, 0.56 * s, 0.56 * s, ang, S_TRI, acc, 0);
      break;
    }
    case B_SCATTER: {
      r.push(x, y, 0.88 * s, 0.88 * s, 0, S_ROUNDBOX, tf, te);
      const n = branch === 1 ? 5 : 3;
      for (let k = 0; k < n; k++) {
        const a = ang + (k / (n - 1) - 0.5) * 1.0;
        r.push(x + Math.cos(a) * 0.16, y + Math.sin(a) * 0.16, 0.26 * s, 0.26 * s, a, S_TRI, acc, 0);
      }
      if (branch === 2) r.push(x, y, 0.62 * s, 0.62 * s, 0, S_RING, acc, 0);
      break;
    }
    case B_CANNON: {
      const kick = Math.max(0, 0.15 - kickT) * 1.3;
      r.push(x, y, 0.92 * s, 0.92 * s, 0, S_ROUNDBOX, tf, te);
      const L = branch === 2 ? 0.8 : 0.6, W = branch === 2 ? 0.3 : 0.22;
      r.push(x + Math.cos(ang) * (0.28 - kick), y + Math.sin(ang) * (0.28 - kick), L * s, W * s, ang, S_CAPSULE, acc, 0);
      r.push(x, y, (branch === 2 ? 0.58 : 0.5) * s, (branch === 2 ? 0.58 : 0.5) * s, 0, S_CIRCLE, tf, acc);
      if (branch === 1) for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + t;
        r.push(x + Math.cos(a) * 0.12, y + Math.sin(a) * 0.12, 0.1, 0.1, 0, S_CIRCLE, acc, 0);
      }
      break;
    }
    case B_FROST:
      r.push(x, y, 0.88 * s, 0.88 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.62 * s, 0.62 * s, t * 0.4, S_HEX, ghost ? 0 : P.cyan, acc);
      if (branch === 1) r.push(x, y, 0.2 * s, 0.2 * s, 0, S_CIRCLE, P.white, 0);
      if (branch === 2) r.push(x, y, 0.34 * s, 0.34 * s, -t, S_STAR, P.white, 0);
      break;
    case B_PRISM:
      r.push(x, y, 0.88 * s, 0.88 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.62 * s, 0.38 * s, ang, S_DIAMOND, ghost ? 0 : P.light, acc);
      if (branch === 1) for (const o of [-0.35, 0.35]) r.push(x + Math.cos(ang + o) * 0.28, y + Math.sin(ang + o) * 0.28, 0.12, 0.12, 0, S_CIRCLE, acc, 0);
      if (branch === 2) r.push(x + Math.cos(ang) * 0.3, y + Math.sin(ang) * 0.3, 0.16, 0.16, 0, S_CIRCLE, P.gold, 0);
      break;
    case B_AMP:
      r.push(x, y, 0.88 * s, 0.88 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.64 * s, 0.64 * s, 0, S_RING, acc, 0);
      r.push(x, y, 0.38 * s, 0.38 * s, t * 0.6, S_STAR, branch === 2 ? P.gold : acc, 0);
      break;
    case B_LIGHT:
      r.push(x, y, 0.8 * s, 0.8 * s, 0.785, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.5 * s, 0.5 * s, t * 0.3, S_STAR, ghost ? 0 : P.light, acc);
      r.push(x, y, 0.16 * s, 0.16 * s, 0, S_CIRCLE, ghost ? 0 : P.white, 0);
      break;
    case B_TRAP:
      for (let k = 0; k < 4; k++) {
        const ox = (k & 1 ? 0.2 : -0.2) * s, oy = (k & 2 ? 0.2 : -0.2) * s;
        r.push(x + ox, y + oy, 0.28 * s, 0.28 * s, -Math.PI / 2, S_TRI, branch === 2 ? P.cyan : branch === 1 ? pack([0.45, 0.8, 0.3]) : acc, 0);
      }
      if (!ghost) r.push(x, y, 0.9 * s, 0.9 * s, 0, S_DASHBOX, 0, (acc & 0x00ffffff) | (0x50 << 24));
      break;
    case B_REPAIR:
      r.push(x, y, 0.86 * s, 0.86 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.56 * s, 0.16 * s, 0, S_BOX, ghost ? acc : P.hpFill, 0);
      r.push(x, y, 0.16 * s, 0.56 * s, 0, S_BOX, ghost ? acc : P.hpFill, 0);
      break;
    case B_TESLA:
      r.push(x, y, 0.86 * s, 0.86 * s, 0, S_ROUNDBOX, tf, te);
      r.push(x, y, 0.3 * s, 0.62 * s, 0, S_DIAMOND, ghost ? 0 : pack([0.6, 0.8, 1]), acc);
      r.push(x, y - 0.22 * s, 0.16 * s, 0.16 * s, 0, S_CIRCLE, ghost ? 0 : P.white, 0);
      if (branch === 1) r.push(x, y, 0.72 * s, 0.72 * s, t * 2, S_RING, acc, 0);
      if (branch === 2) r.push(x, y, 0.3 * s, 0.3 * s, t, S_STAR, P.gold, 0);
      break;
  }
}

const gemCol = GEM_COLORS.map(c => c ? pack(hex(c)) : 0);
export function drawScene(r, w, fx, view, alpha) {
  const d = darkness(w);
  const P = palette(d);
  const t = w.vt;          // 動畫用視覺時鐘
  const simT = w.time;     // 與模擬計時欄位比較用
  r.begin();

  // ── 地形：晶脈、岩石 ──
  const terr = w.terrain, rock = w.rock;
  for (let c = 0; c < N_CELLS; c++) {
    if (rock[c]) r.push((c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5, 1.02, 1.02, 0, S_BOX, P.rock, 0);
    else if (terr[c] === T_VEIN && w.bldAt[c] < 0) r.push((c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5, 0.5, 0.5, 0.785, S_BOX, P.vein, P.veinEdge);
  }

  // ── 光域外的黑暗（不能建造） ──
  const lit = w.lit;
  const fogCol = pack(mix([0.36, 0.32, 0.28], [0, 0, 0], P.nightish), 0.38 + 0.25 * P.nightish);
  for (let c = 0; c < N_CELLS; c++) if (!lit[c]) r.push((c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5, 1.02, 1.02, 0, S_BOX, fogCol, 0);
  // ── 遺跡 ──
  if (w.ruins) for (const ru of w.ruins) {
    const x = ru.x + 0.5, y = ru.y + 0.5;
    if (ru.claimed) { r.push(x, y, 0.9, 0.9, 0, S_HEX, 0, pack(P.edgeRGB, 0.25)); continue; }
    const k = 0.5 + 0.5 * Math.sin(t * 2 + ru.x);
    r.push(x, y, 2.4, 2.4, 0, S_GLOW, pack([1, 0.8, 0.4], 0.25 + 0.2 * k), 0);
    r.push(x, y, 1.1, 1.1, t * 0.3, S_HEX, pack([0.3, 0.24, 0.15], 0.6), pack([1, 0.82, 0.45], 0.9));
    r.push(x, y, 0.45, 0.45, -t * 0.6, S_STAR, pack([1, 0.85, 0.5]), 0);
  }

  // ── 暗晶（夜裡擊殺留下，黎明光波淨化成晶） ──
  const dark = w.darkC;
  const darkCol = pack(mix([0.42, 0.28, 0.62], [0.7, 0.5, 1], P.nightish), 0.85);
  for (let c = 0; c < N_CELLS; c++) {
    const a = dark[c];
    if (a < 0.04) continue;
    const sz = Math.min(0.62, 0.16 + Math.sqrt(a) * 0.32);
    r.push((c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5, sz * 0.7, sz, 0, S_DIAMOND, darkCol, 0);
  }

  // ── 蝕的黑暗圈 ──
  for (let i = 0; i < w.n; i++) {
    if (w.et[i] !== E_ECLIPSE) continue;
    const x = w.epx[i] + (w.ex[i] - w.epx[i]) * alpha, y = w.epy[i] + (w.ey[i] - w.epy[i]) * alpha;
    r.push(x, y, 14, 14, 0, S_CIRCLE, pack([0.02, 0.01, 0.04], 0.42), 0);
    r.push(x, y, 14, 14, t * 0.2, S_RING, pack([0.6, 0.2, 0.8], 0.5), 0);
  }

  // ── 燃燒帶 ──
  const burnT = w.cellBurnT;
  for (let c = 0; c < N_CELLS; c++) {
    if (burnT[c] > simT) {
      const k = Math.min(1, (burnT[c] - simT) / 3);
      r.push((c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5, 0.95, 0.95, 0, S_BOX, (P.burnHot & 0x00ffffff) | ((Math.round(90 * k) & 255) << 24), 0);
    }
  }

  // ── 光環範圍（冰晶：淡青色；增幅：階級色虛環） ──
  for (let b = 1; b < w.bHigh; b++) {
    if (!w.balive[b]) continue;
    const bt = w.bt[b];
    if (bt !== B_FROST && bt !== B_AMP) continue;
    const s = w.bstats[b], R = s.aura * 2, x = w.bx[b] + 0.5, y = w.by[b] + 0.5;
    if (w.bdis[b] > simT) continue;
    if (bt === B_FROST) { r.push(x, y, R, R, 0, S_CIRCLE, P.cyanSoft, 0); r.push(x, y, R, R, 0, S_RING, P.cyanEdge, 0); }
    else r.push(x, y, R, R, 0, S_RING, (P.tierEdge[w.btier[b]] & 0x00ffffff) | (0x40 << 24), 0);
  }

  // ── 夜間光暈（核心與塔） ──
  if (P.nightish > 0.01) {
    r.push(CORE_CX, CORE_CY, 22 + w.btier[w.core] * 3, 22 + w.btier[w.core] * 3, 0, S_GLOW, P.coreGlow, 0);
    for (let b = 1; b < w.bHigh; b++) {
      if (!w.balive[b] || w.bt[b] === B_WALL) continue;
      r.push(w.bx[b] + 0.5, w.by[b] + 0.5, 7, 7, 0, S_GLOW, P.lightGlow, 0);
    }
  }

  // ── 主攻方向預警 ──
  if (w.warnDirs.length && (w.phase === P_DUSK || w.phase === P_NIGHT) && w.state === 'run') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    for (const dir of w.warnDirs) {
      const horiz = dir.side % 2 === 0;
      const len = dir.w * (horiz ? MAP_W : MAP_H);
      const cxp = horiz ? dir.u * MAP_W : (dir.side === 1 ? MAP_W - 0.6 : 0.6);
      const cyp = horiz ? (dir.side === 0 ? 0.6 : MAP_H - 0.6) : dir.u * MAP_H;
      const a = 0.25 + 0.35 * pulse;
      r.push(cxp, cyp, horiz ? len : 1.2, horiz ? 1.2 : len, 0, S_BOX, pack([1, 0.23, 0.19], a * 0.6), 0);
      const inward = dir.side === 0 ? Math.PI / 2 : dir.side === 1 ? Math.PI : dir.side === 2 ? -Math.PI / 2 : 0;
      for (let k = -1; k <= 1; k++) {
        const off = k * len * 0.3;
        const ax = horiz ? cxp + off : cxp + Math.cos(inward) * (2.4 + pulse * 0.8);
        const ay = horiz ? cyp + Math.sin(inward) * (2.4 + pulse * 0.8) : cyp + off;
        r.push(ax, ay, 2.2, 2.2, inward, S_TRI, pack([1, 0.23, 0.19], 0.55 + 0.4 * pulse), 0);
      }
    }
  }

  // ── 選取 / 預覽的射程圈 ──
  const showRange = (x, y, range, ok) => {
    r.push(x, y, range * 2, range * 2, 0, S_CIRCLE, ok ? P.range : pack(C.danger, 0.08), 0);
    r.push(x, y, range * 2, range * 2, 0, S_RING, ok ? P.rangeEdge : P.bad, 0);
  };
  if (view.selected > 0 && w.balive[view.selected] && !view.multi.length) {
    const b = view.selected, s = w.bstats[b];
    const R = s.range || s.aura || s.light;
    if (R) showRange(w.bx[b] + 0.5, w.by[b] + 0.5, R, true);
  }
  if (view.buildType && view.hover && !view.dragCells) {
    const s = statsOf(view.buildType, 0, 0), R = s.range || s.aura || (s.light ? s.light + (w.research.has('r_beacon') ? 3 : 0) : 0);
    if (R) showRange(view.hover.x + 0.5, view.hover.y + 0.5, R, view.hoverOk);
  }

  // ── 殘影與藍圖 ──
  for (const g of w.ghosts) {
    r.push(g.x + 0.5, g.y + 0.5, 0.96, 0.96, 0, S_DASHBOX, 0, P.ghost);
    drawBuilding(r, P, g.type, g.tier, g.branch, g.x + 0.5, g.y + 0.5, 0.8, -Math.PI / 2, t, 0, P.ghost, true);
  }
  for (let k = 0; k < w.blueprints.length; k++) {
    const p = w.blueprints[k];
    r.push(p.x + 0.5, p.y + 0.5, 0.96, 0.96, 0, S_DASHBOX, P.blueprintFill, P.blueprint);
    drawBuilding(r, P, p.type, 0, 0, p.x + 0.5, p.y + 0.5, 0.7, -Math.PI / 2, t, 0, P.blueprint, true);
  }

  // ── 建築 ──
  for (let b = 1; b < w.bHigh; b++) {
    if (!w.balive[b]) continue;
    const bt = w.bt[b], tier = w.btier[b];
    let x = w.bx[b] + 0.5, y = w.by[b] + 0.5;
    const age = t - w.bborn[b], upAge = t - w.bupT[b];
    let s = 1;
    if (age < 0.18) { const k = age / 0.18; s = k < 0.5 ? lerp(0.35, 1.18, k * 2) : lerp(1.18, 1, (k - 0.5) * 2); }
    else if (upAge < 0.22) { const k = upAge / 0.22; s = 1 + 0.25 * Math.sin(k * Math.PI); }
    const hitAge = t - w.bhitT[b];
    if (hitAge < 0.12) { x += Math.sin(b * 12.9 + t * 90) * 0.05; y += Math.cos(b * 7.3 + t * 80) * 0.05; }
    const hpf = w.bhp[b] / w.bmax[b];
    const low = hpf < 0.3;
    const dis = w.bdis[b] > simT;
    let fill = P.tierFill[tier], edge = P.tierEdge[tier];
    if (low && Math.sin(t * 14) > 0) edge = P.danger;
    if (dis) { fill = P.disabled; if (Math.sin(t * 20) > 0.3) edge = P.danger; }
    // 快被突破：最近被打、血量低於一半 → 紅色脈動光暈（白天也看得到）
    if (hitAge < 0.4 && hpf < 0.5) {
      const k = (1 - hpf) * (0.6 + 0.4 * Math.sin(t * 12));
      r.push(x, y, 3.2, 3.2, 0, S_GLOW, pack(C.danger, 0.55 * k), 0);
    }
    if (w.basc[b]) {
      r.push(x, y, 1.9, 1.9, 0, S_GLOW, pack([1, 0.85, 0.45], 0.35 + 0.15 * Math.sin(t * 3 + b)), 0);
      r.push(x, y, 1.25, 1.25, t * 0.8, S_STAR, 0, pack([1, 0.85, 0.45], 0.9));
    }
    if (w.bdark[b] > simT) fill = pack([0.08, 0.05, 0.12]);
    drawBuilding(r, P, bt, tier, w.bbranch[b], x, y, s, w.bang[b], t, fill, edge, false, t - w.bfire[b]);
    const st = w.bstars[b];
    if (st) for (let k = 0; k < st; k++) r.push(x - 0.36 + k * 0.18, y + 0.5, 0.14, 0.14, 0, S_STAR, P.gold, 0);
    if (w.bgem0[b]) r.push(x - 0.38, y - 0.38, 0.2, 0.26, 0, S_DIAMOND, gemCol[w.bgem0[b] & 3], 0);
    if (w.bgem1[b]) r.push(x + 0.38, y - 0.38, 0.2, 0.26, 0, S_DIAMOND, gemCol[w.bgem1[b] & 3], 0);
    // 勝利：光波掃過時建築依序亮起
    if (w.state === 'won' && w.sweepR >= 0) {
      const dd = Math.hypot(x - CORE_CX, y - CORE_CY), k = w.sweepR - dd;
      if (k > 0 && k < 10) r.push(x, y, 3, 3, 0, S_GLOW, pack(C.light, 0.9 * (1 - k / 10)), 0);
    }
    if (hpf < 0.999) {
      r.push(x, y - 0.62, 0.84, 0.13, 0, S_BOX, P.hpBack, 0);
      r.push(x - 0.4 + 0.4 * hpf, y - 0.62, 0.8 * hpf, 0.09, 0, S_BOX, low ? P.hpLow : P.hpFill, 0);
    }
  }

  // ── 核心 ──
  {
    const c = w.core, tier = w.btier[c];
    const hpf = w.bhp[c] / w.bmax[c];
    const hit = t - w.coreHitT < 0.3;
    const pulse = 1 + 0.04 * Math.sin(t * 2.5);
    const e = P.tierEdge[tier];
    const upAge = t - w.bupT[c];
    const us = upAge < 0.3 ? 1 + 0.15 * Math.sin(upAge / 0.3 * Math.PI) : 1;
    r.push(CORE_CX, CORE_CY, 2.9 * us, 2.9 * us, 0, S_ROUNDBOX, P.tierFill[tier], hit ? P.danger : e);
    r.push(CORE_CX, CORE_CY, 2.2 * pulse, 2.2 * pulse, t * 0.3, S_HEX, 0, e);
    if (tier >= 2) r.push(CORE_CX, CORE_CY, 1.8, 1.8, -t * 0.2, S_HEX, 0, e);
    const coreCol = [P.light, pack([1, 0.62, 0.25]), pack([0.6, 0.85, 1]), pack([0.72, 0.58, 1])][w.coreType] ?? P.light;
    r.push(CORE_CX, CORE_CY, 1.3, 1.3, -t * 0.6, S_STAR, coreCol, e);
    r.push(CORE_CX, CORE_CY, 0.5 * pulse, 0.5 * pulse, 0, S_CIRCLE, P.white, 0);
    if (w.shield > 0) r.push(CORE_CX, CORE_CY, 4.4, 4.4, t * 0.4, S_RING, pack([0.55, 0.9, 1], 0.75), 0);
    if (hpf < 0.999) {
      r.push(CORE_CX, CORE_CY - 1.85, 3.0, 0.2, 0, S_BOX, P.hpBack, 0);
      r.push(CORE_CX - 1.45 + 1.45 * hpf, CORE_CY - 1.85, 2.9 * hpf, 0.14, 0, S_BOX, hpf < 0.3 ? P.hpLow : P.hpFill, 0);
    }
    if (hit) r.push(CORE_CX, CORE_CY, 5.5, 5.5, 0, S_RING, pack(C.danger, 0.6 * (1 - (t - w.coreHitT) / 0.3)), 0);
  }
  // ── 第二太陽 ──
  if (w.sun2 && w.mods.secondSun) {
    const { x, y } = w.sun2, p2 = 1 + 0.06 * Math.sin(t * 3);
    r.push(x, y, 2.2 * p2, 2.2 * p2, 0, S_GLOW, pack(C.light, 0.5), 0);
    r.push(x, y, 1.3, 1.3, t * 0.4, S_HEX, 0, P.edge);
    r.push(x, y, 0.9, 0.9, -t * 0.7, S_STAR, P.light, P.edge);
  }

  // ── 敵人 ──
  const n = w.n;
  const ex = w.ex, ey = w.ey, epx = w.epx, epy = w.epy, et = w.et, erot = w.erot, efl = w.eflash, erad = w.erad, eel = w.eelite;
  if (P.nightish > 0.05 && !view.noGlow) {
    for (let i = 0; i < n; i++) {
      const s = erad[i] * 5;
      r.push(epx[i] + (ex[i] - epx[i]) * alpha, epy[i] + (ey[i] - epy[i]) * alpha, s, s, 0, S_GLOW, P.enemyGlow, 0);
    }
  }
  const freezeT = w.cellFreezeT;
  let lordI = -1;
  for (let i = 0; i < n; i++) {
    const x = epx[i] + (ex[i] - epx[i]) * alpha, y = epy[i] + (ey[i] - epy[i]) * alpha;
    const tp = et[i], s = erad[i] * 2;
    const fl = efl[i] > 0 ? P.flash : P.enemy;
    let shape = S_BOX;
    if (tp === E_SPIKE) shape = S_TRI;
    else if (tp === E_HEAVY) shape = S_ROUNDBOX;
    else if (tp === E_DIAMOND) shape = S_DIAMOND;
    else if (tp === E_HEX) shape = S_HEX;
    else if (tp === E_SHADE) shape = S_CIRCLE;
    if (eel[i]) r.push(x, y, s * 1.7, s * 1.7, t * 2 + i, S_RING, P.elite, 0);
    if (tp >= E_FLYER) {
      const c = (ey[i] | 0) * MAP_W + (ex[i] | 0), fr = freezeT[c] > simT;
      if (tp === E_FLYER) r.push(x, y, s * 1.2, s * 0.9, erot[i], S_TRI, efl[i] > 0 ? P.flash : pack([1, 0.55, 0.45], 0.9), P.enemyEdge);
      else if (tp === E_HEALER) { r.push(x, y, s, s, 0, S_CIRCLE, fl, P.enemyEdge); r.push(x, y, s * 0.6, s * 0.18, 0, S_BOX, pack([0.4, 1, 0.55]), 0); r.push(x, y, s * 0.18, s * 0.6, 0, S_BOX, pack([0.4, 1, 0.55]), 0); }
      else if (tp === E_SHIELD) { r.push(x, y, 5, 5, 0, S_RING, pack([1, 0.75, 0.3], 0.25), 0); r.push(x, y, s, s, erot[i], S_HEX, fl, pack([1, 0.8, 0.4])); }
      else if (tp === E_CLOAK) r.push(x, y, s, s, 0, S_DIAMOND, efl[i] > 0 ? P.flash : pack([0.85, 0.3, 0.3], 0.28), pack([1, 0.5, 0.45], 0.35));
      else if (tp === E_BURROW) { r.push(x, y, s * 1.1, s * 1.1, 0, S_CIRCLE, pack([0.35, 0.22, 0.12], 0.6), 0); r.push(x, y, s, s, erot[i], S_DASHBOX, 0, P.enemyEdge); }
      if (fr) r.push(x, y, s * 1.3, s * 1.3, 0, S_RING, P.cyan, 0);
      continue;
    }
    if (IS_BOSS[tp]) { lordI = i; continue; } // 最後畫，壓在潮水上方
    if (tp === E_SHADE) { r.push(x, y, s * 1.6, s * 1.6, 0, S_GLOW, pack([0.5, 0.1, 0.6], 0.5), 0); r.push(x, y, s, s, 0, S_CIRCLE, pack([0.06, 0.02, 0.08]), pack([0.85, 0.4, 1])); continue; }
    r.push(x, y, s, s, tp === E_DIAMOND ? 0 : erot[i], shape, fl, P.enemyEdge);
    const c = (ey[i] | 0) * MAP_W + (ex[i] | 0);
    if (freezeT[c] > simT) r.push(x, y, s * 1.3, s * 1.3, 0, S_RING, P.cyan, 0);
  }

  if (lordI >= 0) {
    const i = lordI, tp = et[i];
    const x = epx[i] + (ex[i] - epx[i]) * alpha, y = epy[i] + (ey[i] - epy[i]) * alpha;
    const s = erad[i] * 2.5, pul = 1 + 0.06 * Math.sin(t * 5);
    const body = efl[i] > 0 ? P.flash : pack([0.55, 0.06, 0.08]), rim = pack([1, 0.45, 0.4]);
    r.push(x, y, s * 3, s * 3, 0, S_GLOW, pack(tp === E_ECLIPSE ? [0.6, 0.15, 0.85] : tp === E_EATER ? [1, 0.75, 0.3] : C.danger, 0.45), 0);
    if (tp === E_LORD) {
      r.push(x, y, s * 1.15, s * 1.15, 0, S_CIRCLE, pack([0.05, 0.02, 0.03], 0.85), 0);
      r.push(x, y, s * pul, s * pul, erot[i], S_STAR, body, rim);
      r.push(x, y, s * 0.55, s * 0.55, -erot[i] * 2, S_STAR, P.enemy, 0);
      r.push(x, y, s * 0.25, s * 0.25, -erot[i] * 3, S_HEX, P.white, 0);
    } else if (tp === E_TIDE) {
      // 深潮：一圈圈往外擴散的波紋
      for (let k = 0; k < 3; k++) { const ph = (t * 0.6 + k / 3) % 1; r.push(x, y, s * (1 + ph * 1.6), s * (1 + ph * 1.6), 0, S_RING, pack(C.danger, 0.5 * (1 - ph)), 0); }
      r.push(x, y, s * pul, s * pul, 0, S_CIRCLE, body, rim);
      r.push(x, y, s * 0.6, s * 0.6, erot[i], S_HEX, pack([0.2, 0.02, 0.04]), rim);
      r.push(x, y, s * 0.25, s * 0.25, 0, S_CIRCLE, P.enemy, 0);
    } else if (tp === E_EATER) {
      // 噬光者：尖銳的飛行體，朝目標方向
      const a = erot[i];
      r.push(x, y, s * 1.3 * pul, s * 0.9, a, S_TRI, body, rim);
      r.push(x - Math.cos(a) * s * 0.35, y - Math.sin(a) * s * 0.35, s * 0.7, s * 0.25, a, S_CAPSULE, pack([1, 0.75, 0.3], 0.8), 0);
      r.push(x, y, s * 0.3, s * 0.3, 0, S_CIRCLE, P.white, 0);
    } else if (tp === E_ECLIPSE) {
      // 蝕：黑色圓盤＋紅紫色日冕
      r.push(x, y, s * 1.4 * pul, s * 1.4 * pul, t * 0.3, S_STAR, pack([0.6, 0.15, 0.85], 0.55), 0);
      r.push(x, y, s * 1.05, s * 1.05, 0, S_CIRCLE, efl[i] > 0 ? P.flash : pack([0.02, 0.01, 0.03]), pack([0.9, 0.4, 1]));
      r.push(x, y, s * 1.12, s * 1.12, -t * 0.5, S_RING, pack([1, 0.5, 0.9], 0.7), 0);
    } else if (tp === E_BROOD) {
      // 群母：大六角，外殼碎片繞著轉
      r.push(x, y, s * pul, s * pul, erot[i], S_HEX, body, rim);
      r.push(x, y, s * 0.45, s * 0.45, -erot[i], S_HEX, P.enemy, 0);
      for (let k = 0; k < w.broodFrag; k++) {
        const a = k / 8 * 6.283 + t * 0.7;
        r.push(x + Math.cos(a) * s * 0.75, y + Math.sin(a) * s * 0.75, s * 0.24, s * 0.24, a, S_HEX, pack([0.35, 0.04, 0.06]), rim);
      }
    }
    r.push(x, y, s * 1.35, s * 1.35, t * 0.5, S_RING, pack(C.danger, 0.6), 0);
  }

  // ── 子彈 ──
  for (let i = 0; i < w.nb; i++) {
    const x = w.upx[i] + (w.ux[i] - w.upx[i]) * alpha, y = w.upy[i] + (w.uy[i] - w.upy[i]) * alpha;
    const k = w.ukind[i];
    if (k === BK_ARROW) {
      const ang = Math.atan2(w.uvy[i], w.uvx[i]);
      const len = w.uap[i] ? 1.4 : 0.7;
      r.push(x - Math.cos(ang) * len * 0.35, y - Math.sin(ang) * len * 0.35, len, w.uap[i] ? 0.14 : 0.11, ang, S_CAPSULE,
        w.utier[i] ? P.tierEdge[w.utier[i]] : P.bullet, 0);
    } else if (k === BK_PELLET) {
      r.push(x, y, 0.2, 0.2, 0, S_CIRCLE, w.utier[i] ? P.tierEdge[w.utier[i]] : P.bullet, 0);
    } else if (k === BK_SHELL) {
      r.push(x, y, 0.36, 0.36, 0, S_CIRCLE, P.shell, 0);
    } else {
      r.push(x, y, 0.2, 0.2, 0, S_CIRCLE, P.shell, 0);
    }
  }

  // ── 粒子與特效 ──
  fx.draw(r, P);

  // ── 核心脈衝範圍提示（藍階以上，黃昏與夜晚） ──
  if (w.cs.pulse && (w.phase === P_DUSK || w.phase === P_NIGHT) && w.state === 'run') {
    const R = w.cs.pulse.radius * 2;
    r.push(CORE_CX, CORE_CY, R, R, 0, S_RING, (P.tierEdge[w.btier[w.core]] & 0x00ffffff) | (0x30 << 24), 0);
  }

  // ── 黎明光波 ──
  if (w.sweepR >= 0) {
    const R = w.sweepR, win = w.state === 'won';
    r.push(CORE_CX, CORE_CY, R * 2 + (win ? 10 : 3), R * 2 + (win ? 10 : 3), 0, S_GLOW, win ? pack(C.light, 0.5) : P.sweepGlow, 0);
    r.push(CORE_CX, CORE_CY, R * 2, R * 2, 0, S_RING, P.sweep, 0);
    if (win) r.push(CORE_CX, CORE_CY, R * 2 - 1.5, R * 2 - 1.5, 0, S_RING, pack(C.light, 0.5), 0);
  }

  // ── 光爆 ──
  if (w.burstR >= 0) {
    const R = w.burstR, col = [[1, 0.92, 0.72], [1, 0.65, 0.3], [0.6, 0.88, 1], [0.75, 0.6, 1]][w.coreType] ?? [1, 0.92, 0.72];
    r.push(CORE_CX, CORE_CY, R * 2 + 4, R * 2 + 4, 0, S_GLOW, pack(col, 0.35), 0);
    r.push(CORE_CX, CORE_CY, R * 2, R * 2, 0, S_RING, pack(col, 0.95), 0);
  }

  // ── 放置預覽 ──
  if (view.buildType) {
    const cells = view.dragCells || (view.hover ? [view.hover] : []);
    for (const cl of cells) {
      const ok = cl.ok ?? view.hoverOk;
      const bp = cl.bp ?? view.hoverBp;
      const e = !ok ? P.danger : bp ? P.blueprint : P.edge;
      r.push(cl.x + 0.5, cl.y + 0.5, 0.96, 0.96, 0, S_DASHBOX, !ok ? pack(C.danger, 0.25) : bp ? P.blueprintFill : pack(P.edgeRGB, 0.12), e);
      drawBuilding(r, P, view.buildType, 0, 0, cl.x + 0.5, cl.y + 0.5, 0.8, -Math.PI / 2, t, 0, e, true);
    }
  }
  if (view.hover && !view.buildType) {
    r.push(view.hover.x + 0.5, view.hover.y + 0.5, 1, 1, 0, S_DASHBOX, 0, pack(P.edgeRGB, 0.35));
  }
  if (view.selected >= 0 && w.balive[view.selected]) {
    const b = view.selected;
    const isCore = b === w.core;
    const sz = isCore ? 3.6 : 1.35;
    r.push(isCore ? CORE_CX : w.bx[b] + 0.5, isCore ? CORE_CY : w.by[b] + 0.5, sz, sz, 0, S_DASHBOX, 0, P.edge);
  }
  // 多選：每座建築一個虛線框
  for (const b of view.multi) {
    if (!w.balive[b]) continue;
    r.push(w.bx[b] + 0.5, w.by[b] + 0.5, 1.3, 1.3, 0, S_DASHBOX, pack(P.edgeRGB, 0.12), P.edge);
  }
  // 新手教學：脈動圓圈標出要看的位置
  if (view.tutMark) {
    const m = view.tutMark, k = 1 + 0.15 * Math.sin(t * 5);
    r.push(m.x, m.y, m.r * 2 * k, m.r * 2 * k, 0, S_RING, pack([1, 0.82, 0.35], 0.95), 0);
    r.push(m.x, m.y, m.r * 2.6 * k, m.r * 2.6 * k, 0, S_GLOW, pack([1, 0.82, 0.35], 0.25), 0);
  }
  // 框選中的矩形
  if (view.box) {
    const b = view.box, x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    r.push((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.05, x1 - x0), Math.max(0.05, y1 - y0), 0, S_BOX, P.blueprintFill, 0);
    r.push((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.05, x1 - x0), Math.max(0.05, y1 - y0), 0, S_DASHBOX, 0, P.blueprint);
  }

  // ── 光照貼圖：只有變暗時才需要 ──
  P.post = postParams(P, view);
  if (P.post.lightAmt > 0.01) drawLights(r, w, fx, P, alpha, t, simT);
  return P;
}

const WARM = [1, 0.9, 0.72], COOL = [0.55, 0.9, 1], RED = [1, 0.25, 0.18];

export function postParams(P, view) {
  const n = P.nightish;
  return {
    lightAmt: view.noLight ? 0 : n * 0.95,
    amb: [0.38 + 0.62 * (1 - n), 0.27 + 0.73 * (1 - n), 0.32 + 0.68 * (1 - n)],
    bloomAmt: 0.25 + 0.6 * n,
    bloomThr: 0.965 - 0.34 * n,   // 白天紙色背景亮度約 0.92，不能讓整片背景發光
  };
}

function drawLights(r, w, fx, P, alpha, t, simT) {
  const ct = w.btier[w.core];
  r.light(CORE_CX, CORE_CY, 30 + ct * 5, pack(WARM, 0.95));
  r.light(CORE_CX, CORE_CY, 12, pack(WARM, 0.6));
  for (let b = 1; b < w.bHigh; b++) {
    if (!w.balive[b]) continue;
    const bt = w.bt[b], x = w.bx[b] + 0.5, y = w.by[b] + 0.5;
    if (w.bdis[b] > simT) continue;
    if (bt === B_WALL) r.light(x, y, 3.2, pack(WARM, 0.35));
    else if (bt === B_FROST) r.light(x, y, 10, pack(COOL, 0.5));
    else if (bt === B_LIGHT) r.light(x, y, 22, pack(WARM, 0.85));
    else if (bt === B_TRAP) continue;
    else if (bt === B_GOLD || bt === B_CRYSTAL) r.light(x, y, 6, pack(bt === B_GOLD ? WARM : COOL, 0.45));
    else r.light(x, y, 10, pack(WARM, 0.55 + 0.1 * w.btier[b]));
    if (t - w.bhitT[b] < 0.4 && w.bhp[b] / w.bmax[b] < 0.5) r.light(x, y, 5, pack(RED, 0.7));
  }
  // 精英與首領自帶紅光
  const n = w.n;
  for (let i = 0; i < n; i++) {
    const boss = IS_BOSS[w.et[i]];
    if (!w.eelite[i] && !boss) continue;
    const x = w.epx[i] + (w.ex[i] - w.epx[i]) * alpha, y = w.epy[i] + (w.ey[i] - w.epy[i]) * alpha;
    if (w.et[i] === E_ECLIPSE) continue; // 蝕會吃光
    r.light(x, y, boss ? 18 : 5, pack(RED, boss ? 0.9 : 0.5));
  }
  if (w.sun2 && w.mods.secondSun) r.light(w.sun2.x, w.sun2.y, 18, pack(WARM, 0.8));
  if (w.burstR >= 0) r.light(CORE_CX, CORE_CY, w.burstR * 2 + 10, pack(WARM, 0.8));
  // 砲彈
  for (let i = 0; i < w.nb; i++) if (w.ukind[i] === BK_SHELL) r.light(w.ux[i], w.uy[i], 2.5, pack(WARM, 0.5));
  // 燃燒帶
  const burnT = w.cellBurnT;
  for (let c = 0; c < N_CELLS; c++) if (burnT[c] > simT) r.light((c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5, 2.6, pack([1, 0.6, 0.25], 0.35));
  // 黎明光波
  if (w.sweepR >= 0) r.light(CORE_CX, CORE_CY, w.sweepR * 2 + 12, pack(WARM, 0.7));
  fx.drawLights(r, P);
}

export { BUILD_DEFS };
