// 純資料定義：不依賴任何瀏覽器 API。
export const MAP_W = 100;
export const MAP_H = 60;
export const N_CELLS = MAP_W * MAP_H;
export const CELL_PX = 16;
export const HZ = 60;
export const DT = 1 / HZ;

// 核心 3×3，位於中央
export const CORE_X0 = 49, CORE_Y0 = 29, CORE_SIZE = 3;
export const CORE_CX = CORE_X0 + CORE_SIZE / 2; // 50.5
export const CORE_CY = CORE_Y0 + CORE_SIZE / 2; // 30.5

// 一天的時段（1× 秒數）
export const PHASES = [
  { id: 'dawn', name: '黎明', dur: 15 },
  { id: 'day', name: '白晝', dur: 60 },
  { id: 'dusk', name: '黃昏', dur: 25 },
  { id: 'night', name: '夜晚', dur: 50 },
];
export const PHASE_START = [0, 15, 75, 100];
export const DAY_LEN = 150;
export const P_DAWN = 0, P_DAY = 1, P_DUSK = 2, P_NIGHT = 3;

// 一般模式 10 天（兩幕），撐到第 11 天黎明即勝利；第 5、10 夜各一隻首領
export const TOTAL_DAYS = 10;

// ── 階級 ──
export const TIER_NAMES = ['白', '綠', '藍', '紫', '白金'];
export const TIER_MULT = [1, 1.6, 2.56, 4.096, 6.55];
// 建築升級花費（相對於建造價）：升到 綠 / 藍 / 紫 / 白金（白金需要研究）
export const UP_GOLD = [0, 1.2, 2.0, 3.2, 6];
export const UP_CRYSTAL = [0, 0.08, 0.2, 0.4, 1.2];
export const CORE_UP = [null, { gold: 300, crystal: 20 }, { gold: 800, crystal: 80 }, { gold: 2000, crystal: 250 }, { gold: 8000, crystal: 1500 }];
export const CORE_UP_DESC = [
  '',
  '核心血量與產出提升（×1.6）',
  '核心獲得夜間脈衝攻擊（範圍傷害）',
  '脈衝強化，黎明增益延長到 30 秒',
  '白金：脈衝範圍與傷害大幅提升，所有建築可升到白金',
];

// 經濟
export const START_GOLD = 300;
export const START_CRYSTAL = 0;
export const CORE_GOLD = 2;
export const CORE_CRYSTAL = 0.3;
export const DAWN_BUFF = 1.3;
export const SELL_RATIO = 0.7;

// 建築類型（與快捷鍵一致）
export const B_CORE = 0, B_WALL = 1, B_GOLD = 2, B_CRYSTAL = 3, B_ARROW = 4, B_SCATTER = 5,
  B_CANNON = 6, B_FROST = 7, B_PRISM = 8, B_AMP = 9, B_LIGHT = 10, B_TRAP = 11, B_REPAIR = 12, B_TESLA = 13;
export const BUILDABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const ATTACK_TOWERS = new Set([B_ARROW, B_SCATTER, B_CANNON, B_PRISM, B_TESLA]);
export const FLOOR_TYPES = new Set([B_TRAP]);   // 鋪在地上、不擋路的建築
// 需要研究才能蓋的建築 → 研究 id
export const RESEARCH_BUILD = { [B_TRAP]: 'r_trap', [B_REPAIR]: 'r_repair', [B_TESLA]: 'r_tesla' };
export const AURA_TOWERS = new Set([B_FROST, B_AMP]);

export const BUILD_DEFS = {
  [B_CORE]: { name: '曙光核心', hp: 3000 },
  [B_WALL]: {
    key: '1', name: '牆', cost: 10, hp: 400, desc: '阻擋敵人。敵人必須拆掉它或繞路。',
    branches: [
      { name: '荊棘牆', desc: '攻擊它的敵人受到 2 倍反彈傷害。' },
      { name: '再生牆', desc: '每秒回復 2% 血量。' },
    ],
  },
  [B_GOLD]: { key: '2', name: '金礦', cost: 50, hp: 150, gold: 1.5, desc: '每秒產出金。' },
  [B_CRYSTAL]: { key: '3', name: '晶礦', cost: 80, hp: 150, crystal: 0.25, desc: '每秒產出晶。只能蓋在晶脈上。' },
  [B_ARROW]: {
    key: '4', name: '箭塔', cost: 40, hp: 200, range: 6, rate: 3, dmg: 10, bulletSpeed: 24,
    desc: '單體攻擊，射速快。',
    branches: [
      { name: '連弩', desc: '射速提升到每秒 8 發。' },
      { name: '狙擊', desc: '射程 12、傷害 ×5、貫穿護甲，射速減半。' },
    ],
  },
  [B_SCATTER]: {
    key: '5', name: '散射塔', cost: 90, hp: 200, range: 4.5, rate: 1.5, dmg: 8, pellets: 5, bulletSpeed: 18,
    desc: '扇形射出 5 發，近距離清場。',
    branches: [
      { name: '霰彈', desc: '每次射出 12 發。' },
      { name: '彈跳', desc: '每發子彈命中後彈跳 3 次。' },
    ],
  },
  [B_CANNON]: {
    key: '6', name: '砲塔', cost: 120, hp: 250, range: 7, rate: 0.6, dmg: 40, radius: 1.8, bulletSpeed: 13,
    desc: '範圍爆炸，專治密集潮水。',
    branches: [
      { name: '集束', desc: '爆炸後再散出 6 顆小炸彈。' },
      { name: '重砲', desc: '爆炸半徑 ×2、傷害 ×1.5，射速變慢。' },
    ],
  },
  [B_FROST]: {
    key: '7', name: '冰晶塔', cost: 100, hp: 200, aura: 4, slow: 0.4, dot: 4,
    desc: '光環：範圍內敵人減速 40%，並持續受傷。',
    branches: [
      { name: '絕對零度', desc: '每 3 秒把範圍內敵人冰凍 1 秒。' },
      { name: '冰刺', desc: '光環傷害 ×4。' },
    ],
  },
  [B_PRISM]: {
    key: '8', name: '稜鏡塔', cost: 150, hp: 200, range: 8, rate: 1.25, dmg: 25,
    desc: '直線雷射，貫穿整條線上的敵人。',
    branches: [
      { name: '分光', desc: '一次射出 3 道光束。' },
      { name: '熔線', desc: '雷射在地面留下 3 秒的燃燒帶。' },
    ],
  },
  [B_AMP]: {
    key: '9', name: '增幅塔', cost: 120, hp: 150, aura: 4, bonus: 0.25,
    desc: '光環：範圍內的塔攻速 +25%、礦產量 +25%。',
    branches: [
      { name: '超頻', desc: '攻速加成 ×2。' },
      { name: '豐收', desc: '產量加成 ×2。' },
    ],
  },
  [B_LIGHT]: { key: '0', name: '燈塔', cost: 120, hp: 300, light: 9, desc: '點亮周圍 9 格的黑暗，讓那裡可以建造。點亮的土地永久屬於你。' },
  [B_TRAP]: {
    key: 'J', name: '地刺', cost: 25, hp: 100, dot: 10, desc: '鋪在地上、不擋路。踩上去的敵人持續受傷。',
    branches: [
      { name: '毒刺', desc: '傷害 ×3。' },
      { name: '冰刺', desc: '踩上去的敵人減速 50%。' },
    ],
  },
  [B_REPAIR]: { key: 'K', name: '維修站', cost: 130, hp: 220, aura: 4, heal: 0.02, desc: '每秒修復周圍 4 格內建築 2% 血量。' },
  [B_TESLA]: {
    key: 'L', name: '雷擊塔', cost: 140, hp: 220, range: 5.5, rate: 1, dmg: 30, chains: 4, desc: '閃電命中後連鎖跳到附近的敵人。',
    branches: [
      { name: '風暴', desc: '連鎖次數 +4。' },
      { name: '過載', desc: '傷害 ×2，被打中的敵人麻痺 0.5 秒。' },
    ],
  },
};

/** 依階級與分支算出建築的實際數值（升級時算一次並快取在建築上）。 */
export function statsOf(type, tier, branch) {
  const d = BUILD_DEFS[type], m = TIER_MULT[tier];
  const s = { hp: Math.round(d.hp * m) };
  const rng = d.range ? d.range + 0.5 * tier : 0;
  switch (type) {
    case B_GOLD: s.gold = d.gold * m; break;
    case B_CRYSTAL: s.crystal = d.crystal * m; break;
    case B_WALL:
      if (branch === 1) s.thorns = 2;
      if (branch === 2) s.regen = BAL.regen;
      break;
    case B_ARROW:
      Object.assign(s, { range: rng, rate: d.rate, dmg: d.dmg * m, speed: d.bulletSpeed });
      if (branch === 1) s.rate = 8;
      if (branch === 2) Object.assign(s, { range: 12, dmg: d.dmg * m * 5, rate: d.rate * 0.5, ap: 1, speed: 60 });
      break;
    case B_SCATTER:
      Object.assign(s, { range: rng, rate: d.rate, dmg: d.dmg * m, pellets: d.pellets, speed: d.bulletSpeed, bounce: 0 });
      if (branch === 1) s.pellets = 12;
      if (branch === 2) s.bounce = 3;
      break;
    case B_CANNON:
      Object.assign(s, { range: rng, rate: d.rate, dmg: d.dmg * m, radius: d.radius, speed: d.bulletSpeed });
      if (branch === 1) s.cluster = 6;
      if (branch === 2) Object.assign(s, { radius: d.radius * 2, dmg: d.dmg * m * 1.5, rate: d.rate * 0.6 });
      break;
    case B_FROST:
      Object.assign(s, { aura: d.aura + 0.5 * tier, slow: Math.min(0.6, d.slow + 0.04 * tier), dot: d.dot * m });
      if (branch === 1) s.freeze = 3;
      if (branch === 2) s.dot *= 4;
      break;
    case B_PRISM:
      Object.assign(s, { range: rng, rate: d.rate, dmg: d.dmg * m, beams: 1 });
      if (branch === 1) s.beams = 3;
      if (branch === 2) s.burn = d.dmg * m * 0.8;
      break;
    case B_AMP: {
      const b = d.bonus * (1 + 0.3 * tier);
      Object.assign(s, { aura: d.aura + 0.5 * tier, rateBonus: b, prodBonus: b });
      if (branch === 1) s.rateBonus *= 2;
      if (branch === 2) s.prodBonus *= 2;
      break;
    }
    case B_LIGHT: s.light = d.light + tier; break;
    case B_TRAP: s.dot = d.dot * m * (branch === 1 ? 3 : 1); if (branch === 2) s.trapSlow = 0.5; break;
    case B_REPAIR: s.aura = d.aura + 0.5 * tier; s.heal = d.heal * (1 + 0.3 * tier); break;
    case B_TESLA:
      Object.assign(s, { range: rng, rate: d.rate, dmg: d.dmg * m, chains: d.chains + tier });
      if (branch === 1) s.chains += 4;
      if (branch === 2) { s.dmg *= 2; s.stun = 0.5; }
      break;
  }
  return s;
}

export function upgradeCost(type, toTier) {
  const c = BUILD_DEFS[type].cost;
  return { gold: Math.round(c * UP_GOLD[toTier]), crystal: Math.ceil(c * UP_CRYSTAL[toTier]) };
}

export function coreStats(tier) {
  const m = TIER_MULT[tier];
  return {
    hp: Math.round(BUILD_DEFS[B_CORE].hp * m), gold: CORE_GOLD * m, crystal: CORE_CRYSTAL * m,
    pulse: tier >= 2 ? (tier >= 4 ? { radius: 12, dmg: 400, period: 1 } : tier >= 3 ? { radius: 9, dmg: 120, period: 1.2 } : { radius: 7, dmg: 50, period: 1.5 }) : null,
    dawnBuffLen: tier >= 3 ? 30 : 15,
  };
}

// 目標策略
export const STRATEGIES = ['最前面', '最近', '血最多', '最強'];

// 敵人
export const E_SHARD = 0, E_SPIKE = 1, E_HEAVY = 2, E_DIAMOND = 3, E_HEX = 4, E_LORD = 5,
  E_TIDE = 6, E_EATER = 7, E_ECLIPSE = 8, E_BROOD = 9, E_SHADE = 10,
  E_FLYER = 11, E_HEALER = 12, E_SHIELD = 13, E_CLOAK = 14, E_BURROW = 15;
export const ENEMY_DEFS = [
  { name: '碎方', shape: 0, size: 0.5, speed: 2.2, hp: 12, dps: 4, armor: 0, desc: '數量主力，構成潮水。' },
  { name: '尖三角', shape: 1, size: 0.6, speed: 3.6, hp: 8, dps: 3, armor: 0, desc: '很快；寧可繞遠路也不拆牆。' },
  { name: '重方', shape: 0, size: 1.2, speed: 1.0, hp: 260, dps: 30, armor: 4, desc: '護甲 4（每次受傷固定減免），專門拆牆。' },
  { name: '菱', shape: 2, size: 0.7, speed: 1.6, hp: 30, dps: 6, armor: 0, desc: '遠程：停在 3 格外射擊建築。' },
  { name: '裂六角', shape: 3, size: 0.9, speed: 1.5, hp: 80, dps: 10, armor: 0, desc: '死亡時分裂成 6 隻碎方。' },
  { name: '夜之主', shape: 4, size: 3.0, speed: 0.9, hp: 20000, dps: 200, armor: 0, desc: '首領。重裝，直衝核心；週期發出脈衝，讓附近的塔停機 2 秒。',
    weak: '單體爆發：重砲、狙擊、貫穿護甲', counters: ['execute', 'focus', 'ricochet'] },
  { name: '深潮', shape: 5, size: 3.4, speed: 0.7, hp: 30000, dps: 120, armor: 0, desc: '首領。極慢極硬，每 8 秒放出一波小怪；走過的地方建築持續受損。',
    weak: '清群：散射、集束砲、冰凍', counters: ['buckshot', 'searing', 'coldsnap'] },
  { name: '噬光者', shape: 6, size: 2.6, speed: 1.6, hp: 14000, dps: 300, armor: 0, desc: '首領。飛行，無視牆壁直飛最亮的建築（礦與核心），吃掉建築會回血。',
    weak: '射程與減速：狙擊、冰晶塔', counters: ['sunlit', 'frostbite', 'coldsnap'] },
  { name: '蝕', shape: 7, size: 3.2, speed: 1.0, hp: 40000, dps: 250, armor: 0, desc: '首領。周圍 7 格一片黑暗，圈內的塔射程減半（稜鏡不受影響）；血量每掉 1/3 分裂出影子。',
    weak: '稜鏡光束不受黑暗影響、光爆', counters: ['overload', 'focus', 'execute'] },
  { name: '群母', shape: 8, size: 3.4, speed: 1.0, hp: 38000, dps: 220, armor: 12, desc: '首領。外殼有 8 片，每打掉一片就掉出一群菁英；外殼越少護甲越低（最高 12）。',
    weak: '持續範圍傷害：爆炸、燃燒帶、連鎖冰凍', counters: ['searing', 'longnight', 'buckshot'] },
  { name: '影', shape: 9, size: 1.4, speed: 1.6, hp: 2500, dps: 60, armor: 0, desc: '蝕分裂出的影子，又快又硬。' },
  { name: '飛群', shape: 1, size: 0.5, speed: 2.6, hp: 10, dps: 3, armor: 0, desc: '會飛：無視牆壁直線飛向核心，撞到什麼拆什麼。' },
  { name: '醫者', shape: 5, size: 0.8, speed: 1.4, hp: 60, dps: 2, armor: 0, desc: '每 0.5 秒替周圍 2.5 格的敵人回血 4%。優先擊殺！' },
  { name: '盾衛', shape: 3, size: 1.0, speed: 1.2, hp: 120, dps: 8, armor: 2, desc: '周圍 2.5 格的敵人受到的直接傷害減半。範圍傷害、燃燒不受影響。' },
  { name: '隱影', shape: 2, size: 0.6, speed: 2.4, hp: 25, dps: 4, armor: 0, desc: '隱形：塔只能鎖定 3.5 格內的牠。爆炸和雷射照樣打得到。' },
  { name: '掘地者', shape: 0, size: 0.8, speed: 1.5, hp: 70, dps: 15, armor: 0, desc: '從地下穿過一切建築，只攻擊核心。' },
];
// 會逐漸出現的新敵人：第幾夜開始（一般模式 / 無限模式共用）、基本比例
export const NEW_ENEMIES = [
  { type: E_FLYER, night: 6, frac: 0.04 },
  { type: E_HEALER, night: 7, frac: 0.012 },
  { type: E_SHIELD, night: 8, frac: 0.018 },
  { type: E_CLOAK, night: 11, frac: 0.04 },
  { type: E_BURROW, night: 13, frac: 0.02 },
];
export const BOSS_TYPES = [E_LORD, E_TIDE, E_EATER, E_ECLIPSE, E_BROOD];
export const IS_BOSS = new Uint8Array(ENEMY_DEFS.length);
for (const t of BOSS_TYPES) IS_BOSS[t] = 1;
// 首領池：第 5 夜從前段池、第 10 夜從終局池各抽一隻；無限模式第 15 夜起五隻輪替
export const BOSS_EARLY = [E_LORD, E_TIDE, E_EATER];
export const BOSS_FINAL = [E_ECLIPSE, E_BROOD];
export const E_RAD = new Float32Array(ENEMY_DEFS.map(e => e.size / 2));
export const E_SPEED = new Float32Array(ENEMY_DEFS.map(e => e.speed));
export const E_HP = new Float32Array(ENEMY_DEFS.map(e => e.hp));
export const E_DPS = new Float32Array(ENEMY_DEFS.map(e => e.dps));
export const E_ARMOR = new Float32Array(ENEMY_DEFS.map(e => e.armor));
// 敵人血量每天的成長（10 天版，由自動測試玩家調整）
export const HP_GROWTH = 1.45;
// ── 研究（花晶） ──
export const RESEARCH = [
  { id: 'r_trap', name: '地刺', col: 0, cost: 120, req: null, desc: '解鎖地刺：鋪在地上、不擋路的陷阱。' },
  { id: 'r_wall', name: '強化牆', col: 0, cost: 250, req: 'r_trap', desc: '牆的血量 +50%。' },
  { id: 'r_repair', name: '維修站', col: 0, cost: 450, req: 'r_wall', desc: '解鎖維修站：持續修復周圍建築。' },
  { id: 'r_works', name: '自動工坊', col: 0, cost: 1000, req: 'r_repair', desc: '同類建築越蓋越貴的幅度減半；維修速度 +50%。' },
  { id: 'r_range', name: '遠視', col: 1, cost: 150, req: null, desc: '所有攻擊塔射程 +0.5。' },
  { id: 'r_tesla', name: '雷擊塔', col: 1, cost: 400, req: 'r_range', desc: '解鎖雷擊塔：閃電在敵人之間連鎖。' },
  { id: 'r_reso', name: '共振', col: 1, cost: 800, req: 'r_tesla', desc: '相鄰的同類攻擊塔，每座 +6% 傷害（最多 4 座）。' },
  { id: 'r_rate', name: '速射', col: 1, cost: 1400, req: 'r_reso', desc: '所有攻擊塔攻速 +12%。' },
  { id: 'r_beacon', name: '燈塔強化', col: 2, cost: 100, req: null, desc: '燈塔照亮範圍 +3 格。' },
  { id: 'r_mine', name: '礦業效率', col: 2, cost: 350, req: 'r_beacon', desc: '金礦超過 12 座後效率遞減的幅度變小。' },
  { id: 'r_socket', name: '雙槽', col: 2, cost: 800, req: 'r_mine', desc: '紫色以上的攻擊塔可以鑲 2 顆晶核。' },
  { id: 'r_plat', name: '白金', col: 2, cost: 2500, req: 'r_socket', desc: '核心與所有建築可以升到第五階：白金（×1.6）。' },
];
export const RESEARCH_COLS = ['工程', '武器', '光'];

// ── 晶核（首領、菁英、遺跡掉落，鑲在紫色以上的攻擊塔） ──
export const GEM_TYPES = [
  { id: 'sharp', name: '鋒銳', desc: r => `傷害 +${[12, 25, 40][r - 1]}%` },
  { id: 'swift', name: '迅捷', desc: r => `攻速 +${[10, 20, 32][r - 1]}%` },
  { id: 'far', name: '遠視', desc: r => `射程 +${[1, 1.5, 2.5][r - 1]}` },
  { id: 'pierce', name: '穿甲', desc: r => `貫穿護甲${r > 1 ? `，傷害 +${[0, 10, 20][r - 1]}%` : ''}` },
  { id: 'frost', name: '霜擊', desc: r => `${[8, 15, 25][r - 1]}% 機率冰凍目標 0.6 秒` },
  { id: 'chain', name: '連鎖', desc: r => `${[12, 22, 35][r - 1]}% 機率彈到附近敵人（60% 傷害）` },
  { id: 'crit', name: '暴擊', desc: r => `${[10, 16, 24][r - 1]}% 機率 3 倍傷害` },
];
export const GEM_RARITY = ['', '普通', '稀有', '傳說'];
export const GEM_COLORS = ['', '#cfd6e0', '#5fb4ff', '#ffb547'];
export const ELITE_HP = 8, ELITE_DPS = 3;
export const DIAMOND_RANGE = 3;
export const LORD_PULSE = { period: 6, radius: 7, stun: 2 };

// 波量（第 n 夜總數）
export const NIGHT_TOTAL = [800, 1800, 3600, 6500, 10000, 12500, 15000, 17500, 19500, 21000];
export const NIGHT_DIRS = [1, 2, 2, 3, 3, 3, 3, 3, 4, 4];
// 每夜組成：尖三角、重方、菱、裂六角的比例（其餘為碎方）
export const NIGHT_MIX = [
  [0.2, 0.01, 0.0, 0.0],
  [0.2, 0.025, 0.03, 0.03],
  [0.18, 0.04, 0.05, 0.05],
  [0.18, 0.05, 0.06, 0.07],
  [0.16, 0.06, 0.07, 0.08],
  [0.16, 0.065, 0.075, 0.085],
  [0.15, 0.07, 0.08, 0.09],
  [0.15, 0.075, 0.08, 0.095],
  [0.14, 0.08, 0.085, 0.1],
  [0.14, 0.085, 0.09, 0.1],
];
export const ELITE_CHANCE = [0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01, 0.011, 0.012];

// 可調平衡參數（tools 會在執行期覆寫來掃參數）
export const BAL = { hpGrowth: HP_GROWTH, dpsGrowth: 1.25, dayTrickle: [0.25, 0.12], nightScale: 1, eliteCrystal: [4, 1.5], lordHp: 1, regen: 0.02,
  lordOvertime: 60, maxAlive: 22000, endlessHp: 1.3, endlessDps: 1.1, endlessCount: 1.06,
  mineExp: 0.6, mineKnee: 12, costEsc: 0.02, litRadius: 16,
  darkPerKill: 0.006, burstCost: 0.2, guideNight: 0.6, bossExp: 1.3 };

// ── 核心種類（開局選一次＝流派起點） ──
export const CORE_TYPES = [
  { id: 'dawn', name: '曙光', school: 'neutral', desc: '平衡，沒有特殊規則。', cost: '無', burst: '全圖每隻敵人受到中等傷害。', unlock: '' },
  { id: 'sun', name: '烈日', school: 'sun', desc: '核心周圍 12 格內的塔傷害 +20%；綠色就有夜間脈衝。', cost: '金礦產量 −20%', burst: '核心周圍 20 格超高傷害。', unlock: '第一次打倒首領' },
  { id: 'moon', name: '新月', school: 'moon', desc: '冰晶塔範圍 +1；冰凍的敵人死亡時凍住周圍。', cost: '核心血量 −25%', burst: '全圖冰凍 3 秒（首領除外）。', unlock: '一般模式勝利' },
  { id: 'tide', name: '潮汐', school: 'tide', desc: '黎明增益加倍；暗晶淨化量 +50%。', cost: '夜晚敵人 +15%', burst: '立刻復活全部殘影。', unlock: '無限模式撐到第 15 天' },
];

// ── 夜晚詞綴 ──
export const MUTATORS = [
  { id: 'swift', name: '疾行', pool: 'mild', desc: '敵人速度 +25%' },
  { id: 'plated', name: '厚甲', pool: 'mild', desc: '所有敵人護甲 +3' },
  { id: 'elite', name: '菁英潮', pool: 'mild', desc: '菁英比例加倍（晶也更多）' },
  { id: 'fog', name: '濃霧', pool: 'mild', desc: '看不到主攻方向的紅色箭頭' },
  { id: 'regen', name: '再生', pool: 'hard', desc: '敵人每秒回血 2%' },
  { id: 'split', name: '分裂', pool: 'hard', desc: '裂六角分裂數加倍' },
  { id: 'chill', name: '抗寒', pool: 'hard', desc: '減速與冰凍效果減半' },
  { id: 'surge', name: '暗湧', pool: 'hard', desc: '多 2 個主攻方向' },
  { id: 'frenzy', name: '狂暴', pool: 'hard', desc: '血量低於一半的敵人拆牆 ×1.5' },
];

// ── 星級與昇華 ──
export const STAR_KILLS = [40, 150, 450, 1200, 3000]; // 攻擊塔升到第 n 星需要的擊殺數
export const STAR_BONUS = 0.08;                      // 每顆星主要數值 +8%
export const ASCEND_COST = 300;                      // 昇華花費（晶）
export const ASCEND_NAMES = { 4: '流星弓', 5: '風暴', 6: '天墜', 7: '永凍核', 8: '日冕', 9: '共振核心' };
export const ASCEND_DESC = {
  4: '每 5 發射出一支貫穿全圖的光箭。', 5: '彈丸加倍，每發多彈跳 2 次。', 6: '每次開砲，附近再落下 3 發砲彈。',
  7: '範圍 +3，每 2 秒冰凍一次。', 8: '多 3 道光束，射程 +4。', 9: '範圍 +4，加成 ×1.5。',
};

// 流場
export const BLD_BASE_COST = 20;
export const BLD_HP_COST_DIV = 20;
export const SPIKE_BLD_MULT = 3;
export const FLOW_MIN_STEPS = 6; // 100 ms

// 事件
export const EV_DEATH = 1, EV_BOOM = 2, EV_BUILD = 3, EV_BDESTROY = 4, EV_COREHIT = 5,
  EV_SHOT = 6, EV_DISSOLVE = 7, EV_SELL = 8, EV_NIGHT = 9, EV_DAWN = 10,
  EV_LASER = 11, EV_UPGRADE = 12, EV_REVIVE = 13, EV_ESHOT = 14, EV_CRYSTAL = 15,
  EV_FREEZE = 16, EV_LORDPULSE = 17, EV_COREPULSE = 18, EV_BOUNCE = 19, EV_DUSK = 20, EV_LORD = 21,
  EV_CARD = 22, EV_BURST = 23, EV_STAR = 24, EV_PURIFY = 25, EV_BOSSWARN = 26, EV_ASCEND = 27, EV_SPLIT = 28,
  EV_SUMMON = 29, EV_EAT = 30, EV_CHAINFREEZE = 31, EV_ZAP = 32, EV_RUIN = 33, EV_GEM = 34, EV_RESEARCH = 35, EV_LIT = 36;
