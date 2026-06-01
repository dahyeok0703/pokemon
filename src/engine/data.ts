// 기존 data/ JSON 자산을 브라우저로 로드한다. (Vite: '/data/...' = repo 루트 기준)
import typeChart from "../../data/type_chart.json";
import natures from "../../data/natures.json";
import expTables from "../../data/exp_tables.json";
import moves from "../../data/pokemon/moves.json";
import formsData from "../../data/pokemon/forms.json";

// 세대별 종 데이터 + 대회 티어 파일은 glob 로 한 번에.
const genModules = import.meta.glob("../../data/pokemon/gen*.json", {
  eager: true,
  import: "default",
}) as Record<string, any[]>;
const tourModules = import.meta.glob(
  "../../data/tournaments/{local,regional,national,continental,world,special}.json",
  { eager: true, import: "default" }
) as Record<string, any[]>;

export type Stat = "HP" | "공격" | "방어" | "특공" | "특방" | "스피드";
export const STAT_KEYS: Stat[] = ["HP", "공격", "방어", "특공", "특방", "스피드"];

export interface Species {
  id: number;
  이름: { 한: string; 영: string };
  분류: string;
  타입: string[];
  종족값: Record<Stat, number>;
  특성: string[];
  숨겨진특성: string | null;
  기술풀: { 기술: string; 방식: string; 레벨?: number }[];
  진화: any;
  현실_출현지역: string[];
  서식_환경: string;
  희귀도: string;
  메가진화_가능여부: boolean;
  거다이맥스_가능여부: boolean;
  기본경험치: number;
  경험치그룹: string;
  포획률: number;
  성별비: any;
}

export interface MoveData {
  타입: string;
  분류: "물리" | "특수" | "변화";
  위력: number | null;
  PP: number | null;
  명중: number | null;
  우선도: number;
  추가효과확률: number | null;
}

// ---- 색인 빌드 -------------------------------------------------------------
export const SPECIES = new Map<number, Species>();
for (const mod of Object.values(genModules)) {
  for (const s of mod) SPECIES.set(s.id, s as Species);
}
export const MOVES = moves as Record<string, MoveData>;
export const TYPE_CHART = typeChart as Record<string, Record<string, number>>;
export const NATURES = natures as Record<string, { 상승: Stat | null; 하강: Stat | null }>;
export const EXP_TABLES = expTables as Record<string, number[]>;
export const NATURE_LIST = Object.keys(NATURES);

export const TOURNAMENTS: any[] = [];
for (const mod of Object.values(tourModules)) for (const t of mod) TOURNAMENTS.push(t);

export const FORMS_BY_BASE = new Map<number, any[]>();
for (const f of formsData as any[]) {
  if (!FORMS_BY_BASE.has(f.기반_id)) FORMS_BY_BASE.set(f.기반_id, []);
  FORMS_BY_BASE.get(f.기반_id)!.push(f);
}

export function speciesName(id: number): string {
  return SPECIES.get(id)?.이름.한 ?? `#${id}`;
}

// ---- 타입 상성 -------------------------------------------------------------
export function typeMult(atkType: string, defTypes: string[]): number {
  let m = 1;
  for (const d of defTypes) m *= TYPE_CHART[atkType]?.[d] ?? 1;
  return m;
}

// ---- 바이옴 → 타입 (탐험 지형 선택) ----------------------------------------
export const BIOMES: { 이름: string; 타입: string[] }[] = [
  { 이름: "도시 근교", 타입: ["노말", "전기", "독", "강철"] },
  { 이름: "숲·삼림", 타입: ["풀", "벌레", "페어리", "노말"] },
  { 이름: "해안·하천", 타입: ["물", "비행", "얼음"] },
  { 이름: "동굴·광산", 타입: ["바위", "땅", "강철", "고스트"] },
  { 이름: "초원·평원", 타입: ["노말", "비행", "땅", "격투"] },
  { 이름: "화산·고온지대", 타입: ["불꽃", "바위", "땅", "드래곤"] },
  { 이름: "극지·고산", 타입: ["얼음", "비행", "강철", "드래곤"] },
  { 이름: "유적·묘지", 타입: ["고스트", "에스퍼", "악", "독"] },
];

// 도시별 추천 바이옴(없으면 전체)
export const CITY_BIOME: Record<string, number[]> = {
  도쿄: [0, 1, 2], 서울: [0, 1, 4], 런던: [0, 1, 7], 파리: [0, 1, 4],
  베를린: [0, 5, 3], 로마: [5, 4, 7], 시드니: [4, 2, 6], 카이로: [5, 7, 3],
  상파울루: [1, 2, 4], 뉴욕: [0, 2, 3], "라스베이거스": [3, 5, 4],
};

// ---- 스타터 후보(바이옴/출신지 무관 기본 3종 + 지역 변형) ------------------
export const STARTER_SETS: { 이름: string; ids: number[] }[] = [
  { 이름: "정통 3종 (불·물·풀)", ids: [4, 7, 1] },
  { 이름: "해안형 (물·물·풀)", ids: [7, 54, 1] },
  { 이름: "화산형 (불·불·바위)", ids: [4, 218, 74] },
  { 이름: "삼림형 (풀·벌레·노말)", ids: [1, 10, 16] },
];

// 희귀도 → 야생 출현 가중치
export const RARITY_WEIGHT: Record<string, number> = {
  흔함: 100, 보통: 45, 희귀: 14, 매우희귀: 4, 전설: 0, 환상: 0,
};
