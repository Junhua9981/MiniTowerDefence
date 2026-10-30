// 遊戲模擬：純邏輯，不依賴 DOM / WebGL / 任何瀏覽器 API，可在 Node 中執行。
import {
  MAP_W, MAP_H, N_CELLS, DT, CORE_X0, CORE_Y0, CORE_SIZE, CORE_CX, CORE_CY,
  PHASE_START, DAY_LEN, P_DAWN, P_DAY, P_DUSK, P_NIGHT, TOTAL_DAYS,
  START_GOLD, START_CRYSTAL, DAWN_BUFF, SELL_RATIO, CORE_UP,
  B_CORE, B_WALL, B_GOLD, B_CRYSTAL, B_ARROW, B_SCATTER, B_CANNON, B_FROST, B_PRISM, B_AMP, BUILD_DEFS,
  statsOf, upgradeCost, coreStats,
  E_SHARD, E_SPIKE, E_HEAVY, E_DIAMOND, E_HEX, E_LORD, E_RAD, E_SPEED, E_HP, E_DPS, E_ARMOR,
  ELITE_HP, ELITE_DPS, DIAMOND_RANGE, LORD_PULSE, BAL,
  NIGHT_TOTAL, NIGHT_DIRS, NIGHT_MIX, ELITE_CHANCE,
  BLD_BASE_COST, BLD_HP_COST_DIV, SPIKE_BLD_MULT, FLOW_MIN_STEPS,
  EV_DEATH, EV_BOOM, EV_BUILD, EV_BDESTROY, EV_COREHIT, EV_SHOT, EV_DISSOLVE, EV_SELL, EV_NIGHT, EV_DAWN,
  EV_LASER, EV_UPGRADE, EV_REVIVE, EV_ESHOT, EV_CRYSTAL, EV_FREEZE, EV_LORDPULSE, EV_COREPULSE, EV_DUSK, EV_LORD,
  EV_CARD, EV_BURST, EV_STAR, EV_PURIFY, EV_BOSSWARN, EV_ASCEND, EV_SPLIT, EV_SUMMON, EV_EAT, EV_CHAINFREEZE,
  E_TIDE, E_EATER, E_ECLIPSE, E_BROOD, E_SHADE, IS_BOSS, BOSS_TYPES, BOSS_EARLY, BOSS_FINAL, ENEMY_DEFS,
  CORE_TYPES, MUTATORS, STAR_KILLS, STAR_BONUS, ASCEND_COST, ATTACK_TOWERS, TIER_NAMES,
  B_LIGHT, B_TRAP, B_REPAIR, B_TESLA, FLOOR_TYPES, RESEARCH_BUILD, RESEARCH, GEM_TYPES,
  E_FLYER, E_HEALER, E_SHIELD, E_CLOAK, E_BURROW, NEW_ENEMIES, EV_ZAP, EV_RUIN, EV_GEM, EV_RESEARCH, EV_LIT,
} from './defs.js';
import { baseMods, CARD_BY_ID, EVOLUTIONS, FULL_POOL } from './cards.js';
import { generateMap, makeRng, T_ROCK, T_VEIN } from './map.js';
import { FlowSolver } from './flow.js';

export const BK_ARROW = 0, BK_SHELL = 1, BK_PELLET = 2, BK_BOMBLET = 3;
const NOX = [0, -1, 0, 1, -1, 1, -1, 0, 1];
const NOY = [0, -1, -1, -1, 0, 0, 1, 1, 1];

// 夜晚出怪曲線（50 s 內積分為 1）
function nightShape(t) {
  const s = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  return s(0, 6, t) * (1 - s(44, 50, t)) * (0.75 + 0.5 * t / 50);
}
let NIGHT_Z = 0;
for (let t = 0; t < 50; t += 0.01) NIGHT_Z += nightShape(t) * 0.01;

export class World {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 20261022;
    this.coreType = opts.coreType ?? 0;
    this.guide = !!opts.guide;
    this.cardPool = opts.cardPool ?? FULL_POOL;
    this.setMode(opts.mode === 'endless');
    if (opts.totalDays) this.totalDays = opts.totalDays;
    this.emitEvents = opts.events ?? false;
    const EC = this.ENEMY_CAP = opts.enemyCap ?? 32768;
    const BC = this.BULLET_CAP = opts.bulletCap ?? 32768;
    const BLC = this.BLD_CAP = N_CELLS + 8;

    // 地圖
    this.terrain = new Uint8Array(N_CELLS);
    this.rock = new Uint8Array(N_CELLS);
    this.goal = new Uint8Array(N_CELLS);
    this.bldAt = new Int32Array(N_CELLS);
    this.floorAt = new Int32Array(N_CELLS);   // 地刺等不擋路的建築
    this.lit = new Uint8Array(N_CELLS);       // 光域：只有被照亮的格子能建造
    this.cellShieldT = new Float32Array(N_CELLS);
    this.distC = new Float32Array(N_CELLS); this.nextC = new Int32Array(N_CELLS); // 掘地者：無視建築的流場
    this.zeroPen = new Float32Array(N_CELLS);
    this.typeCount = new Int32Array(16);
    this.ghostAt = new Uint8Array(N_CELLS);
    this.bpAt = new Uint8Array(N_CELLS);
    this.penalty = new Float32Array(N_CELLS);
    this.distA = new Float32Array(N_CELLS); this.nextA = new Int32Array(N_CELLS);
    this.distB = new Float32Array(N_CELLS); this.nextB = new Int32Array(N_CELLS);
    this.solver = new FlowSolver();
    // 光環 / 地面效果（每格預先計算的係數）
    this.cellSlow = new Float32Array(N_CELLS);
    this.cellDot = new Float32Array(N_CELLS);
    this.cellFreezeT = new Float32Array(N_CELLS);
    this.cellBurnT = new Float32Array(N_CELLS);
    this.cellBurnDps = new Float32Array(N_CELLS);
    this.cellFreezeSrc = new Uint8Array(N_CELLS); // 1 = 冰晶塔 / 光爆，2 = 連鎖
    this.darkC = new Float32Array(N_CELLS);       // 暗晶（黎明光波淨化成晶）

    // 空間網格（與地圖格對齊）
    this.cellCount = new Int32Array(N_CELLS);
    this.cellStart = new Int32Array(N_CELLS + 1);
    this.cellFill = new Int32Array(N_CELLS);
    this.cellItems = new Int32Array(EC);
    this.ecell = new Int32Array(EC);

    // 敵人 SoA（緊密池：swap-remove，以 eid 驗證引用）
    this.ex = new Float32Array(EC); this.ey = new Float32Array(EC);
    this.epx = new Float32Array(EC); this.epy = new Float32Array(EC);
    this.evx = new Float32Array(EC); this.evy = new Float32Array(EC);
    this.et = new Uint8Array(EC);
    this.ehp = new Float32Array(EC); this.emax = new Float32Array(EC);
    this.eflash = new Float32Array(EC);
    this.eatk = new Int32Array(EC);
    this.eid = new Uint32Array(EC);
    this.edead = new Uint8Array(EC);
    this.erot = new Float32Array(EC);
    this.erad = new Float32Array(EC);
    this.eelite = new Uint8Array(EC);
    this.ecd = new Float32Array(EC);
    this.estamp = new Uint32Array(EC);
    this.E_FIELDS = ['ex', 'ey', 'epx', 'epy', 'evx', 'evy', 'et', 'ehp', 'emax', 'eflash', 'eatk', 'eid', 'edead',
      'erot', 'erad', 'ecell', 'eelite', 'ecd'];
    this.eAlt = {};
    for (const f of this.E_FIELDS) this.eAlt[f] = new this[f].constructor(EC);

    // 建築 SoA（固定槽位 + 空閒清單）
    this.bt = new Uint8Array(BLC);
    this.bx = new Int16Array(BLC); this.by = new Int16Array(BLC);
    this.bhp = new Float32Array(BLC); this.bmax = new Float32Array(BLC);
    this.bcd = new Float32Array(BLC);
    this.btgt = new Int32Array(BLC); this.btgtId = new Uint32Array(BLC);
    this.bstrat = new Uint8Array(BLC);
    this.balive = new Uint8Array(BLC);
    this.bborn = new Float32Array(BLC);
    this.bhitT = new Float32Array(BLC);
    this.bang = new Float32Array(BLC);
    this.binvest = new Float32Array(BLC);
    this.binvestC = new Float32Array(BLC);
    this.bdawnDay = new Int16Array(BLC);
    this.bfire = new Float32Array(BLC);
    this.btier = new Uint8Array(BLC);
    this.bbranch = new Uint8Array(BLC);
    this.bdis = new Float32Array(BLC);
    this.brateM = new Float32Array(BLC);
    this.bprodM = new Float32Array(BLC);
    this.bfreeze = new Float32Array(BLC);
    this.bupT = new Float32Array(BLC);
    this.bstars = new Uint8Array(BLC);   // 星級 0..5
    this.bkills = new Float32Array(BLC); // 擊殺數（攻擊塔的星級經驗）
    this.basc = new Uint8Array(BLC);     // 已昇華
    this.bhaste = new Float32Array(BLC); // 回潮：此時間前攻速 ×2
    this.bdark = new Float32Array(BLC);  // 蝕的黑暗：此時間前射程減半
    this.bfocus = new Float32Array(BLC); // 聚焦：連續命中同一目標的加成
    this.bfocusId = new Uint32Array(BLC);
    this.bshots = new Uint16Array(BLC);
    this.bbornT = new Float32Array(BLC);
    this.bgem0 = new Int16Array(BLC); this.bgem1 = new Int16Array(BLC); // 晶核：type*4 + rarity，0 = 空
    this.bstats = new Array(BLC).fill(null);
    this.bfree = new Int32Array(BLC);

    // 子彈 SoA
    this.ux = new Float32Array(BC); this.uy = new Float32Array(BC);
    this.upx = new Float32Array(BC); this.upy = new Float32Array(BC);
    this.uvx = new Float32Array(BC); this.uvy = new Float32Array(BC);
    this.ulife = new Float32Array(BC); this.udmg = new Float32Array(BC);
    this.ukind = new Uint8Array(BC);
    this.utx = new Float32Array(BC); this.uty = new Float32Array(BC);
    this.urad = new Float32Array(BC);
    this.ubounce = new Uint8Array(BC);
    this.uap = new Uint8Array(BC);
    this.ulast = new Uint32Array(BC);
    this.ucluster = new Uint8Array(BC);
    this.utier = new Uint8Array(BC);
    this.uown = new Int32Array(BC);      // 開火的建築（擊殺算給它）
    this.U_FIELDS = ['ux', 'uy', 'upx', 'upy', 'uvx', 'uvy', 'ulife', 'udmg', 'ukind', 'utx', 'uty', 'urad', 'ubounce', 'uap', 'ulast', 'ucluster', 'utier', 'uown'];

    // 事件（給渲染 / 音效讀取；由消費者清空）
    this.EV_CAP = 16384;
    this.evT = new Uint8Array(this.EV_CAP);
    this.evX = new Float32Array(this.EV_CAP); this.evY = new Float32Array(this.EV_CAP);
    this.evA = new Float32Array(this.EV_CAP); this.evB = new Float32Array(this.EV_CAP); this.evC = new Float32Array(this.EV_CAP);

    this.prof = { flow: 0, flowCount: 0 };
    this.reset();
  }

  reset(seed) {
    if (seed !== undefined) this.seed = seed;
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    this.veins = generateMap(this.seed, this.terrain);
    for (let i = 0; i < N_CELLS; i++) this.rock[i] = this.terrain[i] === T_ROCK ? 1 : 0;
    this.bldAt.fill(-1); this.goal.fill(0); this.ghostAt.fill(0); this.bpAt.fill(0);
    this.floorAt.fill(-1); this.lit.fill(0); this.cellShieldT.fill(0); this.typeCount.fill(0);
    this.bgem0.fill(0); this.bgem1.fill(0);
    this.cellSlow.fill(1); this.cellDot.fill(0); this.cellFreezeT.fill(0); this.cellBurnT.fill(0); this.cellBurnDps.fill(0);
    this.cellFreezeSrc.fill(0); this.darkC.fill(0);
    this.bstars.fill(0); this.bkills.fill(0); this.basc.fill(0); this.bhaste.fill(0); this.bdark.fill(0); this.bfocus.fill(0);
    this.n = 0; this.nb = 0; this.evN = 0; this.nextEid = 1; this.beamId = 1;
    this.balive.fill(0); this.bstats.fill(null);
    this.bfreeTop = 0; this.bHigh = 1;
    for (let i = this.BLD_CAP - 1; i >= 1; i--) this.bfree[this.bfreeTop++] = i;
    this.ghosts = [];
    this.blueprints = [];

    this.state = 'plan'; // plan | run | won | lost
    this.tick = 0; this.time = 0; this.vt = 0; // vt：視覺時鐘（暫停中也會走，只給動畫用）
    this.day = 1; this.dayT = 0; this.phase = P_DAWN;
    this.gold = START_GOLD; this.crystal = START_CRYSTAL;
    this.goldRate = 0; this.crystalRate = 0;
    this.spawnAcc = 0;
    this.dirs = []; this.warnDirs = [];
    this.dirSwitched = false; this.lordSpawned = false; this.lordAlive = 0; this.overtime = 0;
    this.sweepR = -1; this.sweepMax = Math.hypot(MAP_W, MAP_H) * 0.6;
    this.flowDirty = true; this.flowSoft = false; this.lastFlowTick = -999;
    this.auraDirty = true;
    this.bench = 0; this.benchBullets = 0;
    this.stats = { kills: 0, peak: 0, built: 0, coreHpAtDawn: [], lost: 0, crystalEarned: 0, revived: 0, coreDmg: 0, lordKills: 0,
      bossKilled: [], purified: 0, cards: 0, bursts: 0, nights: 0, maxStars: 0 };
    this.coreHitT = -10; this.corePulseCd = 0; this.corePulseT = -10;

    // 流派系統
    this.crng = makeRng(this.seed ^ 0x5eed_c4d5);   // 卡片、詞綴、首領用獨立亂數，彼此不干擾
    this.cards = [];          // 持有的卡（依選擇順序）
    this.offers = [];         // 待選的卡：{ kind: 'normal'|'legend', cards: [id], rerolled }
    this.mut = {};            // 本夜詞綴旗標
    this.mutList = [];
    this.shield = 0; this.burstsUsed = 0; this.burstR = -1; this.burstT = -10;
    this.starfallAcc = 0; this.pendingLegend = false; this.duskTime = -1; this.bossScale = 1; this.continued = false; this.purifiedToday = 0; this.lastPurify = 0;
    this.chainBudget = 0; this.eclipseSplits = 0; this.broodFrag = 8; this.sun2 = null; this.sun2Cd = 0;
    this.bossSeen = {};
    const early = BOSS_EARLY[Math.floor(this.crng() * BOSS_EARLY.length)];
    const final = BOSS_FINAL[Math.floor(this.crng() * BOSS_FINAL.length)];
    const rot = [...BOSS_TYPES];
    for (let i = rot.length - 1; i > 0; i--) { const j = Math.floor(this.crng() * (i + 1)); [rot[i], rot[j]] = [rot[j], rot[i]]; }
    this.bossPlan = { early, final, rot };
    this.nextBoss = null;     // { type, day }：前一個黎明預告
    this.unlocked = this.guide ? new Set([B_WALL, B_GOLD, B_ARROW]) : null; // 新手引導：建築逐日解鎖
    this.research = new Set();
    this.gems = [];           // 晶核背包：{ t, r }
    this.ruinLog = [];        // 給介面顯示的遺跡獎勵訊息
    this.newEnemy = -1;       // 今晚第一次出現的敵人種類
    this.rebuildMods();

    // 核心
    const c = this.allocBuilding(B_CORE, CORE_X0, CORE_Y0, true, 0, 0);
    this.core = c;
    this.cs = this.coreStatsFor(0);
    this.bhp[c] = this.bmax[c] = this.cs.hp;
    this.goldRate = this.cs.gold; this.crystalRate = this.cs.crystal;
    for (let y = CORE_Y0; y < CORE_Y0 + CORE_SIZE; y++)
      for (let x = CORE_X0; x < CORE_X0 + CORE_SIZE; x++) {
        this.bldAt[y * MAP_W + x] = c; this.goal[y * MAP_W + x] = 1;
      }
    this.recomputeFlow();
    this.recomputeAura();
    this.solver.solve(this.rock, this.goal, this.zeroPen, 1, this.distC, this.nextC);
    this.initTerritory();
  }

  // ───────────────────────── 光域與遺跡 ─────────────────────────
  initTerritory() {
    // 起始光域：核心周圍，至少照到最近的晶脈
    let nearest = Infinity;
    for (let c = 0; c < N_CELLS; c++) if (this.terrain[c] === T_VEIN) {
      const dx = (c % MAP_W) + 0.5 - CORE_CX, dy = ((c / MAP_W) | 0) + 0.5 - CORE_CY;
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    this.ruins = [];
    this.lightArea(CORE_CX, CORE_CY, Math.min(24, Math.max(BAL.litRadius, nearest + 2)), true);
    // 遺跡：散落在黑暗中，被照亮時領取獎勵
    const rewards = ['crystal', 'gem', 'gold', 'card', 'crystal', 'gem', 'gold', 'card'];
    for (let tries = 0; tries < 4000 && this.ruins.length < rewards.length; tries++) {
      const x = 2 + Math.floor(this.crng() * (MAP_W - 4)), y = 2 + Math.floor(this.crng() * (MAP_H - 4)), c = y * MAP_W + x;
      if (this.rock[c] || this.terrain[c] === T_VEIN || this.lit[c]) continue;
      const d = Math.hypot(x + 0.5 - CORE_CX, y + 0.5 - CORE_CY);
      if (d < 20) continue;
      if (this.ruins.some(r => Math.hypot(r.x - x, r.y - y) < 11)) continue;
      this.ruins.push({ x, y, c, reward: rewards[this.ruins.length], claimed: false });
    }
  }
  /** 照亮一塊圓形區域（永久）；照到的遺跡自動領取 */
  lightArea(cx, cy, R, silent = false) {
    let n = 0;
    this.forCellsInRadius(cx, cy, R, c => { if (!this.lit[c]) { this.lit[c] = 1; n++; } });
    if (n && !silent) this.ev(EV_LIT, cx, cy, R);
    if (this.ruins) for (const r of this.ruins) if (!r.claimed && this.lit[r.c]) this.claimRuin(r);
    return n;
  }
  claimRuin(r) {
    r.claimed = true;
    let msg = '';
    if (r.reward === 'crystal') { const a = 80 + 25 * this.day; this.crystal += a; msg = `遺跡：古代晶庫 +${a} 晶`; }
    else if (r.reward === 'gold') { const a = 400 + 150 * this.day; this.gold += a; msg = `遺跡：埋藏的金 +${a} 金`; }
    else if (r.reward === 'gem') { const g = this.addGem(2); msg = `遺跡：找到晶核「${GEM_TYPES[g.t].name}」（稀有）`; }
    else { this.queueOffer('normal'); msg = '遺跡：古代遺物——多選一張卡'; }
    this.ruinLog.push(msg);
    this.ev(EV_RUIN, r.x + 0.5, r.y + 0.5, 0);
  }

  // ───────────────────────── 研究與晶核 ─────────────────────────
  mineEff(n) { const K = BAL.mineKnee; return n <= K ? n : K * Math.pow(n / K, this.research.has('r_mine') ? 0.75 : BAL.mineExp); }
  maxTier() { return this.research.has('r_plat') ? 4 : 3; }
  researchInfo(id) {
    const r = RESEARCH.find(x => x.id === id);
    if (!r) return { reason: '沒有這個研究' };
    if (this.research.has(id)) return { reason: '已完成', done: true };
    if (r.req && !this.research.has(r.req)) return { reason: '需要先完成前一項' };
    if (this.crystal < r.cost) return { reason: '晶不足' };
    return { reason: '' };
  }
  doResearch(id) {
    const info = this.researchInfo(id);
    if (info.reason) return info.reason;
    const r = RESEARCH.find(x => x.id === id);
    this.crystal -= r.cost;
    this.research.add(id);
    this.rebuildMods();
    this.ev(EV_RESEARCH, CORE_CX, CORE_CY, 0);
    return '';
  }
  addGem(r) {
    const g = { t: Math.floor(this.crng() * GEM_TYPES.length), r };
    if (this.gems.length >= 60) { this.crystal += 10 * r; return g; }
    this.gems.push(g);
    this.ev(EV_GEM, CORE_CX, CORE_CY, r);
    return g;
  }
  gemSlots(b) {
    if (!this.balive[b] || b === this.core || !ATTACK_TOWERS.has(this.bt[b]) || this.btier[b] < 3) return 0;
    return this.research.has('r_socket') ? 2 : 1;
  }
  socketGem(b, slot, idx) {
    if (slot >= this.gemSlots(b)) return '這座塔沒有這個槽（紫色以上的攻擊塔才能鑲）';
    const g = this.gems[idx];
    if (!g) return '沒有這顆晶核';
    const arr = slot ? this.bgem1 : this.bgem0;
    if (arr[b]) this.gems.push({ t: (arr[b] >> 2), r: arr[b] & 3 });
    this.gems.splice(idx, 1);
    arr[b] = g.t * 4 + g.r;
    this.refreshOne(b);
    return '';
  }
  unsocketGem(b, slot) {
    const arr = slot ? this.bgem1 : this.bgem0;
    if (!arr[b]) return '';
    this.gems.push({ t: arr[b] >> 2, r: arr[b] & 3 });
    arr[b] = 0;
    this.refreshOne(b);
    return '';
  }
  /** 三顆同種同稀有度 → 一顆高一級 */
  mergeGems(t, r) {
    if (r >= 3) return '傳說晶核不能再合成';
    const idx = [];
    this.gems.forEach((g, i) => { if (g.t === t && g.r === r && idx.length < 3) idx.push(i); });
    if (idx.length < 3) return '需要三顆同種、同稀有度的晶核';
    for (let k = idx.length - 1; k >= 0; k--) this.gems.splice(idx[k], 1);
    this.gems.push({ t, r: r + 1 });
    this.ev(EV_GEM, CORE_CX, CORE_CY, r + 1);
    return '';
  }
  refreshOne(b) {
    const s = this.computeStats(b), old = this.bmax[b];
    this.bstats[b] = s; this.bmax[b] = s.hp; this.bhp[b] = Math.min(s.hp, this.bhp[b] + Math.max(0, s.hp - old));
  }

  // ───────────────────────── 指令 ─────────────────────────
  start() { if (this.state === 'plan') this.state = 'run'; }
  get coreTier() { return this.btier[this.core]; }
  /** 白晝折扣（快速部署）只在規劃、黎明、白晝生效 */
  dayDisc() { return this.mods.dayDiscount && (this.state === 'plan' || this.phase <= P_DAY) ? 1 - this.mods.dayDiscount : 1; }
  costOf(type, fromBlueprint = false) {
    let c = BUILD_DEFS[type].cost * this.dayDisc();
    if (type === B_WALL) c *= this.mods.wallCost;
    else c *= 1 + (this.research.has('r_works') ? BAL.costEsc / 2 : BAL.costEsc) * this.typeCount[type]; // 同類越蓋越貴
    if (fromBlueprint) c *= 1 - this.mods.bpDiscount;
    return Math.max(1, Math.round(c));
  }
  isUnlocked(type) {
    const rb = RESEARCH_BUILD[type];
    if (rb && !this.research.has(rb)) return false;
    if (type === B_LIGHT) return !this.unlocked || this.day >= 2;
    return !this.unlocked || this.unlocked.has(type) || !!rb;
  }
  unlockReason(type) {
    const rb = RESEARCH_BUILD[type];
    if (rb && !this.research.has(rb)) return `需要研究「${RESEARCH.find(r => r.id === rb).name}」`;
    return '尚未解鎖';
  }

  // ───────────────────────── 流派：核心、卡片、修正器 ─────────────────────────
  setCoreType(k) {
    if (this.state !== 'plan' || !CORE_TYPES[k]) return;
    this.coreType = k;
    this.rebuildMods();
  }
  coreStatsFor(tier) {
    const cs = coreStats(tier), m = this.mods;
    cs.hp = Math.round(cs.hp * m.coreHpMul);
    if (!cs.pulse && m.pulseFromGreen && tier >= 1) cs.pulse = { radius: 6, dmg: 35, period: 1.6 };
    return cs;
  }
  /** 從頭套用核心種類與所有持有的卡，然後重算每座建築的數值 */
  rebuildMods() {
    const m = baseMods();
    const ct = CORE_TYPES[this.coreType].id;
    if (ct === 'sun') { m.sunCore = true; m.pulseFromGreen = true; m.goldMul *= 0.8; }
    if (ct === 'moon') { m.frostAura += 1; m.chainFreeze = Math.max(m.chainFreeze, 1.2); m.coreHpMul = 0.75; }
    if (ct === 'tide') { m.dawnBuffMul = 2; m.darkMul *= 1.5; m.nightMul = 1.15; }
    for (const id of this.cards) CARD_BY_ID[id].apply(m);
    this.mods = m;
    if (this.core !== undefined && this.balive[this.core]) {
      const c = this.core, old = this.bmax[c];
      this.cs = this.coreStatsFor(this.btier[c]);
      this.bmax[c] = this.cs.hp; this.bhp[c] = Math.max(1, Math.min(this.cs.hp, this.bhp[c] + this.cs.hp - old));
    }
    if (m.secondSun && !this.sun2) this.placeSun2();
    this.refreshStats();
  }
  /** 依階級、分支、星級、昇華、位置與修正器算出建築數值 */
  computeStats(b) {
    const t = this.bt[b], m = this.mods;
    const s = statsOf(t, this.btier[b], this.bbranch[b]);
    const k = 1 + STAR_BONUS * this.bstars[b], R = this.research;
    s.hp = Math.round(s.hp * k * (t === B_WALL && R.has('r_wall') ? 1.5 : 1));
    if (s.dmg) s.dmg *= k * (m.dmg[t] || 1);
    if (s.gold) s.gold *= m.goldMul; // 金礦不吃星級（避免經濟滾雪球）
    if (s.crystal) s.crystal *= k;
    if (s.dot) s.dot *= k;
    const dx = this.bx[b] + 0.5 - CORE_CX, dy = this.by[b] + 0.5 - CORE_CY, d2 = dx * dx + dy * dy;
    if (s.range) {
      if (m.sunCore && d2 <= 144) s.dmg *= 1.2;
      if (m.coreRange && d2 <= 225) s.range += m.coreRange;
    }
    if (ATTACK_TOWERS.has(t)) {
      if (R.has('r_range')) s.range += 0.5;
      if (R.has('r_rate')) s.rate *= 1.12;
      // 共振：相鄰同類攻擊塔
      if (R.has('r_reso')) {
        let nb = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const xx = this.bx[b] + ox, yy = this.by[b] + oy;
          if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
          const q = this.bldAt[yy * MAP_W + xx];
          if (q > 0 && q !== b && this.bt[q] === t) nb++;
        }
        s.dmg *= 1 + 0.06 * Math.min(4, nb); s.reso = Math.min(4, nb);
      }
      // 晶核
      for (const code of [this.bgem0[b], this.bgem1[b]]) {
        if (!code) continue;
        const gt = GEM_TYPES[code >> 2].id, r = (code & 3) - 1;
        if (gt === 'sharp') s.dmg *= 1 + [0.12, 0.25, 0.4][r];
        else if (gt === 'swift') s.rate *= 1 + [0.1, 0.2, 0.32][r];
        else if (gt === 'far') s.range += [1, 1.5, 2.5][r];
        else if (gt === 'pierce') { s.ap = 1; s.dmg *= 1 + [0, 0.1, 0.2][r]; }
        else if (gt === 'frost') s.gFreeze = (s.gFreeze || 0) + [0.08, 0.15, 0.25][r];
        else if (gt === 'chain') s.gChain = (s.gChain || 0) + [0.12, 0.22, 0.35][r];
        else if (gt === 'crit') s.gCrit = (s.gCrit || 0) + [0.1, 0.16, 0.24][r];
      }
    }
    if (t === B_LIGHT && R.has('r_beacon')) s.light += 3;
    if (t === B_REPAIR && R.has('r_works')) s.heal *= 1.5;
    const asc = this.basc[b];
    switch (t) {
      case B_ARROW: s.bounce = m.arrowBounce; break;
      case B_SCATTER: s.pellets += m.pellets; if (asc) { s.pellets *= 2; s.bounce += 2; } break;
      case B_PRISM: s.beams += m.prismBeams; if (asc) { s.beams += 3; s.range += 4; } break;
      case B_FROST:
        s.aura += m.frostAura + (asc ? 3 : 0);
        if (asc) s.freeze = 2;
        else if (m.frostFreeze) s.freeze = s.freeze ? s.freeze * 0.8 : m.frostFreeze;
        break;
      case B_AMP:
        s.aura += m.ampAura + (asc ? 4 : 0);
        if (asc) { s.rateBonus *= 1.5; s.prodBonus *= 1.5; }
        s.rateBonus *= k; s.prodBonus *= k;
        break;
      case B_WALL: if (m.wallThorns) s.thorns = (s.thorns || 0) + m.wallThorns; break;
    }
    return s;
  }
  refreshStats() {
    for (let b = 1; b < this.bHigh; b++) {
      if (!this.balive[b]) continue;
      const s = this.computeStats(b), old = this.bmax[b];
      this.bstats[b] = s; this.bmax[b] = s.hp; this.bhp[b] = Math.min(s.hp, this.bhp[b] + Math.max(0, s.hp - old));
    }
    this.auraDirty = true;
  }
  starUp(b) {
    if (!this.balive[b] || this.bstars[b] >= 5) return;
    this.bstars[b]++;
    if (this.bstars[b] > this.stats.maxStars) this.stats.maxStars = this.bstars[b];
    const s = this.computeStats(b), old = this.bmax[b];
    this.bstats[b] = s; this.bmax[b] = s.hp; this.bhp[b] += s.hp - old;
    if (this.bt[b] === B_FROST || this.bt[b] === B_AMP) this.auraDirty = true;
    this.ev(EV_STAR, this.bx[b] + 0.5, this.by[b] + 0.5, this.bstars[b]);
  }

  /** 產生一組卡（3 張）。kind: 'normal' | 'legend' */
  makeOffer(kind = 'normal') {
    const owned = new Set(this.cards);
    // 已被進化卡吸收的卡也算持有
    for (const id of this.cards) { const e = EVOLUTIONS.find(x => x.id === id); if (e) e.from.forEach(f => owned.add(f)); }
    const pick = [];
    if (kind === 'legend') {
      const pool = this.cardPool.legends.filter(id => !owned.has(id));
      while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(this.crng() * pool.length), 1)[0]);
      return pick.length ? { kind, cards: pick, rerolled: false } : null;
    }
    // 進化卡：條件達成就一定出現在第一格
    for (const e of EVOLUTIONS) if (!owned.has(e.id) && e.from.every(f => this.cards.includes(f))) { pick.push(e.id); break; }
    // 首領預告日：放一張對策卡
    if (this.nextBoss && this.nextBoss.day === this.day + 1) {
      const ctr = ENEMY_DEFS[this.nextBoss.type].counters.filter(id => !owned.has(id) && this.cardPool.pool.includes(id) && !pick.includes(id));
      if (ctr.length) pick.push(ctr[Math.floor(this.crng() * ctr.length)]);
    }
    const school = CORE_TYPES[this.coreType].school;
    const count = {};
    for (const id of this.cards) { const sc = CARD_BY_ID[id].school; count[sc] = (count[sc] || 0) + 1; }
    const cand = this.cardPool.pool.filter(id => !owned.has(id) && !pick.includes(id));
    while (pick.length < 3 && cand.length) {
      const ws = cand.map(id => { const sc = CARD_BY_ID[id].school; return (sc === school ? 1.6 : 1) * ((count[sc] || 0) >= 2 ? 2 : 1); });
      let r = this.crng() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (k < ws.length - 1 && (r -= ws[k]) > 0) k++;
      pick.push(cand.splice(k, 1)[0]);
    }
    return pick.length ? { kind, cards: pick, rerolled: false } : null;
  }
  queueOffer(kind) { const o = this.makeOffer(kind); if (o) this.offers.push(o); }
  pickCard(id) {
    const o = this.offers[0];
    if (!o || !o.cards.includes(id)) return '沒有這張卡';
    this.offers.shift();
    const evo = EVOLUTIONS.find(e => e.id === id);
    if (evo) this.cards = this.cards.filter(c => !evo.from.includes(c));
    this.cards.push(id);
    this.stats.cards++;
    this.rebuildMods();
    this.ev(EV_CARD, CORE_CX, CORE_CY, 0);
    return '';
  }
  rerollCost() { const o = this.offers[0]; return 15 * Math.pow(2, o ? o.rerolls || 0 : 0); }
  rerollOffer() {
    const o = this.offers[0];
    if (!o || o.kind !== 'normal') return '這組不能重抽';
    const cost = this.rerollCost();
    if (this.crystal < cost) return '晶不足';
    this.crystal -= cost;
    const n = this.makeOffer('normal');
    if (n) { n.rerolls = (o.rerolls || 0) + 1; n.rerolled = true; this.offers[0] = n; }
    return '';
  }

  /** 光爆：每夜限用（黃昏或夜晚），消耗核心目前血量的 20% */
  canBurst() {
    if (this.state !== 'run') return '遊戲沒在進行';
    if (this.phase < P_DUSK) return '只能在黃昏或夜晚使用';
    if (this.burstsUsed >= this.mods.burstUses) return '今晚已經用過了';
    return '';
  }
  lightBurst() {
    const why = this.canBurst();
    if (why) return why;
    this.burstsUsed++; this.stats.bursts++;
    const c = this.core;
    this.bhp[c] = Math.max(1, this.bhp[c] * (1 - BAL.burstCost));
    this.burstR = 0; this.burstT = this.time;
    const ct = CORE_TYPES[this.coreType].id, hpMult = this.hpMultFor(this.day);
    if (ct === 'moon') {
      this.cellFreezeT.fill(this.time + 3); this.cellFreezeSrc.fill(1);
    } else if (ct === 'tide') {
      for (let k = this.ghosts.length - 1; k >= 0; k--) this.reviveGhost(k);
    } else {
      const sun = ct === 'sun', R2 = sun ? 400 : Infinity, dmg = (sun ? 220 : 60) * hpMult;
      for (let i = 0; i < this.n; i++) {
        const dx = this.ex[i] - CORE_CX, dy = this.ey[i] - CORE_CY;
        if (dx * dx + dy * dy > R2) continue;
        if (IS_BOSS[this.et[i]]) this.dotEnemy(i, this.emax[i] * (sun ? 0.08 : 0.03));
        else this.dotEnemy(i, dmg);
      }
    }
    this.ev(EV_BURST, CORE_CX, CORE_CY, this.coreType);
    return '';
  }

  /** 昇華：紫色 5 星的攻擊塔／冰晶／增幅，每種限 1 座 */
  ascendInfo(b) {
    const t = this.bt[b];
    if (!this.balive[b] || !(ATTACK_TOWERS.has(t) || t === B_FROST || t === B_AMP) || t === B_TESLA) return { reason: '這種建築不能昇華' };
    if (this.basc[b]) return { reason: '已昇華' };
    if (this.btier[b] < 3) return { reason: '需要紫色以上' };
    if (this.bstars[b] < 5) return { reason: `需要 5 星（目前 ${this.bstars[b]} 星）` };
    for (let k = 1; k < this.bHigh; k++) if (this.balive[k] && this.basc[k] && this.bt[k] === t) return { reason: '同一種塔只能昇華 1 座' };
    if (this.crystal < ASCEND_COST) return { reason: `晶不足（需要 ${ASCEND_COST}）`, cost: ASCEND_COST };
    return { reason: '', cost: ASCEND_COST };
  }
  ascend(b) {
    const info = this.ascendInfo(b);
    if (info.reason) return info.reason;
    this.crystal -= ASCEND_COST; this.binvestC[b] += ASCEND_COST;
    this.basc[b] = 1;
    const s = this.computeStats(b), old = this.bmax[b];
    this.bstats[b] = s; this.bmax[b] = s.hp; this.bhp[b] += s.hp - old;
    this.auraDirty = true;
    this.ev(EV_ASCEND, this.bx[b] + 0.5, this.by[b] + 0.5, this.bt[b]);
    return '';
  }

  /** 第二太陽：在核心附近找一塊空地當副光源（不是建築，不會被拆） */
  placeSun2() {
    for (const [ox, oy] of [[-14, 0], [14, 0], [0, -11], [0, 11], [-11, -9], [11, 9], [-11, 9], [11, -9]]) {
      const x = Math.floor(CORE_CX + ox), y = Math.floor(CORE_CY + oy);
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
      if (!this.rock[y * MAP_W + x]) { this.sun2 = { x: x + 0.5, y: y + 0.5 }; return; }
    }
    this.sun2 = { x: CORE_CX - 14, y: CORE_CY };
  }

  /** 一般模式勝利後繼續進入無限模式 */
  continueEndless() {
    if (this.state !== 'won' || this.endless) return;
    this.endless = true; this.totalDays = Infinity; this.state = 'run'; this.continued = true;
    this.stats.nights--; // onDawn 會再加一次
    this.onDawn();
  }

  /** 回傳空字串表示可放置，否則為原因。 */
  canPlace(type, x, y, ignoreGold = false) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '超出地圖';
    const c = y * MAP_W + x;
    if (this.rock[c]) return '岩石不可建造';
    if (this.bldAt[c] >= 0 || this.floorAt[c] >= 0) return '已有建築';
    if (!this.lit[c]) return '黑暗中不能建造（先蓋燈塔照亮）';
    if (this.state === 'won' || this.state === 'lost') return '遊戲已結束';
    if (!this.isUnlocked(type)) return this.unlockReason(type);
    if (type === B_CRYSTAL && this.terrain[c] !== T_VEIN) return '晶礦只能蓋在晶脈上';
    if (this.n > 0 && this.cellCount[c] > 0) return '有敵人在此格';
    if (!ignoreGold && this.gold < this.costOf(type)) return '金不足';
    return '';
  }

  place(type, x, y, fromBlueprint = false) {
    const why = this.canPlace(type, x, y, true);
    const cost = this.costOf(type, fromBlueprint);
    if (why || this.gold < cost) return -1;
    const c = y * MAP_W + x;
    if (this.ghostAt[c]) this.removeGhostAt(c);
    if (this.bpAt[c]) this.removeBlueprintAt(c);
    this.gold -= cost;
    const b = this.allocBuilding(type, x, y, false, 0, 0);
    this.binvest[b] = cost;
    this.bdawnDay[b] = this.phase === P_DAWN || this.state === 'plan' ? this.day : -1;
    this.stats.built++;
    this.ev(EV_BUILD, x + 0.5, y + 0.5, type);
    return b;
  }

  /** 錢夠就蓋，不夠就放藍圖。回傳 'built' | 'blueprint' | 原因字串 */
  placeOrBlueprint(type, x, y) {
    const why = this.canPlace(type, x, y, true);
    const c = y * MAP_W + x;
    if (why && why !== '有敵人在此格') return why;
    if (!why && this.gold >= this.costOf(type) && this.blueprints.length === 0) { this.place(type, x, y); return 'built'; }
    if (this.bpAt[c]) return '已有藍圖';
    this.blueprints.push({ type, x, y, c });
    this.bpAt[c] = 1;
    return 'blueprint';
  }

  removeBlueprintAt(c) {
    const i = this.blueprints.findIndex(p => p.c === c);
    if (i >= 0) this.blueprints.splice(i, 1);
    this.bpAt[c] = 0;
  }
  removeGhostAt(c) {
    const i = this.ghosts.findIndex(g => g.c === c);
    if (i >= 0) this.ghosts.splice(i, 1);
    this.ghostAt[c] = 0;
  }
  clearBlueprints() { for (const p of this.blueprints) this.bpAt[p.c] = 0; this.blueprints.length = 0; }

  processBlueprints() {
    let i = 0;
    while (i < this.blueprints.length) {
      const p = this.blueprints[i];
      const why = this.canPlace(p.type, p.x, p.y, true) || (this.gold < this.costOf(p.type, true) ? '金不足' : '');
      if (!why) { this.bpAt[p.c] = 0; this.blueprints.splice(i, 1); this.place(p.type, p.x, p.y, true); continue; }
      if (why === '金不足') break;          // 依放置順序：前面的蓋不起就等
      if (why === '有敵人在此格') { i++; continue; }
      this.bpAt[p.c] = 0; this.blueprints.splice(i, 1); // 位置已失效
    }
  }

  sellRefund(b) {
    if (!this.balive[b] || b === this.core) return { gold: 0, crystal: 0 };
    const full = this.bdawnDay[b] === this.day && (this.phase === P_DAWN || this.state === 'plan');
    const r = full ? 1 : SELL_RATIO;
    return { gold: Math.floor(this.binvest[b] * r), crystal: Math.floor(this.binvestC[b] * r), full };
  }

  sell(b) {
    if (!this.balive[b] || b === this.core) return null;
    const r = this.sellRefund(b);
    this.gold += r.gold; this.crystal += r.crystal;
    this.unsocketGem(b, 0); this.unsocketGem(b, 1);
    this.ev(EV_SELL, this.bx[b] + 0.5, this.by[b] + 0.5, this.bt[b]);
    this.freeBuilding(b);
    return r;
  }

  cycleStrategy(b) {
    const t = this.bt[b];
    if (this.balive[b] && (t === B_ARROW || t === B_CANNON || t === B_SCATTER || t === B_PRISM)) this.bstrat[b] = (this.bstrat[b] + 1) % 4;
  }

  /** 升級資訊：{ cost, reason, needBranch } */
  upgradeInfo(b) {
    if (!this.balive[b]) return { reason: '不存在' };
    const tier = this.btier[b];
    if (tier >= this.maxTier()) return { reason: tier >= 4 ? '已是最高階級' : '已是最高階級（研究「白金」可再升一階）' };
    if (b === this.core) {
      const d = this.dayDisc(), base = CORE_UP[tier + 1];
      const cost = { gold: Math.round(base.gold * d), crystal: Math.ceil(base.crystal * d) };
      let reason = '';
      if (this.gold < cost.gold) reason = '金不足'; else if (this.crystal < cost.crystal) reason = '晶不足';
      return { cost, reason, needBranch: false };
    }
    const raw = upgradeCost(this.bt[b], tier + 1), d = this.dayDisc();
    const cost = { gold: Math.round(raw.gold * d), crystal: Math.ceil(raw.crystal * d) };
    let reason = '';
    if (tier + 1 > this.coreTier) reason = `核心階級不足（需要先把核心升到${TIER_NAMES[tier + 1]}）`;
    else if (this.gold < cost.gold) reason = '金不足';
    else if (this.crystal < cost.crystal) reason = '晶不足';
    const hasBranch = !!BUILD_DEFS[this.bt[b]].branches;
    return { cost, reason, needBranch: tier + 1 === 3 && hasBranch };
  }

  upgrade(b, branch = 0) {
    const info = this.upgradeInfo(b);
    if (info.reason) return info.reason;
    if (info.needBranch && branch !== 1 && branch !== 2) return '需要選擇分支';
    this.gold -= info.cost.gold; this.crystal -= info.cost.crystal;
    const tier = ++this.btier[b];
    if (b === this.core) {
      const old = this.bmax[b];
      this.cs = this.coreStatsFor(tier);
      this.bmax[b] = this.cs.hp; this.bhp[b] += this.cs.hp - old;
    } else {
      this.binvest[b] += info.cost.gold; this.binvestC[b] += info.cost.crystal;
      if (info.needBranch) this.bbranch[b] = branch;
      const s = this.computeStats(b);
      const old = this.bmax[b];
      this.bstats[b] = s; this.bmax[b] = s.hp; this.bhp[b] += s.hp - old;
      this.auraDirty = true; this.flowSoft = true;
    }
    this.bupT[b] = this.vt;
    this.ev(EV_UPGRADE, b === this.core ? CORE_CX : this.bx[b] + 0.5, b === this.core ? CORE_CY : this.by[b] + 0.5, tier);
    return '';
  }

  // ───────────────────────── 建築池 ─────────────────────────
  allocBuilding(type, x, y, isCore, tier, branch, stars = 0, kills = 0, asc = 0) {
    const b = isCore ? 0 : this.bfree[--this.bfreeTop];
    this.bt[b] = type; this.bx[b] = x; this.by[b] = y;
    this.btier[b] = tier; this.bbranch[b] = branch;
    this.bstars[b] = stars; this.bkills[b] = kills; this.basc[b] = asc;
    this.bhaste[b] = 0; this.bdark[b] = 0; this.bfocus[b] = 0; this.bshots[b] = 0; this.bbornT[b] = this.time;
    const s = isCore ? null : this.computeStats(b);
    this.bstats[b] = s;
    this.bhp[b] = this.bmax[b] = isCore ? this.coreStatsFor(tier).hp : s.hp;
    this.bcd[b] = 0; this.btgt[b] = -1; this.btgtId[b] = 0; this.bstrat[b] = 0;
    this.balive[b] = 1; this.bborn[b] = this.vt; this.bhitT[b] = -10; this.bang[b] = -Math.PI / 2;
    this.bfire[b] = -10; this.binvest[b] = 0; this.binvestC[b] = 0; this.bdawnDay[b] = -1;
    this.bdis[b] = 0; this.brateM[b] = 1; this.bprodM[b] = 1; this.bfreeze[b] = 1; this.bupT[b] = -10;
    if (b >= this.bHigh) this.bHigh = b + 1;
    if (!isCore) {
      if (FLOOR_TYPES.has(type)) this.floorAt[y * MAP_W + x] = b;
      else { this.bldAt[y * MAP_W + x] = b; this.flowDirty = true; }
      this.auraDirty = true;
      this.typeCount[type]++;
      if (type === B_LIGHT) this.lightArea(x + 0.5, y + 0.5, s.light);
      if (this.research.has('r_reso') && ATTACK_TOWERS.has(type)) this.resoDirty = true;
    }
    return b;
  }

  freeBuilding(b) {
    if (!this.balive[b]) return;
    this.balive[b] = 0;
    this.bstats[b] = null;
    const c = this.by[b] * MAP_W + this.bx[b], t = this.bt[b];
    if (FLOOR_TYPES.has(t)) this.floorAt[c] = -1;
    else { this.bldAt[c] = -1; this.flowDirty = true; }
    this.typeCount[t]--;
    this.bgem0[b] = 0; this.bgem1[b] = 0;
    this.bfree[this.bfreeTop++] = b;
    this.auraDirty = true;
    if (this.research.has('r_reso') && ATTACK_TOWERS.has(t)) this.resoDirty = true;
  }

  damageBuilding(b, dmg) {
    if (this.bench) return;
    const m = this.mods;
    if (m.sanctum) {
      const dx = (b === this.core ? CORE_CX : this.bx[b] + 0.5) - CORE_CX, dy = (b === this.core ? CORE_CY : this.by[b] + 0.5) - CORE_CY;
      if (dx * dx + dy * dy <= 64 + 1e-6) dmg *= 1 - m.sanctum;
    }
    if (b === this.core && this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a; dmg -= a;
      if (dmg <= 0) { this.bhitT[b] = this.vt; return; }
    }
    this.bhp[b] -= dmg;
    this.bhitT[b] = this.vt;
    this.flowSoft = true;
    if (b === this.core) {
      this.stats.coreDmg += dmg;
      if (this.vt - this.coreHitT > 0.25) { this.coreHitT = this.vt; this.ev(EV_COREHIT, CORE_CX, CORE_CY, dmg); }
      if (this.bhp[b] <= 0) { this.bhp[b] = 0; this.state = 'lost'; this.stats.lost = 1; }
      return;
    }
    if (this.bhp[b] <= 0) {
      const x = this.bx[b], y = this.by[b], c = y * MAP_W + x;
      this.ev(EV_BDESTROY, x + 0.5, y + 0.5, this.bt[b]);
      // 留下殘影，下一個黎明免費復活
      this.ghosts.push({ c, x, y, type: this.bt[b], tier: this.btier[b], branch: this.bbranch[b], strat: this.bstrat[b],
        invest: this.binvest[b], investC: this.binvestC[b], stars: this.bstars[b], kills: this.bkills[b], asc: this.basc[b],
        g0: this.bgem0[b], g1: this.bgem1[b],
        reviveAt: this.mods.undying ? this.time + this.mods.undying : Infinity });
      this.ghostAt[c] = 1;
      this.freeBuilding(b);
    }
  }

  /** 讓第 k 個殘影復活（黎明光波、不滅、潮汐光爆） */
  reviveGhost(k) {
    const g = this.ghosts[k];
    this.ghosts.splice(k, 1); this.ghostAt[g.c] = 0;
    if (this.rock[g.c] || this.bldAt[g.c] >= 0 || this.floorAt[g.c] >= 0) return -1;
    if (this.n > 0 && this.cellCount[g.c] > 0 && this.state === 'run' && this.phase >= P_DUSK) {
      // 有敵人站在上面：夜裡先不復活，留到下次
      this.ghosts.push(g); this.ghostAt[g.c] = 1; return -1;
    }
    if (this.bpAt[g.c]) this.removeBlueprintAt(g.c);
    const b = this.allocBuilding(g.type, g.x, g.y, false, g.tier, g.branch, g.stars || 0, g.kills || 0, g.asc || 0);
    this.bstrat[b] = g.strat; this.binvest[b] = g.invest; this.binvestC[b] = g.investC;
    if (g.g0 || g.g1) { this.bgem0[b] = g.g0 || 0; this.bgem1[b] = g.g1 || 0; this.refreshOne(b); }
    if (this.mods.reviveHaste) this.bhaste[b] = this.time + this.mods.reviveHaste;
    this.stats.revived++;
    this.ev(EV_REVIVE, g.x + 0.5, g.y + 0.5, g.type);
    return b;
  }

  // ───────────────────────── 流場與光環 ─────────────────────────
  recomputeFlow() {
    const t0 = now();
    const pen = this.penalty;
    pen.fill(0);
    for (let b = 1; b < this.bHigh; b++) {
      if (!this.balive[b] || FLOOR_TYPES.has(this.bt[b])) continue;
      pen[this.by[b] * MAP_W + this.bx[b]] = BLD_BASE_COST + Math.max(0, this.bhp[b]) / BLD_HP_COST_DIV;
    }
    this.solver.solve(this.rock, this.goal, pen, 1, this.distA, this.nextA);
    this.solver.solve(this.rock, this.goal, pen, SPIKE_BLD_MULT, this.distB, this.nextB);
    this.flowDirty = false; this.flowSoft = false; this.lastFlowTick = this.tick;
    this.prof.flow += now() - t0; this.prof.flowCount++;
  }

  forCellsInRadius(cx, cy, R, fn) {
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(MAP_W - 1, Math.floor(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(MAP_H - 1, Math.floor(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= R * R) fn(y * MAP_W + x);
    }
  }

  /** 冰晶與增幅的光環改成每格 / 每座建築的預先係數；建築變動時才重算。 */
  recomputeAura() {
    this.cellSlow.fill(1); this.cellDot.fill(0);
    for (let b = 0; b < this.bHigh; b++) { this.brateM[b] = 1; this.bprodM[b] = 1; }
    const slow = this.cellSlow, dot = this.cellDot, bldAt = this.bldAt;
    for (let b = 1; b < this.bHigh; b++) {
      if (!this.balive[b] || this.bdis[b] > this.time) continue;
      const t = this.bt[b];
      if (t === B_TRAP) {
        const c = this.by[b] * MAP_W + this.bx[b], st = this.bstats[b];
        dot[c] += st.dot;
        if (st.trapSlow && slow[c] > 1 - st.trapSlow) slow[c] = 1 - st.trapSlow;
        continue;
      }
      if (t === B_WALL && this.mods.iceWall) {
        this.forCellsInRadius(this.bx[b] + 0.5, this.by[b] + 0.5, 1.6, c => { if (slow[c] > 0.6) slow[c] = 0.6; });
        continue;
      }
      if (t !== B_FROST && t !== B_AMP) continue;
      const s = this.bstats[b], cx = this.bx[b] + 0.5, cy = this.by[b] + 0.5;
      if (t === B_FROST) {
        const f = 1 - s.slow;
        this.forCellsInRadius(cx, cy, s.aura, c => { if (slow[c] > f) slow[c] = f; dot[c] += s.dot; });
      } else {
        this.forCellsInRadius(cx, cy, s.aura, c => {
          const bb = bldAt[c];
          if (bb > 0 && bb !== b) {
            if (this.brateM[bb] < 1 + s.rateBonus) this.brateM[bb] = 1 + s.rateBonus;
            if (this.bprodM[bb] < 1 + s.prodBonus) this.bprodM[bb] = 1 + s.prodBonus;
          }
        });
      }
    }
    // 影刺：殘影與它旁邊的格子持續傷害
    if (this.mods.ghostDot && this.ghosts.length) {
      const d = 12 * this.mods.ghostDot * Math.sqrt(this.hpMultFor(this.day));
      for (const g of this.ghosts) this.forCellsInRadius(g.x + 0.5, g.y + 0.5, 1.5, c => { dot[c] += d; });
    }
    this.auraDirty = false;
  }

  // ───────────────────────── 事件 ─────────────────────────
  ev(t, x, y, a, b = 0, c = 0) {
    if (!this.emitEvents || this.evN >= this.EV_CAP) return;
    const i = this.evN++;
    this.evT[i] = t; this.evX[i] = x; this.evY[i] = y; this.evA[i] = a; this.evB[i] = b; this.evC[i] = c;
  }

  // ───────────────────────── 敵人 ─────────────────────────
  spawnEnemy(type, x, y, hpMult, elite = 0) {
    if (this.n >= this.ENEMY_CAP) return -1;
    const i = this.n++;
    this.ex[i] = this.epx[i] = x; this.ey[i] = this.epy[i] = y;
    this.evx[i] = this.evy[i] = 0;
    this.et[i] = type;
    this.ehp[i] = this.emax[i] = E_HP[type] * hpMult * (elite ? ELITE_HP : 1);
    this.eflash[i] = 0; this.eatk[i] = -1; this.edead[i] = 0;
    this.eid[i] = this.nextEid++;
    this.erot[i] = this.rng() * 6.283;
    this.erad[i] = E_RAD[type] * (elite ? 1.15 : 1);
    this.eelite[i] = elite;
    this.ecd[i] = type === E_LORD ? LORD_PULSE.period * 0.5 : type === E_TIDE ? 4 : this.rng() * 0.25;
    if (IS_BOSS[type]) { this.lordAlive++; if (type === E_ECLIPSE) this.eclipseSplits = 0; if (type === E_BROOD) this.broodFrag = 8; }
    return i;
  }

  /** 塔造成的傷害。own = 開火的建築（擊殺記在它身上） */
  damageEnemy(j, dmg, ap = 0, own = 0) {
    if (this.edead[j]) return;
    const t = this.et[j], m = this.mods;
    let a = 0;
    if (!ap) { a = t === E_BROOD ? this.broodFrag * 1.5 : E_ARMOR[t]; if (this.mut.plated) a += 3; }
    const cell = this.ecell[j];
    if (m.frostVuln && this.cellSlow[cell] < 1) dmg *= 1 + m.frostVuln;
    if (this.cellShieldT[cell] > this.time && t !== E_SHIELD) dmg *= 0.5;
    const gs = own > 0 ? this.bstats[own] : null;
    if (gs) {
      if (gs.gCrit && this.rng() < gs.gCrit) dmg *= 3;
      if (gs.gFreeze && !IS_BOSS[t] && this.rng() < gs.gFreeze) { this.cellFreezeT[cell] = Math.max(this.cellFreezeT[cell], this.time + 0.6); this.cellFreezeSrc[cell] = 1; }
      if (gs.gChain && !this._chaining && this.rng() < gs.gChain) {
        const k = this.nearestEnemy(this.ex[j], this.ey[j], 2.5, this.eid[j]);
        if (k >= 0) { this._chaining = true; this.damageEnemy(k, dmg * 0.6, ap, own); this._chaining = false; this.ev(EV_ZAP, this.ex[j], this.ey[j], 0, this.ex[k], this.ey[k]); }
      }
    }
    const d = a > 0 ? Math.max(1, dmg - a) : dmg;
    this.ehp[j] -= d;
    this.eflash[j] = 0.06;
    if (this.ehp[j] > 0 && m.execute && own && !IS_BOSS[t] && this.ehp[j] < this.emax[j] * m.execute) this.ehp[j] = 0;
    if (this.ehp[j] <= 0) { this.edead[j] = 1; this.stats.kills++; if (own > 0) this.creditKill(own); }
  }
  creditKill(b) {
    if (!this.balive[b] || this.bstars[b] >= 5) return;
    if (++this.bkills[b] >= STAR_KILLS[this.bstars[b]]) this.starUp(b);
  }

  /** 持續傷害（光環、燃燒、荊棘）：不吃護甲、不閃白 */
  dotEnemy(j, dmg) {
    if (this.edead[j]) return;
    this.ehp[j] -= dmg;
    if (this.ehp[j] <= 0) { this.edead[j] = 1; this.stats.kills++; }
  }

  /** 在邊緣某段範圍內取一個生成點（帶抖動）。side: 0 上 1 右 2 下 3 左；u: 0..1 沿邊位置 */
  edgePoint(side, u, width) {
    const rng = this.rng;
    for (let tries = 0; tries < 6; tries++) {
      const along = u + (rng() + rng() - 1) * width * 0.5;
      const depth = rng() * 1.6 + 0.05;
      let x, y;
      if (side === 0) { x = along * MAP_W; y = depth; }
      else if (side === 2) { x = along * MAP_W; y = MAP_H - depth; }
      else if (side === 1) { x = MAP_W - depth; y = along * MAP_H; }
      else { x = depth; y = along * MAP_H; }
      x = Math.min(MAP_W - 0.05, Math.max(0.05, x));
      y = Math.min(MAP_H - 0.05, Math.max(0.05, y));
      const c = (y | 0) * MAP_W + (x | 0);
      if (!this.rock[c] && this.bldAt[c] < 0) { this._px = x; this._py = y; return true; }
      u = rng();
    }
    return false;
  }

  pickType(night) {
    if (night) {
      // 逐漸出現的新敵人
      const r2 = this.rng();
      let acc = 0;
      for (const ne of NEW_ENEMIES) {
        if (this.day < ne.night) continue;
        acc += ne.frac * Math.min(2, 1 + 0.1 * (this.day - ne.night));
        if (r2 < acc) return ne.type;
      }
    }
    const r = this.rng();
    if (night) {
      const m = NIGHT_MIX[Math.min(this.day, NIGHT_MIX.length) - 1];
      let acc = m[0]; if (r < acc) return E_SPIKE;
      acc += m[1]; if (r < acc) return E_HEAVY;
      acc += m[2]; if (r < acc) return E_DIAMOND;
      acc += m[3]; if (r < acc) return E_HEX;
      return E_SHARD;
    }
    return r < 0.3 ? E_SPIKE : E_SHARD;
  }

  chooseDirs(count) {
    const dirs = [];
    const sides = [0, 1, 2, 3];
    for (let i = 0; i < count; i++) {
      const k = Math.floor(this.rng() * sides.length);
      const side = sides.splice(k, 1)[0];
      dirs.push({ side, u: 0.2 + this.rng() * 0.6, w: side % 2 === 0 ? 0.28 : 0.4 });
    }
    return dirs;
  }

  // ── 模式與成長曲線 ──
  /** endless = 無限模式：沒有終點，每 5 夜一隻更強的夜之主 */
  setMode(endless) { this.endless = !!endless; this.totalDays = endless ? Infinity : TOTAL_DAYS; }
  isLordDay(d = this.day) { return d % 5 === 0 && (this.endless || d <= this.totalDays); }
  /** 第 d 夜的首領種類 */
  bossFor(d) {
    if (d === 5) return this.bossPlan.early;
    if (d === 10) return this.bossPlan.final;
    const r = this.bossPlan.rot;
    return r[(d / 5 - 3) % r.length];
  }
  hpMultFor(d) {
    const L = TOTAL_DAYS;
    const base = Math.pow(BAL.hpGrowth, Math.min(d, L) - 1);
    return d <= L ? base : base * Math.pow(BAL.endlessHp, d - L);
  }
  dpsMultFor(d) {
    const L = TOTAL_DAYS;
    const base = Math.pow(BAL.dpsGrowth, Math.min(d, L) - 1);
    return d <= L ? base : base * Math.pow(BAL.endlessDps, d - L);
  }
  nightTotalFor(d) {
    const i = Math.min(d, NIGHT_TOTAL.length) - 1;
    const t = NIGHT_TOTAL[i] * (BAL.nightCurve ? (BAL.nightCurve[i] ?? 1) : 1);
    let k = BAL.nightScale * this.mods.nightMul;
    if (this.guide) k *= d === 1 ? BAL.guideNight : d === 2 ? 0.8 : 1; // 新手引導：前兩夜溫和一點
    return (d <= NIGHT_TOTAL.length ? t : t * Math.pow(BAL.endlessCount, d - NIGHT_TOTAL.length)) * k;
  }

  spawnTick() {
    const hpMult = this.hpMultFor(this.day);
    const tIn = this.dayT - PHASE_START[this.phase];
    const dIdx = Math.min(this.day, NIGHT_TOTAL.length) - 1;
    const nightRate = this.nightTotalFor(this.day) / NIGHT_Z;
    let rate = 0, mainFrac = 0;
    if (this.phase === P_DAY) rate = BAL.dayTrickle[0] + BAL.dayTrickle[1] * (Math.min(this.day, 8) - 1);
    else if (this.phase === P_DUSK) { const u = tIn / 25; rate = 0.5 + u * u * nightRate * 0.18; mainFrac = 0.4 + 0.5 * u; }
    else if (this.phase === P_NIGHT) {
      rate = this.overtime > 0 ? nightRate * 0.03 : nightRate * nightShape(tIn); mainFrac = 1;
    }
    if (this.n >= BAL.maxAlive) rate = 0; // 效能上限
    this.spawnAcc += rate * DT;
    const night = this.phase === P_NIGHT || this.phase === P_DUSK;
    const eliteP = night ? ELITE_CHANCE[dIdx] * (this.mut.elite ? 2 : 1) * (this.day > 10 ? 1 + 0.1 * (this.day - 10) : 1) : 0;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      let ok;
      if (this.dirs.length && this.rng() < mainFrac) {
        const d = this.dirs[Math.floor(this.rng() * this.dirs.length)];
        ok = this.edgePoint(d.side, d.u, d.w);
      } else ok = this.edgePoint(Math.floor(this.rng() * 4), this.rng(), 0.3);
      if (ok) this.spawnEnemy(this.pickType(night), this._px, this._py, hpMult, this.rng() < eliteP ? 1 : 0);
    }
    // 首領：黃昏就從主攻方向出現，才來得及在夜裡抵達陣地
    if (this.isLordDay() && !this.lordSpawned && this.phase === P_DUSK && tIn >= 1) {
      this.lordSpawned = true;
      const type = this.bossFor(this.day);
      const d = this.dirs[0] || { side: 0, u: 0.5, w: 0.2 };
      if (this.edgePoint(d.side, d.u, 0.05) || this.edgePoint(d.side, 0.5, 0.6)) {
        const seen = this.bossSeen[type] || 0;
        this.bossSeen[type] = seen + 1;
        const scale = Math.pow(this.day / 5, BAL.bossExp) * Math.pow(1.5, seen);
        this.bossScale = scale;
        const x = this._px, y = this._py;
        this.spawnEnemy(type, x, y, BAL.lordHp * scale, 0);
        // 覺醒：再次登場的首領帶著一群菁英護衛
        if (seen > 0) for (let k = 0; k < 8 + 4 * seen; k++) this.spawnEnemy(k % 2 ? E_HEAVY : E_SPIKE, clampX(x + (this.rng() - 0.5) * 3), clampY(y + (this.rng() - 0.5) * 3), hpMult, 1);
        this.ev(EV_LORD, x, y, type);
      }
    }
  }

  // ───────────────────────── 時間與時段 ─────────────────────────
  isFinalNight() { return !this.endless && this.day === this.totalDays && this.phase === P_NIGHT; }
  dawnBuffActive() {
    if (this.state !== 'run') return false;
    if (this.mods.everDay && this.phase <= P_DAY) return true;
    return this.phase === P_DAWN || (this.cs.dawnBuffLen > 15 && this.dayT < this.cs.dawnBuffLen);
  }
  dawnBuffMult() { return 1 + (DAWN_BUFF - 1) * this.mods.dawnBuffMul; }

  /** 黎明：結算這一夜，準備今天的卡、預告、解鎖 */
  onDawn() {
    const m = this.mods;
    this.stats.nights++;
    // 撐過一夜：非攻擊建築 +1 星（夜晚開始前就存在的）
    for (let b = 1; b < this.bHigh; b++) {
      if (!this.balive[b] || ATTACK_TOWERS.has(this.bt[b])) continue;
      if (this.bbornT[b] <= this.duskTime) this.starUp(b);
    }
    if (m.dawnHeal) {
      for (let b = 0; b < this.bHigh; b++) if (this.balive[b]) this.bhp[b] = this.bmax[b];
    }
    this.mut = {}; this.mutList = []; this.newEnemy = -1;
    this.burstsUsed = 0; this.shield = 0;
    this.auraDirty = true;
    this.purifiedToday = 0;
    if (this.unlocked) {
      const add = { 2: [B_CRYSTAL], 3: [B_SCATTER, B_CANNON], 4: [B_FROST, B_PRISM], 5: [B_AMP] }[this.day] || [];
      for (const t of add) this.unlocked.add(t);
      if (this.day >= 5) this.unlocked = null;
    }
    if (this.pendingLegend) { this.pendingLegend = false; this.queueOffer('legend'); }
    // 首領預告：首領出現的前一個黎明
    if (this.isLordDay(this.day + 1)) {
      this.nextBoss = { type: this.bossFor(this.day + 1), day: this.day + 1 };
      this.ev(EV_BOSSWARN, CORE_CX, CORE_CY, this.nextBoss.type);
    } else if (this.nextBoss && this.nextBoss.day < this.day) this.nextBoss = null;
    if (this.day >= 2) this.queueOffer('normal');
  }
  /** 黃昏：選詞綴、上護盾、預支；還沒選的卡自動選第一張 */
  onDusk() {
    const m = this.mods;
    this.duskTime = this.time;
    const ne = NEW_ENEMIES.find(x => x.night === this.day);
    this.newEnemy = ne ? ne.type : -1;
    while (this.offers.length) this.pickCard(this.offers[0].cards[0]);
    this.shield = m.coreShield * (1 + this.coreTier);
    if (m.advance) this.gold += this.goldRate * m.advance;
    // 詞綴
    const d = this.day, boss = this.isLordDay(d);
    let count = 0, pool = 'mild';
    if (!this.endless || d <= TOTAL_DAYS) { if (d >= 7 && d <= 9) count = 1; }
    else { count = d >= 16 ? 2 : 1; pool = 'any'; if (boss && d < 16) count = 0; }
    const cand = MUTATORS.filter(x => pool === 'any' || x.pool === pool);
    for (let k = 0; k < count && cand.length; k++) {
      const mu = cand.splice(Math.floor(this.crng() * cand.length), 1)[0];
      this.mut[mu.id] = true; this.mutList.push(mu.id);
    }
  }

  advanceClock() {
    this.time += DT;
    this.dayT += DT;
    // 夜之主還沒倒下：黑夜延長（最多 BAL.lordOvertime 秒）
    if (this.dayT >= DAY_LEN && this.lordAlive > 0 && this.overtime < BAL.lordOvertime) {
      // 首領還沒倒：第一道晨光把其他敵人驅散，只剩首領，黑夜延長
      if (this.overtime === 0) {
        for (let i = 0; i < this.n; i++) if (!IS_BOSS[this.et[i]]) this.edead[i] = 2;
        this.ev(EV_DAWN, CORE_CX, CORE_CY, 0);
      }
      this.dayT = DAY_LEN - 1e-4;
      this.overtime += DT;
      return;
    }
    if (this.dayT >= DAY_LEN) {
      this.dayT -= DAY_LEN;
      this.overtime = 0;
      this.lordSpawned = false;
      this.day++;
      this.stats.coreHpAtDawn.push(Math.round(this.bhp[this.core]));
      this.phase = P_DAWN;
      this.sweepR = 0;
      this.dirs = []; this.warnDirs = []; this.dirSwitched = false;
      this.ev(EV_DAWN, CORE_CX, CORE_CY, this.day);
      if (this.day > this.totalDays) { this.state = 'won'; this.stats.nights++; return; }
      this.onDawn();
      return;
    }
    const p = this.dayT >= PHASE_START[3] ? 3 : this.dayT >= PHASE_START[2] ? 2 : this.dayT >= PHASE_START[1] ? 1 : 0;
    if (p !== this.phase) {
      this.phase = p;
      if (p === P_DUSK) {
        this.onDusk();
        const dIdx = Math.min(this.day, NIGHT_DIRS.length) - 1;
        this.dirs = this.chooseDirs(Math.min(4, NIGHT_DIRS[dIdx] + (this.mut.surge ? 2 : 0)));
        this.warnDirs = this.mut.fog ? [] : this.dirs;
        this.ev(EV_DUSK, CORE_CX, CORE_CY, this.day);
      } else if (p === P_NIGHT) this.ev(EV_NIGHT, CORE_CX, CORE_CY, this.day);
    }
    // 第 3 夜起，中途換方向
    if (this.phase === P_NIGHT && this.day >= 3 && !this.dirSwitched && this.dayT - PHASE_START[3] > 24) {
      this.dirSwitched = true;
      this.dirs = this.chooseDirs(this.dirs.length);
      this.warnDirs = this.mut.fog ? [] : this.dirs;
    }
  }

  // ───────────────────────── 主步進 ─────────────────────────
  /** 暫停或規劃中由外部呼叫，只推進視覺時鐘 */
  idle(dt) { this.vt += dt; }

  step() {
    if (this.state === 'plan' || this.state === 'lost') return;
    this.tick++;
    this.vt += DT;
    if (this.state === 'won') { this.time += DT; this.sweepStep(); this.removeDead(); return; }

    this.advanceClock();
    if (this.state !== 'run') { this.sweepStep(); this.removeDead(); return; }

    if (this.tick % 10 === 0 && this.blueprints.length) this.processBlueprints();
    if (this.mods.undying && this.tick % 30 === 0 && this.ghosts.length) {
      for (let k = this.ghosts.length - 1; k >= 0; k--) if (this.ghosts[k].reviveAt <= this.time) this.reviveGhost(k);
    }
    if (this.mods.starfall && this.stats.kills - this.starfallAcc >= this.mods.starfall) {
      this.starfallAcc += this.mods.starfall;
      const cand = [];
      for (let b = 1; b < this.bHigh; b++) if (this.balive[b] && ATTACK_TOWERS.has(this.bt[b]) && this.bstars[b] < 5) cand.push(b);
      if (cand.length) this.starUp(cand[Math.floor(this.rng() * cand.length)]);
    }
    this.chainBudget = Math.min(this.chainBudget + 3, 120);
    if (this.burstR >= 0) { this.burstR += DT * 60; if (this.burstR > this.sweepMax) this.burstR = -1; }
    if (this.bench) this.benchSpawn(); else this.spawnTick();
    this.buildGrid();
    if ((this.flowDirty && this.tick - this.lastFlowTick >= FLOW_MIN_STEPS) ||
      (this.flowSoft && this.tick - this.lastFlowTick >= 30)) this.recomputeFlow();
    if (this.auraDirty) this.recomputeAura();
    this.sweepStep();
    this.updateEnemies();
    this.updateBuildings();
    this.updateBullets();
    this.removeDead();
    if (this.n > this.stats.peak) this.stats.peak = this.n;
  }

  sweepStep() {
    if (this.sweepR < 0) return;
    this.sweepR += DT * this.sweepMax / 2.2;
    const r2 = this.sweepR * this.sweepR;
    for (let i = 0; i < this.n; i++) {
      if (this.edead[i]) continue;
      const dx = this.ex[i] - CORE_CX, dy = this.ey[i] - CORE_CY;
      if (dx * dx + dy * dy < r2) this.edead[i] = 2;
    }
    // 光波掃到殘影時依序復活
    if (this.ghosts.length && this.state === 'run') {
      for (let k = this.ghosts.length - 1; k >= 0; k--) {
        const g = this.ghosts[k];
        const dx = g.x + 0.5 - CORE_CX, dy = g.y + 0.5 - CORE_CY;
        if (dx * dx + dy * dy > r2) continue;
        this.reviveGhost(k);
      }
    }
    // 光波掃過暗晶：淨化成晶
    if (!this.bench) {
      const dark = this.darkC, mul = CORE_TYPES[this.coreType].id === 'tide' ? 1.5 : 1;
      let total = 0, evs = 0;
      const y0 = Math.max(0, Math.floor(CORE_CY - this.sweepR)), y1 = Math.min(MAP_H - 1, Math.floor(CORE_CY + this.sweepR));
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - CORE_CY;
        for (let x = 0; x < MAP_W; x++) {
          const c = y * MAP_W + x;
          if (dark[c] <= 0) continue;
          const dx = x + 0.5 - CORE_CX, d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const amt = dark[c] * mul;
          total += amt; dark[c] = 0;
          if (amt > 0.15 && evs < 40) { evs++; this.ev(EV_PURIFY, x + 0.5, y + 0.5, amt); }
        }
      }
      if (total > 0) { this.crystal += total; this.stats.crystalEarned += total; this.stats.purified += total; this.purifiedToday += total; }
    }
    if (this.sweepR > this.sweepMax) { this.sweepR = -1; this.lastPurify = this.purifiedToday; }
  }

  buildGrid() {
    const n = this.n, cnt = this.cellCount, start = this.cellStart, fill = this.cellFill, items = this.cellItems;
    const ex = this.ex, ey = this.ey, ecell = this.ecell;
    cnt.fill(0);
    for (let i = 0; i < n; i++) {
      const c = (ey[i] | 0) * MAP_W + (ex[i] | 0);
      ecell[i] = c; cnt[c]++;
    }
    let s = 0;
    for (let c = 0; c < N_CELLS; c++) { start[c] = s; fill[c] = s; s += cnt[c]; }
    start[N_CELLS] = s;
    for (let i = 0; i < n; i++) items[fill[ecell[i]]++] = i;
    if (this.tick % 30 === 0 && n > 256) this.spatialSort();
  }

  /** 依格子順序重排敵人陣列（雙緩衝交換），之後 cellItems 變成恆等排列。 */
  spatialSort() {
    const n = this.n, items = this.cellItems;
    for (const f of this.E_FIELDS) {
      const src = this[f], dst = this.eAlt[f];
      for (let k = 0; k < n; k++) dst[k] = src[items[k]];
      this.eAlt[f] = src; this[f] = dst;
    }
    for (let k = 0; k < n; k++) items[k] = k;
  }

  nearestBuilding(x, y, R) {
    let best = -1, bd = Infinity;
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(MAP_W - 1, Math.floor(x + R));
    const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(MAP_H - 1, Math.floor(y + R));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.bldAt[cy * MAP_W + cx];
      if (b < 0) continue;
      const dx = Math.max(cx - x, 0, x - cx - 1), dy = Math.max(cy - y, 0, y - cy - 1);
      const d2 = dx * dx + dy * dy;
      if (d2 <= R * R && d2 < bd) { bd = d2; best = b; }
    }
    return best;
  }

  updateEnemies() {
    const n = this.n, W = MAP_W, time = this.time;
    const ex = this.ex, ey = this.ey, epx = this.epx, epy = this.epy, evx = this.evx, evy = this.evy;
    const et = this.et, ecell = this.ecell, eatk = this.eatk, eflash = this.eflash, erot = this.erot, erad = this.erad;
    const eelite = this.eelite, ecd = this.ecd;
    const start = this.cellStart, items = this.cellItems;
    const nextA = this.nextA, nextB = this.nextB, bldAt = this.bldAt, rock = this.rock;
    const cellSlow = this.cellSlow, cellDot = this.cellDot, cellFreezeT = this.cellFreezeT;
    const cellBurnT = this.cellBurnT, cellBurnDps = this.cellBurnDps;
    const tick = this.tick;
    const dpsMult = this.dpsMultFor(this.day), bossDps = Math.sqrt(this.bossScale);
    const mut = this.mut, slowedDps = this.mods.slowedDps, speedMul = mut.swift ? 1.25 : 1;
    for (let i = 0; i < n; i++) {
      const x = ex[i], y = ey[i];
      epx[i] = x; epy[i] = y;
      if (eflash[i] > 0) eflash[i] -= DT;
      const t = et[i], r = erad[i], boss = IS_BOSS[t];
      const c = ecell[i];
      let dps = E_DPS[t] * (eelite[i] ? ELITE_DPS : 1) * (boss ? bossDps : dpsMult);
      if (cellSlow[c] < 1) dps *= slowedDps;
      if (mut.frenzy && this.ehp[i] < this.emax[i] * 0.5) dps *= 1.5;
      if (mut.regen && this.ehp[i] < this.emax[i]) this.ehp[i] = Math.min(this.emax[i], this.ehp[i] + this.emax[i] * 0.02 * DT);

      // 地面效果：冰晶光環、燃燒帶
      let dot = cellDot[c];
      if (cellBurnT[c] > time) dot += cellBurnDps[c];
      if (dot > 0) { this.dotEnemy(i, dot * DT); if (this.edead[i]) continue; }
      let frozen = cellFreezeT[c] > time && !boss;
      let slowF = boss && t !== E_EATER ? 0.5 + 0.5 * cellSlow[c] : cellSlow[c];
      if (mut.chill) { slowF = 1 - (1 - slowF) * 0.5; if (frozen) { frozen = false; slowF *= 0.5; } }
      if (boss) { if (this.bossTick(i, t, x, y, dps)) continue; }

      let dirx = 0, diry = 0;
      let attacking = false;

      // 菱：停在 3 格外射擊建築
      if (t === E_DIAMOND) {
        let tb = eatk[i];
        if (tb >= 0) {
          if (!this.balive[tb]) tb = -1;
          else if (tb !== this.core) {
            const dx = this.bx[tb] + 0.5 - x, dy = this.by[tb] + 0.5 - y;
            if (dx * dx + dy * dy > (DIAMOND_RANGE + 1) * (DIAMOND_RANGE + 1)) tb = -1;
          }
        }
        ecd[i] -= DT;
        if (tb < 0 && ecd[i] <= 0) { ecd[i] = 0.25; tb = this.nearestBuilding(x, y, DIAMOND_RANGE); }
        eatk[i] = tb;
        if (tb >= 0) {
          attacking = true;
          this.damageBuilding(tb, dps * DT);
          if ((tick + i) % 30 === 0) {
            const tx = tb === this.core ? CORE_CX : this.bx[tb] + 0.5, ty = tb === this.core ? CORE_CY : this.by[tb] + 0.5;
            this.ev(EV_ESHOT, x, y, 0, tx, ty);
          }
        }
      }

      // 醫者：替周圍敵人回血；盾衛：替周圍敵人擋傷害
      if (t === E_HEALER && (tick + i) % 30 === 0) this.healAround(x, y, 2.5);
      else if (t === E_SHIELD && (tick + i) % 15 === 0) this.forCellsInRadius(x, y, 2.5, q => { this.cellShieldT[q] = time + 0.3; });
      // 飛群：無視牆壁直線飛向核心，擋路的建築直接拆
      if (t === E_FLYER) {
        const dx = CORE_CX - x, dy = CORE_CY - y, L = Math.hypot(dx, dy) || 1;
        const nx = x + dx / L * 0.6, ny = y + dy / L * 0.6, q = (ny | 0) * W + (nx | 0);
        const tb = bldAt[q];
        if (tb >= 0) { this.damageBuilding(tb, dps * DT); evx[i] = 0; evy[i] = 0; }
        else {
          const sp = frozen ? 0 : E_SPEED[t] * slowF * speedMul * DT;
          ex[i] = x + dx / L * sp; ey[i] = y + dy / L * sp; evx[i] = dx / L * sp * 60; evy[i] = dy / L * sp * 60;
        }
        erot[i] = Math.atan2(dy, dx);
        continue;
      }

      // 噬光者：飛行，無視牆壁直飛最亮的建築
      if (t === E_EATER) {
        let tb = eatk[i];
        if (tb >= 0 && !this.balive[tb]) tb = -1;
        ecd[i] -= DT;
        if (tb < 0 && ecd[i] <= 0) { ecd[i] = 0.5; tb = this.eaterTarget(x, y); }
        eatk[i] = tb;
        if (tb >= 0) {
          const tx = tb === this.core ? CORE_CX : this.bx[tb] + 0.5, ty = tb === this.core ? CORE_CY : this.by[tb] + 0.5;
          const dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy);
          if (L <= (tb === this.core ? 2.2 : 1.1)) {
            this.damageBuilding(tb, dps * DT);
            if (!this.balive[tb]) { this.ehp[i] = Math.min(this.emax[i], this.ehp[i] + this.emax[i] * 0.08); this.ev(EV_EAT, tx, ty, 0); }
            evx[i] = 0; evy[i] = 0;
          } else {
            const sp = E_SPEED[t] * slowF * speedMul * DT;
            ex[i] = x + dx / L * sp; ey[i] = y + dy / L * sp;
            evx[i] = dx / L * sp * 60; evy[i] = dy / L * sp * 60;
            erot[i] = Math.atan2(dy, dx);
          }
        }
        continue;
      }

      const burrow = t === E_BURROW;
      if (!attacking) {
        const field = burrow ? this.nextC : t === E_SPIKE ? nextB : nextA;
        let nc = field[c];
        if (!burrow && (bldAt[c] >= 0 || rock[c])) nc = nextA[c]; // 被擠進障礙物：朝流場方向脫困
        if (nc >= 0) {
          const nx = nc % W, ny = (nc / W) | 0;
          const tb = bldAt[nc];
          if (tb >= 0 && (bldAt[c] < 0 || burrow) && (!burrow || tb === this.core)) {
            const ddx = Math.max(nx - x, 0, x - nx - 1), ddy = Math.max(ny - y, 0, y - ny - 1);
            const reach = (boss ? 0.6 : r) + 0.14;
            if (ddx * ddx + ddy * ddy <= reach * reach) {
              attacking = true;
              eatk[i] = tb;
              this.damageBuilding(tb, dps * DT);
              const s = this.bstats[tb];
              if (s && s.thorns) { this.dotEnemy(i, dps * s.thorns * DT); if (this.edead[i]) continue; }
            }
          }
          if (!attacking) {
            eatk[i] = -1;
            const tx = nx + 0.5 - x, ty = ny + 0.5 - y;
            const L = Math.sqrt(tx * tx + ty * ty);
            if (L > 1e-5) { dirx = tx / L; diry = ty / L; }
          }
        } else eatk[i] = -1;
      }

      // 輕量互斥：最多 8 個鄰居。每隻敵人隔一步做一次（推力加倍）。
      let sx = 0, sy = 0;
      if (((i + tick) & 1) === 0 && !boss) {
        let checked = 0;
        const cx = c % W, cy = (c / W) | 0;
        for (let k = 0; k < 9 && checked < 8; k++) {
          const qx = cx + NOX[k], qy = cy + NOY[k];
          if (qx < 0 || qy < 0 || qx >= W || qy >= MAP_H) continue;
          const q = qy * W + qx;
          const s0 = start[q], cnt = start[q + 1] - s0;
          if (cnt === 0) continue;
          let m = s0 + (k === 0 ? (i + tick) % cnt : 0);
          for (let z = 0; z < cnt; z++, m++) {
            if (m >= s0 + cnt) m = s0;
            const j = items[m];
            if (j === i) continue;
            const dx = x - ex[j], dy = y - ey[j];
            const rj = erad[j], rr = r + rj;
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) {
              if (d2 > 1e-8) {
                const d = Math.sqrt(d2);
                const push = (rr - d) / d * (rj / rr);
                sx += dx * push; sy += dy * push;
              } else { sx += (i & 1) ? 0.05 : -0.05; sy += (i & 2) ? 0.05 : -0.05; }
            }
            if (++checked >= 8) break;
          }
        }
        sx *= 0.7; sy *= 0.7;
      }

      const sp = frozen ? 0 : E_SPEED[t] * slowF * speedMul * DT;
      let vx = dirx * sp, vy = diry * sp;
      const sl = sx * sx + sy * sy, smax = frozen ? 0.02 : 0.1;
      if (sl > smax * smax) { const k = smax / Math.sqrt(sl); sx *= k; sy *= k; }
      vx += sx; vy += sy;

      // 碰撞：岩石與建築不可穿越（逐軸滑動）；夜之主用較小的碰撞半徑
      const cr = boss ? 0.3 : r * 0.8;
      let nx2 = x + vx, ny2 = y;
      if (burrow) { ny2 = y + vy; if (rock[(ny2 | 0) * W + (nx2 | 0)]) { nx2 = x; ny2 = y; } }
      else if (bldAt[c] < 0 && !rock[c]) {
        const lx = nx2 + (vx > 0 ? cr : -cr);
        if (lx < 0 || lx >= W) nx2 = x;
        else { const q = (y | 0) * W + (lx | 0); if (rock[q] || bldAt[q] >= 0) nx2 = x; }
        ny2 = y + vy;
        const ly = ny2 + (vy > 0 ? cr : -cr);
        if (ly < 0 || ly >= MAP_H) ny2 = y;
        else { const q = (ly | 0) * W + (nx2 | 0); if (rock[q] || bldAt[q] >= 0) ny2 = y; }
      } else ny2 = y + vy;
      if (nx2 < 0.01) nx2 = 0.01; else if (nx2 > W - 0.01) nx2 = W - 0.01;
      if (ny2 < 0.01) ny2 = 0.01; else if (ny2 > MAP_H - 0.01) ny2 = MAP_H - 0.01;
      ex[i] = nx2; ey[i] = ny2;
      evx[i] = (nx2 - x) * 60; evy[i] = (ny2 - y) * 60;
      if (t === E_SPIKE) { if (dirx || diry) erot[i] = Math.atan2(diry, dirx); }
      else if (!frozen) erot[i] += DT * (t === E_HEAVY ? 0.4 : boss ? 0.5 : t === E_DIAMOND ? 0 : 1.2);
    }
  }

  /** 首領每步的特殊行為。回傳 true 表示這一步已處理完（不再走一般移動） */
  bossTick(i, t, x, y, dps) {
    const time = this.time, ecd = this.ecd, hpMult = this.hpMultFor(this.day);
    if (t === E_LORD) {
      // 週期脈衝讓附近的塔停機
      ecd[i] -= DT;
      if (ecd[i] <= 0) {
        ecd[i] = LORD_PULSE.period;
        this.forCellsInRadius(x, y, LORD_PULSE.radius, q => { const b = this.bldAt[q]; if (b > 0) this.bdis[b] = time + LORD_PULSE.stun; });
        this.auraDirty = true;
        this.ev(EV_LORDPULSE, x, y, LORD_PULSE.radius);
      }
    } else if (t === E_TIDE) {
      // 每 8 秒放出一波小怪；走過的地方建築持續受損
      ecd[i] -= DT;
      if (ecd[i] <= 0) {
        ecd[i] = 8;
        const k = Math.min(120 + 20 * (this.bossSeen[t] - 1 || 0), BAL.maxAlive + 2000 - this.n);
        for (let q = 0; q < k; q++) {
          const a = this.rng() * 6.283, R = 1.8 + this.rng() * 1.5;
          const sx = clampX(x + Math.cos(a) * R), sy = clampY(y + Math.sin(a) * R), c = (sy | 0) * MAP_W + (sx | 0);
          if (this.rock[c] || this.bldAt[c] >= 0) continue;
          this.spawnEnemy(q % 5 ? E_SHARD : E_SPIKE, sx, sy, hpMult, 0);
        }
        this.ev(EV_SUMMON, x, y, 3.3);
      }
      if ((this.tick + i) % 30 === 0) this.damageArea(x, y, 2.6, dps * 0.15);
    } else if (t === E_ECLIPSE) {
      // 周圍一片黑暗：圈內的塔射程減半
      if ((this.tick + i) % 15 === 0) {
        const until = time + 0.35;
        this.forCellsInRadius(x, y, 7, q => { const b = this.bldAt[q]; if (b > 0) this.bdark[b] = until; });
      }
      const frac = this.ehp[i] / this.emax[i];
      while (this.eclipseSplits < 2 && frac < 1 - (this.eclipseSplits + 1) / 3) {
        this.eclipseSplits++;
        for (let q = 0; q < 3; q++) {
          const a = q / 3 * 6.283 + this.rng();
          this.spawnEnemy(E_SHADE, clampX(x + Math.cos(a) * 1.5), clampY(y + Math.sin(a) * 1.5), this.bossScale, 0);
        }
        this.ev(EV_SPLIT, x, y, t);
      }
    } else if (t === E_BROOD) {
      // 外殼每掉一片（每 1/9 血），掉出一群菁英
      while (this.broodFrag > 0 && this.ehp[i] < this.emax[i] * this.broodFrag / 9) {
        this.broodFrag--;
        for (let q = 0; q < 10; q++) {
          const a = this.rng() * 6.283, R = 1.6 + this.rng();
          const sx = clampX(x + Math.cos(a) * R), sy = clampY(y + Math.sin(a) * R), c = (sy | 0) * MAP_W + (sx | 0);
          if (this.rock[c] || this.bldAt[c] >= 0) continue;
          this.spawnEnemy(q % 3 ? E_SHARD : E_SPIKE, sx, sy, hpMult, 1);
        }
        this.ev(EV_SPLIT, x, y, t);
      }
    }
    return false;
  }
  /** 醫者：周圍敵人回血 4% */
  healAround(x, y, R) {
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey;
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(MAP_W - 1, Math.floor(x + R));
    const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(MAP_H - 1, Math.floor(y + R));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const q = cy * MAP_W + cx;
      for (let m = start[q], e = start[q + 1]; m < e; m++) {
        const j = items[m];
        if (this.edead[j] || IS_BOSS[this.et[j]]) continue;
        const dx = ex[j] - x, dy = ey[j] - y;
        if (dx * dx + dy * dy <= R * R && this.ehp[j] < this.emax[j]) this.ehp[j] = Math.min(this.emax[j], this.ehp[j] + this.emax[j] * 0.04);
      }
    }
  }
  /** 範圍內所有建築受到傷害（深潮） */
  damageArea(x, y, R, dmg) {
    this.forCellsInRadius(x, y, R, q => { const b = this.bldAt[q]; if (b >= 0 && this.balive[b]) this.damageBuilding(b, dmg); });
  }
  /** 噬光者的目標：最近的礦，沒有就是核心 */
  eaterTarget(x, y) {
    let best = this.core, bd = Infinity;
    for (let b = 1; b < this.bHigh; b++) {
      if (!this.balive[b] || (this.bt[b] !== B_GOLD && this.bt[b] !== B_CRYSTAL)) continue;
      const dx = this.bx[b] + 0.5 - x, dy = this.by[b] + 0.5 - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = b; }
    }
    return best;
  }

  findTarget(b, range) {
    const cx = this.bx[b] + 0.5, cy = this.by[b] + 0.5;
    const strat = this.bstrat[b];
    const x0 = Math.max(0, Math.floor(cx - range - 0.6)), x1 = Math.min(MAP_W - 1, Math.floor(cx + range + 0.6));
    const y0 = Math.max(0, Math.floor(cy - range - 0.6)), y1 = Math.min(MAP_H - 1, Math.floor(cy + range + 0.6));
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey, erad = this.erad;
    const dist = this.distA;
    let best = -1, bestScore = Infinity;
    for (let y = y0; y <= y1; y++) {
      const dyc = Math.max(0, Math.abs(y + 0.5 - cy) - 0.5);
      for (let x = x0; x <= x1; x++) {
        const dxc = Math.max(0, Math.abs(x + 0.5 - cx) - 0.5);
        if (dxc * dxc + dyc * dyc > (range + 0.6) * (range + 0.6)) continue;
        const q = y * MAP_W + x;
        const s = start[q], e = start[q + 1];
        if (s === e) continue;
        for (let m = s; m < e; m++) {
          const j = items[m];
          if (this.edead[j]) continue;
          const dx = ex[j] - cx, dy = ey[j] - cy;
          const d2 = dx * dx + dy * dy;
          const rr = range + erad[j];
          if (d2 > rr * rr) continue;
          if (this.et[j] === E_CLOAK && d2 > 12.25) continue; // 隱影：只看得到 3.5 格內
          let score;
          if (strat === 0) score = dist[q];
          else if (strat === 1) score = d2;
          else if (strat === 2) score = -this.ehp[j];
          else score = -(this.emax[j] * 1000 + this.ehp[j]);
          if (score < bestScore) { bestScore = score; best = j; }
        }
      }
    }
    return best;
  }

  updateBuildings() {
    const ex = this.ex, ey = this.ey, time = this.time;
    const buff = this.dawnBuffActive() ? this.dawnBuffMult() : 1;
    let gold = 0, crystal = 0, nMines = 0;
    if (this.resoDirty) { this.resoDirty = false; this.refreshStats(); }
    for (let b = 1; b < this.bHigh; b++) {
      if (!this.balive[b]) continue;
      const t = this.bt[b], s = this.bstats[b];
      if (this.bench && this.bhp[b] < this.bmax[b]) this.bhp[b] = this.bmax[b];
      if (this.bdis[b] > 0 && this.bdis[b] <= time) { this.bdis[b] = 0; this.auraDirty = true; }
      const disabled = this.bdis[b] > time;
      if (t === B_GOLD) { if (!disabled) { gold += s.gold * this.bprodM[b]; nMines++; } continue; }
      if (t === B_LIGHT || t === B_TRAP) continue;
      if (t === B_REPAIR) {
        if (!disabled && (this.tick + b) % 30 === 0) {
          const h = s.heal * 0.5;
          this.forCellsInRadius(this.bx[b] + 0.5, this.by[b] + 0.5, s.aura, c => {
            const q = this.bldAt[c];
            if (q >= 0 && this.balive[q] && this.bhp[q] < this.bmax[q]) this.bhp[q] = Math.min(this.bmax[q], this.bhp[q] + this.bmax[q] * h * (q === this.core ? 0.25 : 1));
          });
        }
        continue;
      }
      if (t === B_CRYSTAL) { if (!disabled) crystal += s.crystal * this.bprodM[b]; continue; }
      if (t === B_WALL) {
        if (s.regen && this.bhp[b] < this.bmax[b]) this.bhp[b] = Math.min(this.bmax[b], this.bhp[b] + this.bmax[b] * s.regen * DT);
        continue;
      }
      if (t === B_AMP) continue;
      if (t === B_FROST) {
        if (s.freeze && !disabled) {
          this.bfreeze[b] -= DT * buff;
          if (this.bfreeze[b] <= 0) {
            this.bfreeze[b] = s.freeze;
            const until = time + 1;
            this.forCellsInRadius(this.bx[b] + 0.5, this.by[b] + 0.5, s.aura, c => { this.cellFreezeT[c] = until; this.cellFreezeSrc[c] = 1; });
            this.ev(EV_FREEZE, this.bx[b] + 0.5, this.by[b] + 0.5, s.aura);
          }
        }
        continue;
      }
      // 攻擊塔
      if (disabled) { this.btgt[b] = -1; continue; }
      const cx = this.bx[b] + 0.5, cy = this.by[b] + 0.5;
      const range = this.bdark[b] > time && t !== B_PRISM ? s.range * 0.5 : s.range;
      let tg = this.btgt[b];
      if (tg >= 0) {
        if (tg >= this.n || this.eid[tg] !== this.btgtId[b] || this.edead[tg]) tg = -1;
        else {
          const dx = ex[tg] - cx, dy = ey[tg] - cy, rr = range + this.erad[tg];
          if (dx * dx + dy * dy > rr * rr) tg = -1;
        }
      }
      const ph = (this.tick + b) % 6;
      if (ph === 0 || (tg < 0 && (ph & 1) === 0)) tg = this.findTarget(b, range);
      this.btgt[b] = tg; this.btgtId[b] = tg >= 0 ? this.eid[tg] : 0;
      this.bcd[b] -= DT * buff * this.brateM[b] * (this.bhaste[b] > time ? 2 : 1);
      if (tg < 0) { if (this.bcd[b] < 0) this.bcd[b] = 0; continue; }
      this.bang[b] = Math.atan2(ey[tg] - cy, ex[tg] - cx);
      if (this.bcd[b] > 0) continue;
      this.bcd[b] += 1 / s.rate;
      if (this.bcd[b] < 0) this.bcd[b] = 0;
      this.fire(b, t, s, cx, cy, tg);
    }
    // 核心產出與脈衝
    const cs = this.cs;
    // 金礦超過 12 座後效率遞減：等效座數 = 12 ×（N/12）^0.6（研究後 0.75）
    if (nMines > BAL.mineKnee) gold *= this.mineEff(nMines) / nMines;
    gold = (gold * buff + cs.gold * (this.mods.secondSun ? 1.5 : 1));
    crystal = (crystal * buff + cs.crystal);
    if (this.bench) { gold = 0; crystal = 0; }
    this.goldRate = gold; this.crystalRate = crystal;
    this.gold += gold * DT; this.crystal += crystal * DT;
    if (cs.pulse && (this.phase === P_NIGHT || this.phase === P_DUSK)) {
      this.corePulseCd -= DT;
      if (this.corePulseCd <= 0) {
        this.corePulseCd = cs.pulse.period;
        this.corePulseT = time;
        this.explode(CORE_CX, CORE_CY, cs.pulse.radius, cs.pulse.dmg, false, 1);
        this.ev(EV_COREPULSE, CORE_CX, CORE_CY, cs.pulse.radius);
      }
    }
    // 第二太陽：夜晚也發出脈衝
    if (this.sun2 && this.mods.secondSun && (this.phase === P_NIGHT || this.phase === P_DUSK)) {
      this.sun2Cd -= DT;
      if (this.sun2Cd <= 0) {
        this.sun2Cd = 1.5;
        const R = 6 + this.coreTier * 0.5, dmg = 40 * (1 + this.coreTier);
        this.explode(this.sun2.x, this.sun2.y, R, dmg, false, 1);
        this.ev(EV_COREPULSE, this.sun2.x, this.sun2.y, R);
      }
    }
  }

  newBullet(own = 0) {
    if (this.nb >= this.BULLET_CAP) return -1;
    const i = this.nb++;
    this.ubounce[i] = 0; this.uap[i] = 0; this.ulast[i] = 0; this.ucluster[i] = 0; this.urad[i] = 0; this.uown[i] = own;
    return i;
  }

  fire(b, t, s, cx, cy, tg) {
    const tier = this.btier[b];
    this.bfire[b] = this.vt;
    this.bshots[b]++;
    const tx0 = this.ex[tg], ty0 = this.ey[tg];
    const dist = Math.hypot(tx0 - cx, ty0 - cy);
    if (t === B_TESLA) { this.zap(b, s, cx, cy, tg); return; }
    if (t === B_PRISM) {
      let dmg = s.dmg;
      if (this.mods.focus) {
        // 聚焦：連續打同一目標，傷害遞增
        if (this.btgtId[b] === this.bfocusId[b]) this.bfocus[b] = Math.min(1.5, this.bfocus[b] + 0.15); else this.bfocus[b] = 0;
        this.bfocusId[b] = this.btgtId[b];
        dmg *= 1 + this.bfocus[b];
      }
      const base = Math.atan2(ty0 - cy, tx0 - cx);
      for (let k = 0; k < s.beams; k++) {
        const a = base + (k - (s.beams - 1) / 2) * (s.beams > 4 ? 0.2 : 0.28);
        this.beam(cx, cy, a, s.range, dmg, s.burn || 0, tier, b, this.mods.prismSplit);
      }
      return;
    }
    // 流星弓：每 5 發射出一支貫穿全圖的光箭
    if (t === B_ARROW && this.basc[b] && this.bshots[b] % 5 === 0) {
      this.beam(cx, cy, Math.atan2(ty0 - cy, tx0 - cx), 60, s.dmg * 4, 0, 3, b, 0);
    }
    const speed = s.speed;
    const tt = dist / speed;
    const ax = tx0 + this.evx[tg] * tt, ay = ty0 + this.evy[tg] * tt;
    const dx = ax - cx, dy = ay - cy, L = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    this.bang[b] = ang;
    if (t === B_SCATTER) {
      const n = s.pellets, spread = n > 6 ? 0.9 : 0.7;
      for (let k = 0; k < n; k++) {
        const i = this.newBullet(b); if (i < 0) break;
        const a = ang + (n === 1 ? 0 : (k / (n - 1) - 0.5) * spread) + (this.rng() - 0.5) * 0.08;
        this.ux[i] = this.upx[i] = cx + Math.cos(a) * 0.4; this.uy[i] = this.upy[i] = cy + Math.sin(a) * 0.4;
        this.uvx[i] = Math.cos(a) * speed; this.uvy[i] = Math.sin(a) * speed;
        this.ukind[i] = BK_PELLET; this.ulife[i] = (s.range + 0.8) / speed; this.udmg[i] = s.dmg;
        this.ubounce[i] = s.bounce; this.utier[i] = tier;
      }
      this.ev(EV_SHOT, cx, cy, t);
      return;
    }
    const i = this.newBullet(b); if (i < 0) return;
    this.ux[i] = this.upx[i] = cx + dx / L * 0.45; this.uy[i] = this.upy[i] = cy + dy / L * 0.45;
    this.uvx[i] = dx / L * speed; this.uvy[i] = dy / L * speed;
    this.udmg[i] = s.dmg; this.utier[i] = tier;
    if (t === B_ARROW) {
      this.ukind[i] = BK_ARROW; this.ulife[i] = (s.range + 1.5) / speed; this.uap[i] = s.ap || 0; this.ubounce[i] = s.bounce || 0;
    } else {
      this.ukind[i] = BK_SHELL; this.ulife[i] = L / speed;
      this.utx[i] = ax; this.uty[i] = ay; this.urad[i] = s.radius; this.ucluster[i] = s.cluster || 0;
      // 天墜：附近再落下 3 發砲彈
      if (this.basc[b]) for (let k = 0; k < 3; k++) {
        const j = this.newBullet(b); if (j < 0) break;
        const ox = ax + (this.rng() - 0.5) * 5, oy = ay + (this.rng() - 0.5) * 5, life = 0.35 + this.rng() * 0.3;
        this.ux[j] = this.upx[j] = ox; this.uy[j] = this.upy[j] = oy - 6;
        this.uvx[j] = 0; this.uvy[j] = 6 / life;
        this.ukind[j] = BK_SHELL; this.ulife[j] = life; this.udmg[j] = s.dmg; this.utier[j] = tier;
        this.utx[j] = ox; this.uty[j] = oy; this.urad[j] = s.radius; this.ucluster[j] = 0;
      }
    }
    this.ev(EV_SHOT, cx, cy, t);
  }

  /** 雷擊塔：閃電在敵人之間連鎖 */
  zap(b, s, cx, cy, tg) {
    const id = ++this.beamId, stamp = this.estamp;
    let px = cx, py = cy, cur = tg, dmg = s.dmg;
    for (let k = 0; k <= s.chains && cur >= 0; k++) {
      stamp[cur] = id;
      const x = this.ex[cur], y = this.ey[cur];
      this.damageEnemy(cur, dmg, 0, b);
      if (s.stun) { const c = this.ecell[cur]; if (this.cellFreezeT[c] < this.time + s.stun) { this.cellFreezeT[c] = this.time + s.stun; this.cellFreezeSrc[c] = 1; } }
      this.ev(EV_ZAP, px, py, this.btier[b], x, y);
      px = x; py = y; dmg *= 0.85;
      cur = this.nearestUnstamped(x, y, 3, id);
    }
  }
  nearestUnstamped(x, y, R, id) {
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey, stamp = this.estamp;
    let best = -1, bd = R * R;
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(MAP_W - 1, Math.floor(x + R));
    const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(MAP_H - 1, Math.floor(y + R));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const q = cy * MAP_W + cx;
      for (let m = start[q], e = start[q + 1]; m < e; m++) {
        const j = items[m];
        if (this.edead[j] || stamp[j] === id) continue;
        const dx = ex[j] - x, dy = ey[j] - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = j; }
      }
    }
    return best;
  }

  /** 稜鏡雷射：沿線傷害所有敵人（每道光束每隻敵人只算一次） */
  beam(x0, y0, a, range, dmg, burn, tier, own = 0, split = 0) {
    const id = ++this.beamId;
    const dx = Math.cos(a), dy = Math.sin(a);
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey, erad = this.erad, stamp = this.estamp;
    const burnUntil = this.time + 3;
    let lastCell = -1;
    let x1 = x0 + dx * range, y1 = y0 + dy * range;
    for (let d = 0.4; d <= range; d += 0.5) {
      const px = x0 + dx * d, py = y0 + dy * d;
      if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) { x1 = px; y1 = py; break; }
      const pc = (py | 0) * MAP_W + (px | 0);
      if (burn && pc !== lastCell) {
        if (this.cellBurnT[pc] <= this.time || this.cellBurnDps[pc] < burn) this.cellBurnDps[pc] = burn;
        this.cellBurnT[pc] = burnUntil;
      }
      lastCell = pc;
      const cx0 = Math.max(0, Math.floor(px - 0.9)), cx1 = Math.min(MAP_W - 1, Math.floor(px + 0.9));
      const cy0 = Math.max(0, Math.floor(py - 0.9)), cy1 = Math.min(MAP_H - 1, Math.floor(py + 0.9));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const q = cy * MAP_W + cx;
        for (let m = start[q], e = start[q + 1]; m < e; m++) {
          const j = items[m];
          if (stamp[j] === id || this.edead[j]) continue;
          // 點到線段距離
          const rx = ex[j] - x0, ry = ey[j] - y0;
          const along = rx * dx + ry * dy;
          if (along < 0 || along > range) continue;
          const perp = Math.abs(rx * dy - ry * dx);
          if (perp < 0.3 + erad[j]) { stamp[j] = id; this.damageEnemy(j, dmg, 0, own); }
        }
      }
    }
    this.ev(EV_LASER, x0, y0, tier, x1, y1);
    // 虹：在射程 60% 處分裂出短光束
    if (split) {
      const L = Math.hypot(x1 - x0, y1 - y0) * 0.6, sx = x0 + dx * L, sy = y0 + dy * L;
      for (let k = 0; k < split; k++) this.beam(sx, sy, a + (k ? 0.55 : -0.55), 4.5, dmg * 0.6, 0, tier, own, 0);
    }
  }

  updateBullets() {
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey, erad = this.erad;
    let i = 0;
    while (i < this.nb) {
      this.upx[i] = this.ux[i]; this.upy[i] = this.uy[i];
      this.ux[i] += this.uvx[i] * DT; this.uy[i] += this.uvy[i] * DT;
      this.ulife[i] -= DT;
      let kill = false;
      const x = this.ux[i], y = this.uy[i];
      const kind = this.ukind[i];
      if (kind === BK_ARROW || kind === BK_PELLET) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || this.ulife[i] <= 0) kill = true;
        else {
          const q = (y | 0) * MAP_W + (x | 0);
          for (let m = start[q], e = start[q + 1]; m < e; m++) {
            const j = items[m];
            if (this.edead[j] || this.eid[j] === this.ulast[i]) continue;
            const dx = ex[j] - x, dy = ey[j] - y, rr = erad[j] + 0.15;
            if (dx * dx + dy * dy < rr * rr) {
              this.damageEnemy(j, this.udmg[i], this.uap[i], this.uown[i]);
              if (this.ubounce[i] > 0) {
                this.ubounce[i]--; this.ulast[i] = this.eid[j];
                const nt = this.nearestEnemy(x, y, 3.5, this.eid[j]);
                if (nt >= 0) {
                  const ddx = ex[nt] - x, ddy = ey[nt] - y, L = Math.hypot(ddx, ddy) || 1;
                  const sp = Math.hypot(this.uvx[i], this.uvy[i]);
                  this.uvx[i] = ddx / L * sp; this.uvy[i] = ddy / L * sp; this.ulife[i] = (L + 0.5) / sp;
                } else kill = true;
              } else kill = true;
              break;
            }
          }
        }
      } else if (this.ulife[i] <= 0) {
        if (kind === BK_SHELL) {
          this.explode(this.utx[i], this.uty[i], this.urad[i], this.udmg[i], true, 0, this.uown[i]);
          if (this.mods.shellBurn) {
            const until = this.time + 3, bd = this.udmg[i] * this.mods.shellBurn;
            this.forCellsInRadius(this.utx[i], this.uty[i], this.urad[i] * 0.7, c => {
              if (this.cellBurnT[c] <= this.time || this.cellBurnDps[c] < bd) this.cellBurnDps[c] = bd;
              this.cellBurnT[c] = until;
            });
          }
          const nc = this.ucluster[i];
          if (nc) {
            const tx = this.utx[i], ty = this.uty[i], dm = this.udmg[i] * 0.4, tier = this.utier[i];
            for (let k = 0; k < nc; k++) {
              const j = this.newBullet(this.uown[i]); if (j < 0) break;
              const a = (k / nc) * 6.283 + this.rng() * 0.6, sp = 4 + this.rng() * 3, life = 0.3 + this.rng() * 0.25;
              this.ux[j] = this.upx[j] = tx; this.uy[j] = this.upy[j] = ty;
              this.uvx[j] = Math.cos(a) * sp; this.uvy[j] = Math.sin(a) * sp;
              this.ukind[j] = BK_BOMBLET; this.ulife[j] = life; this.udmg[j] = dm; this.urad[j] = 1.0;
              this.utx[j] = tx + Math.cos(a) * sp * life; this.uty[j] = ty + Math.sin(a) * sp * life; this.utier[j] = tier;
            }
          }
        } else this.explode(this.utx[i], this.uty[i], this.urad[i], this.udmg[i], true, 0, this.uown[i]);
        kill = true;
      }
      if (kill) {
        const last = --this.nb;
        if (i !== last) this.moveBullet(last, i);
      } else i++;
    }
  }

  moveBullet(s, d) {
    this.ux[d] = this.ux[s]; this.uy[d] = this.uy[s]; this.upx[d] = this.upx[s]; this.upy[d] = this.upy[s];
    this.uvx[d] = this.uvx[s]; this.uvy[d] = this.uvy[s]; this.ulife[d] = this.ulife[s]; this.udmg[d] = this.udmg[s];
    this.ukind[d] = this.ukind[s]; this.utx[d] = this.utx[s]; this.uty[d] = this.uty[s]; this.urad[d] = this.urad[s];
    this.ubounce[d] = this.ubounce[s]; this.uap[d] = this.uap[s]; this.ulast[d] = this.ulast[s];
    this.ucluster[d] = this.ucluster[s]; this.utier[d] = this.utier[s]; this.uown[d] = this.uown[s];
  }

  nearestEnemy(x, y, R, excludeId) {
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey;
    let best = -1, bd = R * R;
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(MAP_W - 1, Math.floor(x + R));
    const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(MAP_H - 1, Math.floor(y + R));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const q = cy * MAP_W + cx;
      for (let m = start[q], e = start[q + 1]; m < e; m++) {
        const j = items[m];
        if (this.edead[j] || this.eid[j] === excludeId) continue;
        const dx = ex[j] - x, dy = ey[j] - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = j; }
      }
    }
    return best;
  }

  explode(x, y, R, dmg, falloff = true, kind = 0, own = 0) {
    if (kind === 0) this.ev(EV_BOOM, x, y, R);
    const x0 = Math.max(0, Math.floor(x - R - 0.6)), x1 = Math.min(MAP_W - 1, Math.floor(x + R + 0.6));
    const y0 = Math.max(0, Math.floor(y - R - 0.6)), y1 = Math.min(MAP_H - 1, Math.floor(y + R + 0.6));
    const start = this.cellStart, items = this.cellItems, ex = this.ex, ey = this.ey, erad = this.erad;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const q = cy * MAP_W + cx;
      for (let m = start[q], e = start[q + 1]; m < e; m++) {
        const j = items[m];
        const dx = ex[j] - x, dy = ey[j] - y, rr = R + erad[j];
        const d2 = dx * dx + dy * dy;
        // 中心全額，邊緣衰減到 40%
        if (d2 < rr * rr) this.damageEnemy(j, falloff ? dmg * (1 - 0.6 * Math.sqrt(d2) / rr) : dmg, 0, own);
      }
    }
  }

  removeDead() {
    let i = 0;
    const day = this.day, m = this.mods, time = this.time;
    const night = this.state === 'run' && this.phase >= P_DUSK && !this.bench;
    const darkK = BAL.darkPerKill * m.darkMul;
    while (i < this.n) {
      const dead = this.edead[i];
      if (dead) {
        const t = this.et[i], x = this.ex[i], y = this.ey[i];
        this.ev(dead === 2 ? EV_DISSOLVE : EV_DEATH, x, y, t, this.eelite[i]);
        if (dead === 1) {
          const cell = (y | 0) * MAP_W + (x | 0);
          if (IS_BOSS[t]) {
            this.stats.lordKilledDay = day; this.stats.lordKills++; this.stats.bossKilled.push(t);
            this.pendingLegend = true;
          }
          if (IS_BOSS[t]) { this.addGem(3); this.addGem(2); this.addGem(2); }
          else if (this.eelite[i] && this.rng() < 0.025) this.addGem(this.rng() < 0.1 ? 2 : 1);
          if (this.eelite[i] || IS_BOSS[t]) {
            const amt = IS_BOSS[t] ? 200 : (BAL.eliteCrystal[0] + BAL.eliteCrystal[1] * day) * m.eliteCrystal;
            this.crystal += amt; this.stats.crystalEarned += amt;
            this.ev(EV_CRYSTAL, x, y, amt);
          }
          // 暗晶：夜裡的擊殺留在地上，等黎明光波淨化
          if (night) this.darkC[cell] += darkK * (IS_BOSS[t] ? 500 : t === E_HEAVY ? 6 : t === E_SHADE ? 8 : t === E_HEX ? 3 : t === E_DIAMOND ? 2 : 1) * (this.eelite[i] ? 4 : 1);
          // 長夜：被冰凍時死亡，凍住周圍
          if (m.chainFreeze && this.cellFreezeT[cell] > time && (this.cellFreezeSrc[cell] === 1 || m.chainChains) && this.chainBudget >= 1) {
            this.chainBudget--;
            const until = time + 1;
            this.forCellsInRadius(x, y, m.chainFreeze, c => { if (this.cellFreezeT[c] < until) { this.cellFreezeT[c] = until; this.cellFreezeSrc[c] = 2; } });
            if ((this.tick + i) % 4 === 0) this.ev(EV_CHAINFREEZE, x, y, m.chainFreeze);
          }
          if (t === E_HEX && this.state === 'run') {
            // 分裂成 6 隻碎方（血量隨天數成長）
            const hpMult = this.hpMultFor(day), nSplit = this.mut.split ? 12 : 6;
            for (let k = 0; k < nSplit; k++) {
              const a = k / nSplit * 6.283;
              const sx = Math.min(MAP_W - 0.05, Math.max(0.05, x + Math.cos(a) * 0.35));
              const sy = Math.min(MAP_H - 0.05, Math.max(0.05, y + Math.sin(a) * 0.35));
              const c = (sy | 0) * MAP_W + (sx | 0);
              this.spawnEnemy(E_SHARD, this.rock[c] || this.bldAt[c] >= 0 ? x : sx, this.rock[c] || this.bldAt[c] >= 0 ? y : sy, hpMult, 0);
            }
          }
        }
        if (IS_BOSS[t]) this.lordAlive--;
        const last = --this.n;
        if (i !== last) this.moveEnemy(last, i);
      } else i++;
    }
  }

  moveEnemy(s, d) {
    this.ex[d] = this.ex[s]; this.ey[d] = this.ey[s]; this.epx[d] = this.epx[s]; this.epy[d] = this.epy[s];
    this.evx[d] = this.evx[s]; this.evy[d] = this.evy[s]; this.et[d] = this.et[s];
    this.ehp[d] = this.ehp[s]; this.emax[d] = this.emax[s]; this.eflash[d] = this.eflash[s];
    this.eatk[d] = this.eatk[s]; this.eid[d] = this.eid[s]; this.edead[d] = this.edead[s];
    this.erot[d] = this.erot[s]; this.erad[d] = this.erad[s]; this.ecell[d] = this.ecell[s];
    this.eelite[d] = this.eelite[s]; this.ecd[d] = this.ecd[s]; this.estamp[d] = this.estamp[s];
  }

  /** 找出夜之主的索引（沒有就回傳 -1） */
  lordIndex() {
    if (this.lordAlive <= 0) return -1;
    for (let i = 0; i < this.n; i++) if (IS_BOSS[this.et[i]] && !this.edead[i]) return i;
    return -1;
  }

  // ───────────────────────── 壓力測試 ─────────────────────────
  /** 自動鋪設防線，並讓同屏敵人數維持在 N。 */
  initBench(N, bullets = 0) {
    this.reset();
    this.lit.fill(1);
    this.bench = N;
    this.benchBullets = bullets;
    this.state = 'run';
    this.gold = 1e9; this.crystal = 1e9;
    this.day = 1; this.dayT = PHASE_START[P_NIGHT] + 1; this.phase = P_NIGHT;
    this.dirs = [{ side: 0, u: 0.5, w: 1 }, { side: 1, u: 0.5, w: 1 }, { side: 2, u: 0.5, w: 1 }, { side: 3, u: 0.5, w: 1 }];
    const tryPlace = (t, x, y) => { if (!this.canPlace(t, x, y, true)) { this.gold = 1e9; return this.place(t, x, y); } return -1; };
    const ring = (R, fn) => {
      for (let x = CORE_X0 - R; x < CORE_X0 + CORE_SIZE + R; x++) { fn(x, CORE_Y0 - R); fn(x, CORE_Y0 + CORE_SIZE + R - 1); }
      for (let y = CORE_Y0 - R + 1; y < CORE_Y0 + CORE_SIZE + R - 1; y++) { fn(CORE_X0 - R, y); fn(CORE_X0 + CORE_SIZE + R - 1, y); }
    };
    ring(9, (x, y) => { const mx = Math.abs(x + 0.5 - CORE_CX) < 1.5, my = Math.abs(y + 0.5 - CORE_CY) < 1.5; if (!mx && !my) tryPlace(B_WALL, x, y); });
    ring(6, (x, y) => { if (((x + y) & 1) === 0) tryPlace(B_ARROW, x, y); });
    ring(4, (x, y) => { if ((x + 2 * y) % 3 === 0) tryPlace(B_CANNON, x, y); });
    ring(7, (x, y) => { const k = (x * 7 + y * 13) % 11; if (k === 0) tryPlace(B_FROST, x, y); else if (k === 5) tryPlace(B_PRISM, x, y); });
    for (let a = 0; a < 40; a++) {
      const ang = a / 40 * Math.PI * 2, R = 16 + (a % 3) * 4;
      tryPlace(a % 5 === 0 ? B_SCATTER : B_ARROW, Math.round(CORE_CX + Math.cos(ang) * R * 1.4), Math.round(CORE_CY + Math.sin(ang) * R));
    }
    this.recomputeFlow();
    for (let i = 0; i < N; i++) {
      const s = Math.floor(this.rng() * 4);
      if (this.edgePoint(s, this.rng(), 0.4)) this.spawnEnemy(this.pickType(true), this._px, this._py, 1);
    }
    for (let i = 0; i < this.n; i += 2) {
      const ang = this.rng() * Math.PI * 2, R = 14 + this.rng() * 20;
      const x = CORE_CX + Math.cos(ang) * R * 1.5, y = CORE_CY + Math.sin(ang) * R;
      const c = (Math.max(0, Math.min(MAP_H - 1, y | 0))) * MAP_W + Math.max(0, Math.min(MAP_W - 1, x | 0));
      if (x > 0 && y > 0 && x < MAP_W && y < MAP_H && !this.rock[c] && this.bldAt[c] < 0) {
        this.ex[i] = this.epx[i] = x; this.ey[i] = this.epy[i] = y;
      }
    }
  }

  benchSpawn() {
    const deficit = this.bench - this.n;
    const k = Math.min(deficit, 400);
    for (let i = 0; i < k; i++) {
      const s = Math.floor(this.rng() * 4);
      if (this.edgePoint(s, this.rng(), 0.5)) this.spawnEnemy(this.pickType(true), this._px, this._py, 1);
    }
    if (this.bhp[this.core] < this.bmax[this.core]) this.bhp[this.core] = this.bmax[this.core];
    const kb = Math.min(this.benchBullets - this.nb, 3000);
    for (let k2 = 0; k2 < kb; k2++) {
      const i = this.newBullet(); if (i < 0) break;
      const a = this.rng() * 6.283;
      this.ux[i] = this.upx[i] = 2 + this.rng() * (MAP_W - 4); this.uy[i] = this.upy[i] = 2 + this.rng() * (MAP_H - 4);
      this.uvx[i] = Math.cos(a) * 8; this.uvy[i] = Math.sin(a) * 8;
      this.ukind[i] = BK_ARROW; this.ulife[i] = 0.5 + this.rng() * 2; this.udmg[i] = 1;
    }
  }
}

const clampX = x => Math.min(MAP_W - 0.05, Math.max(0.05, x));
const clampY = y => Math.min(MAP_H - 0.05, Math.max(0.05, y));
const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
