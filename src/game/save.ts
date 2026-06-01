import { Mon } from "../engine/pokemon";
import { randomSeed } from "../engine/rng";

const KEY = "pokemon-earth-2035-save";

export interface Player {
  버전: number;
  이름: string;
  출신지: { 국가: string; 도시: string };
  면허_등급: string;
  현재_도시: string;
  현재_국가: string;
  party: Mon[];
  box: Mon[];
  인벤토리: Record<string, number>;
  소지금: number;
  명성: number;
  도감_본: number[];
  도감_잡은: number[];
  대회_전적: { id: string; 이름: string; 결과: string; 명성: number; 상금: number }[];
  스토리_플래그: string[];
  rng: { seed: number; counter: number };
  날짜: { 년: number; 월: number; 일: number };
}

export function newPlayer(name: string, 국가: string, 도시: string): Player {
  return {
    버전: 1, 이름: name, 출신지: { 국가, 도시 }, 면허_등급: "신인",
    현재_도시: 도시, 현재_국가: 국가, party: [], box: [],
    인벤토리: { 몬스터볼: 5, 슈퍼볼: 0, 하이퍼볼: 0, 상처약: 5, 고급상처약: 1 },
    소지금: 30000, 명성: 0, 도감_본: [], 도감_잡은: [],
    대회_전적: [], 스토리_플래그: [],
    rng: { seed: randomSeed(), counter: 0 },
    날짜: { 년: 2035, 월: 6, 일: 1 },
  };
}

export function save(p: Player): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
export function load(): Player | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Player; } catch { return null; }
}
export function hasSave(): boolean { return !!localStorage.getItem(KEY); }
export function wipe(): void { localStorage.removeItem(KEY); }

export function seen(p: Player, id: number): void { if (!p.도감_본.includes(id)) p.도감_본.push(id); }
export function caught(p: Player, id: number): void {
  seen(p, id);
  if (!p.도감_잡은.includes(id)) p.도감_잡은.push(id);
}
