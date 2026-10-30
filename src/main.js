// 進入點：主迴圈（固定 60 Hz 模擬 + 插值渲染）、鏡頭、輸入（滑鼠 + 觸控）、壓力測試。
import { World } from './sim/world.js';
import { MAP_W, MAP_H, DT, BUILD_DEFS, B_WALL, BUILDABLE, TIER_NAMES, ATTACK_TOWERS } from './sim/defs.js';
import { T_ROCK, T_VEIN } from './sim/map.js';
import { Renderer } from './render/gl.js';
import { Fx } from './render/fx.js';
import { drawScene } from './render/scene.js';
import { UI, enemyTip, buildingTip } from './ui/ui.js';
import { Sound } from './audio/audio.js';
import { Guide } from './ui/guide.js';
import { poolFor, CARD_BY_ID } from './sim/cards.js';
import { CORE_TYPES, BOSS_TYPES } from './sim/defs.js';

const params = new URLSearchParams(location.search);
const BENCH = Math.max(0, Math.floor(+params.get('bench') || 0));
const BENCH_BULLETS = Math.max(0, Math.floor(+params.get('bullets') || 0));
const BENCH_PARTICLES = Math.max(0, Math.floor(+params.get('particles') || 0));
const AUTO_DEGRADE = params.get('degrade') !== 'off';
const fixedSeed = params.has('seed') ? +params.get('seed') : null;
const newSeed = () => fixedSeed ?? ((Math.random() * 1e9) | 0);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || params.get('touch') === '1';
document.body.classList.toggle('touch', IS_TOUCH);

const store = {
  get(k, d) { try { const v = localStorage.getItem('mtd-' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mtd-' + k, String(v)); } catch { /* 無痕視窗等 */ } },
};

const canvas = document.getElementById('gl');
let renderer;
try { renderer = new Renderer(canvas, 140000); }
catch (e) {
  const el = document.getElementById('err');
  el.style.display = 'flex';
  el.innerHTML = `無法啟動 WebGL2：${e.message}<br>請改用最新版 Chrome / Edge / Firefox / Safari，並確認硬體加速已開啟。`;
  throw e;
}
if (IS_TOUCH) renderer.maxDpr = 1.5;

let gameMode = params.get('mode') === 'endless' ? 'endless' : params.get('mode') === 'normal' ? 'normal' : store.get('mode', 'normal');

// ── 解鎖進度（存在瀏覽器）：累積撐過的夜、打倒過的首領、勝利 ──
const progress = (() => { try { return JSON.parse(store.get('progress', '{}')) || {}; } catch { return {}; } })();
progress.nights ||= 0; progress.bosses ||= []; progress.won ||= false;
const saveProgress = () => store.set('progress', JSON.stringify(progress));
function coreUnlocked() {
  return [true, progress.bosses.length > 0, !!progress.won, (+store.get('best-endless', 0)) >= 15 || params.get('unlock') === 'all']
    .map(x => x || params.get('unlock') === 'all');
}
function cardPool() {
  if (params.get('unlock') === 'all') return poolFor({ nights: 999, allBosses: true });
  return poolFor({ nights: progress.nights, allBosses: BOSS_TYPES.every(t => progress.bosses.includes(t)) });
}
let coreType = +store.get('core', 0);
if (!coreUnlocked()[coreType]) coreType = 0;
let guideOn = store.get('guide', store.get('tut-done', '') === '1' ? '0' : '1') === '1';
const world = new World({ events: true, enemyCap: Math.max(32768, BENCH * 2), bulletCap: Math.max(32768, BENCH_BULLETS * 2), seed: newSeed(), mode: gameMode,
  coreType, guide: !BENCH && gameMode === 'normal' && guideOn, cardPool: cardPool() });
let unlockMsgs = [], recordedNights = 0, lastGems = 0;
const fx = new Fx(20000);
const sound = new Sound();
sound.setVolume(+store.get('volume', 0.35));
window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('keydown', () => sound.unlock());

const cam = { x: MAP_W / 2, y: MAP_H / 2, zoom: 1, ppc: 10 };
const view = {
  buildType: 0, hover: null, hoverOk: false, hoverBp: false,
  selected: -1, multi: [], box: null, dragCells: null,
  rectMode: false, boxMode: false, noGlow: false, noLight: false,
  rectFill: store.get('rect-fill', '0') === '1', tutMark: null,
};
const st = { speed: 1, paused: false, playTime: 0, perf: { fps: 0, simMs: 0, renderMs: 0, particles: 0, instances: 0, degrade: '' } };
let acc = 0, restartArm = 0;

const ui = new UI({
  selectBuild: t => selectBuild(t),
  setSpeed: s => { st.speed = s; },
  cycleSpeed: () => { st.speed = st.speed % 3 + 1; },
  cycleVolume: () => { sound.unlock(); const v = sound.cycleVolume(); store.set('volume', v); ui.toast(`音量：${sound.volumeName()}`); },
  sell: () => sellSel(),
  upgrade: br => upgradeSel(br === 'all' ? 0 : br, br === 'all'),
  cycleStrategy: () => stratSel(),
  togglePause: () => togglePause(),
  restart: () => restart(),
  setMode: m => setMode(m),
  cancel: () => cancelAll(),
  toggleBox: () => { view.boxMode = !view.boxMode; view.rectMode = false; ui.toast(view.boxMode ? '框選：拖曳選取多座建築' : '框選：關'); },
  // 觸控：畫線 → 外框 → 實心 → 畫線
  pickCard: id => { const r = world.pickCard(id); if (r) ui.toast(r); else ui.toast(`獲得：${CARD_BY_ID[id].name}`); },
  reroll: () => { const r = world.rerollOffer(); if (r) ui.toast(r); },
  burst: () => doBurst(),
  research: id => { const r = world.doResearch(id); ui.toast(r || '研究完成！'); ui.selKey = ''; },
  mergeGems: (t, r) => { const m = world.mergeGems(t, r); ui.toast(m || '合成成功'); },
  socket: (b, slot, idx) => { const m = world.socketGem(b, slot, idx); if (m) ui.toast(m); },
  unsocket: (b, slot) => { world.unsocketGem(b, slot); },
  ascend: () => { const b = view.selected; if (b > 0) { const r = world.ascend(b); ui.toast(r || '昇華！'); ui.selKey = ''; } },
  setCore: k => {
    if (world.state !== 'plan') return;
    if (!coreUnlocked()[k]) { ui.toast(`尚未解鎖：${CORE_TYPES[k].unlock}`); return; }
    coreType = k; store.set('core', k); world.setCoreType(k);
    ui.toast(`${CORE_TYPES[k].name}核心：${CORE_TYPES[k].desc}`);
  },
  setGuide: on => { guideOn = on; store.set('guide', on ? '1' : '0'); if (world.state === 'plan') restart(true); },
  continueEndless: () => {
    if (world.state !== 'won') return;
    world.continueEndless(); gameMode = 'endless'; prevState = 'run'; recorded = false;
    ui.toast('繼續挑戰：無限模式，第 11 夜起有詞綴');
  },
  toggleRect: () => {
    if (!view.rectMode) { view.rectMode = true; setRectFill(false); }
    else if (!view.rectFill) setRectFill(true);
    else { view.rectMode = false; }
    ui.toast(!view.rectMode ? '畫線：沿著手指畫' : view.rectFill ? '實心：拖曳填滿整個矩形' : '外框：拖曳畫出矩形外框');
  },
  removeAt: c => removeMarkerAt(c),
});
ui.bestDays = +store.get('best-endless', 0);
const guide = new Guide({
  world, view, touch: IS_TOUCH,
  onDone: () => { store.set('tut-done', '1'); guideOn = false; store.set('guide', '0'); },
});
function doBurst() {
  const r = world.lightBurst();
  if (r) ui.toast(r); else ui.toast(`光爆！（${CORE_TYPES[world.coreType].burst}）`);
}

if (BENCH) {
  world.initBench(BENCH, BENCH_BULLETS);
  ui.toast(`壓力測試：${BENCH} 隻敵人` + (BENCH_BULLETS ? `、${BENCH_BULLETS} 發子彈` : '') + (BENCH_PARTICLES ? `、${BENCH_PARTICLES} 個粒子` : ''));
  console.log(`[bench] 目標 ${BENCH} 隻敵人。每秒輸出 FPS / 模擬耗時 / 渲染耗時。`);
}

/** 某格上的建築（含地刺這種鋪在地上的） */
const bAt = ci => world.bldAt[ci] >= 0 ? world.bldAt[ci] : world.floorAt[ci];

// ───────────── 鏡頭 ─────────────
function fitPPC() {
  const topPad = IS_TOUCH ? 10 : 40;
  return Math.min(renderer.cssW / (MAP_W + 2), (renderer.cssH - topPad) / (MAP_H + 2));
}
function screenToWorld(sx, sy) {
  return { x: cam.x + (sx - renderer.cssW / 2) / cam.ppc, y: cam.y + (sy - renderer.cssH / 2) / cam.ppc };
}
function clampCam() {
  cam.zoom = Math.min(IS_TOUCH ? 4 : 3, Math.max(0.5, cam.zoom));
  cam.x = Math.min(MAP_W, Math.max(0, cam.x));
  cam.y = Math.min(MAP_H, Math.max(0, cam.y));
}
function zoomAt(sx, sy, factor) {
  const before = screenToWorld(sx, sy);
  cam.zoom *= factor;
  clampCam();
  cam.ppc = fitPPC() * cam.zoom;
  const after = screenToWorld(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y;
  clampCam();
}

// ───────────── 指令 ─────────────
function selectBuild(t) {
  if (world.state === 'won' || world.state === 'lost') return;
  view.buildType = view.buildType === t ? 0 : t;
  clearSel();
}
function clearSel() { view.selected = -1; view.multi = []; }
function selectedList() {
  if (view.multi.length) return view.multi.filter(b => world.balive[b]);
  if (view.selected >= 0 && world.balive[view.selected]) return [view.selected];
  return [];
}
function cancelAll() {
  if (view.buildType) view.buildType = 0; else clearSel();
  view.dragCells = null; view.box = null; gesture = null;
}
function sellSel() {
  const list = selectedList().filter(b => b !== world.core);
  if (!list.length) return;
  let g = 0, c = 0, full = false;
  for (const b of list) { const r = world.sell(b); if (r) { g += r.gold; c += r.crystal; full = full || r.full; } }
  ui.toast(`賣出 ${list.length > 1 ? list.length + ' 座 ' : ''}+${g} 金${c ? ` +${c} 晶` : ''}${full ? '（黎明全額退款）' : ''}`);
  clearSel();
}
function stratSel() {
  for (const b of selectedList()) world.cycleStrategy(b);
  ui.selKey = '';
}
/**
 * 升級選取的建築（單選或多選）。沒有選取時升級游標下的建築。
 * allSame = 單選時一併升級所有同類、同階級、同分支的建築。
 */
function upgradeSel(branch = 0, allSame = false) {
  let list = selectedList();
  if (!list.length && view.hover && !IS_TOUCH) {
    const b = bAt(view.hover.y * MAP_W + view.hover.x);
    if (b >= 0) list = [b];
  }
  if (!list.length) { ui.toast('先選取建築（點一下，或拖曳框選多座）'); return; }
  if (allSame && list.length === 1 && list[0] !== world.core) {
    const b0 = list[0], t = world.bt[b0], tier = world.btier[b0], br = world.bbranch[b0];
    list = [];
    for (let k = 1; k < world.bHigh; k++) if (world.balive[k] && world.bt[k] === t && world.btier[k] === tier && world.bbranch[k] === br) list.push(k);
  }
  list.sort((a, b) => world.btier[a] - world.btier[b]);
  let done = 0, needBr = 0, lack = 0, capped = 0, lastReason = '';
  for (const b of list) {
    const info = world.upgradeInfo(b);
    if (info.reason) {
      lastReason = info.reason;
      if (info.reason.startsWith('核心')) capped++; else if (info.reason !== '已是最高階級') lack++;
      continue;
    }
    if (info.needBranch && !branch) { needBr++; continue; }
    if (!world.upgrade(b, info.needBranch ? branch : 0)) done++;
  }
  const parts = [];
  if (done) parts.push(`升級 ${done} 座`);
  if (needBr) parts.push(`${needBr} 座要選紫色分支（${IS_TOUCH ? '點面板按鈕' : 'Z / C'}）`);
  if (lack) parts.push(`${lack} 座資源不足`);
  if (capped) parts.push(`${capped} 座受核心階級限制`);
  ui.toast(parts.length ? parts.join('・') : lastReason || '沒有可升級的建築');
  ui.selKey = '';
}
/** 選取畫面內所有同類、同階級、同分支的建築 */
function selectSame(b0) {
  if (b0 <= 0 || !world.balive[b0]) return;
  const t = world.bt[b0], tier = world.btier[b0], br = world.bbranch[b0];
  const a = screenToWorld(0, 0), z = screenToWorld(renderer.cssW, renderer.cssH);
  const out = [];
  for (let k = 1; k < world.bHigh; k++) {
    if (!world.balive[k] || world.bt[k] !== t || world.btier[k] !== tier || world.bbranch[k] !== br) continue;
    const x = world.bx[k] + 0.5, y = world.by[k] + 0.5;
    if (x >= a.x && x <= z.x && y >= a.y && y <= z.y) out.push(k);
  }
  setMulti(out);
  ui.toast(`選取畫面內 ${out.length} 座${BUILD_DEFS[t].name}`);
}
function setMulti(list) {
  if (list.length === 1) { view.selected = list[0]; view.multi = []; }
  else { view.selected = -1; view.multi = list; }
  ui.selKey = '';
}
function removeMarkerAt(ci) {
  if (world.bpAt[ci]) { world.removeBlueprintAt(ci); ui.toast('已移除藍圖'); return true; }
  if (world.ghostAt[ci]) { world.removeGhostAt(ci); ui.toast('已移除殘影（黎明不會復活）'); return true; }
  return false;
}
function restart(quiet = false) {
  world.setMode(gameMode === 'endless');
  world.coreType = coreType; world.guide = !BENCH && gameMode === 'normal' && guideOn; world.cardPool = cardPool();
  world.reset(newSeed());
  if (BENCH) world.initBench(BENCH, BENCH_BULLETS);
  fx.n = 0; fx.shake = 0;
  view.buildType = 0; clearSel(); view.dragCells = null; view.box = null;
  st.paused = false; st.playTime = 0; acc = 0; restartArm = 0; recorded = false; recordedNights = 0;
  unlockMsgs = [];
  if (world.guide) { guide.start(); ui.toggleHelp(false); } else { guide.stop(false); if (!IS_TOUCH) ui.toggleHelp(true); }
  if (sound.ctx) sound.stopDrone(0.3);
  if (!quiet) ui.toast(gameMode === 'endless' ? '新的一局：無限模式' : '新的一局');
}
function setMode(m) {
  if (world.state !== 'plan') return;
  gameMode = m; store.set('mode', m);
  restart(true);
  ui.toast(m === 'endless' ? '無限模式：沒有終點，每 5 夜一隻首領' : '一般模式：撐到第 11 天黎明');
}
/** 一局結束：記錄解鎖進度，回傳新解鎖的東西 */
function recordProgress() {
  const before = coreUnlocked(), poolBefore = cardPool().pool.length + cardPool().legends.length;
  progress.nights += world.stats.nights - recordedNights;
  recordedNights = world.stats.nights;
  for (const t of world.stats.bossKilled) if (!progress.bosses.includes(t)) progress.bosses.push(t);
  if (world.state === 'won' && !world.endless) progress.won = true;
  saveProgress();
  const after = coreUnlocked(), msgs = [];
  after.forEach((u, k) => { if (u && !before[k]) msgs.push(`${CORE_TYPES[k].name}核心`); });
  const added = cardPool().pool.length + cardPool().legends.length - poolBefore;
  if (added > 0) msgs.push(`${added} 張新卡加入卡池`);
  return msgs;
}
function togglePause() {
  if (world.state === 'plan') { world.start(); st.paused = false; ui.toggleHelp(false); return; }
  if (world.state === 'won' || world.state === 'lost') { restart(); return; }
  if (!st.paused && world.isFinalNight()) { ui.toast('最後一夜無法暫停'); return; }
  st.paused = !st.paused;
}

// ───────────── 放置筆劃（自由畫線／矩形外框） ─────────────
function cellAt(sx, sy) {
  const p = screenToWorld(sx, sy);
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return { x, y, wx: p.x, wy: p.y };
}
function evalCells(cells) {
  let budget = world.blueprints.length ? 0 : world.gold;
  const cost = world.costOf(view.buildType);
  for (const c of cells) {
    const why = world.canPlace(view.buildType, c.x, c.y, true);
    c.ok = (!why || why === '有敵人在此格') && !world.bpAt[c.y * MAP_W + c.x];
    c.bp = c.ok && (budget < cost || !!why);
    if (c.ok && !c.bp) budget -= cost;
  }
  return cells;
}
function rectRing(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const out = [];
  for (let x = x0; x <= x1; x++) out.push({ x, y: y0 });
  for (let y = y0 + 1; y <= y1; y++) out.push({ x: x1, y });
  if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push({ x, y: y1 });
  if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push({ x: x0, y });
  return out;
}
function setRectFill(on) { view.rectFill = on; store.set('rect-fill', on ? '1' : '0'); }
/** 實心矩形：一列一列蛇行排列（藍圖照這個順序蓋） */
function rectFilled(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const out = [];
  for (let y = y0; y <= y1; y++) {
    const rev = (y - y0) & 1;
    for (let i = 0; i <= x1 - x0; i++) out.push({ x: rev ? x1 - i : x0 + i, y });
  }
  return out;
}
/**
 * 從上一格到這一格補齊中間的格子（Bresenham），讓快速拖曳也不會斷線。
 * 往回拖到上一格時會把最後一格收回，所以拖過頭只要往回拉就好。
 */
function extendStroke(g, c) {
  let { x, y } = g.last;
  const dx = Math.abs(c.x - x), dy = -Math.abs(c.y - y), sx = c.x > x ? 1 : -1, sy = c.y > y ? 1 : -1;
  let err = dx + dy;
  while (x !== c.x || y !== c.y) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    const k = y * MAP_W + x;
    const n = g.cells.length, prev = n >= 2 ? g.cells[n - 2] : null;
    if (prev && prev.x === x && prev.y === y) { const q = g.cells.pop(); g.seen.delete(q.y * MAP_W + q.x); }
    else if (!g.seen.has(k)) { g.seen.add(k); g.cells.push({ x, y }); }
  }
  g.last = c;
}
function updateStrokePreview(g) {
  const cells = g.rect ? (g.fill ? rectFilled(g.start, g.last) : rectRing(g.start, g.last)) : g.cells.map(c => ({ x: c.x, y: c.y }));
  view.dragCells = evalCells(cells);
  showStrokeInfo(g);
}
/** 拖曳中在游標旁顯示：會蓋幾座、花多少、幾個藍圖，以及怎麼收回 */
function showStrokeInfo(g) {
  const cells = view.dragCells || [];
  let built = 0, bps = 0;
  for (const c of cells) if (c.ok) { if (c.bp) bps++; else built++; }
  const d = BUILD_DEFS[view.buildType];
  const shape = g.rect ? (g.fill ? '實心矩形' : '矩形外框') : '';
  const how = IS_TOUCH ? '往回拖可縮短・第二根手指取消' : `往回拖可縮短・右鍵／Esc 取消${g.rect ? '・F 切換外框／實心' : ''}`;
  const html = `<b>${d.name} × ${built + bps}</b>${shape ? `　${shape}` : ''}<br>` +
    `<span style="color:var(--gold)">${built} 座立即蓋・${fmtN(built * world.costOf(view.buildType))} 金</span>` +
    (bps ? `<br><span style="color:var(--cyan)">${bps} 個藍圖（之後自動花 ${fmtN(bps * world.costOf(view.buildType, true))} 金）</span>` : '') +
    `<br><span style="opacity:.6">${how}</span>`;
  const p = g.pt || mouse;
  ui.showTip(html, p.x, IS_TOUCH ? p.y - 110 : p.y);
}
const fmtN = n => Math.floor(n).toLocaleString('en-US');
function cancelStroke(msg = '已取消這一筆') {
  if (!gesture || gesture.kind !== 'stroke') return false;
  gesture = null; view.dragCells = null; ui.showTip('');
  ui.toast(msg);
  return true;
}
function commitStroke(g, keepMode) {
  const cells = view.dragCells || [];
  let placed = 0, bps = 0;
  for (const c of cells) {
    if (!c.ok) continue;
    const r = world.placeOrBlueprint(view.buildType, c.x, c.y);
    if (r === 'built') placed++; else if (r === 'blueprint') bps++;
  }
  if (bps) ui.toast(`${placed ? `蓋了 ${placed} 座・` : ''}${bps} 個藍圖：錢夠時依序自動建造`);
  else if (placed === 0 && cells.length) {
    const why = world.canPlace(view.buildType, cells[0].x, cells[0].y, true);
    if (why) ui.toast(why);
  }
  if (!keepMode && view.buildType !== B_WALL) view.buildType = 0;
  view.dragCells = null;
  ui.showTip('');
}
function finishBox() {
  const b = view.box; view.box = null;
  if (!b) return;
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
  const out = [];
  for (let k = 1; k < world.bHigh; k++) {
    if (!world.balive[k]) continue;
    const x = world.bx[k] + 0.5, y = world.by[k] + 0.5;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push(k);
  }
  setMulti(out);
  if (out.length > 1) ui.toast(`已選取 ${out.length} 座建築`);
}

// ───────────── 指標輸入（滑鼠與觸控共用） ─────────────
const keys = new Set();
const mouse = { x: 0, y: 0, inside: false };
const pointers = new Map();
let gesture = null;
let lastTap = { t: 0, b: -1 };

canvas.addEventListener('contextmenu', e => { e.preventDefault(); cancelStroke(); });
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; }
  ui.showTip('');

  // 兩指：縮放 + 平移（取消進行中的筆劃）
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    if (gesture && gesture.kind === 'stroke') cancelStroke();
    gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom0: cam.zoom };
    view.dragCells = null; view.box = null;
    return;
  }
  if (pointers.size > 2) return;

  const c = cellAt(e.clientX, e.clientY);
  const w0 = screenToWorld(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') {
    if (e.button === 1) { e.preventDefault(); gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; return; }
    if (e.button === 2) {
      if (view.buildType) view.buildType = 0;
      else if (!(c && removeMarkerAt(c.y * MAP_W + c.x))) clearSel();
      view.dragCells = null; gesture = null; return;
    }
    if (e.button !== 0 || !c) return;
    if (view.buildType) {
      gesture = { kind: 'stroke', rect: e.ctrlKey || view.rectMode, fill: view.rectFill, start: c, last: c, cells: [{ x: c.x, y: c.y }], seen: new Set([c.y * MAP_W + c.x]), keep: e.shiftKey, pt: { x: e.clientX, y: e.clientY } };
      updateStrokePreview(gesture);
      return;
    }
    const b = bAt(c.y * MAP_W + c.x);
    if (b >= 0 && !e.shiftKey) {
      if (e.ctrlKey && b > 0) { // Ctrl+點：加入／移出多選
        const list = selectedList().filter(k => k !== world.core);
        const i = list.indexOf(b);
        if (i >= 0) list.splice(i, 1); else list.push(b);
        setMulti(list);
      } else { view.selected = b; view.multi = []; ui.selKey = ''; }
      gesture = { kind: 'maybeBox', sx: e.clientX, sy: e.clientY, w0 };
    } else {
      gesture = { kind: 'box', w0 };
      view.box = { x0: w0.x, y0: w0.y, x1: w0.x, y1: w0.y };
    }
    return;
  }

  // 觸控／觸控筆
  if (!c) return;
  if (view.buildType) {
    gesture = { kind: 'stroke', rect: view.rectMode, fill: view.rectFill, start: c, last: c, cells: [{ x: c.x, y: c.y }], seen: new Set([c.y * MAP_W + c.x]), keep: true, pt: { x: e.clientX, y: e.clientY } };
    updateStrokePreview(gesture);
  } else if (view.boxMode) {
    gesture = { kind: 'box', w0 };
    view.box = { x0: w0.x, y0: w0.y, x1: w0.x, y1: w0.y };
  } else {
    gesture = { kind: 'tap', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, c, t0: performance.now(), long: false };
    // 長按：移除藍圖／殘影，或選取畫面內所有同類建築
    gesture.timer = setTimeout(() => {
      if (!gesture || gesture.kind !== 'tap') return;
      gesture.long = true;
      const ci = c.y * MAP_W + c.x;
      if (removeMarkerAt(ci)) return;
      const b = bAt(ci);
      if (b > 0) selectSame(b);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 500);
  }
});

canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; }
  const p = pointers.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (!gesture) return;
  if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // 平移：中點位移；縮放：以中點為錨
    cam.x -= (mx - gesture.mx) / cam.ppc; cam.y -= (my - gesture.my) / cam.ppc;
    gesture.mx = mx; gesture.my = my;
    const target = gesture.zoom0 * d / Math.max(1, gesture.d0);
    zoomAt(mx, my, target / cam.zoom);
    return;
  }
  if (gesture.kind === 'pan') {
    const sx = gesture.sx, sy = gesture.sy;
    cam.x = gesture.cx - (e.clientX - sx) / cam.ppc; cam.y = gesture.cy - (e.clientY - sy) / cam.ppc;
    clampCam(); return;
  }
  if (gesture.kind === 'stroke') {
    // 拖曳中按右鍵（和弦按鍵只會觸發 pointermove）＝取消這一筆
    if (e.pointerType === 'mouse' && (e.buttons & 2)) { cancelStroke(); return; }
    gesture.pt = { x: e.clientX, y: e.clientY };
    const c = cellAt(e.clientX, e.clientY);
    if (!c || (c.x === gesture.last.x && c.y === gesture.last.y)) { showStrokeInfo(gesture); return; }
    if (gesture.rect) gesture.last = c; else extendStroke(gesture, c);
    updateStrokePreview(gesture);
    return;
  }
  if (gesture.kind === 'maybeBox' && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 6) {
    gesture = { kind: 'box', w0: gesture.w0 };
    view.box = { x0: gesture.w0.x, y0: gesture.w0.y, x1: gesture.w0.x, y1: gesture.w0.y };
  }
  if (gesture.kind === 'box') {
    const w1 = screenToWorld(e.clientX, e.clientY);
    view.box.x1 = w1.x; view.box.y1 = w1.y;
    return;
  }
  if (gesture.kind === 'tap' && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 10) {
    clearTimeout(gesture.timer);
    gesture = { kind: 'pan', sx: gesture.sx, sy: gesture.sy, cx: gesture.cx, cy: gesture.cy };
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.kind === 'pinch') { if (pointers.size === 0) gesture = null; return; }
  const g = gesture;
  gesture = null;
  if (g.kind === 'stroke') commitStroke(g, g.keep || e.shiftKey);
  else if (g.kind === 'box') finishBox();
  else if (g.kind === 'tap') {
    clearTimeout(g.timer);
    if (g.long) return;
    const ci = g.c.y * MAP_W + g.c.x;
    const b = bAt(ci);
    const now = performance.now();
    if (b > 0 && lastTap.b === b && now - lastTap.t < 350) { selectSame(b); lastTap = { t: 0, b: -1 }; return; }
    lastTap = { t: now, b };
    if (b >= 0) { view.selected = b; view.multi = []; ui.selKey = ''; }
    else {
      clearSel();
      if (world.bpAt[ci] || world.ghostAt[ci]) ui.toast('長按可移除藍圖或殘影');
      else ui.showCellInfo(world, ci);
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('dblclick', e => {
  const c = cellAt(e.clientX, e.clientY);
  if (!c || view.buildType) return;
  const b = bAt(c.y * MAP_W + c.x);
  if (b > 0) selectSame(b);
});
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { mouse.inside = false; ui.showTip(''); } });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
window.addEventListener('mousemove', e => updateTip(e));
// 擋掉 iOS 的雙指縮放整頁
document.addEventListener('gesturestart', e => e.preventDefault());

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.key === 'Tab') { e.preventDefault(); st.speed = st.speed % 3 + 1; return; }
  if (e.key === 'F3') { e.preventDefault(); ui.perfOn = !ui.perfOn; return; }
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
  if (e.key === 'Escape') { if (!cancelStroke()) cancelAll(); return; }
  if (k === 'f' && !e.repeat) {
    setRectFill(!view.rectFill);
    if (gesture && gesture.kind === 'stroke' && gesture.rect) { gesture.fill = view.rectFill; updateStrokePreview(gesture); }
    else ui.toast(view.rectFill ? 'Ctrl+拖曳：實心矩形' : 'Ctrl+拖曳：矩形外框');
    return;
  }
  { const t = BUILDABLE.find(t => BUILD_DEFS[t].key.toLowerCase() === k); if (t && !e.ctrlKey && !e.metaKey) { if (world.isUnlocked(t)) selectBuild(t); else ui.toast(world.unlockReason(t)); return; } }
  if (k === 'g') { ui.toggleLab(); return; }
  if (k === 'x') { sellSel(); return; }
  if (k === 'q') { doBurst(); return; }
  if (k === 't') { stratSel(); return; }
  if (k === 'u') { upgradeSel(0, e.shiftKey); return; }
  if (k === 'z' || k === 'c') { upgradeSel(k === 'z' ? 1 : 2, e.shiftKey); return; }
  if (k === 'h') { ui.toggleHelp(); return; }
  if (k === 'm') { sound.unlock(); const m = sound.toggleMute(); ui.toast(m ? '音效：關' : `音效：開（音量 ${sound.volumeName()}）`); return; }
  if (k === 'v') { ui.h.cycleVolume(); return; }
  if (k === 'r') {
    if (world.state === 'won' || world.state === 'lost' || performance.now() - restartArm < 2500) restart();
    else { restartArm = performance.now(); ui.toast('再按一次 R 確認重新開始'); }
    return;
  }
  keys.add(k); keys.add(e.key);
});
window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); keys.delete(e.key); });
window.addEventListener('blur', () => keys.clear());

function updateTip(e) {
  if (IS_TOUCH) return;
  const target = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (target) { ui.showTip(ui.tipFor(world, target.dataset.tip), e.clientX, e.clientY); return; }
  if (gesture && gesture.kind === 'stroke') return; // 拖曳中的資訊由 showStrokeInfo 顯示
  if (e.target !== canvas || gesture || view.buildType) { ui.showTip(''); return; }
  const c = cellAt(e.clientX, e.clientY);
  if (!c) { ui.showTip(''); return; }
  let best = -1, bd = 2.5 * 2.5;
  for (let i = 0; i < world.n; i++) {
    const dx = world.ex[i] - c.wx, dy = world.ey[i] - c.wy, d2 = dx * dx + dy * dy;
    const r = world.erad[i] + 0.2;
    if (d2 < r * r && d2 < bd) { bd = d2; best = i; }
  }
  if (best >= 0) { ui.showTip(enemyTip(world, best), e.clientX, e.clientY); return; }
  const ci = c.y * MAP_W + c.x;
  const b = bAt(ci);
  if (b === world.core) {
    const goal = world.endless ? '無限模式：撐得越久越好。' : `撐到第 ${world.totalDays + 1} 天黎明即勝利。`;
    ui.showTip(`<b>曙光核心</b>　${TIER_NAMES[world.coreTier]}<br>血量 ${Math.ceil(world.bhp[b])} / ${world.bmax[b]}<br>` +
      `被摧毀即失敗。${goal}<br>核心階級是所有建築的上限。<br><span style="opacity:.6">左鍵選取 → 升級</span>`, e.clientX, e.clientY);
    return;
  }
  if (b > 0) { ui.showTip(buildingTip(world, b), e.clientX, e.clientY); return; }
  ui.showTip(ui.cellInfo(world, ci, true), e.clientX, e.clientY);
}

// ───────────── 主迴圈 ─────────────
let last = performance.now();
let fpsFrames = 0, fpsT = last, simAcc = 0, simSteps = 0, rendAcc = 0, rendFrames = 0;
let benchLogT = last;
let slowFrames = 0, fastFrames = 0, degrade = 0;
let prevState = world.state, slowmo = 0, recorded = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;

  renderer.resize();
  const fit = fitPPC();
  const pan = 40 / cam.zoom * dtReal;
  if (keys.has('w') || keys.has('ArrowUp')) cam.y -= pan;
  if (keys.has('s') || keys.has('ArrowDown')) cam.y += pan;
  if (keys.has('a') || keys.has('ArrowLeft')) cam.x -= pan;
  if (keys.has('d') || keys.has('ArrowRight')) cam.x += pan;
  clampCam();
  cam.ppc = fit * cam.zoom;

  // 模擬（固定步長，2× / 3× 用每幀多跑幾步）
  let steps = 0;
  const running = (world.state === 'run' && !st.paused) || world.state === 'won';
  if (world.state === 'won' && prevState !== 'won') slowmo = 0.5; // 勝利：慢動作 0.5 秒
  if (world.state === 'lost' && prevState !== 'lost') {
    if (sound.ctx) { sound.stopDrone(0.5); sound.lose(); }
    if (world.endless && !recorded) {
      const days = world.day - 1;
      ui.lastWasBest = days > ui.bestDays;
      if (ui.lastWasBest) { ui.bestDays = days; store.set('best-endless', days); }
    }
    if (!recorded && !BENCH) { recorded = true; unlockMsgs = recordProgress(); }
  }
  if (world.state === 'won' && prevState !== 'won' && !recorded && !BENCH) { recorded = true; unlockMsgs = recordProgress(); }
  prevState = world.state;
  let simScale = 1;
  if (slowmo > 0) { slowmo -= dtReal; simScale = 0.25; }
  if (running) {
    acc += dtReal * st.speed * simScale;
    const maxSteps = 4 * st.speed;
    while (acc >= DT && steps < maxSteps) {
      const t0 = performance.now();
      world.step();
      simAcc += performance.now() - t0; simSteps++;
      acc -= DT; steps++;
    }
    if (steps >= maxSteps) acc = Math.min(acc, DT);
    if (world.state === 'run') st.playTime += dtReal;
  } else world.idle(dtReal);
  const alpha = running ? acc / DT : 1;

  const c = mouse.inside && !IS_TOUCH ? cellAt(mouse.x, mouse.y) : null;
  view.hover = c;
  if (c && view.buildType) {
    const why = world.canPlace(view.buildType, c.x, c.y, true);
    view.hoverOk = (!why || why === '有敵人在此格') && !world.bpAt[c.y * MAP_W + c.x];
    view.hoverBp = !!why || world.gold < world.costOf(view.buildType) || world.blueprints.length > 0;
  } else { view.hoverOk = false; view.hoverBp = false; }
  view.multi = view.multi.filter(b => world.balive[b]);

  if (BENCH_PARTICLES) fx.fill(BENCH_PARTICLES);
  sound.consume(world, st.speed);   // 先讓音效讀事件，特效讀完會清空
  fx.consume(world);
  fx.update(running ? steps * DT : dtReal);

  const t1 = performance.now();
  const sh = fx.shake;
  const camDraw = { x: cam.x + (sh ? (Math.random() - 0.5) * sh : 0), y: cam.y + (sh ? (Math.random() - 0.5) * sh : 0), ppc: cam.ppc };
  const P = drawScene(renderer, world, fx, view, alpha);
  renderer.draw(camDraw, P.bg, P.line, MAP_W, MAP_H, P.outside, P.post);
  rendAcc += performance.now() - t1; rendFrames++;

  // 自動降級：粒子減半 → 關閉 bloom → 光照 1/8 並關掉敵人光暈；持續順暢時反向開回
  const ft = dtReal * 1000;
  if (ft > 18) { slowFrames++; fastFrames = 0; } else if (ft < 13) { fastFrames++; slowFrames = 0; }
  if (AUTO_DEGRADE && slowFrames > 30 && degrade < 3) { degrade++; slowFrames = 0; }
  if (fastFrames > 240 && degrade > 0) { degrade--; fastFrames = 0; }
  fx.budget = degrade >= 1 ? 0.5 : 1;
  renderer.bloomOn = degrade < 2;
  renderer.lightDiv = degrade >= 3 ? 8 : 4;
  view.noGlow = degrade >= 3;
  st.perf.degrade = ['', '粒子減半', '粒子減半・關 bloom', '粒子減半・關 bloom・光照 1/8'][degrade];

  fpsFrames++;
  if (now - fpsT >= 500) {
    st.perf.fps = fpsFrames * 1000 / (now - fpsT);
    st.perf.simMs = simSteps ? simAcc / simSteps : 0;
    st.perf.renderMs = rendFrames ? rendAcc / rendFrames : 0;
    fpsFrames = 0; fpsT = now; simAcc = 0; simSteps = 0; rendAcc = 0; rendFrames = 0;
  }
  st.perf.particles = fx.n;
  st.perf.instances = renderer.count;
  if (BENCH && now - benchLogT >= 1000) {
    benchLogT = now;
    console.log(`[bench] fps=${st.perf.fps.toFixed(1)} sim=${st.perf.simMs.toFixed(2)}ms/step render=${st.perf.renderMs.toFixed(2)}ms(cpu) enemies=${world.n} bullets=${world.nb} particles=${fx.n} instances=${renderer.count}`);
  }

  guide.update();
  while (world.ruinLog.length) ui.toast(world.ruinLog.shift());
  if (world.gems.length > lastGems && world.state === 'run') ui.toast(`獲得晶核！（共 ${world.gems.length} 顆，按 ${IS_TOUCH ? '「研究」' : 'G'} 查看）`);
  lastGems = world.gems.length;
  ui.update(world, {
    muted: sound.muted, volumeName: sound.volumeName(), speed: st.speed, paused: st.paused || world.state === 'plan',
    buildType: view.buildType, selected: view.selected, multi: view.multi, perf: st.perf, playTime: st.playTime,
    mode: gameMode, boxMode: view.boxMode, rectMode: view.rectMode, rectFill: view.rectFill, touch: IS_TOUCH,
    coreUnlocked: coreUnlocked(), guide: guideOn, unlockMsgs,
  });
}
requestAnimationFrame(frame);
ui.toggleHelp(!BENCH && !IS_TOUCH && !world.guide);
if (world.guide) guide.start();
if (IS_TOUCH) ui.perfOn = false;

// 方便在 console 檢查
window.game = { world, fx, cam, view, renderer, sound, ui, guide, progress };
void ATTACK_TOWERS; void T_ROCK; void T_VEIN;
