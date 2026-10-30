// DOM 介面：疊在 canvas 上方。只讀取模擬狀態，透過回呼送出指令。
import {
  PHASES, PHASE_START, DAY_LEN, P_NIGHT, P_DAWN, BUILD_DEFS, BUILDABLE, STRATEGIES, TIER_NAMES, CORE_UP_DESC,
  B_WALL, B_GOLD, B_CRYSTAL, B_ARROW, B_SCATTER, B_CANNON, B_FROST, B_PRISM, B_AMP, B_CORE,
  ENEMY_DEFS, E_ARMOR, ELITE_HP, ELITE_DPS, statsOf, coreStats, ATTACK_TOWERS, DAWN_BUFF,
  CORE_TYPES, MUTATORS, STAR_KILLS, ASCEND_NAMES, ASCEND_DESC, ASCEND_COST, P_DUSK,
  B_LIGHT, B_TRAP, B_REPAIR, B_TESLA, RESEARCH, RESEARCH_COLS, GEM_TYPES, GEM_RARITY, GEM_COLORS, RESEARCH_BUILD,
} from '../sim/defs.js';
import { TIER_HEX } from '../render/scene.js';
import { CARD_BY_ID, SCHOOLS } from '../sim/cards.js';
const MUT_BY_ID = Object.fromEntries(MUTATORS.map(m => [m.id, m]));

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const f1 = n => (Math.round(n * 10) / 10).toString();

function drawIcon(cv, type) {
  const dpr = 2; cv.width = 30 * dpr; cv.height = 30 * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  g.lineWidth = 1.6; g.strokeStyle = '#ece7db'; g.fillStyle = 'rgba(236,231,219,0.08)';
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.stroke(); };
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill(); };
  rr(5, 5, 20, 20, 4);
  if (type === B_WALL) { g.fillStyle = 'rgba(236,231,219,0.3)'; g.fillRect(11, 11, 8, 8); }
  if (type === B_GOLD) poly([[15, 8], [22, 15], [15, 22], [8, 15]], '#e3b23c');
  if (type === B_CRYSTAL) poly([[15, 7], [20, 15], [15, 23], [10, 15]], '#35c4c8');
  if (type === B_ARROW) poly([[22, 15], [11, 9], [11, 21]], '#ece7db');
  if (type === B_SCATTER) for (const a of [-0.5, 0, 0.5]) {
    const cx = 15 + Math.cos(a) * 3, cy = 15 + Math.sin(a) * 3;
    poly([[cx + Math.cos(a) * 5, cy + Math.sin(a) * 5], [cx + Math.cos(a + 2.4) * 3, cy + Math.sin(a + 2.4) * 3], [cx + Math.cos(a - 2.4) * 3, cy + Math.sin(a - 2.4) * 3]], '#ece7db');
  }
  if (type === B_CANNON) { g.fillStyle = '#ece7db'; g.beginPath(); g.roundRect(15, 12.5, 10, 5, 2.5); g.fill(); g.beginPath(); g.arc(15, 15, 5, 0, 6.29); g.fillStyle = '#2a2b31'; g.fill(); g.stroke(); }
  if (type === B_FROST) { const p = []; for (let k = 0; k < 6; k++) p.push([15 + Math.cos(k * 1.047) * 6, 15 + Math.sin(k * 1.047) * 6]); poly(p, '#35c4c8'); }
  if (type === B_PRISM) { poly([[23, 15], [15, 11], [7, 15], [15, 19]], '#ffe9b8'); }
  if (type === B_AMP) { g.beginPath(); g.arc(15, 15, 6, 0, 6.29); g.stroke(); g.fillStyle = '#ece7db'; g.beginPath(); g.arc(15, 15, 2.2, 0, 6.29); g.fill(); }
  if (type === B_LIGHT) { const p = []; for (let k = 0; k < 10; k++) { const r = k & 1 ? 3 : 7, a = k * 0.628 - 1.57; p.push([15 + Math.cos(a) * r, 15 + Math.sin(a) * r]); } poly(p, '#ffe9b8'); }
  if (type === B_TRAP) for (const [x, y] of [[11, 13], [19, 13], [11, 21], [19, 21]]) poly([[x, y - 5], [x + 3, y], [x - 3, y]], '#ece7db');
  if (type === B_REPAIR) { g.fillStyle = '#5fd08a'; g.fillRect(9, 13.5, 12, 3); g.fillRect(13.5, 9, 3, 12); }
  if (type === B_TESLA) { poly([[15, 7], [19, 15], [15, 23], [11, 15]], '#9cc8ff'); g.fillStyle = '#fff'; g.beginPath(); g.arc(15, 11, 1.8, 0, 6.29); g.fill(); }
}

/** 建築的可顯示數值列（[標籤, 值, 用於比較的數字]） */
export function statRows(type, s, buff = 1, extra = {}) {
  const rows = [['血量', fmt(s.hp), s.hp]];
  switch (type) {
    case B_GOLD: rows.push(['產出', `+${f1(s.gold * buff * (extra.prod || 1))} 金/秒`, s.gold]); break;
    case B_CRYSTAL: rows.push(['產出', `+${(s.crystal * buff * (extra.prod || 1)).toFixed(2)} 晶/秒`, s.crystal]); break;
    case B_WALL:
      if (s.thorns) rows.push(['反彈', `${s.thorns}× 攻擊者傷害`]);
      if (s.regen) rows.push(['再生', `${s.regen * 100}%/秒`]);
      break;
    case B_ARROW: case B_SCATTER: case B_CANNON: case B_PRISM: {
      const rate = s.rate * buff * (extra.rate || 1);
      rows.push(['傷害', f1(s.dmg) + (s.pellets ? ` × ${s.pellets}` : '') + (s.beams > 1 ? ` × ${s.beams} 道` : ''), s.dmg]);
      rows.push(['射速', `${rate.toFixed(2)} 次/秒`, s.rate]);
      rows.push(['射程', `${f1(s.range)} 格`, s.range]);
      if (s.radius) rows.push(['爆炸半徑', `${f1(s.radius)} 格`, s.radius]);
      if (s.bounce) rows.push(['彈跳', `${s.bounce} 次`]);
      if (s.cluster) rows.push(['子炸彈', `${s.cluster} 顆`]);
      if (s.ap) rows.push(['特性', '貫穿護甲']);
      if (s.burn) rows.push(['燃燒帶', `${f1(s.burn)}/秒・3 秒`]);
      break;
    }
    case B_FROST:
      rows.push(['範圍', `${f1(s.aura)} 格`, s.aura], ['減速', `${Math.round(s.slow * 100)}%`, s.slow], ['光環傷害', `${f1(s.dot)}/秒`, s.dot]);
      if (s.freeze) rows.push(['冰凍', `每 ${s.freeze} 秒凍 1 秒`]);
      break;
    case B_AMP:
      rows.push(['範圍', `${f1(s.aura)} 格`, s.aura], ['攻速加成', `+${Math.round(s.rateBonus * 100)}%`, s.rateBonus], ['產量加成', `+${Math.round(s.prodBonus * 100)}%`, s.prodBonus]);
      break;
    case B_LIGHT: rows.push(['照亮半徑', `${f1(s.light)} 格`, s.light]); break;
    case B_TRAP: rows.push(['傷害', `${f1(s.dot)}/秒`, s.dot]); if (s.trapSlow) rows.push(['減速', '50%']); break;
    case B_REPAIR: rows.push(['範圍', `${f1(s.aura)} 格`, s.aura], ['修復', `${(s.heal * 100).toFixed(1)}%/秒`, s.heal]); break;
    case B_TESLA: {
      const rate = s.rate * buff * (extra.rate || 1);
      rows.push(['傷害', f1(s.dmg), s.dmg], ['射速', `${rate.toFixed(2)} 次/秒`, s.rate], ['射程', `${f1(s.range)} 格`, s.range], ['連鎖', `${s.chains} 次`, s.chains]);
      if (s.stun) rows.push(['麻痺', `${s.stun} 秒`]);
      break;
    }
  }
  if (s.reso) rows.push(['共振', `+${s.reso * 6}% 傷害`]);
  if (s.gCrit) rows.push(['暴擊', `${Math.round(s.gCrit * 100)}%`]);
  if (s.gChain) rows.push(['連鎖機率', `${Math.round(s.gChain * 100)}%`]);
  if (s.gFreeze) rows.push(['冰凍機率', `${Math.round(s.gFreeze * 100)}%`]);
  return rows;
}
const gemName = code => `${GEM_TYPES[code >> 2].name}・${GEM_RARITY[code & 3]}`;
const gemHtml = (t, r) => `<span style="color:${GEM_COLORS[r]}">◆ ${GEM_TYPES[t].name}</span>`;

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.lastText = 0;
    this.selKey = '';
    this.perfOn = true;

    const bar = $('build');
    this.btns = {};
    for (const t of BUILDABLE) {
      const d = BUILD_DEFS[t];
      const el = document.createElement('button');
      el.className = 'bbtn';
      el.tabIndex = -1;
      el.innerHTML = `<span class="key">${d.key}</span><span class="tier" title="可升級的最高階級"></span><canvas></canvas><span class="nm">${d.name}</span><span class="cost mono">${d.cost}</span>`;
      drawIcon(el.querySelector('canvas'), t);
      el.addEventListener('click', () => handlers.selectBuild(t));
      el.dataset.tip = 'build:' + t;
      bar.appendChild(el);
      this.btns[t] = { el, cost: el.querySelector('.cost'), tier: el.querySelector('.tier') };
    }
    document.querySelectorAll('#speed .sp').forEach(el => el.addEventListener('click', () => handlers.setSpeed(+el.dataset.s)));
    $('help-btn').addEventListener('click', () => this.toggleHelp());
    $('mute').addEventListener('click', () => handlers.cycleVolume());
    // 規劃畫面：模式與開始
    document.querySelectorAll('#hint [data-mode]').forEach(el => el.addEventListener('click', () => handlers.setMode(el.dataset.mode)));
    $('start-btn').addEventListener('click', () => handlers.togglePause());
    $('again-btn').addEventListener('click', () => handlers.restart());
    $('endless-btn').addEventListener('click', () => handlers.continueEndless());
    $('burst-btn').addEventListener('click', () => handlers.burst());
    $('lab-btn').addEventListener('click', () => this.toggleLab());
    $('tb-lab').addEventListener('click', () => this.toggleLab());
    $('lab').addEventListener('click', e => {
      const el = e.target.closest('[data-r],[data-tab],[data-merge],[data-x]');
      if (!el) return;
      if (el.dataset.x !== undefined) { this.toggleLab(false); return; }
      if (el.dataset.tab) { this.labTab = el.dataset.tab; this.labKey = ''; return; }
      if (el.dataset.r) { handlers.research(el.dataset.r); this.labKey = ''; return; }
      if (el.dataset.merge) { const [t, r] = el.dataset.merge.split(',').map(Number); handlers.mergeGems(t, r); this.labKey = ''; }
    });
    this.labOpen = false; this.labTab = 'research'; this.labKey = ''; this.gemPick = -1;
    $('tb-burst').addEventListener('click', () => handlers.burst());
    $('guide-cb').addEventListener('change', e => handlers.setGuide(e.target.checked));
    // 核心選擇
    const cores = $('cores');
    CORE_TYPES.forEach((c, k) => {
      const b = document.createElement('button');
      b.dataset.core = k; b.textContent = c.name; b.dataset.tip = 'core:' + k;
      b.addEventListener('click', () => handlers.setCore(k));
      cores.appendChild(b);
    });
    // 卡片面板（事件委派）
    $('cards').addEventListener('click', e => {
      const c = e.target.closest('[data-card]');
      if (c) { handlers.pickCard(c.dataset.card); return; }
      const a = e.target.closest('[data-act]');
      if (a) { if (a.dataset.act === 'reroll') handlers.reroll(); else if (a.dataset.act === 'min') { this.cardsMin = true; this.cardsKey = ''; } return; }
      if (this.cardsMin) { this.cardsMin = false; this.cardsKey = ''; }
    });
    this.cardsMin = false; this.cardsKey = ''; this.ownedKey = ''; this.newUntil = {}; this.prevUnlocked = null;
    // 觸控工具列
    $('tb-play').addEventListener('click', () => handlers.togglePause());
    $('tb-speed').addEventListener('click', () => handlers.cycleSpeed());
    $('tb-vol').addEventListener('click', () => handlers.cycleVolume());
    $('tb-box').addEventListener('click', () => handlers.toggleBox());
    $('tb-rect').addEventListener('click', () => handlers.toggleRect());
    $('tb-cancel').addEventListener('click', () => handlers.cancel());
    document.querySelectorAll('#touchbar button, #hint button, #end button, #burst-btn').forEach(b => { b.tabIndex = -1; });
    $('help').addEventListener('click', () => this.toggleHelp());
  }

  toggleLab(force) {
    this.labOpen = force ?? !this.labOpen;
    $('lab').style.display = this.labOpen ? 'block' : 'none';
    this.labKey = '';
  }
  /** 研究與晶核面板 */
  updateLab(w) {
    if (!this.labOpen) return;
    const key = `${this.labTab}|${[...w.research].join()}|${Math.floor(w.crystal / 10)}|${w.gems.map(g => g.t * 4 + g.r).join()}`;
    if (key === this.labKey) return;
    this.labKey = key;
    const head = `<div class="lab-head"><span class="tabs"><button data-tab="research" class="${this.labTab === 'research' ? 'on' : ''}">研究</button>` +
      `<button data-tab="gems" class="${this.labTab === 'gems' ? 'on' : ''}">晶核（${w.gems.length}）</button></span>` +
      `<span class="c">${fmt(w.crystal)} 晶</span><button data-x>✕</button></div>`;
    let body = '';
    if (this.labTab === 'research') {
      body = `<div class="lab-cols">` + RESEARCH_COLS.map((name, col) => `<div class="lab-col"><div class="lab-ct">${name}</div>` +
        RESEARCH.filter(r => r.col === col).map(r => {
          const info = w.researchInfo(r.id), done = w.research.has(r.id);
          const locked = r.req && !w.research.has(r.req);
          return `<button class="node ${done ? 'done' : locked ? 'locked' : ''}" data-r="${r.id}" ${done || info.reason ? 'disabled' : ''}>` +
            `<b>${r.name}</b><span class="cost">${done ? '已完成' : `${r.cost} 晶`}</span><span class="d">${r.desc}</span></button>`;
        }).join('') + `</div>`).join('') + `</div><div class="lab-note">研究不會暫停遊戲。晶來自核心、晶礦、菁英與黎明淨化的暗晶。</div>`;
    } else {
      const groups = new Map();
      for (const g of w.gems) { const k = g.t * 4 + g.r; groups.set(k, (groups.get(k) || 0) + 1); }
      const rows = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([k, n]) => {
        const t = k >> 2, r = k & 3;
        return `<div class="gem-row"><span>${gemHtml(t, r)} <span class="dim">${GEM_RARITY[r]}</span> × ${n}</span><span class="dim">${GEM_TYPES[t].desc(r)}</span>` +
          (n >= 3 && r < 3 ? `<button data-merge="${t},${r}">合成 3→1</button>` : '') + `</div>`;
      }).join('');
      body = rows ? `<div class="gems">${rows}</div><div class="lab-note">點選紫色以上的攻擊塔，在面板裡把晶核鑲進槽。三顆同種同稀有度可以合成更高一級。</div>`
        : `<div class="lab-note">還沒有晶核。打倒首領必掉、菁英偶爾掉、遺跡裡也有。</div>`;
    }
    $('lab').innerHTML = head + body;
    $('lab').querySelectorAll('button').forEach(b => { b.tabIndex = -1; });
  }

  toggleHelp(force) {
    const on = force ?? !$('help').classList.contains('on');
    $('help').classList.toggle('on', on);
    $('help-btn').style.display = on ? 'none' : 'block';
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.style.opacity = 0; }, 1800);
  }

  update(w, st) {
    const final = w.isFinalNight() && w.state === 'run';
    $('tl-bar').style.display = final ? 'none' : 'flex';
    $('tl-final').style.display = final ? 'block' : 'none';
    const marker = $('tl-marker');
    marker.style.left = (Math.min(1, w.dayT / DAY_LEN) * 100) + '%';
    marker.classList.toggle('moon', w.phase === P_NIGHT);

    // 首領血條（每幀）
    const li = w.state === 'run' ? w.lordIndex() : -1;
    $('boss').style.display = li >= 0 ? 'block' : 'none';
    if (li >= 0) {
      $('boss-fill').style.width = (Math.max(0, w.ehp[li]) / w.emax[li] * 100) + '%';
      const nm = ENEMY_DEFS[w.et[li]].name.split('').join(' ');
      if (this.bossName !== nm) { this.bossName = nm; document.querySelector('#boss .nm').textContent = nm; }
    }

    const now = performance.now();
    if (now - this.lastText < 100 && !st.force) return;
    this.lastText = now;

    $('tl-day').textContent = w.state === 'won' ? `第 ${w.totalDays + 1} 天・黎明`
      : w.endless ? `第 ${w.day} 天・無限` : `第 ${Math.min(w.day, w.totalDays)} 天 / ${w.totalDays}`;
    const buffOn = w.dawnBuffActive();
    $('tl-phase').textContent = w.state === 'plan' ? '規劃中'
      : w.overtime > 0 ? `首領未倒・黑夜延長 ${Math.ceil(60 - w.overtime)}s`
        : PHASES[w.phase].name + (final ? '' : `・${Math.ceil(PHASES[w.phase].dur - (w.dayT - PHASE_START[w.phase]))}s`) + (buffOn ? '・增益 +30%' : '');

    $('gold').textContent = fmt(w.gold);
    $('gold-rate').textContent = `+${w.goldRate.toFixed(1)}/s`;
    $('crystal').textContent = fmt(w.crystal);
    $('crystal-rate').textContent = `+${w.crystalRate.toFixed(2)}/s`;
    const c = w.core, hp = Math.max(0, w.bhp[c]), mx = w.bmax[c];
    $('core-hp-v').textContent = `${fmt(hp)} / ${fmt(mx)}`;
    const f = $('core-fill');
    f.style.width = (hp / mx * 100) + '%';
    f.style.background = hp / mx < 0.3 ? 'var(--red)' : 'var(--ok)';
    const ct = w.coreTier;
    $('core-tier-v').textContent = `核心階級：${TIER_NAMES[ct]}（建築上限）`;
    $('core-tier-dot').style.background = TIER_HEX[ct];

    document.querySelectorAll('#speed .sp').forEach(el => el.classList.toggle('on', +el.dataset.s === st.speed));
    $('pause-tag').style.display = st.paused ? 'inline' : 'none';
    $('mute').textContent = `音量 ${st.volumeName}`;
    $('mute').classList.toggle('off', !!st.muted);
    $('pause-tag').textContent = w.state === 'plan' ? '規劃中' : '暫停';

    const unl = w.unlocked ? [...w.unlocked].join() : 'all';
    if (this.prevUnlocked !== null && unl !== this.prevUnlocked && w.state === 'run') {
      for (const t of BUILDABLE) if (w.isUnlocked(t) && !(this.prevUnlocked === 'all' || this.prevUnlocked.split(',').includes(String(t)))) this.newUntil[t] = now + 30000;
    }
    this.prevUnlocked = unl;
    for (const t of BUILDABLE) {
      const b = this.btns[t], cost = w.costOf(t);
      b.el.style.display = w.isUnlocked(t) ? '' : 'none';
      const isNew = (this.newUntil[t] || 0) > now;
      if (isNew !== !!b.newEl) {
        if (isNew) { b.newEl = document.createElement('span'); b.newEl.className = 'new'; b.newEl.textContent = '新'; b.el.appendChild(b.newEl); }
        else { b.newEl.remove(); b.newEl = null; }
      }
      b.el.classList.toggle('on', st.buildType === t);
      const poor = w.gold < cost;
      b.el.classList.toggle('poor', poor);
      b.cost.textContent = poor ? `差 ${Math.ceil(cost - w.gold)}` : cost;
      b.cost.style.color = poor ? 'var(--red)' : '';
      b.tier.style.background = TIER_HEX[ct];
    }

    $('hint').style.display = w.state === 'plan' ? 'block' : 'none';
    document.querySelectorAll('#hint [data-mode]').forEach(el => el.classList.toggle('on', el.dataset.mode === st.mode));
    $('mode-note').textContent = st.mode === 'endless'
      ? `無限模式：沒有終點，每 5 夜一隻首領，第 11 夜起有詞綴。${this.bestDays ? `最佳紀錄 ${this.bestDays} 天。` : ''}`
      : '一般模式：撐到第 11 天黎明即勝利；第 5、10 夜各有一隻首領。';
    if (w.state === 'plan') {
      document.querySelectorAll('#cores [data-core]').forEach(el => {
        const k = +el.dataset.core;
        el.classList.toggle('on', k === w.coreType);
        el.classList.toggle('locked', !st.coreUnlocked[k]);
      });
      const ct = CORE_TYPES[w.coreType];
      $('core-note').innerHTML = `<b>${ct.name}核心</b>：${ct.desc}${ct.cost !== '無' ? `　代價：${ct.cost}` : ''}`;
      $('guide-cb').checked = !!st.guide;
      $('guide-toggle').style.display = st.mode === 'endless' ? 'none' : '';
    }
    this.updateExtras(w, st);
    this.updateCards(w, st);
    this.updateOwned(w);
    this.updateLab(w);
    // 說明面板放在資源面板正下方（資源面板高度會隨卡片變化）
    const rb = $('res').getBoundingClientRect().bottom + 8;
    if (Math.abs((this.helpTop || 0) - rb) > 1) { this.helpTop = rb; $('help').style.top = rb + 'px'; $('help-btn').style.top = rb + 'px'; }
    $('lab-btn').style.display = w.state === 'run' || w.state === 'plan' ? '' : 'none';
    if (st.multi.length) this.updateMulti(w, st.multi); else this.updateSel(w, st.selected);

    // 觸控工具列
    if (st.touch) {
      $('tb-play').textContent = w.state === 'plan' ? '開始' : (w.state === 'won' || w.state === 'lost') ? '再來' : st.paused ? '繼續' : '暫停';
      $('tb-speed').textContent = `${st.speed}×`;
      $('tb-vol').textContent = st.muted ? '靜音' : `音量${st.volumeName}`;
      $('tb-box').classList.toggle('on', st.boxMode);
      $('tb-burst').style.display = w.state === 'run' && w.phase >= P_DUSK ? '' : 'none';
      $('tb-burst').disabled = !!w.canBurst();
      $('tb-box').style.display = st.buildType ? 'none' : '';
      $('tb-rect').style.display = st.buildType ? '' : 'none';
      $('tb-rect').textContent = !st.rectMode ? '畫線' : st.rectFill ? '實心' : '外框';
      $('tb-cancel').style.display = (st.buildType || st.selected >= 0 || st.multi.length) ? '' : 'none';
    }

    const perf = $('perf');
    perf.style.display = this.perfOn ? 'block' : 'none';
    if (this.perfOn) {
      const p = st.perf;
      perf.innerHTML = `FPS <b>${p.fps.toFixed(0)}</b>　敵人 <b>${fmt(w.n)}</b><br>子彈 <b>${fmt(w.nb)}</b>　粒子 <b>${fmt(p.particles)}</b><br>` +
        `模擬 <b>${p.simMs.toFixed(2)}</b> ms/步　渲染 <b>${p.renderMs.toFixed(2)}</b> ms<br>實例 <b>${fmt(p.instances)}</b>　峰值 <b>${fmt(w.stats.peak)}</b>` +
        (p.degrade ? `<br>自動降級：<b>${p.degrade}</b>` : '');
    }

    const end = $('end');
    // 勝利時等光波掃完再顯示結算，讓破曉的演出看得到
    if ((w.state === 'won' && w.sweepR < 0) || w.state === 'lost') {
      if (end.style.display !== 'flex') {
        end.style.display = 'flex';
        const t = $('end-title');
        t.textContent = w.state === 'won' ? '破曉' : '陷落';
        t.className = w.state === 'won' ? 'win' : 'lose';
        const mins = Math.floor(st.playTime / 60), secs = Math.floor(st.playTime % 60);
        const survived = w.state === 'won' ? w.totalDays : w.day - 1;
        const dayRow = w.endless
          ? ['存活天數', `${survived} 天${this.lastWasBest ? '・新紀錄！' : this.bestDays ? `（最佳 ${this.bestDays}）` : ''}`]
          : ['存活天數', `${survived} / ${w.totalDays}`];
        $('end-stats').innerHTML = [
          dayRow, ['核心', CORE_TYPES[w.coreType].name], ['總擊殺', fmt(w.stats.kills)],
          ['擊倒首領', w.stats.bossKilled.length ? w.stats.bossKilled.map(t => ENEMY_DEFS[t].name).join('、') : '0'],
          ['卡片', `${w.cards.length} 張`], ['暗晶淨化', `${fmt(w.stats.purified)} 晶`], ['峰值同屏敵人', fmt(w.stats.peak)],
          ['建築總數', fmt(w.stats.built)], ['遊玩時間', `${mins}:${String(secs).padStart(2, '0')}`],
        ].map(([a, b]) => `<tr><td>${a}</td><td class="mono">${b}</td></tr>`).join('');
        $('unlocks').innerHTML = (st.unlockMsgs || []).map(m => `解鎖：${m}`).join('<br>');
        $('endless-btn').style.display = w.state === 'won' && !w.endless ? 'inline-block' : 'none';
      }
    } else end.style.display = 'none';
  }

  /** 時間軸下方：今晚詞綴、首領預告 */
  updateExtras(w, st) {
    const parts = [];
    if (w.newEnemy >= 0 && w.phase >= P_DUSK) parts.push(`<span class="mut">新敵人：<b>${ENEMY_DEFS[w.newEnemy].name}</b>（${ENEMY_DEFS[w.newEnemy].desc}）</span>`);
    if (w.mutList.length) parts.push(`<span class="mut">今晚詞綴：${w.mutList.map(id => `<b>${MUT_BY_ID[id].name}</b>（${MUT_BY_ID[id].desc}）`).join('、')}</span>`);
    const nb = w.nextBoss;
    if (nb && w.state === 'run' && (w.day < nb.day || (w.day === nb.day && w.phase < P_DUSK))) {
      const d = ENEMY_DEFS[nb.type];
      parts.push(`<span class="boss">${w.day < nb.day ? '明晚' : '今晚'}首領：<b>${d.name}</b>・弱點：${d.weak}</span>`);
    }
    const html = parts.join('<br>');
    const el = $('tl-extra');
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; el.style.display = html ? 'block' : 'none'; }
    // 光爆按鈕
    const bb = $('burst-btn');
    const why = w.canBurst();
    bb.disabled = !!why;
    bb.classList.toggle('ready', !why && w.bhp[w.core] < w.bmax[w.core] * 0.6);
    bb.style.display = w.state === 'run' ? '' : 'none';
    const left = w.mods.burstUses - w.burstsUsed;
    bb.firstChild.textContent = why && w.phase >= P_DUSK ? '光爆（今晚已用）' : `光爆${left > 1 ? ` ×${left}` : ''}`;
  }

  /** 黎明卡片面板 */
  updateCards(w, st) {
    const el = $('cards');
    const o = w.state === 'run' ? w.offers[0] : null;
    if (!o) { if (el.style.display !== 'none') { el.style.display = 'none'; this.cardsKey = ''; this.cardsMin = false; } return; }
    const key = `${o.cards.join()}|${o.rerolled}|${this.cardsMin}|${w.offers.length}|${w.crystal >= w.rerollCost()}`;
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    el.style.display = 'block';
    el.classList.toggle('min', this.cardsMin);
    const legend = o.kind === 'legend';
    const nb = w.nextBoss, counters = nb && nb.day === w.day + 1 ? ENEMY_DEFS[nb.type].counters : [];
    const title = legend ? '首領獎勵：選一張傳說卡' : `黎明抉擇・選一張卡`;
    const more = w.offers.length > 1 ? `（還有 ${w.offers.length - 1} 組）` : '';
    if (this.cardsMin) { el.innerHTML = `<div class="head"><b>${title}${more}</b><span style="color:var(--dim)">點這裡展開</span></div>`; return; }
    el.innerHTML = `<div class="head"><b>${title}${more}</b><span class="ctl">` +
      (legend || o.rerolled ? '' : `<button data-act="reroll" ${w.crystal >= w.rerollCost() ? '' : 'disabled'}>重抽（${w.rerollCost()} 晶）</button>`) +
      `<button data-act="min">收起</button></span></div><div class="row">` +
      o.cards.map(id => {
        const c = CARD_BY_ID[id], sc = SCHOOLS[c.school];
        return `<button class="card" data-card="${id}" data-tip="card:${id}" style="--sc:${sc.color}"><div class="sc">${sc.name}${counters.includes(id) ? '<span class="tag">對策</span>' : ''}</div>` +
          `<div class="nm">${c.name}</div><div class="tx">${c.text}</div></button>`;
      }).join('') + `</div>`;
    el.querySelectorAll('button').forEach(b => { b.tabIndex = -1; });
  }

  /** 已持有的卡（資源面板下方的小標籤） */
  updateOwned(w) {
    const key = w.cards.join();
    if (key === this.ownedKey) return;
    this.ownedKey = key;
    $('owned').innerHTML = w.cards.map(id => {
      const c = CARD_BY_ID[id], col = SCHOOLS[c.school].color;
      return `<span data-tip="card:${id}" style="color:${col};border-color:${col}55">${c.name}</span>`;
    }).join('');
  }

  /** 多選面板：依類型統計，批次升級／賣出 */
  updateMulti(w, list) {
    const el = $('sel');
    el.style.display = 'block';
    const groups = new Map();
    let canUp = 0, needBr = 0, gold = 0, crystal = 0, towers = 0, refundG = 0, refundC = 0;
    for (const b of list) {
      const key = `${w.bt[b]}|${w.btier[b]}`;
      groups.set(key, (groups.get(key) || 0) + 1);
      const info = w.upgradeInfo(b);
      if (info.cost && !info.reason?.startsWith('核心') && info.reason !== '已是最高階級') {
        if (info.needBranch) needBr++; else canUp++;
        gold += info.cost.gold; crystal += info.cost.crystal;
      }
      if (ATTACK_TOWERS.has(w.bt[b])) towers++;
      if (b !== w.core) { const r = w.sellRefund(b); refundG += r.gold; refundC += r.crystal; }
    }
    const key = `M|${list.join(',')}|${list.map(b => w.btier[b] + '' + w.bbranch[b]).join('')}|${Math.floor(w.gold / 50)}|${Math.floor(w.crystal / 5)}`;
    if (this.selKey === key) return;
    this.selKey = key;
    const rows = [...groups.entries()].sort().map(([k, n]) => {
      const [t, tier] = k.split('|').map(Number);
      return `<tr><td><span class="tier-dot" style="background:${TIER_HEX[tier]}"></span>${BUILD_DEFS[t].name}</td><td>× ${n}</td></tr>`;
    }).join('');
    const enough = w.gold >= gold && w.crystal >= crystal;
    el.innerHTML = `<h3>已選取 ${list.length} 座</h3><div class="sub">升級時由低階往高階依序處理，資源用完就停</div>
      <table class="mono">${rows}</table>
      <div class="up">
        <div class="cost">全部升一階：${this.costHtml({ gold, crystal })}${enough ? '' : '<span style="color:var(--red)">（不夠全部）</span>'}</div>
        <div class="btns"><button id="m-up" ${canUp ? '' : 'disabled'}>升級 ${canUp} 座（U）</button></div>
        ${needBr ? `<div class="delta">${needBr} 座要升紫色，選一個分支：</div><div class="btns"><button data-br="1">分支 A（Z）</button><button data-br="2">分支 B（C）</button></div>` : ''}
      </div>
      <div class="btns">
        ${towers ? '<button id="m-strat">切換目標（T）</button>' : ''}
        <button id="m-sell">賣出全部 +${fmt(refundG)}${refundC ? ` +${fmt(refundC)}晶` : ''}（X）</button>
      </div>`;
    el.querySelectorAll('button').forEach(bt => { bt.tabIndex = -1; });
    if ($('m-up')) $('m-up').onclick = () => this.h.upgrade(0);
    el.querySelectorAll('[data-br]').forEach(bt => { bt.onclick = () => this.h.upgrade(+bt.dataset.br); });
    if ($('m-strat')) $('m-strat').onclick = () => this.h.cycleStrategy();
    $('m-sell').onclick = () => this.h.sell();
  }

  /** 空地／岩石／晶脈／藍圖／殘影的說明 */
  cellInfo(w, ci) {
    if (w.bpAt[ci]) { const p = w.blueprints.find(q => q.c === ci); return `<b style="color:var(--cyan)">藍圖：${BUILD_DEFS[p.type].name}</b><br>錢夠時依放置順序自動建造（排第 ${w.blueprints.indexOf(p) + 1}）。<br>右鍵（手機：長按）移除。`; }
    if (w.ghostAt[ci]) { const g = w.ghosts.find(q => q.c === ci); return `<b>殘影：${BUILD_DEFS[g.type].name}</b>（${TIER_NAMES[g.tier]}）<br>下一個黎明會被光波免費復活。<br>右鍵（手機：長按）移除。`; }
    const tr = w.terrain[ci];
    if (tr === 1) return '<b>岩石</b><br>不可建造、不可通行。';
    if (tr === 2) return '<b style="color:var(--cyan)">晶脈</b><br>只有晶脈能蓋晶礦（3）。離核心越遠的晶脈越大。';
    return '';
  }
  showCellInfo(w, ci) { const h = this.cellInfo(w, ci); if (h) this.toast(h.replace(/<br>/g, '　').replace(/<[^>]+>/g, '')); }

  costHtml(cost) {
    return `<span class="g">${fmt(cost.gold)} 金</span>` + (cost.crystal ? `　<span class="c">${fmt(cost.crystal)} 晶</span>` : '');
  }

  updateSel(w, b) {
    const el = $('sel');
    if (b < 0 || !w.balive[b]) { el.style.display = 'none'; this.selKey = ''; return; }
    if (this.selKey.startsWith('M|')) this.selKey = '';
    el.style.display = 'block';
    const isCore = b === w.core;
    const t = w.bt[b], d = BUILD_DEFS[t], tier = w.btier[b], br = w.bbranch[b];
    const info = w.upgradeInfo(b);
    const asc = isCore ? null : w.ascendInfo(b);
    if (this.gemPickB !== b) { this.gemPickB = b; this.gemPick = -1; }
    const key = `${b}|${tier}|${br}|${info.reason}|${w.phase === P_DAWN}|${w.bstars[b]}|${w.basc[b]}|${asc && asc.reason}|${w.bgem0[b]}|${w.bgem1[b]}|${this.gemPick}|${w.gems.length}|${w.maxTier()}`;
    const buff = w.dawnBuffActive() ? DAWN_BUFF : 1;
    if (this.selKey !== key) {
      this.selKey = key;
      const isTower = ATTACK_TOWERS.has(t);
      const brName = br ? d.branches[br - 1].name : '';
      let up = '';
      if (tier < w.maxTier()) {
        const next = tier + 1;
        let delta = '';
        if (isCore) delta = CORE_UP_DESC[next];
        else {
          const a = statRows(t, statsOf(t, tier, br)), bb = statRows(t, statsOf(t, next, 0));
          delta = bb.map((r, i) => (a[i] && r[2] !== undefined && a[i][2] !== r[2]) ? `${r[0]} ${a[i][1]} → ${r[1]}` : '').filter(Boolean).slice(0, 3).join('<br>');
        }
        up = `<div class="up"><div class="cost">升到 <span class="tier-dot" style="background:${TIER_HEX[next]}"></span>${TIER_NAMES[next]}：${this.costHtml(info.cost)}</div>
          <div class="delta">${delta}</div>`;
        if (info.needBranch) {
          up += `<div class="branch">${d.branches.map((x, i) => `<button data-br="${i + 1}" ${info.reason ? 'disabled' : ''} title="${i ? 'C' : 'Z'}"><b>${i ? 'C' : 'Z'}・${x.name}</b><span>${x.desc}</span></button>`).join('')}</div>`;
        } else {
          up += `<div class="btns"><button id="sel-up" ${info.reason ? 'disabled' : ''} title="U">升級（U）</button></div>`;
        }
        if (info.reason) up += `<div class="why">${info.reason}</div>`;
      } else up = `<div class="up"><div class="cost">已是最高階級</div></div>`;
      // 晶核槽
      const slots = w.gemSlots(b);
      if (slots) {
        up += `<div class="up"><div class="cost">晶核槽</div><div class="btns">` + [0, 1].slice(0, slots).map(k => {
          const code = (k ? w.bgem1 : w.bgem0)[b];
          return code ? `<button data-sock="${k}" title="點一下取下">${gemHtml(code >> 2, code & 3)}・${GEM_TYPES[code >> 2].desc(code & 3)}</button>`
            : `<button data-sock="${k}">＋ 鑲嵌晶核</button>`;
        }).join('') + `</div>` + (this.gemPick >= 0 ? `<div class="gem-pick">${w.gems.length ? w.gems.map((g, i) => `<button data-gem="${i}">${gemHtml(g.t, g.r)} ${GEM_RARITY[g.r]}・${GEM_TYPES[g.t].desc(g.r)}</button>`).join('') : '<span class="dim">背包裡沒有晶核</span>'}</div>` : '') + `</div>`;
      }
      // 昇華（紫色 5 星）
      if (!isCore && ASCEND_NAMES[t]) {
        if (w.basc[b]) up += `<div class="up"><div class="cost" style="color:#ffe1a0">已昇華：${ASCEND_NAMES[t]}</div><div class="delta">${ASCEND_DESC[t]}</div></div>`;
        else if (tier === 3) up += `<div class="up"><div class="cost">昇華：<b style="color:#ffe1a0">${ASCEND_NAMES[t]}</b>　<span class="c">${ASCEND_COST} 晶</span></div>` +
          `<div class="delta">${ASCEND_DESC[t]}</div><div class="btns"><button id="sel-asc" ${asc.reason ? 'disabled' : ''}>昇華</button></div>` +
          (asc.reason ? `<div class="why">${asc.reason}</div>` : '') + `</div>`;
      }
      el.innerHTML = `<h3><span class="tier-dot" style="background:${TIER_HEX[tier]}"></span>${d.name}${brName ? `<span class="tag">${brName}</span>` : ''}</h3>
        <div class="sub">階級：${TIER_NAMES[tier]}${isCore ? `（所有建築的階級上限）・${CORE_TYPES[w.coreType].name}核心` : ''}</div>
        ${isCore ? '' : `<div class="mono" id="sel-star" style="font-size:12px;margin-bottom:4px"></div>`}
        <div class="mono" id="sel-hp"></div><div class="hpbar"><div id="sel-hpf"></div></div>
        <table class="mono" id="sel-stats"></table>
        ${up}
        <div class="btns">
          ${isTower ? '<button id="sel-strat" title="T"></button>' : ''}
          ${!isCore ? '<button id="sel-sell" title="X"></button>' : ''}
        </div>`;
      el.querySelectorAll('button').forEach(bt => { bt.tabIndex = -1; });
      if ($('sel-up')) $('sel-up').onclick = e => this.h.upgrade(e.shiftKey ? 'all' : 0);
      if ($('sel-asc')) $('sel-asc').onclick = () => this.h.ascend();
      el.querySelectorAll('[data-sock]').forEach(bt => { bt.onclick = () => {
        const k = +bt.dataset.sock, code = (k ? w.bgem1 : w.bgem0)[b];
        if (code) { this.h.unsocket(b, k); this.gemPick = -1; } else this.gemPick = this.gemPick === k ? -1 : k;
        this.selKey = '';
      }; });
      el.querySelectorAll('[data-gem]').forEach(bt => { bt.onclick = () => { this.h.socket(b, this.gemPick, +bt.dataset.gem); this.gemPick = -1; this.selKey = ''; }; });
      el.querySelectorAll('[data-br]').forEach(bt => { bt.onclick = () => this.h.upgrade(+bt.dataset.br); });
      if ($('sel-strat')) $('sel-strat').onclick = () => this.h.cycleStrategy();
      if ($('sel-sell')) $('sel-sell').onclick = () => this.h.sell();
    }
    $('sel-hp').textContent = `血量 ${fmt(Math.max(0, w.bhp[b]))} / ${fmt(w.bmax[b])}`;
    const se = $('sel-star');
    if (se) {
      const stars = w.bstars[b], att = ATTACK_TOWERS.has(t);
      const prog = stars >= 5 ? '滿星' : att ? `擊殺 ${fmt(w.bkills[b])} / ${fmt(STAR_KILLS[stars])}` : '每撐過一夜 +1 星';
      se.innerHTML = `<span style="color:var(--gold)">${'★'.repeat(stars)}</span><span style="opacity:.3">${'★'.repeat(5 - stars)}</span>　<span style="color:var(--dim)">${prog}</span>`;
    }
    $('sel-hpf').style.width = (Math.max(0, w.bhp[b]) / w.bmax[b] * 100) + '%';
    let rows;
    if (isCore) {
      const cs = coreStats(tier);
      rows = [['產出', `+${f1(cs.gold)} 金・+${cs.crystal.toFixed(2)} 晶/秒`]];
      if (cs.pulse) rows.push(['夜間脈衝', `${cs.pulse.dmg} 傷害・半徑 ${cs.pulse.radius}・每 ${cs.pulse.period} 秒`]);
      rows.push(['黎明增益', `${cs.dawnBuffLen} 秒`]);
    } else {
      rows = statRows(t, w.bstats[b], buff, { rate: w.brateM[b], prod: w.bprodM[b] }).slice(1);
      if (w.brateM[b] > 1 && ATTACK_TOWERS.has(t)) rows.push(['增幅', `攻速 +${Math.round((w.brateM[b] - 1) * 100)}%`]);
      if (w.bprodM[b] > 1 && (t === B_GOLD || t === B_CRYSTAL)) rows.push(['增幅', `產量 +${Math.round((w.bprodM[b] - 1) * 100)}%`]);
      if (w.bdis[b] > w.time) rows.push(['狀態', '<span style="color:var(--red)">停機中</span>']);
    }
    $('sel-stats').innerHTML = rows.map(([a, v]) => `<tr><td>${a}</td><td>${v}</td></tr>`).join('');
    const s = $('sel-strat'); if (s) s.textContent = `目標：${STRATEGIES[w.bstrat[b]]}（T）`;
    const sell = $('sel-sell'); if (sell) {
      const r = w.sellRefund(b);
      sell.textContent = `賣出 +${r.gold}${r.crystal ? ` +${r.crystal}晶` : ''}${r.full ? ' 全額' : ''}（X）`;
    }
  }

  tipFor(w, key) {
    if (key === 'burst') {
      const ct = CORE_TYPES[w.coreType];
      return `<b>光爆</b>　${ct.name}核心<br>${ct.burst}<br>每夜限 ${w.mods.burstUses} 次，只能在黃昏或夜晚使用。<br><span style="color:var(--red)">消耗核心目前血量的 20%。</span>`;
    }
    if (key.startsWith('card:')) {
      const c = CARD_BY_ID[key.slice(5)], sc = SCHOOLS[c.school];
      return `<b>${c.name}</b>　<span style="color:${sc.color}">${sc.name}</span><br>${c.tip}`;
    }
    if (key.startsWith('core:')) {
      const c = CORE_TYPES[+key.slice(5)];
      return `<b>${c.name}核心</b><br>${c.desc}<br>代價：${c.cost}<br>光爆：${c.burst}` + (c.unlock ? `<br><span style="opacity:.6">解鎖條件：${c.unlock}</span>` : '');
    }
    if (key === 'res') return `<b>金</b>：建造與升級。核心與金礦產出，黎明時礦產量 +30%。<br><b style="color:var(--cyan)">晶</b>：升到綠色以上、核心升級。核心少量產出、晶礦（只能蓋在晶脈上）、菁英敵人掉落。<br>擊殺一般敵人不給錢。`;
    if (key.startsWith('build:')) {
      const t = +key.slice(6), d = BUILD_DEFS[t];
      const rows = statRows(t, statsOf(t, 0, 0)).map(r => `${r[0]} ${r[1]}`).join('・');
      const br = d.branches ? `<br><span style="opacity:.65">紫色分支：${d.branches.map(b => b.name).join(' ／ ')}</span>` : '';
      return `<b>${d.name}</b>　<span style="color:var(--gold)">${d.cost} 金</span>　[${d.key}]<br>${d.desc}<br>${rows}${br}`;
    }
    return '';
  }

  showTip(html, x, y) {
    const tip = $('tip');
    if (!html) { tip.style.display = 'none'; return; }
    tip.innerHTML = html; tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, x + 14) + 'px';
    tip.style.top = Math.min(window.innerHeight - r.height - 8, y + 16) + 'px';
  }
}

export function enemyTip(w, i) {
  const t = w.et[i], d = ENEMY_DEFS[t], el = w.eelite[i];
  return `<b style="color:#ff6a5c">${el ? '菁英・' : ''}${d.name}</b><br>血量 ${Math.ceil(w.ehp[i])} / ${Math.ceil(w.emax[i])}・速度 ${d.speed} 格/秒<br>` +
    `拆建築 ${d.dps * (el ? ELITE_DPS : 1)}/秒${E_ARMOR[t] ? `・護甲 ${E_ARMOR[t]}` : ''}<br>${d.desc}` +
    (el ? `<br><span style="color:var(--gold)">菁英：血量 ×${ELITE_HP}、傷害 ×${ELITE_DPS}，死亡掉晶</span>` : '');
}

export function buildingTip(w, b) {
  const t = w.bt[b], d = BUILD_DEFS[t], br = w.bbranch[b];
  return `<b>${d.name}</b>${br ? `（${d.branches[br - 1].name}）` : ''}　<span style="color:${TIER_HEX[w.btier[b]]}">●</span> ${TIER_NAMES[w.btier[b]]}<br>` +
    `血量 ${Math.ceil(w.bhp[b])} / ${fmt(w.bmax[b])}<br>${d.desc}<br><span style="opacity:.6">左鍵選取</span>`;
}
