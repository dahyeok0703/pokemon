import { RNG } from "./rng";
import {
  SPECIES, MOVES, NATURES, EXP_TABLES, NATURE_LIST,
  STAT_KEYS, Stat, Species, speciesName,
} from "./data";

export interface MoveSlot { name: string; pp: number; maxpp: number; }
export interface Mon {
  uid: string;
  종_id: number;
  별명: string;
  level: number;
  exp: number;
  nature: string;
  성별: string;
  ivs: Record<Stat, number>;
  evs: Record<Stat, number>;
  stats: Record<Stat, number>;
  maxHP: number;
  curHP: number;
  moves: MoveSlot[];
  status: string | null;
  types: string[];
  name: string;
  shiny?: boolean;
  // 일시 변신(전투 한정)
  mega?: boolean;
  gmax?: number; // 남은 턴
  형태표시?: string; // "메가"/"거다이맥스"
  _orig?: { stats: Record<Stat, number>; maxHP: number; types: string[] };
}

let UID = 1;
export function newUid(): string { return `m${(UID++).toString(36)}${Date.now().toString(36).slice(-3)}`; }

export function natureMult(nature: string, key: Stat): number {
  const n = NATURES[nature];
  if (!n) return 1;
  if (n.상승 === key) return 1.1;
  if (n.하강 === key) return 0.9;
  return 1;
}

export function calcOne(base: number, iv: number, ev: number, level: number, key: Stat, nature: string): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (key === "HP") return core + level + 10;
  return Math.floor((core + 5) * natureMult(nature, key));
}

export function recalc(mon: Mon): void {
  const sp = SPECIES.get(mon.종_id)!;
  const prevMax = mon.maxHP;
  for (const k of STAT_KEYS) {
    mon.stats[k] = calcOne(sp.종족값[k], mon.ivs[k], mon.evs[k], mon.level, k, mon.nature);
  }
  mon.maxHP = mon.stats.HP;
  mon.types = sp.타입.slice();
  if (prevMax) mon.curHP += mon.maxHP - prevMax; // 레벨업 시 HP 증가분 반영
  if (mon.curHP > mon.maxHP) mon.curHP = mon.maxHP;
}

// 레벨업 기술 중 레벨<=현재 (최신 4개). 비면 첫 레벨업기.
export function chooseMoves(sp: Species, level: number): string[] {
  const lv = sp.기술풀
    .filter((m) => m.방식 === "레벨업" && (m.레벨 ?? 0) <= level && MOVES[m.기술])
    .sort((a, b) => (b.레벨 ?? 0) - (a.레벨 ?? 0));
  const out: string[] = [];
  for (const m of lv) { if (!out.includes(m.기술)) out.push(m.기술); if (out.length >= 4) break; }
  if (!out.length) {
    const any = sp.기술풀.filter((m) => m.방식 === "레벨업" && MOVES[m.기술]).map((m) => m.기술);
    if (any.length) out.push(...any.slice(0, 4));
    else out.push("몸통박치기");
  }
  return out;
}

function makeSlots(names: string[]): MoveSlot[] {
  return names.map((name) => {
    const pp = MOVES[name]?.PP ?? 20;
    return { name, pp, maxpp: pp };
  });
}

export function expGroup(sp: Species): string {
  return EXP_TABLES[sp.경험치그룹] ? sp.경험치그룹 : "중간";
}
export function expForLevel(group: string, level: number): number {
  const table = EXP_TABLES[group] ?? EXP_TABLES["중간"];
  return table[Math.min(99, Math.max(0, level - 1))];
}

export interface BuildOpts {
  nature?: string; ivFloor?: number; ivCeil?: number;
  evs?: Partial<Record<Stat, number>>; 별명?: string; shiny?: boolean;
}
export function buildMon(rng: RNG, speciesId: number, level: number, opts: BuildOpts = {}): Mon {
  const sp = SPECIES.get(speciesId)!;
  const nature = opts.nature ?? rng.pick(NATURE_LIST);
  const ivs = {} as Record<Stat, number>;
  const evs = {} as Record<Stat, number>;
  const lo = opts.ivFloor ?? 0, hi = opts.ivCeil ?? 31;
  for (const k of STAT_KEYS) { ivs[k] = rng.int(lo, hi); evs[k] = opts.evs?.[k] ?? 0; }
  let sex = "무성";
  if (sp.성별비?.무성 === undefined) sex = rng.rand() * 100 < (sp.성별비?.수 ?? 50) ? "수" : "암";
  const mon: Mon = {
    uid: newUid(), 종_id: speciesId, 별명: opts.별명 ?? sp.이름.한, level, exp: 0,
    nature, 성별: sex, ivs, evs, stats: {} as any, maxHP: 0, curHP: 0,
    moves: makeSlots(chooseMoves(sp, level)), status: null, types: sp.타입.slice(),
    name: sp.이름.한, shiny: opts.shiny,
  };
  recalc(mon);
  mon.curHP = mon.maxHP;
  mon.exp = expForLevel(expGroup(sp), level);
  return mon;
}

// 격파 보상 경험치
export function expYield(loser: Mon): number {
  const sp = SPECIES.get(loser.종_id)!;
  return Math.max(1, Math.floor((sp.기본경험치 * loser.level) / 5));
}

// 전투 후 UI에서 처리할 이벤트(슬롯 꽉 찬 기술 학습 / 진화 축하)
export interface ExpEvents {
  learns: { mon: Mon; move: string }[];
  evolves: { mon: Mon; fromName: string; toId: number; toName: string }[];
}
export function newExpEvents(): ExpEvents { return { learns: [], evolves: [] }; }

// 경험치 획득 → 레벨업/진화 처리. 로그 콜백 + 이벤트 수집.
export function gainExp(mon: Mon, amount: number, log: (s: string, cls?: string) => void, events?: ExpEvents): void {
  let sp = SPECIES.get(mon.종_id)!;
  const group = expGroup(sp);
  mon.exp += amount;
  log(`${mon.별명} 경험치 +${amount}`, "dim");
  while (mon.level < 100 && mon.exp >= expForLevel(group, mon.level + 1)) {
    mon.level += 1;
    recalc(mon);
    log(`✨ ${mon.별명}이(가) 레벨 ${mon.level} 달성!`, "good");
    // 새 기술 학습(레벨업 기술 중 이번 레벨)
    for (const m of sp.기술풀) {
      if (m.방식 === "레벨업" && m.레벨 === mon.level && MOVES[m.기술]) {
        if (mon.moves.find((x) => x.name === m.기술)) continue;
        if (mon.moves.length < 4) {
          const pp = MOVES[m.기술]?.PP ?? 20;
          mon.moves.push({ name: m.기술, pp, maxpp: pp });
          log(`   └ 새 기술 «${m.기술}» 습득!`, "sys");
        } else if (events) {
          events.learns.push({ mon, move: m.기술 }); // 슬롯 꽉 참 → UI에서 유저에게 물음
        } else {
          const old = mon.moves.shift()!;
          const pp = MOVES[m.기술]?.PP ?? 20;
          mon.moves.push({ name: m.기술, pp, maxpp: pp });
          log(`   └ «${old.name}» 대신 «${m.기술}» 습득`, "sys");
        }
      }
    }
    // 레벨 진화
    const child = evolveTarget(mon);
    if (child) {
      const fromName = mon.별명 === sp.이름.한 ? sp.이름.한 : mon.별명;
      const childSp = SPECIES.get(child)!;
      mon.종_id = child;
      if (mon.별명 === sp.이름.한) mon.별명 = childSp.이름.한;
      mon.name = childSp.이름.한;
      recalc(mon);
      sp = childSp;
      if (events) events.evolves.push({ mon, fromName, toId: child, toName: childSp.이름.한 });
      else log(`🌟 ${fromName}이(가) ${childSp.이름.한}(으)로 진화했다!`, "good");
    }
  }
}

// 슬롯이 꽉 찬 상태에서 기술 교체(슬롯 인덱스) 또는 포기(-1)
export function applyLearn(mon: Mon, move: string, slotIndex: number): void {
  if (slotIndex < 0 || slotIndex > 3) return; // 포기
  const pp = MOVES[move]?.PP ?? 20;
  mon.moves[slotIndex] = { name: move, pp, maxpp: pp };
}

// 현재 종의 자식 중 레벨 조건을 만족하는 진화 대상
export function evolveTarget(mon: Mon): number | null {
  const sp = SPECIES.get(mon.종_id);
  const kids: { id: number }[] = sp?.진화?.to ?? [];
  for (const k of kids) {
    const childSp = SPECIES.get(k.id);
    const cond = childSp?.진화?.조건;
    if (cond && cond.방식 === "레벨" && typeof cond.값 === "number" && mon.level >= cond.값) {
      return k.id;
    }
  }
  return null;
}

// 이 종으로 '진화해 들어오는' 최소 레벨(레벨진화면 그 값, 비레벨진화면 추정치)
export function minLevelFor(id: number): number {
  const sp = SPECIES.get(id);
  const cond = sp?.진화?.조건;
  const from = sp?.진화?.from?.id;
  if (!from) return 1;
  if (cond?.방식 === "레벨" && typeof cond.값 === "number") return cond.값;
  return 30; // 돌/교환/친밀도 진화는 30레벨쯤부터 등장한다고 본다
}

// 주어진 레벨에 '맞는 진화 단계'로 내려준다. (저레벨 → 기본형, 고레벨 → 진화형)
// 레벨에 따라 진화하는 시스템이므로, 최종진화형은 충분히 높은 레벨에서만 등장한다.
export function appropriateStage(id: number, level: number): number {
  let cur = id, guard = 0;
  while (guard++ < 6) {
    const sp = SPECIES.get(cur);
    const from = sp?.진화?.from?.id;
    const cond = sp?.진화?.조건;
    if (!from) break;
    const need = cond?.방식 === "레벨" && typeof cond.값 === "number" ? cond.값 : 30;
    if (level < need) { cur = from; continue; }
    break;
  }
  return cur;
}

export function fullHeal(mon: Mon): void {
  mon.curHP = mon.maxHP;
  mon.status = null;
  for (const m of mon.moves) m.pp = m.maxpp;
}
