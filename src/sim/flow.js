import { MAP_W, MAP_H, N_CELLS } from './defs.js';

// 8 方向鄰居（前 4 個正交、後 4 個斜向）
const DX = new Int32Array([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = new Int32Array([0, 0, 1, -1, 1, -1, 1, -1]);
// 成本量化：每格 16 單位，斜向 23（≈16√2）
const Q = 16;
const STEP = new Int32Array([Q, Q, Q, Q, 23, 23, 23, 23]);
const NB = 1 << 15;      // 環狀桶數（必須大於最大單邊成本）
const MASK = NB - 1;

/**
 * 以核心為終點的反向 Dijkstra 流場，用 Dial 演算法（環狀桶佇列）實作：
 * 成本量化成整數後，每次 pop 是 O(1)。
 * 所有緩衝預先配置，執行中不產生垃圾。
 */
export class FlowSolver {
  constructor() {
    this.cap = N_CELLS * 8 + 16;
    this.head = new Int32Array(NB).fill(-1);
    this.entNode = new Int32Array(this.cap);
    this.entNext = new Int32Array(this.cap);
    this.dq = new Int32Array(N_CELLS);
    this.done = new Uint8Array(N_CELLS);
    this.free = new Uint8Array(N_CELLS); // 1 = 可斜穿（非岩石、非建築、非終點）
    this.pq = new Int32Array(N_CELLS);   // 量化後的進入成本
  }

  /**
   * rock: 1 = 不可通行；goal: 1 = 終點（核心格）；penalty: 進入該格的額外成本（建築）
   * mult: 建築成本倍率（尖三角用 3）。dist（以格為單位）/ next 為輸出。
   */
  solve(rock, goal, penalty, mult, dist, next) {
    const W = MAP_W, H = MAP_H;
    const head = this.head, entNode = this.entNode, entNext = this.entNext;
    const dq = this.dq, done = this.done, free = this.free, pq = this.pq;
    const INF = 0x3fffffff;
    for (let i = 0; i < N_CELLS; i++) {
      const p = penalty[i];
      free[i] = (rock[i] | goal[i]) === 0 && p === 0 ? 1 : 0;
      pq[i] = goal[i] ? 0 : Math.min(NB - 64, Math.round(p * mult * Q));
      dq[i] = INF; done[i] = 0; next[i] = -1;
    }
    let ne = 0, pending = 0;
    for (let i = 0; i < N_CELLS; i++) if (goal[i]) {
      dq[i] = 0; entNode[ne] = i; entNext[ne] = head[0]; head[0] = ne++; pending++;
    }
    let cur = 0;
    while (pending > 0) {
      const b = cur & MASK;
      let e = head[b];
      head[b] = -1;
      while (e >= 0) {
        const nIdx = entNode[e];
        e = entNext[e];
        pending--;
        if (done[nIdx] || dq[nIdx] !== cur) continue;
        done[nIdx] = 1;
        const nx = nIdx % W, ny = (nIdx / W) | 0;
        const enter = pq[nIdx];
        for (let k = 0; k < 8; k++) {
          const cx = nx - DX[k], cy = ny - DY[k];
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          const c = cy * W + cx;
          if (rock[c] | goal[c] | done[c]) continue;
          // 斜走：兩個正交格都必須是空地（不能穿過岩石或建築的角）
          if (k >= 4 && !(free[cy * W + nx] & free[ny * W + cx])) continue;
          const nd = cur + STEP[k] + enter;
          if (nd < dq[c]) {
            dq[c] = nd; next[c] = nIdx;
            const bb = nd & MASK;
            entNode[ne] = c; entNext[ne] = head[bb]; head[bb] = ne++; pending++;
          }
        }
      }
      cur++;
    }
    for (let i = 0; i < N_CELLS; i++) dist[i] = dq[i] === INF ? Infinity : dq[i] / Q;
  }
}
