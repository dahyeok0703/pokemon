import { RNG } from "./rng";
import { SPECIES, Species, RARITY_WEIGHT } from "./data";
import { buildMon, Mon } from "./pokemon";

export const LICENSE_ORDER = ["신인", "정규", "상급", "마스터"];
export function licenseRank(l: string): number { return Math.max(0, LICENSE_ORDER.indexOf(l)); }
export function licenseFor(fame: number): string {
  if (fame >= 6000) return "마스터";
  if (fame >= 1500) return "상급";
  if (fame >= 300) return "정규";
  return "신인";
}

const ALL_TYPES = ["노말","불꽃","물","풀","전기","얼음","격투","독","땅","비행","에스퍼","벌레","바위","고스트","드래곤","악","강철","페어리"];

export interface Eligibility { ok: boolean; reasons: string[]; }
export function eligible(player: { 명성: number; 면허_등급: string }, t: any): Eligibility {
  const reasons: string[] = [];
  const q = t.출전_자격;
  if (player.명성 < (q.최소_명성 ?? 0)) reasons.push(`명성 ${q.최소_명성} 필요 (현재 ${player.명성})`);
  if (licenseRank(player.면허_등급) < licenseRank(q.면허_등급 ?? "신인"))
    reasons.push(`${q.면허_등급} 면허 필요 (현재 ${player.면허_등급})`);
  return { ok: reasons.length === 0, reasons };
}

// 티어별 기본 레벨(레벨캡 없을 때)
export function tierLevel(tier: string, rules: any, playerAvg: number): number {
  if (typeof rules?.레벨캡 === "number") return rules.레벨캡;
  const base: Record<string, number> = { 로컬: Math.min(25, Math.max(8, playerAvg)), 지방: 40, 국가: 55, 대륙: 70, 세계: 82, 특수: 50 };
  return base[tier] ?? 50;
}

function poolFor(rules: any): Species[] {
  let pool = Array.from(SPECIES.values());
  if (rules?.전설_금지 !== false) pool = pool.filter((s) => s.희귀도 !== "전설");
  if (rules?.환상_금지 !== false) pool = pool.filter((s) => s.희귀도 !== "환상");
  // 타입제한: "X 타입만" 처럼 'X'와 '만'이 함께면 그 타입으로 한정
  const tr: string | null = rules?.타입제한 ?? null;
  if (tr && tr.includes("만")) {
    const t = ALL_TYPES.find((x) => tr.includes(x));
    if (t) pool = pool.filter((s) => s.타입.includes(t));
  }
  return pool.length ? pool : Array.from(SPECIES.values());
}

export function genTrainerTeam(rng: RNG, level: number, rules: any, count: number): Mon[] {
  const pool = poolFor(rules);
  const weights = pool.map((s) => Math.max(1, RARITY_WEIGHT[s.희귀도] ?? 10) + (s.희귀도 === "희귀" ? 6 : 0));
  const team: Mon[] = [];
  const used = new Set<number>();
  let guard = 0;
  while (team.length < count && guard++ < 200) {
    const sp = rng.weighted(pool, weights);
    if (rules?.동일종_금지 !== false && used.has(sp.id)) continue;
    used.add(sp.id);
    const lv = Math.max(2, level - rng.int(0, 2));
    team.push(buildMon(rng, sp.id, lv, { ivFloor: 12, ivCeil: 28 }));
  }
  return team;
}

// 대회 라운드 구조 → 인터랙티브 라운드(상대 트레이너) 목록(최대 4)
export interface RoundDef { 이름: string; teamSize: number; }
export function buildRounds(t: any): RoundDef[] {
  const labels: string[] = t.라운드_구조?.라운드 ?? ["8강", "4강", "결승"];
  const tail = labels.slice(-3); // 막판 3라운드만 인터랙티브
  return tail.map((lbl, i) => ({ 이름: lbl, teamSize: Math.min(3, 1 + i) }));
}
