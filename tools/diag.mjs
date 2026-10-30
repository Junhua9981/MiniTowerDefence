// 診斷：跑一局，第 N 夜每 5 秒印出首領與核心狀態。用法：node tools/diag.mjs 種子 夜 [bal-json]
import { runGame } from './autoplay.mjs';
import { World } from '../src/sim/world.js';
import { BAL, ENEMY_DEFS, IS_BOSS, P_DUSK, HZ } from '../src/sim/defs.js';
const seed = +process.argv[2], night = +process.argv[3];
if (process.argv[4]) Object.assign(BAL, JSON.parse(process.argv[4]));
const orig = World.prototype.step;
let lastLog = 0;
World.prototype.step = function () {
  orig.call(this);
  if (this.day === night && this.phase >= P_DUSK && this.time - lastLog >= 5) {
    lastLog = this.time;
    const i = this.lordIndex();
    let alive = 0; for (let b = 1; b < this.bHigh; b++) alive += this.balive[b];
    console.log(`t=${(this.dayT).toFixed(0)} n=${this.n} core=${Math.round(this.bhp[this.core])}/${this.bmax[this.core]} bld=${alive}` +
      (i >= 0 ? ` boss=${ENEMY_DEFS[this.et[i]].name} hp=${Math.round(this.ehp[i])}/${Math.round(this.emax[i])} at=${this.ex[i].toFixed(0)},${this.ey[i].toFixed(0)}` : ''));
  }
};
const r = runGame({ seed, profile: 'full', maxDays: night });
console.log(r.result, r.day, r.bosses);
