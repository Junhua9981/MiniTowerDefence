// 視覺特效：粒子、擴散環、光束、震動。讀取模擬事件，不影響模擬本身。
import {
  EV_DEATH, EV_BOOM, EV_BUILD, EV_BDESTROY, EV_COREHIT, EV_DISSOLVE, EV_SELL, EV_LASER, EV_UPGRADE, EV_REVIVE,
  EV_ESHOT, EV_CRYSTAL, EV_FREEZE, EV_LORDPULSE, EV_COREPULSE, EV_LORD,
  EV_CARD, EV_BURST, EV_STAR, EV_PURIFY, EV_ASCEND, EV_SPLIT, EV_SUMMON, EV_EAT, EV_CHAINFREEZE,
  EV_ZAP, EV_RUIN, EV_GEM, EV_RESEARCH, EV_LIT,
  E_HEAVY, E_LORD, E_HEX, E_RAD, CORE_CX, CORE_CY, IS_BOSS,
} from '../sim/defs.js';
import { S_TRI, S_RING, S_CIRCLE, S_BOX, S_GLOW, S_CAPSULE, S_DIAMOND, S_HEX } from './gl.js';

/** 0xBBGGRR + alpha → 打包 RGBA8 */
const rgbaA = (bgr, a) => ((Math.round(Math.max(0, Math.min(1, a)) * 255) << 24) | bgr) >>> 0;

const K_SHARD = 0, K_RING = 1, K_DOT = 2, K_BEAM = 3, K_SEEK = 4;
// 顏色索引（對應 draw() 裡的 cols）
export const C_ENEMY = 0, C_BOOM = 1, C_BOOMFILL = 2, C_BUILD = 3, C_DANGER = 4, C_BLD = 5, C_LIGHT = 6, C_CYAN = 7,
  C_TIER0 = 8, C_ESHOT = 12, C_GOLD = 13;

export class Fx {
  constructor(cap = 20000) {
    this.cap = cap;
    this.n = 0;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.tx = new Float32Array(cap); this.ty = new Float32Array(cap);
    this.rot = new Float32Array(cap); this.vr = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.size = new Float32Array(cap); this.size1 = new Float32Array(cap);
    this.kind = new Uint8Array(cap); this.col = new Uint8Array(cap); this.shape = new Uint8Array(cap);
    this.shake = 0;
    this.seed = 1;
    this.budget = 1;   // 自動降級：1 = 全部、0.5 = 粒子減半
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  add(kind, x, y, vx, vy, life, size, size1, col, rot = 0, vr = 0, shape = S_TRI) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.size1[i] = size1; this.col[i] = col;
    this.rot[i] = rot; this.vr[i] = vr; this.shape[i] = shape;
    return i;
  }

  /** 壓力測試：補滿粒子到 target 個 */
  fill(target) {
    const k = Math.min(target, this.cap) - this.n;
    for (let j = 0; j < k; j++) {
      const a = this.rnd() * 6.283, sp = 0.5 + this.rnd() * 2;
      this.add(K_SHARD, 2 + this.rnd() * 96, 2 + this.rnd() * 56, Math.cos(a) * sp, Math.sin(a) * sp,
        0.5 + this.rnd() * 1.5, 0.2 + this.rnd() * 0.2, 0, 0, this.rnd() * 6, (this.rnd() - 0.5) * 10);
    }
  }

  /** 讀取並清空模擬事件 */
  consume(w) {
    const n = w.evN;
    let deaths = 0;
    for (let k = 0; k < n; k++) if (w.evT[k] === EV_DEATH) deaths++;
    // 大量死亡時限制每幀碎片數量
    const shardBudget = (deaths > 500 ? 500 / deaths : 1) * this.budget;
    for (let k = 0; k < n; k++) {
      const t = w.evT[k], x = w.evX[k], y = w.evY[k], a = w.evA[k], b = w.evB[k], c = w.evC[k];
      if (t === EV_DEATH) {
        const boss = IS_BOSS[a | 0];
        const big = a === E_HEAVY || boss || b > 0;
        if (!big && this.rnd() > shardBudget) continue;
        const cnt = boss ? 40 : big ? 6 : 3 + ((this.rnd() * 3) | 0);
        const r = E_RAD[a | 0];
        const shp = a === E_HEX ? S_HEX : S_TRI;
        for (let j = 0; j < cnt; j++) {
          const ang = this.rnd() * 6.283, sp = (1.5 + this.rnd() * 3.5) * (big ? 1.3 : 1) * (boss ? 2 : 1);
          this.add(K_SHARD, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.35 + this.rnd() * (boss ? 1.2 : 0.35),
            Math.min(0.9, r * (0.55 + this.rnd() * 0.4)), 0, C_ENEMY, this.rnd() * 6.28, (this.rnd() - 0.5) * 20, shp);
        }
        if (boss) { this.shake = 0.6; this.add(K_RING, x, y, 0, 0, 1.2, 1, 30, C_LIGHT); }
      } else if (t === EV_BOOM) {
        this.add(K_RING, x, y, 0, 0, 0.32, 0.4, a * 2, C_BOOM);
        this.add(K_DOT, x, y, 0, 0, 0.18, a * 1.6, a * 2.2, C_BOOMFILL);
      } else if (t === EV_BUILD) {
        this.add(K_RING, x, y, 0, 0, 0.45, 0.6, 2.6, C_BUILD);
      } else if (t === EV_SELL) {
        this.add(K_RING, x, y, 0, 0, 0.3, 1.2, 0.2, C_BUILD);
      } else if (t === EV_BDESTROY) {
        this.add(K_RING, x, y, 0, 0, 0.5, 0.5, 3, C_DANGER);
        for (let j = 0; j < 8; j++) {
          const ang = this.rnd() * 6.283, sp = 2 + this.rnd() * 3;
          this.add(K_SHARD, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.6, 0.3, 0, C_BLD, this.rnd() * 6, (this.rnd() - 0.5) * 16, S_BOX);
        }
      } else if (t === EV_COREHIT) {
        this.shake = Math.min(0.45, this.shake + 0.18);
        this.add(K_RING, x, y, 0, 0, 0.6, 2.2, 5, C_DANGER);
      } else if (t === EV_DISSOLVE) {
        if (this.rnd() > 0.5 * this.budget) continue;
        this.add(K_DOT, x, y, (this.rnd() - 0.5) * 0.6, -0.6 - this.rnd(), 0.6 + this.rnd() * 0.4, 0.35, 0.05, C_LIGHT, 0, 0, S_CIRCLE);
      } else if (t === EV_LASER) {
        const i = this.add(K_BEAM, x, y, 0, 0, 0.16, 0.26, 0.03, C_TIER0 + Math.min(3, a | 0));
        if (i >= 0) { this.tx[i] = b; this.ty[i] = c; }
        const j = this.add(K_BEAM, x, y, 0, 0, 0.1, 0.1, 0.02, C_LIGHT);
        if (j >= 0) { this.tx[j] = b; this.ty[j] = c; }
      } else if (t === EV_ESHOT) {
        const i = this.add(K_SEEK, x, y, 0, 0, 0.25, 0.22, 0.22, C_ESHOT, 0, 0, S_CIRCLE);
        if (i >= 0) { this.tx[i] = b; this.ty[i] = c; }
      } else if (t === EV_CRYSTAL) {
        const cnt = Math.min(12, 3 + (a / 3) | 0);
        for (let j = 0; j < cnt; j++) {
          const i = this.add(K_SEEK, x + (this.rnd() - 0.5), y + (this.rnd() - 0.5), 0, 0, 0.7 + this.rnd() * 0.4, 0.35, 0.2, C_CYAN, 0.785, 0, S_DIAMOND);
          if (i >= 0) { this.tx[i] = CORE_CX; this.ty[i] = CORE_CY; }
        }
        this.add(K_RING, x, y, 0, 0, 0.5, 0.4, 2.5, C_CYAN);
      } else if (t === EV_UPGRADE) {
        this.add(K_RING, x, y, 0, 0, 0.55, 0.5, 3.2, C_TIER0 + Math.min(3, a | 0));
        this.add(K_DOT, x, y, 0, 0, 0.4, 2.4, 0.5, C_TIER0 + Math.min(3, a | 0), 0, 0, S_GLOW);
      } else if (t === EV_REVIVE) {
        this.add(K_RING, x, y, 0, 0, 0.6, 0.3, 2.4, C_LIGHT);
        this.add(K_DOT, x, y, 0, 0, 0.5, 2.2, 0.6, C_LIGHT, 0, 0, S_GLOW);
      } else if (t === EV_FREEZE) {
        this.add(K_RING, x, y, 0, 0, 0.45, 0.6, a * 2, C_CYAN);
      } else if (t === EV_LORDPULSE) {
        this.shake = Math.min(0.5, this.shake + 0.25);
        this.add(K_RING, x, y, 0, 0, 0.7, 2, a * 2, C_DANGER);
        this.add(K_RING, x, y, 0, 0, 0.5, 1, a * 1.4, C_DANGER);
      } else if (t === EV_COREPULSE) {
        this.add(K_RING, x, y, 0, 0, 0.5, 2.5, a * 2, C_LIGHT);
      } else if (t === EV_LORD) {
        this.shake = 0.5;
        this.add(K_RING, x, y, 0, 0, 1.0, 2, 14, C_DANGER);
      } else if (t === EV_BURST) {
        this.shake = 0.7;
        this.add(K_DOT, x, y, 0, 0, 0.6, 12, 40, C_LIGHT, 0, 0, S_GLOW);
      } else if (t === EV_STAR) {
        this.add(K_RING, x, y, 0, 0, 0.5, 0.3, 2, C_GOLD);
        for (let j = 0; j < 5; j++) {
          const ang = j / 5 * 6.283, sp = 1.5;
          this.add(K_SHARD, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp - 1, 0.6, 0.22, 0, C_GOLD, ang, 4, S_DIAMOND);
        }
      } else if (t === EV_PURIFY) {
        const i = this.add(K_SEEK, x, y, 0, 0, 0.8 + this.rnd() * 0.5, 0.3, 0.15, C_CYAN, 0.785, 0, S_DIAMOND);
        if (i >= 0) { this.tx[i] = CORE_CX; this.ty[i] = CORE_CY; }
      } else if (t === EV_ASCEND) {
        this.shake = 0.3;
        this.add(K_RING, x, y, 0, 0, 0.9, 0.5, 6, C_GOLD);
        this.add(K_DOT, x, y, 0, 0, 0.8, 4, 1, C_LIGHT, 0, 0, S_GLOW);
      } else if (t === EV_SPLIT || t === EV_SUMMON) {
        this.shake = Math.min(0.5, this.shake + 0.3);
        this.add(K_RING, x, y, 0, 0, 0.6, 2, a > 4 ? 10 : a * 3, C_DANGER);
      } else if (t === EV_EAT) {
        this.add(K_RING, x, y, 0, 0, 0.5, 2, 0.3, C_DANGER);
      } else if (t === EV_CHAINFREEZE) {
        if (this.rnd() > this.budget) continue;
        this.add(K_RING, x, y, 0, 0, 0.35, 0.3, a * 2, C_CYAN);
      } else if (t === EV_ZAP) {
        if (this.rnd() > this.budget) continue;
        const i = this.add(K_BEAM, x, y, 0, 0, 0.12, 0.16, 0.03, C_CYAN);
        if (i >= 0) { this.tx[i] = b; this.ty[i] = c; }
      } else if (t === EV_RUIN) {
        this.add(K_RING, x, y, 0, 0, 1.0, 0.5, 6, C_GOLD);
        this.add(K_DOT, x, y, 0, 0, 0.8, 4, 1, C_LIGHT, 0, 0, S_GLOW);
      } else if (t === EV_LIT) {
        this.add(K_RING, x, y, 0, 0, 0.8, 1, a * 2, C_LIGHT);
      } else if (t === EV_GEM || t === EV_RESEARCH) {
        this.add(K_RING, x, y, 0, 0, 0.6, 1, 6, t === EV_GEM ? C_CYAN : C_GOLD);
      } else if (t === EV_CARD) {
        this.add(K_RING, x, y, 0, 0, 0.8, 2, 8, C_GOLD);
      }
    }
    w.evN = 0;
  }

  update(dt) {
    let i = 0;
    this.shake *= Math.exp(-12 * dt);
    if (this.shake < 0.002) this.shake = 0;
    const drag = Math.exp(-4 * dt);
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          this.kind[i] = this.kind[l]; this.x[i] = this.x[l]; this.y[i] = this.y[l];
          this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.tx[i] = this.tx[l]; this.ty[i] = this.ty[l];
          this.life[i] = this.life[l]; this.max[i] = this.max[l];
          this.size[i] = this.size[l]; this.size1[i] = this.size1[l]; this.col[i] = this.col[l];
          this.rot[i] = this.rot[l]; this.vr[i] = this.vr[l]; this.shape[i] = this.shape[l];
        }
        continue;
      }
      if (this.kind[i] === K_SEEK) {
        // 往目標飛：剩餘時間內走完剩下距離
        const k = Math.min(1, dt / Math.max(0.016, this.life[i]));
        this.x[i] += (this.tx[i] - this.x[i]) * k; this.y[i] += (this.ty[i] - this.y[i]) * k;
      } else if (this.kind[i] !== K_BEAM) {
        this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
        this.vx[i] *= drag; this.vy[i] *= drag;
        this.rot[i] += this.vr[i] * dt;
      }
      i++;
    }
  }

  /** 爆炸、雷射、脈衝等短暫光源 */
  drawLights(r, pal) {
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i], col = this.col[i], u = this.life[i] / this.max[i];
      if (k === K_BEAM) {
        const dx = this.tx[i] - this.x[i], dy = this.ty[i] - this.y[i], L = Math.hypot(dx, dy);
        r.lightLine((this.x[i] + this.tx[i]) / 2, (this.y[i] + this.ty[i]) / 2, L + 1.5, 1.6, Math.atan2(dy, dx), rgbaA(0xc8e6ff, 0.5 * u));
      } else if (k === K_RING && (col === C_BOOM || col === C_LIGHT || col === C_CYAN || col === C_DANGER)) {
        const s = this.size1[i] + (this.size[i] - this.size1[i]) * u * u;
        const c = col === C_CYAN ? 0xffe68c : col === C_DANGER ? 0x4050ff : 0xa0d8ff;
        r.light(this.x[i], this.y[i], s * 1.6, rgbaA(c, 0.7 * u));
      }
    }
  }

  /** pal: 調色盤（打包好的顏色） */
  draw(r, pal) {
    const cols = [pal.enemy, pal.boom, pal.boomFill, pal.build, pal.danger, pal.bldFill, pal.light, pal.cyan,
      pal.tierEdge[0], pal.tierEdge[1], pal.tierEdge[2], pal.tierEdge[3], pal.eshot, pal.gold];
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i], u = this.life[i] / this.max[i]; // 1 → 0
      const c = cols[this.col[i]];
      const a = ((c >>> 24) / 255) * (k === K_SEEK ? Math.min(1, u * 3) : u);
      const col = (c & 0x00ffffff) | ((Math.round(a * 255) & 255) << 24);
      if (k === K_SHARD) {
        r.push(this.x[i], this.y[i], this.size[i], this.size[i], this.rot[i], this.shape[i], col, 0);
      } else if (k === K_RING) {
        const s = this.size1[i] + (this.size[i] - this.size1[i]) * u * u;
        r.push(this.x[i], this.y[i], s, s, 0, S_RING, col, 0);
      } else if (k === K_BEAM) {
        const dx = this.tx[i] - this.x[i], dy = this.ty[i] - this.y[i], L = Math.hypot(dx, dy);
        const wdt = this.size1[i] + (this.size[i] - this.size1[i]) * u;
        r.push((this.x[i] + this.tx[i]) / 2, (this.y[i] + this.ty[i]) / 2, L + wdt, wdt, Math.atan2(dy, dx), S_CAPSULE, col, 0);
      } else if (k === K_SEEK) {
        r.push(this.x[i], this.y[i], this.size[i], this.size[i], this.rot[i], this.shape[i], col, 0);
      } else {
        const s = this.size1[i] + (this.size[i] - this.size1[i]) * u;
        r.push(this.x[i], this.y[i], s, s, 0, this.shape[i] === S_CIRCLE ? S_CIRCLE : S_GLOW, col, 0);
      }
    }
  }
}
