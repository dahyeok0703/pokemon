import { Mon } from "../engine/pokemon";
import { randomSeed } from "../engine/rng";
import { LOC_BY_ID } from "../engine/world";

const KEY = "pokemon-earth-2035-save";

export interface Player {
  버전: number;
  이름: string;
  배경: string;
  출신지: { 국가: string; 도시: string };
  면허_등급: string;
  현재_장소: string;
  현재_도시: string;
  현재_국가: string;
  밤: boolean;
  party: Mon[];
  box: Mon[];
  인벤토리: Record<string, number>;
  트로피: string[];
  소지금: number;
  명성: number;
  도감_본: number[];
  도감_잡은: number[];
  대회_전적: { id: string; 이름: string; 결과: string; 명성: number; 상금: number }[];
  npc전적: { 만남: number; 승리: number; 패배: number };
  스토리_플래그: string[];
  rng: { seed: number; counter: number };
  날짜: { 년: number; 월: number; 일: number };
  시각: number; // 0~23
}

export function newPlayer(name: string, locId: string, 배경: string): Player {
  const loc = LOC_BY_ID.get(locId)!;
  return {
    버전: 2, 이름: name, 배경, 출신지: { 국가: loc.국가, 도시: loc.이름 }, 면허_등급: "신인",
    현재_장소: locId, 현재_도시: loc.이름, 현재_국가: loc.국가, 밤: false,
    party: [], box: [],
    인벤토리: { 몬스터볼: 8, 슈퍼볼: 0, 하이퍼볼: 0, 상처약: 5, 고급상처약: 1 },
    트로피: [],
    소지금: 30000, 명성: 0, 도감_본: [], 도감_잡은: [],
    대회_전적: [], npc전적: { 만남: 0, 승리: 0, 패배: 0 }, 스토리_플래그: [],
    rng: { seed: randomSeed(), counter: 0 },
    날짜: { 년: 2035, 월: 6, 일: 1 }, 시각: 9,
  };
}

function migrate(p: any): Player {
  if (!p.현재_장소) p.현재_장소 = "JP-TYO";
  if (p.밤 === undefined) p.밤 = false;
  if (!p.배경) p.배경 = "";
  const loc = LOC_BY_ID.get(p.현재_장소);
  if (loc) { p.현재_도시 = loc.이름; p.현재_국가 = loc.국가; }
  if (!p.인벤토리) p.인벤토리 = { 몬스터볼: 5, 상처약: 3 };
  if (!p.트로피) p.트로피 = [];
  if (!p.npc전적) p.npc전적 = { 만남: 0, 승리: 0, 패배: 0 };
  if (typeof p.시각 !== "number") p.시각 = p.밤 ? 21 : 13;
  p.버전 = 3;
  return p as Player;
}

export function save(p: Player): void { localStorage.setItem(KEY, JSON.stringify(p)); }
export function load(): Player | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return migrate(JSON.parse(raw)); } catch { return null; }
}
export function hasSave(): boolean { return !!localStorage.getItem(KEY); }
export function wipe(): void { localStorage.removeItem(KEY); }

export function seen(p: Player, id: number): void { if (!p.도감_본.includes(id)) p.도감_본.push(id); }
export function caught(p: Player, id: number): void {
  seen(p, id);
  if (!p.도감_잡은.includes(id)) p.도감_잡은.push(id);
}
