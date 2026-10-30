// 新手引導：參考宮本茂「用關卡安排來教」的做法，分散在前五天。
//  ・建築逐日解鎖（第 1 天只有牆、金礦、箭塔），一次只出現一個新東西
//  ・第一夜敵人少、只從一個方向來（在模擬端調整），讓玩家安全地第一次失敗
//  ・只在「剛好需要」的時刻出現一句提示，做到就消失，不擋操作、不暫停
//  ・玩家隨時可以關掉；不強迫照順序做
import { B_WALL, B_GOLD, B_CRYSTAL, B_ARROW, B_CANNON, B_FROST, B_AMP, B_LIGHT, CORE_CX, CORE_CY, P_DAWN, P_DUSK, P_NIGHT } from '../sim/defs.js';

const $ = id => document.getElementById(id);
const count = (w, type, minTier = 0) => {
  let n = 0;
  for (let b = 1; b < w.bHigh; b++) if (w.balive[b] && w.bt[b] === type && w.btier[b] >= minTier) n++;
  return n;
};
const total = w => { let n = 0; for (let b = 1; b < w.bHigh; b++) n += w.balive[b]; return n; };
const CORE = { x: CORE_CX, y: CORE_CY, r: 2.4 };

/**
 * 每則提示：
 *  when(w, v)  出現條件　done(w, v) 完成條件（做到就消失）　ttl 純說明的顯示秒數
 *  hl 要閃爍的 DOM　mark(w) 地圖上要圈的位置
 */
function hints(touch) {
  const k = (desk, tch) => touch ? tch : desk;
  return [
    { id: 'arrow', when: w => w.day === 1 && w.phase < P_DUSK, done: w => count(w, B_ARROW) >= 1,
      text: () => k('先點下方的<b>箭塔</b>，再點核心旁邊的空地。', '先點下方的<b>箭塔</b>，再點核心旁邊的空地。'),
      hl: `.bbtn[data-tip="build:${B_ARROW}"]`, mark: () => CORE },
    { id: 'gold', when: w => w.day === 1 && w.phase < P_DUSK && count(w, B_ARROW) >= 1, done: w => count(w, B_GOLD) >= 2,
      text: () => '<b>金礦</b>會一直產金。在核心附近蓋兩座。', hl: `.bbtn[data-tip="build:${B_GOLD}"]` },
    { id: 'start', when: w => w.state === 'plan' && count(w, B_GOLD) >= 1, done: w => w.state !== 'plan',
      text: () => k('準備好就按<b>空白鍵</b>開始。第一個白天很平靜，也可以邊玩邊蓋。', '準備好就點<b>開始</b>。第一個白天很平靜，也可以邊玩邊蓋。'),
      hl: touch ? '#tb-play, #start-btn' : '#start-btn' },
    { id: 'dusk1', when: w => w.day === 1 && w.phase === P_DUSK, done: w => count(w, B_WALL) >= 6 || w.day > 1,
      text: () => k('天色變暗了。<b>紅色箭頭</b>是今晚敵人來的方向。<br>按 <kbd>1</kbd> 選<b>牆</b>，在那一側<b>拖曳</b>畫一排。拖過頭就往回拉。',
        '天色變暗了。<b>紅色箭頭</b>是今晚敵人來的方向。<br>選<b>牆</b>，在那一側<b>拖曳</b>畫一排。拖過頭就往回拉。'),
      hl: `.bbtn[data-tip="build:${B_WALL}"]` },
    { id: 'night1', when: w => w.day === 1 && w.phase === P_NIGHT, ttl: 9,
      text: () => '敵人會拆牆，或繞遠路找縫隙。撐到黎明就好。' },
    { id: 'ghost', when: w => w.ghosts.length > 0 && w.day <= 5, ttl: 10,
      text: () => '被拆的建築會留下<b>虛線殘影</b>。黎明的光波掃過時，它會免費復活。' },
    { id: 'card', when: w => w.offers.length > 0, done: w => w.offers.length === 0,
      text: () => '撐過一夜了！每個黎明可以選<b>一張卡</b>，它會讓這一局的防線永久變強。<br>到黃昏還沒選，會自動拿第一張。', hl: '#cards' },
    { id: 'dark', when: w => w.phase <= 1 && w.state === 'run' && w.lastPurify >= 1, ttl: 9,
      text: w => `夜裡擊殺留下的紫色<b>暗晶</b>，被黎明光波掃過就變成晶（今天 +${Math.round(w.lastPurify)} 晶）。` },
    { id: 'crystal', when: w => w.isUnlocked(B_CRYSTAL) && w.day >= 2 && w.phase <= 1, done: w => count(w, B_CRYSTAL) >= 1 || w.day >= 4,
      text: () => '新建築：<b>晶礦</b>。只能蓋在地圖上<b style="color:var(--cyan)">青色的晶脈</b>，晶用來升級。', hl: `.bbtn[data-tip="build:${B_CRYSTAL}"]` },
    { id: 'coreup', when: w => w.coreTier === 0 && w.state === 'run' && !w.upgradeInfo(w.core).reason, done: w => w.coreTier >= 1,
      text: () => k('核心可以升級了：<b>點一下核心</b>，再按 <kbd>U</kbd>。<br>核心的階級是所有建築的上限。', '核心可以升級了：<b>點一下核心</b>，再點面板上的「升級」。<br>核心的階級是所有建築的上限。'),
      mark: () => CORE },
    { id: 'towerup', when: w => w.coreTier >= 1 && count(w, B_ARROW) > 0 && w.gold >= 50 && w.crystal >= 4, done: w => count(w, B_ARROW, 1) >= 1,
      text: () => k('塔也能升級了。點一座箭塔按 <kbd>U</kbd>；<kbd>Shift</kbd>+<kbd>U</kbd> 一次升級全部同類。', '塔也能升級了。點一座箭塔，再點面板上的「升級」。'),
      mark: w => { for (let b = 1; b < w.bHigh; b++) if (w.balive[b] && w.bt[b] === B_ARROW) return { x: w.bx[b] + 0.5, y: w.by[b] + 0.5, r: 1 }; return null; } },
    { id: 'star', when: w => w.stats.maxStars >= 1, ttl: 9,
      text: () => '打得越多，塔的<b style="color:var(--gold)">星級 ★</b> 越高，數值也跟著變強。牆和礦則是每撐過一夜升一星。' },
    { id: 'cannon', when: w => w.isUnlocked(B_CANNON) && w.day >= 3, ttl: 10,
      text: () => '新建築：<b>散射塔</b>近距離清場，<b>砲塔</b>專治密集的潮水。', hl: `.bbtn[data-tip="build:${B_CANNON}"]` },
    { id: 'multi', when: w => total(w) >= 16 && w.state === 'run' && w.phase <= 1, done: (w, v) => v.multi.length >= 2, ttl: 16,
      text: () => k('在<b>空地上拖曳</b>可以框選多座建築，一起升級或賣出；<b>雙擊</b>建築＝選畫面內同類。', '右側「<b>框選</b>」打開後拖曳，可以一次選多座建築；<b>連點兩下</b>建築＝選畫面內同類。'),
      hl: touch ? '#tb-box' : null },
    { id: 'boss', when: w => !!w.nextBoss && w.day < w.nextBoss.day, ttl: 14,
      text: () => '明晚有<b>首領</b>！上方寫著它的弱點；今天的卡裡標著「對策」的那張專門剋它。', hl: '#tl-extra' },
    { id: 'frost', when: w => w.isUnlocked(B_FROST) && w.day >= 4, ttl: 10,
      text: () => '新建築：<b>冰晶塔</b>讓範圍內的敵人變慢，<b>稜鏡塔</b>射出貫穿整條線的雷射。', hl: `.bbtn[data-tip="build:${B_FROST}"]` },
    { id: 'burst', when: w => w.day >= 3 && w.phase >= P_DUSK && w.state === 'run' && !w.canBurst() && (w.bhp[w.core] < w.bmax[w.core] * 0.7 || w.day === 5),
      done: w => w.stats.bursts > 0, ttl: 14,
      text: () => k('危急時按 <kbd>Q</kbd> 放出<b>光爆</b>，代價是核心 20% 的血。每夜一次。', '危急時點右側的<b>光爆</b>，代價是核心 20% 的血。每夜一次。'),
      hl: touch ? '#tb-burst' : '#burst-btn' },
    { id: 'light', when: w => w.day >= 2 && w.phase <= 1 && w.state === 'run' && w.typeCount[B_LIGHT] === 0 && w.isUnlocked(B_LIGHT), done: w => w.typeCount[B_LIGHT] > 0, ttl: 20,
      text: () => k('地圖上<b>暗的地方不能建造</b>。按 <kbd>0</kbd> 選<b>燈塔</b>，蓋在亮區邊緣就能照亮外面；遠處有更大的晶脈和<b style="color:#ffd27a">遺跡</b>。',
        '地圖上<b>暗的地方不能建造</b>。選<b>燈塔</b>蓋在亮區邊緣就能照亮外面；遠處有更大的晶脈和<b style="color:#ffd27a">遺跡</b>。'),
      hl: `.bbtn[data-tip="build:${B_LIGHT}"]` },
    { id: 'ruin', when: w => w.ruins && w.ruins.some(r => r.claimed), ttl: 10,
      text: () => '照亮遺跡就能領獎勵：晶、金、晶核，或多選一張卡。' },
    { id: 'lab', when: w => w.day >= 3 && w.crystal >= 120 && w.research.size === 0 && w.phase <= 1, done: w => w.research.size > 0, ttl: 20,
      text: () => k('晶夠了：按 <kbd>G</kbd> 打開<b>研究</b>，可以解鎖新建築（地刺、雷擊塔、維修站）和能力。', '晶夠了：點右側「<b>研究</b>」，可以解鎖新建築（地刺、雷擊塔、維修站）和能力。'),
      hl: touch ? '#tb-lab' : '#lab-btn' },
    { id: 'gem', when: w => w.gems.length > 0, ttl: 14,
      text: () => '拿到<b>晶核</b>了！紫色以上的攻擊塔可以鑲嵌：點塔，在面板裡按「鑲嵌晶核」。' },
    { id: 'amp', when: w => w.day >= 5 && w.phase === P_DAWN && w.isUnlocked(B_AMP), ttl: 12,
      text: () => '最後一種建築<b>增幅塔</b>解鎖了：讓周圍的塔打得更快、礦產得更多。<br>引導到這裡結束，接下來就交給你了！', hl: `.bbtn[data-tip="build:${B_AMP}"]`, final: true },
  ];
}

export class Guide {
  constructor(env) {
    this.env = env;        // { world, view, touch, onDone }
    this.list = hints(env.touch);
    this.seen = new Set();
    this.cur = null; this.t0 = 0; this.html = '';
    this.active = false;
    $('guide').addEventListener('click', e => { if (e.target.closest('[data-x]')) this.dismiss(); });
  }
  start() { this.active = true; this.seen.clear(); this.cur = null; this.html = ''; document.body.classList.add('tut-on'); }
  stop(finished) {
    this.active = false; this.hide();
    document.body.classList.remove('tut-on');
    if (finished) this.env.onDone();
  }
  hide() {
    this.cur = null; this.env.view.tutMark = null;
    document.querySelectorAll('.tut-hl').forEach(el => el.classList.remove('tut-hl'));
    $('guide').style.display = 'none'; this.html = '';
  }
  dismiss() { if (this.cur) { this.seen.add(this.cur.id); if (this.cur.final) { this.stop(true); return; } } this.hide(); }

  update() {
    if (!this.active) return;
    const w = this.env.world, v = this.env.view;
    if (!w.guide || w.state === 'won' || w.state === 'lost') { if (this.cur) this.hide(); return; }
    if (w.day >= 6) { this.stop(true); return; }
    const now = performance.now() / 1000;
    if (this.cur) {
      const h = this.cur;
      const doneNow = h.done && h.done(w, v);
      const expired = h.ttl && now - this.t0 > h.ttl;
      const gone = !h.ttl && now - this.t0 > 3 && !h.when(w, v); // 情境過了：先收起來，之後條件再成立會再出現
      if (doneNow || expired) { this.seen.add(h.id); if (h.final) { this.stop(true); return; } this.hide(); }
      else if (gone) this.hide();
    }
    if (!this.cur) {
      for (const h of this.list) {
        if (this.seen.has(h.id)) continue;
        if (h.done && h.done(w, v)) { this.seen.add(h.id); continue; }
        if (h.when(w, v)) { this.cur = h; this.t0 = now; if (h.hl) document.querySelectorAll(h.hl).forEach(el => el.classList.add('tut-hl')); break; }
      }
      if (!this.cur) return;
    }
    const h = this.cur;
    v.tutMark = h.mark ? h.mark(w) : null;
    const html = `<div class="gh">新手引導<span data-x title="關閉這則提示">知道了 ✕</span></div>${h.text(w)}`;
    if (html !== this.html) {
      this.html = html;
      const el = $('guide');
      el.innerHTML = html; el.style.display = 'block';
    }
  }
}
void P_DAWN;
