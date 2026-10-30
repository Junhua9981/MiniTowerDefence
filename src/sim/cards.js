// 黎明卡片：每張卡都是一個「修正器」，選了之後這一局永久生效。
// apply(m) 只改 mods 物件上的數值或旗標；world.rebuildMods() 會從頭把所有持有的卡套用一次。
import { B_ARROW, B_SCATTER, B_CANNON, B_PRISM, B_WALL } from './defs.js';

export const SCHOOLS = {
  sun: { name: '烈光', color: '#ffc85a' },
  moon: { name: '月影', color: '#7fd8ff' },
  tide: { name: '潮汐', color: '#b08cff' },
  neutral: { name: '中立', color: '#d8d2c4' },
  evo: { name: '進化', color: '#ff8fd0' },
  legend: { name: '傳說', color: '#ffe9a8' },
};

/** 修正器的預設值（沒有任何卡時） */
export function baseMods() {
  return {
    dmg: { [B_ARROW]: 1, [B_SCATTER]: 1, [B_CANNON]: 1, [B_PRISM]: 1 },
    goldMul: 1, arrowBounce: 0, prismBeams: 0, focus: false, shellBurn: 0, coreRange: 0, sunCore: false, execute: 0,
    frostVuln: 0, chainFreeze: 0, chainChains: false, frostFreeze: 0, frostAura: 0, iceWall: false, ghostDot: 0, slowedDps: 1,
    reviveHaste: 0, eliteCrystal: 1, advance: 0, bpDiscount: 0, dawnHeal: false, darkMul: 1, wallThorns: 0, ampAura: 0,
    pellets: 0, wallCost: 1, coreShield: 0, dayDiscount: 0, prismSplit: 0, undying: 0, secondSun: false, burstUses: 1,
    starfall: 0, everDay: false, sanctum: 0, dawnBuffMul: 1, nightMul: 1, coreHpMul: 1, pulseFromGreen: false,
  };
}

const C = (id, name, school, text, tip, apply) => ({ id, name, school, text, tip, apply });

export const CARDS = [
  // ── 烈光：攻擊 ──
  C('ricochet', '折射', 'sun', '箭命中後彈跳 1 次', '箭塔的箭命中後會再彈向 3.5 格內最近的另一個敵人。', m => { m.arrowBounce += 1; }),
  C('overload', '稜鏡過載', 'sun', '稜鏡塔多一道光束', '每座稜鏡塔每次多射一道光束。', m => { m.prismBeams += 1; }),
  C('focus', '聚焦', 'sun', '光束照同一目標傷害遞增', '稜鏡塔連續打同一個目標，每次傷害 +15%，最多 +150%。', m => { m.focus = true; }),
  C('searing', '熾熱彈', 'sun', '砲彈留下燃燒地帶', '砲塔爆炸處留下 3 秒的燃燒帶，每秒造成砲彈傷害的 40%。', m => { m.shellBurn += 0.4; }),
  C('sunlit', '日照', 'sun', '核心周圍的塔射程 +1', '核心 15 格內的攻擊塔射程 +1。', m => { m.coreRange += 1; }),
  C('execute', '處決', 'sun', '打死血量低於 15% 的敵人', '塔的攻擊讓非首領敵人的血量低於 15% 時直接擊殺。', m => { m.execute = Math.max(m.execute, 0.15); }),
  // ── 月影：控制 ──
  C('frostbite', '霜蝕', 'moon', '冰晶光環內敵人受傷 +20%', '站在減速區裡的敵人受到的所有傷害 +20%。', m => { m.frostVuln += 0.2; }),
  C('longnight', '長夜', 'moon', '冰凍的敵人死時凍住周圍', '被冰凍時死亡的敵人，會讓周圍 2 格冰凍 1 秒。', m => { m.chainFreeze = Math.max(m.chainFreeze, 2); }),
  C('coldsnap', '寒潮', 'moon', '冰晶塔每 6 秒冰凍 1 秒', '所有冰晶塔都會週期冰凍範圍內的敵人；已有冰凍的週期縮短 20%。', m => { m.frostFreeze = 6; }),
  C('icewall', '冰牆', 'moon', '牆旁邊的敵人被減速', '每面牆周圍 1.5 格的敵人減速 40%。', m => { m.iceWall = true; }),
  C('shadespike', '影刺', 'moon', '敵人走過殘影會受傷', '殘影與它旁邊的格子會持續傷害經過的敵人（隨天數成長）。', m => { m.ghostDot += 1; }),
  C('hush', '靜默', 'moon', '被減速的敵人拆牆 −30%', '站在減速區裡的敵人，拆建築的傷害 −30%。', m => { m.slowedDps *= 0.7; }),
  // ── 潮汐：經濟與循環 ──
  C('rebound', '回潮', 'tide', '復活的建築 15 秒雙倍攻速', '黎明復活（或不滅復活）的建築，15 秒內攻速 ×2。', m => { m.reviveHaste = 15; }),
  C('crystaltide', '晶潮', 'tide', '菁英掉晶加倍', '菁英敵人死亡時掉落的晶 ×2。', m => { m.eliteCrystal *= 2; }),
  C('advance', '預支', 'tide', '黃昏一次領 30 秒金礦產量', '每個黃昏開始時，立刻拿到目前 30 秒份的金。', m => { m.advance += 30; }),
  C('bpdiscount', '藍圖折扣', 'tide', '藍圖自動建造便宜 20%', '從藍圖自動蓋起來的建築只花 80% 的錢。', m => { m.bpDiscount = 0.2; }),
  C('dawnmend', '黎明重建', 'tide', '黎明時全部建築回滿血', '每個黎明開始時，所有建築與核心回滿血。', m => { m.dawnHeal = true; }),
  C('harvest', '暗晶收割', 'tide', '暗晶掉落 +50%', '夜晚擊殺留下的暗晶 +50%。', m => { m.darkMul *= 1.5; }),
  // ── 中立 ──
  C('thorns', '荊棘', 'neutral', '牆反彈 30% 傷害', '所有牆把攻擊者造成的傷害反彈 30%（荊棘牆分支再疊加）。', m => { m.wallThorns += 0.3; }),
  C('resonance', '共鳴', 'neutral', '增幅塔範圍 +1', '所有增幅塔光環範圍 +1 格。', m => { m.ampAura += 1; }),
  C('buckshot', '散彈', 'neutral', '散射塔彈丸 +2', '散射塔每次多射 2 發。', m => { m.pellets += 2; }),
  C('sapper', '工兵', 'neutral', '牆的成本 −30%', '牆（含藍圖）只要 7 金。', m => { m.wallCost *= 0.7; }),
  C('aegis', '底光', 'neutral', '核心每夜擋下一段傷害', '每個黃昏，核心獲得一層護盾，擋下 1000 ×（核心階級 +1）的傷害。', m => { m.coreShield += 1000; }),
  C('quickdeploy', '快速部署', 'neutral', '白晝建造升級便宜 10%', '黎明與白晝時，建造與升級的花費 −10%。', m => { m.dayDiscount = 0.1; }),
];

// 進化卡：同時持有兩張指定的卡時出現；選了之後取代原本兩張（效果包含原本兩張）
export const EVOLUTIONS = [
  { ...C('rainbow', '虹', 'evo', '光束命中後分裂成 3 道', '稜鏡的光束在射程 60% 處再分裂出 2 道短光束。包含折射與稜鏡過載。',
    m => { m.arrowBounce += 1; m.prismBeams += 1; m.prismSplit = 2; }), from: ['ricochet', 'overload'] },
  { ...C('glacier', '永夜冰河', 'evo', '冰凍連鎖可以一直傳下去', '連鎖冰凍造成的冰凍也會繼續連鎖（每秒有上限）。包含長夜與寒潮。',
    m => { m.chainFreeze = Math.max(m.chainFreeze, 2.5); m.frostFreeze = 6; m.chainChains = true; }), from: ['longnight', 'coldsnap'] },
  { ...C('undying', '不滅', 'evo', '被拆的建築 30 秒後就復活', '建築被拆後不用等黎明，30 秒後自動復活。包含回潮與黎明重建。',
    m => { m.reviveHaste = 15; m.dawnHeal = true; m.undying = 30; }), from: ['rebound', 'dawnmend'] },
];

// 傳說卡：只從首領獎勵出現
export const LEGENDS = [
  C('secondsun', '第二太陽', 'legend', '地圖另一端出現副核心', '在核心旁的空地升起第二個光源：產出核心一半的金，夜晚發出脈衝。', m => { m.secondSun = true; }),
  C('eclipseheart', '日蝕之心', 'legend', '光爆每夜可用 2 次', '光爆的使用次數變成每夜 2 次。', m => { m.burstUses = 2; }),
  C('starfall', '星落', 'legend', '每擊殺 1000 隻，一座塔升 1 星', '每累積 1000 次擊殺，隨機一座還沒滿星的攻擊塔升 1 星。', m => { m.starfall = 1000; }),
  C('everday', '永晝', 'legend', '黎明增益持續整個白晝', '黎明增益從黎明一直持續到黃昏開始。', m => { m.everDay = true; }),
  C('sanctum', '聖域', 'legend', '核心 8 格內建築受傷 −50%', '核心與它周圍 8 格內的建築受到的傷害減半。', m => { m.sanctum = 0.5; }),
];

export const ALL_CARDS = [...CARDS, ...EVOLUTIONS, ...LEGENDS];
export const CARD_BY_ID = Object.fromEntries(ALL_CARDS.map(c => [c.id, c]));

// 卡池解鎖：第一局 16 張，之後依累積撐過的夜數加入
export const BASE_POOL = ['ricochet', 'overload', 'searing', 'sunlit', 'frostbite', 'longnight', 'coldsnap', 'hush',
  'rebound', 'crystaltide', 'dawnmend', 'harvest', 'thorns', 'buckshot', 'sapper', 'aegis'];
export const UNLOCK_GROUPS = [
  { nights: 10, cards: ['focus', 'execute', 'icewall', 'advance'] },
  { nights: 20, cards: ['shadespike', 'bpdiscount', 'resonance', 'quickdeploy'] },
];
export const BASE_LEGENDS = ['secondsun', 'eclipseheart', 'starfall'];
export const EXTRA_LEGENDS = ['everday', 'sanctum'];

/** 依解鎖進度算出可用的卡池 */
export function poolFor(progress = {}) {
  const nights = progress.nights || 0;
  const pool = [...BASE_POOL];
  for (const g of UNLOCK_GROUPS) if (nights >= g.nights) pool.push(...g.cards);
  const legends = [...BASE_LEGENDS];
  if (progress.allBosses) legends.push(...EXTRA_LEGENDS);
  return { pool, legends };
}
export const FULL_POOL = { pool: CARDS.map(c => c.id), legends: LEGENDS.map(c => c.id) };
void B_WALL;
