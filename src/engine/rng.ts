// CLAUDE.md 3절 Mulberry32 — Python verify_battle.py와 동일한 결정론 PRNG.
const MASK = 0xffffffff;

export class RNG {
  seed: number;
  counter: number;
  constructor(seed: number, counter = 0) {
    this.seed = seed >>> 0;
    this.counter = counter;
  }
  private raw(c: number): number {
    let t = (this.seed + Math.imul(c, 0x6d2b79f5)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  rand(): number {
    this.counter += 1;
    return this.raw(this.counter);
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.rand() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.rand() < p;
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  // 가중 선택: weights 합에 비례
  weighted<T>(arr: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rand() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
}

export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
