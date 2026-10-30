// 程式合成音效（Web Audio）。讀取模擬事件；不影響模擬。
// 同類音效同時最多 6 個，並依當幀事件數量自動降低音量，上萬隻敵人也不會爆音。
import {
  EV_DEATH, EV_BOOM, EV_BUILD, EV_BDESTROY, EV_COREHIT, EV_SHOT, EV_SELL, EV_NIGHT, EV_DAWN, EV_LASER,
  EV_UPGRADE, EV_REVIVE, EV_CRYSTAL, EV_FREEZE, EV_LORDPULSE, EV_COREPULSE, EV_DUSK, EV_LORD,
  EV_CARD, EV_BURST, EV_STAR, EV_PURIFY, EV_BOSSWARN, EV_ASCEND, EV_SPLIT, EV_SUMMON, EV_EAT,
  EV_ZAP, EV_RUIN, EV_GEM, EV_RESEARCH, EV_LIT,
  B_ARROW, B_SCATTER, B_CANNON, E_LORD, E_HEAVY, IS_BOSS,
} from '../sim/defs.js';

const MAX_VOICES = 6;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.35;
    this.voices = new Map(); // 類別 → 結束時間陣列
    this.lastAlarm = 0;
    this.drone = null;
  }

  /** 瀏覽器規定要有使用者操作才能開始播放 */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp.connect(this.master); this.master.connect(ctx.destination);
    // 1 秒白噪音
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v || 0));
    this.muted = this.volume === 0;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  /** 音量循環：高 → 中 → 低 → 靜音 → 高 */
  cycleVolume() {
    const levels = [0.6, 0.35, 0.15, 0];
    const i = levels.findIndex(l => Math.abs(l - (this.muted ? 0 : this.volume)) < 0.01);
    const v = levels[(i + 1) % levels.length];
    if (v === 0) { this.muted = true; if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); return 0; }
    this.setVolume(v);
    return v;
  }
  volumeName() {
    if (this.muted) return '靜音';
    return this.volume >= 0.5 ? '高' : this.volume >= 0.25 ? '中' : '低';
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted && this.volume < 0.01) this.volume = 0.35;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** 取得一個發聲配額；超過上限回傳 false */
  voice(cat, dur, max = MAX_VOICES) {
    const now = this.ctx.currentTime;
    let arr = this.voices.get(cat);
    if (!arr) this.voices.set(cat, arr = []);
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] < now) arr.splice(i, 1);
    if (arr.length >= max) return false;
    arr.push(now + dur);
    return true;
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(type, f0, f1, dur, peak, t = this.ctx.currentTime, attack = 0.004) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, attack, peak, dur);
    o.connect(g); g.connect(this.comp);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  noiseHit(filterType, freq, q, dur, peak, t = this.ctx.currentTime) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, 0.002, peak, dur);
    s.connect(f); f.connect(g); g.connect(this.comp);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ── 各種音效 ──
  shot(kind, k) {
    if (kind === B_CANNON) {
      if (!this.voice('cannon', 0.3, 4)) return;
      this.tone('sine', 110, 38, 0.28, 0.4 * k);
      this.noiseHit('lowpass', 500, 0.7, 0.18, 0.18 * k);
    } else if (kind === B_SCATTER) {
      if (!this.voice('scatter', 0.12, 3)) return;
      this.noiseHit('bandpass', 1800, 1.2, 0.06, 0.14 * k);
    } else {
      if (!this.voice('arrow', 0.12, 3)) return;
      this.noiseHit('bandpass', 3200 + Math.random() * 800, 2, 0.03, 0.07 * k);
    }
  }
  laser(tier, k) {
    if (!this.voice('laser', 0.2, 3)) return;
    const f = 900 + tier * 200;
    this.tone('triangle', f, f * 0.3, 0.16, 0.07 * k);
    this.tone('sine', f * 2, f * 0.6, 0.12, 0.04 * k);
  }
  death(big, k) {
    if (!this.voice(big ? 'deathBig' : 'death', big ? 0.1 : 0.06, big ? 4 : 4)) return;
    if (big) this.noiseHit('lowpass', 900, 1, 0.12, 0.2 * k);
    else this.tone('sine', 900 + Math.random() * 700, 600, 0.018, 0.03 * k);
  }
  boom(k) { if (this.voice('boom', 0.3, 4)) this.noiseHit('lowpass', 420, 0.8, 0.3, 0.25 * k); }
  build() { if (this.voice('ui', 0.1)) this.tone('sine', 620, 880, 0.08, 0.18); }
  sell() { if (this.voice('ui', 0.1)) this.tone('sine', 700, 420, 0.1, 0.16); }
  upgrade(tier) {
    if (!this.voice('ui', 0.3)) return;
    const base = [523, 587, 659, 784][tier] || 523, t = this.ctx.currentTime;
    [1, 1.25, 1.5].forEach((m, i) => this.tone('triangle', base * m, 0, 0.18, 0.13, t + i * 0.06));
  }
  revive() { if (this.voice('revive', 0.2)) this.tone('sine', 880 + Math.random() * 300, 1320, 0.15, 0.06); }
  destroy() { if (this.voice('destroy', 0.25)) { this.noiseHit('lowpass', 700, 0.8, 0.22, 0.3); this.tone('sine', 160, 60, 0.2, 0.25); } }
  crystal() {
    if (!this.voice('crystal', 0.3)) return;
    const t = this.ctx.currentTime;
    [1568, 2093, 2637].forEach((f, i) => this.tone('sine', f, 0, 0.12, 0.06, t + i * 0.04));
  }
  freeze() { if (this.voice('freeze', 0.3)) { this.noiseHit('highpass', 5000, 0.7, 0.25, 0.12); this.tone('sine', 2400, 3200, 0.2, 0.04); } }
  corePulse() { if (this.voice('pulse', 0.3)) this.tone('sine', 220, 440, 0.25, 0.12); }
  coreHit() {
    const now = this.ctx.currentTime;
    if (now - this.lastAlarm < 0.6) return;
    this.lastAlarm = now;
    this.tone('square', 880, 0, 0.12, 0.12, now);
    this.tone('square', 660, 0, 0.14, 0.12, now + 0.13);
  }
  lordPulse() { this.tone('sine', 70, 30, 0.6, 0.6); this.noiseHit('lowpass', 250, 1, 0.5, 0.3); }
  lord() {
    const t = this.ctx.currentTime;
    this.tone('sawtooth', 55, 40, 1.8, 0.25, t, 0.3);
    this.tone('sawtooth', 58, 41, 1.8, 0.2, t, 0.3);
    this.noiseHit('lowpass', 200, 1, 1.5, 0.3, t);
  }

  /** 黃昏：低頻嗡鳴逐漸升起（dur 秒內爬升） */
  duskDrone(dur) {
    this.stopDrone(0.5);
    const ctx = this.ctx, t = ctx.currentTime;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(55, t); o2.frequency.setValueAtTime(55.6, t);
    o1.frequency.linearRampToValueAtTime(65, t + dur); o2.frequency.linearRampToValueAtTime(66, t + dur);
    f.type = 'lowpass'; f.frequency.setValueAtTime(150, t); f.frequency.linearRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + dur);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.comp);
    o1.start(t); o2.start(t);
    this.drone = { o1, o2, g };
  }
  stopDrone(fade = 2) {
    if (!this.drone) return;
    const t = this.ctx.currentTime, d = this.drone;
    d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(Math.max(0.0001, d.g.gain.value), t);
    d.g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    d.o1.stop(t + fade + 0.1); d.o2.stop(t + fade + 0.1);
    this.drone = null;
  }
  /** 夜晚開始：低沉鐘響 */
  bell() {
    const t = this.ctx.currentTime;
    [[110, 0.35], [220, 0.18], [331, 0.1], [442, 0.06], [583, 0.04]].forEach(([f, a]) => this.tone('sine', f, f * 0.995, 3.5, a, t, 0.005));
  }
  /** 黎明：上行和弦 */
  dawnChord(big = false) {
    const t = this.ctx.currentTime;
    const notes = big ? [262, 330, 392, 523, 659, 784] : [262, 330, 392, 523];
    notes.forEach((f, i) => this.tone('triangle', f, 0, big ? 2.5 : 1.6, big ? 0.14 : 0.1, t + i * 0.12, 0.06));
  }
  /** 選卡：短促的上行三音 */
  cardPick() {
    const t = this.ctx.currentTime;
    [523, 659, 988].forEach((f, i) => this.tone('triangle', f, 0, 0.35, 0.09, t + i * 0.06, 0.01));
  }
  /** 光爆：低頻轟鳴＋亮音 */
  burst() {
    const t = this.ctx.currentTime;
    this.tone('sawtooth', 70, 35, 1.2, 0.2, t, 0.01);
    [392, 523, 784, 1046].forEach((f, i) => this.tone('sine', f, 0, 1.4, 0.08, t + 0.05 + i * 0.04, 0.02));
  }
  star() {
    if (!this.voice('star', 0.3)) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 1320, 0, 0.25, 0.05, t, 0.005); this.tone('sine', 1760, 0, 0.3, 0.04, t + 0.07, 0.005);
  }
  ascend() {
    const t = this.ctx.currentTime;
    [262, 392, 523, 784, 1046, 1568].forEach((f, i) => this.tone('triangle', f, 0, 1.6, 0.08, t + i * 0.08, 0.03));
  }
  lose() {
    const t = this.ctx.currentTime;
    [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.9, 0.08, t + i * 0.25, 0.02));
  }

  /** 讀取本幀的模擬事件（不清空；清空由特效系統負責） */
  consume(w, speed) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const n = w.evN;
    if (!n) return;
    let shots = 0, deaths = 0;
    for (let i = 0; i < n; i++) { const t = w.evT[i]; if (t === EV_SHOT) shots++; else if (t === EV_DEATH) deaths++; }
    const kShot = Math.min(1, 1.5 / Math.sqrt(Math.max(1, shots)));
    const kDeath = Math.min(1, 2 / Math.sqrt(Math.max(1, deaths)));
    for (let i = 0; i < n; i++) {
      const t = w.evT[i], a = w.evA[i];
      switch (t) {
        case EV_SHOT: this.shot(a, kShot); break;
        case EV_LASER: this.laser(a, kShot); break;
        case EV_DEATH: this.death(a === E_HEAVY || IS_BOSS[a | 0] || w.evB[i] > 0, kDeath); break;
        case EV_BOOM: this.boom(kShot); break;
        case EV_BUILD: this.build(); break;
        case EV_SELL: this.sell(); break;
        case EV_UPGRADE: this.upgrade(a | 0); break;
        case EV_REVIVE: this.revive(); break;
        case EV_BDESTROY: this.destroy(); break;
        case EV_CRYSTAL: this.crystal(); break;
        case EV_FREEZE: this.freeze(); break;
        case EV_COREPULSE: this.corePulse(); break;
        case EV_COREHIT: this.coreHit(); break;
        case EV_LORDPULSE: this.lordPulse(); break;
        case EV_LORD: this.lord(); break;
        case EV_DUSK: this.duskDrone(25 / Math.max(1, speed)); break;
        case EV_NIGHT: this.stopDrone(3); this.bell(); break;
        case EV_DAWN: this.stopDrone(1); this.dawnChord(a > w.totalDays); break;
        case EV_CARD: this.cardPick(); break;
        case EV_BURST: this.burst(); break;
        case EV_STAR: this.star(); break;
        case EV_PURIFY: if (this.voice('purify', 0.12)) this.tone('sine', 1400 + Math.random() * 600, 0, 0.12, 0.03, this.ctx.currentTime, 0.002); break;
        case EV_BOSSWARN: this.lordPulse(); break;
        case EV_ASCEND: this.ascend(); break;
        case EV_SPLIT: case EV_SUMMON: this.lordPulse(); break;
        case EV_EAT: this.destroy(); break;
        case EV_ZAP: if (this.voice('zap', 0.08, 2)) this.noiseHit('highpass', 3000, 2, 0.06, 0.05 * kShot); break;
        case EV_RUIN: this.ascend(); break;
        case EV_GEM: this.star(); break;
        case EV_RESEARCH: this.cardPick(); break;
        case EV_LIT: if (this.voice('lit', 0.5, 1)) this.tone('sine', 660, 990, 0.5, 0.05); break;
      }
    }
  }
}
