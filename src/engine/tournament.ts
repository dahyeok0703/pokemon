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

// ── 접수 가능 시간(시간 개념) ──────────────────────────────
function hashId(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
export interface RegWindow { months: number[]; dayLo: number; dayHi: number; hourLo: number; hourHi: number; text: string; }
export function regWindow(t: any): RegWindow {
  const h = hashId(t.id ?? t.이름 ?? "");
  switch (t.티어) {
    case "로컬": return { months: [1,2,3,4,5,6,7,8,9,10,11,12], dayLo: -1, dayHi: -1, hourLo: 9, hourHi: 18, text: "매주 주말 09–18시" };
    case "지방": return { months: [3,6,9,12], dayLo: 8, dayHi: 14, hourLo: 10, hourHi: 17, text: "분기(3·6·9·12월) 8–14일 10–17시" };
    case "국가": { const m = [9,10,11][h % 3]; return { months: [m], dayLo: 12, dayHi: 18, hourLo: 10, hourHi: 16, text: `매년 ${m}월 12–18일 10–16시` }; }
    case "대륙": { const m = [12,1,2][h % 3]; return { months: [m], dayLo: 5, dayHi: 11, hourLo: 10, hourHi: 16, text: `매년 ${m}월 5–11일 10–16시` }; }
    case "세계": { const m = [7,8][h % 2]; return { months: [m], dayLo: 14, dayHi: 21, hourLo: 10, hourHi: 18, text: `매년 ${m}월 14–21일 10–18시` }; }
    default: { const m = (h % 12) + 1; return { months: [m], dayLo: 10, dayHi: 20, hourLo: 9, hourHi: 18, text: `매년 ${m}월 10–20일 09–18시` }; }
  }
}
export function isOpen(t: any, 월: number, 일: number, 시각: number): boolean {
  const w = regWindow(t);
  if (!w.months.includes(월)) return false;
  if (시각 < w.hourLo || 시각 >= w.hourHi) return false;
  if (w.dayLo < 0) return 일 % 7 === 6 || 일 % 7 === 0; // 로컬: 주말
  return 일 >= w.dayLo && 일 <= w.dayHi;
}

// 대회 트로피 이름
export function trophyName(t: any): string {
  const medal: Record<string, string> = { 로컬: "🥉", 지방: "🥈", 국가: "🥇", 대륙: "🏆", 세계: "👑", 특수: "🎖️" };
  return `${medal[t.티어] ?? "🏆"} ${t.이름} 우승 트로피`;
}

// 대회 라운드 구조 → 인터랙티브 라운드(상대 트레이너) 목록(최대 4)
export interface RoundDef { 이름: string; teamSize: number; }
export function buildRounds(t: any): RoundDef[] {
  const labels: string[] = t.라운드_구조?.라운드 ?? ["8강", "4강", "결승"];
  const tail = labels.slice(-3); // 막판 3라운드만 인터랙티브
  return tail.map((lbl, i) => ({ 이름: lbl, teamSize: Math.min(3, 1 + i) }));
}
