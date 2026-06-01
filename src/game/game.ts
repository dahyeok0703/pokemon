import { RNG } from "../engine/rng";
import { SPECIES, MOVES, RARITY_WEIGHT, TOURNAMENTS, speciesName, Species, megaForm, megaForms, gmaxForm } from "../engine/data";
import { buildMon, Mon, fullHeal, applyLearn, appropriateStage } from "../engine/pokemon";
import { Battle, Action } from "../engine/battle";
import { BALLS } from "../engine/catch";
import { eligible, licenseFor, genTrainerTeam, buildRounds, tierLevel, RoundDef, isOpen, regWindow, trophyName, entrantCount, closingSoon } from "../engine/tournament";
import { WORLD, CONTINENTS, locsByContinent, LOC_BY_ID, rollEncounter, Method, Location } from "../engine/world";
import { artwork, sprite, shinyArtwork, shinySprite } from "../engine/sprites";
import { npcsPresent, npcChat, npcHint, NPC, NPC_TOTAL, pickFamous, displayName } from "../engine/npc";
import { generateReactions } from "../engine/reactions";
import { Player, newPlayer, save, load, hasSave, wipe, seen, caught } from "./save";
import * as UI from "../ui/ui";

const SHOP = [
  { item: "몬스터볼", 가격: 200 }, { item: "슈퍼볼", 가격: 600 }, { item: "하이퍼볼", 가격: 1200 },
  { item: "상처약", 가격: 300 }, { item: "고급상처약", 가격: 700 },
];
// 강화 장비 (고가, 1회 구매로 보유)
const KEY_ITEMS = [
  { item: "메가링", 가격: 50000, 설명: "메가진화 가능 포켓몬을 전투에서 메가진화시킨다" },
  { item: "다이맥스밴드", 가격: 50000, 설명: "거다이맥스 가능 포켓몬을 전투에서 거다이맥스시킨다" },
];
const GEN_RANGES: [number, number][] = [
  [1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025],
];
const ALL_TYPES = ["노말","불꽃","물","풀","전기","얼음","격투","독","땅","비행","에스퍼","벌레","바위","고스트","드래곤","악","강철","페어리"];
// 지구상 단 하나의 정점
const GRAND_TOURNAMENT = "W-01";

// 스타팅 가능 풀: 전설/환상 제외
const STARTER_POOL: Species[] = Array.from(SPECIES.values()).filter((s) => s.희귀도 !== "전설" && s.희귀도 !== "환상");

interface Archetype { fit?: string[]; lines: (sp: Species, loc: Location) => string[]; }
const BACKGROUNDS: Archetype[] = [
  { fit: ["불꽃"], lines: (sp, loc) => [`당신의 가문은 ${loc.이름}에서 대대로 대장간을 운영해 왔다.`, `용광로의 불 곁에서 자란 ${sp.이름.한}은(는) 집안의 수호신 같은 존재였고, 면허를 딴 당신을 따라나섰다.`] },
  { fit: ["물"], lines: (sp, loc) => [`바다를 끼고 사는 ${loc.이름}의 어부 집안에서 태어난 당신.`, `파도에 휩쓸린 당신을 구해준 ${sp.이름.한}와(과)의 인연이, 이제 함께하는 여정으로 이어진다.`] },
  { fit: ["풀", "벌레"], lines: (sp, loc) => [`식물학자였던 부모를 따라 ${loc.기후}의 숲을 누비며 자란 당신.`, `숲에서 가장 먼저 마음을 연 ${sp.이름.한}이(가) 당신의 첫 파트너가 되었다.`] },
  { fit: ["전기", "강철"], lines: (sp, loc) => [`${loc.이름}의 거대 발전소·공장 지대에서 엔지니어로 일하던 당신.`, `정비실에 자주 드나들던 ${sp.이름.한}와(과) 손발이 맞았고, 둘은 함께 세상에 나섰다.`] },
  { fit: ["얼음"], lines: (sp, loc) => [`극한의 ${loc.기후} 지대, 빙벽을 오르는 탐험가의 피가 흐르는 당신.`, `눈보라 속에서 길을 안내해 준 ${sp.이름.한}, 그 신뢰가 여정의 시작이 되었다.`] },
  { fit: ["격투"], lines: (sp, loc) => [`${loc.이름}의 오래된 도장에서 무도를 수련하며 자란 당신.`, `함께 땀 흘린 ${sp.이름.한}은(는) 스승이자 동료. 이제 더 넓은 무대를 향한다.`] },
  { fit: ["에스퍼", "페어리"], lines: (sp, loc) => [`예부터 영험하다 전해지는 ${loc.이름}에서, 당신은 기묘한 직감을 타고났다.`, `그 힘에 이끌리듯 나타난 ${sp.이름.한}와(과) 마음이 통했다.`] },
  { fit: ["고스트", "악"], lines: (sp, loc) => [`${loc.이름}의 그늘진 뒷골목과 폐허를 떠돌던 당신.`, `누구도 곁을 주지 않을 때, ${sp.이름.한}만이 당신 옆에 남았다. 둘은 서로의 전부다.`] },
  { fit: ["바위", "땅"], lines: (sp, loc) => [`${loc.이름}의 광산·협곡에서 지질을 조사하던 당신.`, `갱도가 무너지던 날 당신을 파낸 ${sp.이름.한}, 그 빚이 우정이 되었다.`] },
  { fit: ["드래곤"], lines: (sp, loc) => [`용의 전설이 깃든 ${loc.이름}, 그 전승을 지키는 가문의 후예인 당신.`, `시험을 통과한 자에게만 마음을 연다는 ${sp.이름.한}이(가) 당신을 택했다.`] },
  { fit: ["비행"], lines: (sp, loc) => [`${loc.이름}의 하늘을 동경하며 자란 당신은 우편·관측 비행을 도왔다.`, `늘 곁을 맴돌던 ${sp.이름.한}와(과) 함께, 더 먼 하늘로 떠난다.`] },
  { fit: ["독"], lines: (sp, loc) => [`${loc.이름}의 약방에서 약초와 독을 다루던 당신.`, `위험한 늪에서 길잡이가 되어준 ${sp.이름.한}, 둘은 그렇게 한 팀이 되었다.`] },
  { fit: ["노말"], lines: (sp, loc) => [`${loc.이름} 토박이인 당신은 어릴 때부터 동네를 누비며 자랐다.`, `가장 영리한 ${sp.이름.한}이(가) 면허를 딴 당신을 스스로 따라나섰다. 둘은 이미 서로를 누구보다 잘 안다.`] },
  // 범용(타입 무관)
  { lines: (sp, loc) => [`${loc.이름}의 생태 연구소 보조였던 당신.`, `다친 어린 ${sp.이름.한}을(를) 밤새 돌본 인연으로, 회복한 그 ${sp.분류 || "포켓몬"}은(는) 당신의 첫 파트너가 되었다.`] },
  { lines: (sp, loc) => [`대대로 ${loc.이름}에서 재난구조대로 일한 가문의 당신.`, `할아버지가 구한 포켓몬의 후손 ${sp.이름.한}을(를) 물려받아 세상으로 나선다.`] },
  { lines: (sp, loc) => [`세계를 떠돌던 유랑자였던 당신은 ${loc.이름}에 머물렀다.`, `그곳에서 ${sp.이름.한}와(과) 맺은 우정이 깊어, 함께 길을 떠나기로 했다.`] },
  { lines: (sp, loc) => [`평범했던 ${loc.이름}의 학생이던 당신, 면허 시험을 막 통과했다.`, `오래 함께한 ${sp.이름.한}와(과) 드디어 진짜 여정을 시작한다.`] },
];
function backgroundFor(sp: Species, loc: Location, rng: RNG): string[] {
  const typed = BACKGROUNDS.filter((b) => b.fit && b.fit.some((t) => sp.타입.includes(t)));
  const generic = BACKGROUNDS.filter((b) => !b.fit);
  const pool = typed.length && rng.rand() < 0.78 ? typed : generic;
  return rng.pick(pool).lines(sp, loc);
}

export class Game {
  p!: Player;
  rng!: RNG;
  battle: Battle | null = null;
  private battleOnEnd: ((b: Battle) => void) | null = null;
  private battleAllowCatch = false;
  private tour: { t: any; rounds: RoundDef[]; idx: number } | null = null;

  // ───── 부트 ─────
  start(): void {
    UI.setStatus(""); UI.clearLog();
    UI.print("포켓몬 · 현실 지구 2035", "head");
    UI.print("2026년, 포켓몬이 진짜 지구에 나타났다. 9년 뒤 — 인간과의 공존은 일상이 되었다.", "dim");
    UI.print("당신은 이제 막 트레이너 면허를 딴 신인. 이 지구를 누비며 살아갈 차례다.", "dim");
    UI.print("");
    const btns: UI.Btn[] = [{ label: "새 게임 시작", on: () => this.newGame(), primary: true }];
    if (hasSave()) { btns.unshift({ label: "이어하기", on: () => this.continueGame(), primary: true });
      btns.push({ label: "세이브 삭제", on: () => { if (confirm("정말 삭제할까요?")) { wipe(); this.start(); } } }); }
    UI.setActions(btns);
  }
  private syncRng(): void { this.rng = new RNG(this.p.rng.seed, this.p.rng.counter); }
  private persist(): void { this.p.rng.counter = this.rng.counter; save(this.p); this.refreshStatus(); }
  private refreshStatus(): void {
    const d = this.p.날짜, t = this.p.시각;
    UI.setStatus(`${this.p.이름} · ${this.p.현재_도시} · ${d.월}/${d.일} ${String(t).padStart(2, "0")}:00${this.p.밤 ? " 🌙" : " ☀️"} · 명성 ${this.p.명성} · ₩${this.p.소지금.toLocaleString()} · ${this.p.면허_등급}`);
  }
  private syncNight(): void { this.p.밤 = this.p.시각 < 6 || this.p.시각 >= 19; }
  private advanceHours(h: number): void {
    this.p.시각 += h;
    while (this.p.시각 >= 24) { this.p.시각 -= 24; this.advanceDays(1); }
    this.syncNight();
  }
  private updateLicense(): void {
    const want = licenseFor(this.p.명성);
    const order = ["신인", "정규", "상급", "마스터"];
    if (order.indexOf(want) > order.indexOf(this.p.면허_등급)) { this.p.면허_등급 = want; UI.print(`📜 면허가 «${want}» 등급으로 승급했다!`, "good"); }
  }
  private loc(): Location { return LOC_BY_ID.get(this.p.현재_장소) ?? WORLD[0]; }
  private partyAvg(): number { const a = this.p.party; return a.length ? Math.round(a.reduce((s, m) => s + m.level, 0) / a.length) : 5; }
  private addMoney(n: number, why: string): void { this.p.소지금 += n; UI.print(`💰 ₩${n.toLocaleString()} 획득 (${why})`, "dim"); }
  private absDay(): number { const d = this.p.날짜; return (d.년 * 12 + d.월) * 28 + d.일; }
  // 전설/환상은 포획·격파 시 이 세계에서 영구 소멸
  private consumeIfSpecial(mon: Mon): void {
    const sp = SPECIES.get(mon.종_id); if (!sp) return;
    if ((sp.희귀도 === "전설" || sp.희귀도 === "환상") && !this.p.소멸_전설.includes(mon.종_id)) {
      this.p.소멸_전설.push(mon.종_id);
      UI.print(`🌑 ${sp.이름.한}은(는) 이제 이 세계에서 사라졌다. 다시는 나타나지 않는다.`, "warn");
    }
  }

  continueGame(): void {
    const p = load(); if (!p) { this.start(); return; }
    this.p = p; this.syncRng(); UI.clearLog();
    UI.print(`다시 오신 걸 환영합니다, ${p.이름} 트레이너.`, "sys");
    UI.print(`${this.loc().이름}. 파티 ${p.party.length}마리 · 명성 ${p.명성} · 도감 ${p.도감_잡은.length}종.`, "dim");
    this.hub();
  }

  // ───── 신규 게임: 이름 → 스타터 자유선택 → 배경 → 튜토리얼 ─────
  newGame(): void {
    UI.clearLog(); UI.print("새로운 여정이 시작된다.", "head"); UI.print("당신의 이름은?");
    UI.inputPrompt("트레이너 이름 입력", (name) => { (this as any)._name = name; this.chooseNationality(); });
  }
  private bestOriginFor(국가: string): string {
    const city = WORLD.find((l) => l.국가 === 국가 && l.도시);
    if (city) return city.id;
    const any = WORLD.find((l) => l.국가 === 국가);
    return any ? any.id : "JP-TYO";
  }
  private chooseNationality(): void {
    UI.clearLog();
    UI.print(`${(this as any)._name}, 당신의 국적은?`, "head");
    UI.print("국적에 따라 출신지가 정해집니다. (배경 이야기는 고른 포켓몬에 맞춰 자동 생성)", "dim");
    const countries = [...new Set(WORLD.filter((l) => l.국가 !== "공해" && l.국가 !== "남극").map((l) => l.국가))];
    UI.setActions(countries.map((c) => ({ label: c, on: () => { (this as any)._locId = this.bestOriginFor(c); this.starterBrowse(); } }))
      .concat([{ label: "↩ 이름 다시", on: () => this.newGame() }]));
  }
  private starterBrowse(): void {
    UI.clearLog();
    UI.print(`${(this as any)._name}, 첫 파트너를 직접 고르세요.`, "head");
    UI.print("전 세대 어떤 포켓몬이든 가능합니다. (전설·환상 포켓몬은 스타팅 불가)", "dim");
    UI.setActions([
      { label: "🔎 이름으로 검색", primary: true, on: () => UI.inputPrompt("포켓몬 이름(일부)", (q) => this.starterList(STARTER_POOL.filter((s) => s.이름.한.includes(q.trim())), 0, `검색: ${q}`)) },
      { label: "📚 세대로 보기", on: () => this.starterByGen() },
      { label: "🏷️ 타입으로 보기", on: () => this.starterByType() },
      { label: "🎲 랜덤 추천 12종", on: () => { const list: Species[] = []; const seen = new Set<number>(); while (list.length < 12) { const s = this.rngOrTemp().pick(STARTER_POOL); if (!seen.has(s.id)) { seen.add(s.id); list.push(s); } } this.starterList(list, 0, "랜덤 추천"); } },
    ]);
  }
  private rngOrTemp(): RNG { return this.rng ?? (this.rng = new RNG(Date.now() >>> 0)); }
  private starterByGen(): void {
    UI.clearLog(); UI.print("세대 선택", "head");
    UI.setActions(GEN_RANGES.map((r, i) => ({ label: `${i + 1}세대`, on: () => this.starterList(STARTER_POOL.filter((s) => s.id >= r[0] && s.id <= r[1]), 0, `${i + 1}세대`) }))
      .concat([{ label: "↩ 뒤로", on: () => this.starterBrowse() }]));
  }
  private starterByType(): void {
    UI.clearLog(); UI.print("타입 선택", "head");
    UI.setActions(ALL_TYPES.map((t) => ({ label: t, on: () => this.starterList(STARTER_POOL.filter((s) => s.타입.includes(t)), 0, `${t} 타입`) }))
      .concat([{ label: "↩ 뒤로", on: () => this.starterBrowse() }]));
  }
  private starterList(pool: Species[], page: number, label: string): void {
    UI.clearLog(); UI.print(`${label} — ${pool.length}종 (클릭해서 선택)`, "head");
    if (!pool.length) { UI.print("결과가 없습니다.", "dim"); UI.setActions([{ label: "↩ 뒤로", on: () => this.starterBrowse() }]); return; }
    const PER = 24, start = page * PER, slice = pool.slice(start, start + PER);
    UI.renderGrid(slice.map((s) => ({ img: sprite(s.id), title: s.이름.한, sub: s.타입.join("·"), on: () => this.starterConfirm(s.id) })));
    const btns: UI.Btn[] = [];
    if (page > 0) btns.push({ label: "◀ 이전", on: () => this.starterList(pool, page - 1, label) });
    if (start + PER < pool.length) btns.push({ label: "다음 ▶", on: () => this.starterList(pool, page + 1, label) });
    btns.push({ label: "↩ 처음으로", on: () => this.starterBrowse() });
    UI.setActions(btns);
  }
  private starterConfirm(id: number): void {
    const sp = SPECIES.get(id)!;
    this.rngOrTemp();
    // 출신지: 플레이어가 고른 국적의 거점
    const loc = LOC_BY_ID.get((this as any)._locId) ?? WORLD[0];
    const bgLines = backgroundFor(sp, loc, this.rng);
    UI.clearLog();
    UI.bigImage(artwork(id), `${sp.이름.한}  [${sp.타입.join("·")}]`);
    UI.print(`${sp.분류} · 종족값합 ${Object.values(sp.종족값).reduce((a, b) => a + b, 0)} · 희귀도 ${sp.희귀도}`, "dim");
    UI.print("");
    UI.print("— 당신의 이야기 —", "head");
    bgLines.forEach((l) => UI.print(l));
    UI.print(`출신지: ${loc.이름} (${loc.국가})`, "sys");
    UI.setActions([
      { label: `이 ${sp.이름.한}와(과) 시작!`, primary: true, on: () => this.beginWith(id, loc.id, bgLines.join(" ")) },
      { label: "↩ 다시 고르기", on: () => this.starterBrowse() },
    ]);
  }
  private beginWith(id: number, locId: string, 배경: string): void {
    const seedCounter = this.rng.counter, seedVal = this.rng.seed;
    this.p = newPlayer((this as any)._name, locId, 배경);
    this.p.rng = { seed: seedVal, counter: seedCounter };
    this.syncRng();
    const starter = buildMon(this.rng, id, 5);
    this.p.party.push(starter); caught(this.p, id);
    this.p.스토리_플래그.push("스타터_획득");
    UI.clearLog();
    UI.bigImage(artwork(id), `${starter.별명} Lv5`);
    UI.print(`${starter.별명}와(과) 함께 여정을 시작한다!`, "good");
    UI.print(`멘토: "좋은 파트너야. 자, 첫 발을 내딛어 봐."`, "npc");
    // 가벼운 튜토리얼 야생전
    const wildId = this.rng.pick(STARTER_POOL.filter((s) => s.희귀도 === "흔함")).id;
    const wild = buildMon(this.rng, wildId, 4);
    seen(this.p, wildId);
    UI.print(`마침 야생 ${wild.별명}(Lv4)이(가) 나타났다! 잡거나 쓰러뜨려 보자.`, "warn");
    this.startBattle([wild], "wild", `야생 ${wild.별명}`, true, (b) => this.resolveWild(b, () => { this.p.스토리_플래그.push("튜토리얼_완료"); for (const m of this.p.party) fullHeal(m); this.hub(); }));
  }

  // ───── 허브 ─────
  hub(): void {
    this.refreshStatus();
    const loc = this.loc();
    const part = this.p.시각 < 6 ? "🌙 새벽" : this.p.시각 < 12 ? "🌅 오전" : this.p.시각 < 18 ? "☀️ 오후" : "🌙 밤";
    UI.head(`${loc.이름} — ${this.p.날짜.월}월 ${this.p.날짜.일}일 ${this.p.시각}시 (${part})`);
    UI.print(loc.설명, "dim");
    const lead = this.p.party.find((m) => m.curHP > 0) ?? this.p.party[0];
    if (lead) UI.printHtml(`<img class="spr sm" src="${this.spr(lead)}"> 선두 ${lead.shiny ? "✨" : ""}<b>${lead.별명}</b> Lv${lead.level} · ${UI.hpBarHtml(lead.curHP, lead.maxHP)}`);
    // 접수 마감 임박 알림
    const soon = TOURNAMENTS.filter((t) => (t.현실_개최지?.도시 === this.p.현재_도시 || t.현실_개최지?.국가 === this.p.현재_국가) && eligible(this.p, t).ok && closingSoon(t, this.p.날짜.월, this.p.날짜.일, this.p.시각));
    soon.slice(0, 3).forEach((t) => UI.print(`⏰ 『${t.이름}』 접수 마감 임박! 지금 출전 가능.`, "warn"));
    const btns: UI.Btn[] = [
      { label: "🌿 탐험", primary: true, on: () => this.exploreMenu() },
      { label: "🧑 사람들", primary: true, on: () => this.npcMenu() },
      { label: "🗺️ 세계로 이동", primary: true, on: () => this.worldMap() },
      { label: "🏆 대회", on: () => this.tournamentList() },
      { label: "🏥 센터", on: () => this.centerMenu() },
      { label: "⏳ 시간 보내기", on: () => { this.advanceHours(3); this.persist(); UI.print(`쉬었다. 지금은 ${this.p.시각}시.`, "dim"); this.hub(); } },
      { label: "📋 파티", on: () => this.partyView() },
      { label: "🎒 가방·트로피", on: () => this.bagView() },
      { label: "📕 도감", on: () => this.pokedex(this.dexGen ?? 1) },
      { label: "💾 저장", on: () => { this.persist(); UI.print("저장했다.", "good"); } },
    ];
    UI.setActions(btns);
  }

  // ───── 탐험 (다양한 방식) ─────
  private exploreMenu(): void {
    const loc = this.loc();
    UI.head(`${loc.이름} 탐험 — 어떻게 찾아볼까?`);
    UI.print(`기후 ${loc.기후} · 주요 타입 ${loc.주요타입.join("·")} · 추천 레벨 ${loc.레벨[0]}~${loc.레벨[1]}`, "dim");
    const desc: Record<Method, string> = {
      걷기: "풀숲·거리를 거닐며 흔한 포켓몬 조우",
      낚시: "물가에서 낚시 (물 타입)",
      서핑: "수면 위를 이동 (물·비행)",
      동굴: "동굴·광산 탐사 (바위·땅·고스트)",
      등산: "고지대 등반 (바위·비행·얼음)",
      야간: "야행성 포켓몬 탐색 (고스트·악·에스퍼)",
      잠복: "오래 잠복해 희귀·배회 포켓몬 노리기 (시간 소모)",
    };
    const btns: UI.Btn[] = loc.방식.map((m) => ({ label: `${m} — ${desc[m]}`, on: () => this.explore(m) }));
    btns.push({ label: "🔭 주변 정찰(랜덤 이벤트)", on: () => this.scout() });
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  // 비전투 랜덤 이벤트
  private scout(): void {
    UI.clearLog(); UI.print("주변을 정찰한다…", "sys");
    this.advanceHours(1);
    const r = this.rng.rand();
    if (r < 0.34) { const gold = this.rng.int(300, 1500); this.addMoney(gold, "버려진 보급품 발견"); }
    else if (r < 0.55) { const it = this.rng.pick(["몬스터볼", "슈퍼볼", "상처약", "고급상처약", "하이퍼볼"]); this.p.인벤토리[it] = (this.p.인벤토리[it] ?? 0) + 1; UI.print(`🎒 ${it}을(를) 주웠다!`, "good"); }
    else if (r < 0.78 && this.p.party.some((m) => m.curHP > 0)) {
      UI.print("떠돌이 트레이너가 승부를 걸어왔다!", "warn");
      const lv = Math.max(3, this.partyAvg() + this.rng.int(-1, 2));
      const enemy = genTrainerTeam(this.rng, lv, {}, this.rng.int(1, 2));
      this.startBattle(enemy, "trainer", "떠돌이 트레이너", false, (b) => {
        UI.print("");
        if (b.state === "win") { const g = lv * this.rng.int(40, 90); this.addMoney(g, "배틀 상금"); this.p.명성 += 3; UI.print("명성 +3", "dim"); }
        else if (b.state === "lose") { this.whiteOut(); return; }
        for (const m of this.p.party) fullHeal(m);
        this.persist();
        UI.setActions([{ label: "계속 탐험", primary: true, on: () => this.exploreMenu() }, { label: "허브로", on: () => this.hub() }]);
      });
      return;
    } else { UI.print("…별다른 건 없었다.", "dim"); }
    this.persist();
    UI.setActions([{ label: "계속 탐험", primary: true, on: () => this.exploreMenu() }, { label: "허브로", on: () => this.hub() }]);
  }
  private explore(method: Method): void {
    if (!this.p.party.some((m) => m.curHP > 0)) { UI.print("싸울 포켓몬이 없다! 센터에서 회복하자.", "warn"); this.whiteOut(); return; }
    const loc = this.loc();
    this.advanceHours(method === "잠복" ? 4 : 1);
    const enc = rollEncounter(this.rng, loc, method, this.p.밤, this.absDay(), this.p.소멸_전설);
    const shiny = this.rng.rand() < 1 / 512;
    const wild = buildMon(this.rng, enc.species.id, enc.level, { shiny });
    seen(this.p, enc.species.id);
    UI.clearLog();
    UI.print(`[${loc.이름} · ${method}${this.p.밤 ? " · 밤" : ""}]`, "dim");
    const rare = enc.mythical ? "✨환상✨ " : enc.legend ? "✨전설✨ " : "";
    UI.bigImage(shiny ? shinyArtwork(enc.species.id) : artwork(enc.species.id), `${shiny ? "✨이로치✨ " : ""}${rare}야생 ${wild.별명} Lv${wild.level}  [${enc.species.타입.join("·")}, ${enc.species.희귀도}]`);
    if (shiny) UI.print("✨ 색이 다른 포켓몬(이로치)이다! 극히 드문 개체!", "crit");
    if (enc.mythical) UI.print("환상의 포켓몬이 나타났다! 세계에 단 하나뿐 — 잡거나 쓰러뜨리면 영영 사라진다!", "crit");
    else if (enc.legend) UI.print("전설의 포켓몬이 모습을 드러냈다! 단 하나뿐인 존재다!", "crit");
    this.startBattle([wild], "wild", `야생 ${wild.별명}`, true, (b) => this.resolveWild(b, () => UI.setActions([
      { label: `계속 ${method}`, primary: true, on: () => this.explore(method) },
      { label: "다른 방식", on: () => this.exploreMenu() },
      { label: "허브로", on: () => this.hub() },
    ])));
  }
  private resolveWild(b: Battle, after: () => void): void {
    UI.print("");
    if (b.state === "caught" && b.caught) {
      const c = b.caught; caught(this.p, c.종_id); fullHeal(c);
      if (this.p.party.length < 6) { this.p.party.push(c); UI.print(`${c.별명}이(가) 파티에 합류했다!`, "good"); }
      else { this.p.box.push(c); UI.print(`${c.별명}은(는) 박스로 보내졌다.`, "good"); }
      this.addMoney(c.level * this.rng.int(15, 30), "포획 보고 보상");
      if (c.shiny) this.addMoney(5000, "✨이로치 포획 보너스");
      this.consumeIfSpecial(c);
    } else if (b.state === "win") {
      UI.print("야생 포켓몬을 쓰러뜨렸다.", "good");
      this.addMoney(b.enemyTeam[0].level * this.rng.int(20, 45), "야생 처치 보상");
      if (b.enemyTeam[0].shiny) this.addMoney(2000, "✨이로치 처치 보너스");
      this.consumeIfSpecial(b.enemyTeam[0]);
    } else if (b.state === "fled") UI.print("전투에서 벗어났다.", "dim");
    else if (b.state === "lose") { this.whiteOut(); return; }
    this.persist(); after();
  }
  private whiteOut(): void {
    UI.print("눈앞이 캄캄해졌다… 가장 가까운 센터로 옮겨졌다.", "warn");
    for (const m of this.p.party) fullHeal(m);
    const loss = Math.min(this.p.소지금, Math.floor(this.p.소지금 * 0.1));
    this.p.소지금 -= loss; if (loss) UI.print(`치료비 ₩${loss.toLocaleString()} 지불.`, "dim");
    this.persist(); UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]);
  }

  // ───── NPC 상호작용 (전 세계 5000명) ─────
  private npcMenu(): void {
    const loc = this.loc();
    UI.head(`${loc.이름}의 사람들`);
    UI.print(`전 세계에 ${NPC_TOTAL.toLocaleString()}명의 트레이너가 살아간다. 지금 이곳에 보이는 이들:`, "dim");
    let here = npcsPresent(loc.id, this.p.날짜.일, 8);
    // 가끔 유명 트레이너가 이 도시에 방문 중
    if (this.rng.rand() < 0.4) { const f = pickFamous(this.rng); if (!here.find((x) => x.id === f.id)) here = [f, ...here].slice(0, 9); }
    const btns: UI.Btn[] = here.map((n) => ({ label: `${n.famous ? "⭐ " : ""}${displayName(n)} (Lv${this.npcLevel(n)}급)`, on: () => this.npcInteract(n) }));
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private npcLevel(n: NPC): number {
    const re = this.p.npc재대결[n.id] ?? 0;
    const base = this.partyAvg() + (n.tier - 3) * 2 + this.rng.int(-1, 1) + Math.min(24, re * 2); // 재대결마다 강해짐
    return Math.max(3, Math.round(n.famous ? Math.max(base, this.partyAvg() + 6) : base));
  }
  private friendTier(f: number): string { return f >= 60 ? "둘도 없는 친구" : f >= 30 ? "친한 사이" : f >= 12 ? "아는 사이" : f > 0 ? "안면" : "초면"; }
  // NPC 파티 구성: 유명 트레이너는 시그니처 에이스 + 정예 필러
  private npcTeam(n: NPC, lv: number, size: number): Mon[] {
    if (n.famous && n.에이스) {
      const fillers = genTrainerTeam(this.rng, lv, {}, Math.max(0, size - 1));
      const aceId = appropriateStage(n.에이스, lv);
      const ace = buildMon(this.rng, aceId, lv, { ivFloor: 26, ivCeil: 31, evs: { 공격: 200, 스피드: 200, HP: 100 } });
      return [...fillers, ace]; // 에이스를 마지막에
    }
    return genTrainerTeam(this.rng, lv, {}, size);
  }
  private npcInteract(n: NPC): void {
    UI.clearLog();
    if (n.famous) UI.bigImage(artwork(n.에이스!), `${displayName(n)} — 에이스 ${this.spName(n.에이스!)}`);
    const f = this.p.npc친밀도[n.id] ?? 0; const re = this.p.npc재대결[n.id] ?? 0;
    UI.print(`${displayName(n)} — ${n.성격} 성격${n.famous ? " · ⭐ 세계적 명성" : ""}`, "head");
    UI.print(`친밀도 ${f} (${this.friendTier(f)})${re ? ` · 대결 ${re}회` : ""}`, "dim");
    UI.printHtml(`<span class="npc">"${n.인사}"</span>`);
    UI.setActions([
      { label: "💬 대화", primary: true, on: () => {
        this.p.npc전적.만남++;
        this.p.npc친밀도[n.id] = (this.p.npc친밀도[n.id] ?? 0) + this.rng.int(1, 3);
        UI.printHtml(`<span class="npc">"${npcChat(this.rng)}"</span>`);
        const fr = this.p.npc친밀도[n.id];
        if (fr >= 30 && this.rng.rand() < 0.35) { const it = this.rng.pick(["하이퍼볼", "고급상처약", "메가링", "다이맥스밴드"]); if ((this.p.인벤토리[it] ?? 0) === 0 || !["메가링", "다이맥스밴드"].includes(it)) { this.p.인벤토리[it] = (this.p.인벤토리[it] ?? 0) + 1; UI.print(`친한 사이라며 ${n.이름}이(가) ${it}을(를) 선물했다!`, "good"); } }
        else if (this.rng.rand() < 0.12) { const it = this.rng.pick(["몬스터볼", "상처약", "슈퍼볼"]); this.p.인벤토리[it] = (this.p.인벤토리[it] ?? 0) + 1; UI.print(`${n.이름}이(가) ${it}을(를) 건넸다!`, "good"); }
        UI.print(`(친밀도 ${fr})`, "dim"); this.persist();
      } },
      { label: re ? `⚔️ 재대결 (${re}회·더 강해짐)` : (n.famous ? "⚔️ 명사에게 도전!" : "⚔️ 대결 신청"), primary: true, on: () => this.npcBattle(n) },
      { label: "🧭 정보 듣기", on: () => { UI.printHtml(`<span class="npc">"${npcHint(this.rng)}"</span>`); } },
      { label: "↩ 돌아가기", on: () => this.npcMenu() },
    ]);
  }
  private spName(id: number): string { return SPECIES.get(id)?.이름.한 ?? `#${id}`; }
  private spr(m: Mon): string { return m.shiny ? shinySprite(m.종_id) : sprite(m.종_id); }
  private npcBattle(n: NPC): void {
    if (!this.p.party.some((m) => m.curHP > 0)) { UI.print("싸울 포켓몬이 없다.", "warn"); return; }
    const re = this.p.npc재대결[n.id] ?? 0;
    const lv = this.npcLevel(n);
    const size = Math.min(6, (n.famous ? 4 : 1 + Math.floor(n.tier / 2)) + Math.min(2, Math.floor(re / 2)) + (this.rng.rand() < 0.4 ? 1 : 0));
    const enemy = this.npcTeam(n, lv, size);
    UI.clearLog(); UI.print(`${displayName(n)}와(과)의 ${re ? `${re + 1}번째 대결` : "대결"}! (${size}마리, Lv${lv}급)`, "sys");
    if (re > 0) UI.print("재대결을 거듭할수록 상대는 더 강해진다.", "dim");
    this.startBattle(enemy, "trainer", displayName(n), false, (b) => {
      UI.print("");
      this.p.npc재대결[n.id] = re + 1;
      if (b.state === "win") {
        const g = lv * this.rng.int(50, 100) * (n.famous ? 3 : 1) + re * 200; this.addMoney(g, "배틀 상금");
        const fame = (2 + n.tier) * (n.famous ? 4 : 1) + re; this.p.명성 += fame; this.p.npc전적.승리++;
        this.p.npc친밀도[n.id] = (this.p.npc친밀도[n.id] ?? 0) + 5;
        UI.print(`명성 +${fame} · 친밀도 +5`, "dim");
        UI.printHtml(`<span class="npc">"${n.famous ? "훌륭하군. 자네 이름, 기억해두지." : "졌다… 강하네요! 또 붙어요!"}"</span>`); this.updateLicense();
      } else if (b.state === "lose") { this.p.npc전적.패배++; this.p.npc친밀도[n.id] = (this.p.npc친밀도[n.id] ?? 0) + 2; this.whiteOut(); return; }
      for (const m of this.p.party) fullHeal(m);
      this.persist();
      UI.setActions([{ label: "다시 도전", on: () => this.npcBattle(n) }, { label: "다른 사람", primary: true, on: () => this.npcMenu() }, { label: "허브로", on: () => this.hub() }]);
    });
  }

  // ───── 가방 / 트로피 ─────
  private bagView(): void {
    UI.head("가방");
    const items = Object.entries(this.p.인벤토리).filter(([, n]) => n > 0);
    if (items.length) items.forEach(([k, v]) => UI.print(`· ${k} ×${v}`)); else UI.print("아이템이 없다.", "dim");
    UI.print("");
    UI.print(`🏆 트로피 진열장 (${this.p.트로피.length})`, "head");
    if (this.p.트로피.length) this.p.트로피.forEach((t) => UI.print(`· ${t}`, "good")); else UI.print("아직 트로피가 없다. 대회에서 우승해 보자!", "dim");
    UI.setActions([{ label: "↩ 돌아가기", on: () => this.hub() }]);
  }

  // ───── 세계 지도 이동 ─────
  private worldMap(): void {
    UI.head("세계로 이동 (이동 시 날짜가 흐른다)");
    UI.setActions(CONTINENTS.map((c) => ({ label: c, on: () => this.continentMenu(c) })).concat([{ label: "↩ 돌아가기", on: () => this.hub() }]));
  }
  private travelCost(dest: Location): { cost: number; days: number } {
    const cur = this.loc();
    if (dest.대륙 === cur.대륙) return { cost: 3000 + ((this.hashStr(dest.id) % 6) * 1000), days: 1 };
    return { cost: 18000 + ((this.hashStr(dest.id) % 23) * 1000), days: 2 + (this.hashStr(dest.id) % 2) };
  }
  private hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  private continentMenu(c: string): void {
    UI.head(`${c} — 이동 (항공료·시간 소요)`);
    const here = this.p.현재_장소;
    const btns: UI.Btn[] = locsByContinent(c).map((l) => {
      const { cost, days } = this.travelCost(l);
      const cur = l.id === here;
      return {
        label: cur ? `📍 ${l.이름} (현재)` : `${l.도시 ? "🏙️ " : "⛰️ "}${l.이름} — ₩${cost.toLocaleString()}/${days}일`,
        disabled: cur,
        on: () => {
          if (this.p.소지금 < cost) { UI.print(`항공료가 부족하다. (₩${cost.toLocaleString()} 필요, 보유 ₩${this.p.소지금.toLocaleString()})`, "warn"); return; }
          this.p.소지금 -= cost; this.advanceDays(days);
          this.p.현재_장소 = l.id; this.p.현재_도시 = l.이름; this.p.현재_국가 = l.국가;
          UI.clearLog(); UI.print(`✈️ ${l.이름}에 도착했다. (항공료 ₩${cost.toLocaleString()}, ${days}일 소요)`, "sys"); UI.print(l.설명, "dim");
          this.persist(); this.hub();
        },
      };
    });
    btns.push({ label: "↩ 대륙 목록", on: () => this.worldMap() });
    UI.setActions(btns);
  }
  private advanceDays(n: number): void {
    let { 년, 월, 일 } = this.p.날짜; 일 += n;
    while (일 > 28) { 일 -= 28; 월++; if (월 > 12) { 월 = 1; 년++; } }
    this.p.날짜 = { 년, 월, 일 };
  }

  // ───── 전투 UI ─────
  private startBattle(enemy: Mon[], kind: "wild" | "trainer", label: string, allowCatch: boolean, onEnd: (b: Battle) => void): void {
    this.battle = new Battle(this.rng, this.p.party, enemy, kind, label);
    this.battleAllowCatch = allowCatch; this.battleOnEnd = onEnd; this.renderBattle();
  }
  private renderBattle(): void {
    const b = this.battle!; this.persist();
    if (b.state !== "ongoing") { b.revertForms(); this.battleOnEnd?.(b); return; }
    if (b.awaitingSwitch) { UI.print("다음 포켓몬을 내보내자.", "warn"); this.renderSwitch(true); return; }
    const me = b.pActive(), en = b.eActive();
    const tag = (m: Mon) => (m.형태표시 ? `<span class="crit">${m.형태표시}</span> ` : "") + (m.shiny ? `<span class="crit">✨</span> ` : "");
    const st = (m: Mon) => (m.status ? ` <span class="warn">[${m.status}]</span>` : "");
    const img = (m: Mon) => (m.shiny ? shinyArtwork(m.종_id) : artwork(m.종_id));
    UI.printHtml(`<div class="battlerow"><img src="${img(en)}"><div class="info">${tag(en)}<b>${en.별명}</b> Lv${en.level} [${en.types.join("·")}]${st(en)}<br>${UI.hpBarHtml(en.curHP, en.maxHP)}</div></div>`);
    UI.printHtml(`<div class="battlerow"><img src="${img(me)}"><div class="info">${tag(me)}<b>${me.별명}</b> Lv${me.level} [${me.types.join("·")}]${st(me)}<br>${UI.hpBarHtml(me.curHP, me.maxHP)}${me.gmax ? ` <span class="dim">(거다이맥스 ${me.gmax}턴)</span>` : ""}</div></div>`);
    const canMega = !b.megaUsed && !me.mega && !me.gmax && (this.p.인벤토리["메가링"] ?? 0) > 0 && !!megaForm(me.종_id);
    const canGmax = !b.gmaxUsed && !me.gmax && !me.mega && (this.p.인벤토리["다이맥스밴드"] ?? 0) > 0 && !!gmaxForm(me.종_id);
    UI.setActions([
      { label: "⚔️ 싸우다", primary: true, on: () => this.renderMoves() },
      ...(canMega ? [{ label: "✨ 메가진화", on: () => this.chooseMega() }] : []),
      ...(canGmax ? [{ label: "✨ 거다이맥스", on: () => this.act({ type: "gmax" }) }] : []),
      ...(this.battleAllowCatch ? [{ label: "🎯 잡기", on: () => this.renderBalls() }] : []),
      { label: "🎒 가방", on: () => this.renderItems() },
      { label: "🔄 포켓몬", on: () => this.renderSwitch(false) },
      ...(b.kind === "wild" ? [{ label: "🏃 도망", on: () => this.act({ type: "run" }) }] : []),
    ]);
  }
  private chooseMega(): void {
    const me = this.battle!.pActive();
    const forms = megaForms(me.종_id);
    if (forms.length <= 1) { this.act({ type: "mega", variant: 0 }); return; }
    UI.print("메가스톤을 선택하세요. (X / Y)", "sys");
    const btns: UI.Btn[] = forms.map((f, i) => {
      const xy = f.식별자?.endsWith("-x") ? "X" : f.식별자?.endsWith("-y") ? "Y" : `${i + 1}`;
      const bst = Object.values(f.종족값).reduce((a: number, b: any) => a + (b as number), 0);
      return { label: `메가스톤 ${xy} — [${f.타입.join("·")}] 종족합 ${bst}`, primary: true, on: () => this.act({ type: "mega", variant: i }) };
    });
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderMoves(): void {
    const me = this.battle!.pActive();
    const btns: UI.Btn[] = me.moves.map((s, i) => {
      const mv = MOVES[s.name];
      return { label: `${s.name} (${mv ? `${mv.타입}/${mv.분류}/위${mv.위력 ?? "-"}` : "?"}) PP${s.pp}/${s.maxpp}`, on: () => this.act({ type: "move", index: i }), disabled: s.pp <= 0 };
    });
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderBalls(): void {
    const btns: UI.Btn[] = Object.keys(BALLS).map((key) => { const n = this.p.인벤토리[key] ?? 0; return { label: `${key} ×${n}`, disabled: n <= 0, on: () => { this.p.인벤토리[key]--; this.act({ type: "catch", ball: key, ballMod: BALLS[key].mod, ballName: key }); } }; });
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderItems(): void {
    const btns: UI.Btn[] = ["상처약", "고급상처약"].map((it) => { const n = this.p.인벤토리[it] ?? 0; return { label: `${it} ×${n}`, disabled: n <= 0, on: () => { this.p.인벤토리[it]--; this.act({ type: "item", item: it }); } }; });
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderSwitch(forced: boolean): void {
    const b = this.battle!; const btns: UI.Btn[] = [];
    this.p.party.forEach((m, i) => {
      if (i === b.pIndex && !forced) return;
      btns.push({ label: `${m.별명} Lv${m.level} (${m.curHP}/${m.maxHP})`, disabled: m.curHP <= 0, on: () => {
        if (forced) { b.forceSwitch(i, (t, c) => UI.print(t, c)); this.renderBattle(); } else this.act({ type: "switch", partyIndex: i });
      }});
    });
    if (!forced) btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private act(a: Action): void { UI.printLines(this.battle!.doTurn(a)); this.afterTurn(); }

  // 턴 후: 진화 축하 패널 / 기술 교체 프롬프트를 차례로 처리한 뒤 배틀 재개
  private afterTurn(): void {
    const b = this.battle!;
    if (b.events.evolves.length) { const ev = b.events.evolves.shift()!; this.evolutionPanel(ev, () => this.afterTurn()); return; }
    if (b.events.learns.length) { const ln = b.events.learns.shift()!; this.learnPrompt(ln, () => this.afterTurn()); return; }
    this.renderBattle();
  }
  private evolutionPanel(ev: { mon: Mon; fromName: string; toId: number; toName: string }, cont: () => void): void {
    UI.clearLog();
    UI.print("———  ✨ 진 화 ✨  ———", "head");
    UI.bigImage(artwork(ev.toId), `${ev.fromName}  →  ${ev.toName}`);
    UI.print(`🎉 축하합니다! ${ev.fromName}이(가) ${ev.toName}(으)로 진화했습니다!`, "good");
    UI.print(`새로운 힘이 깨어났다. ${ev.toName}의 능력치가 크게 상승했다!`, "sys");
    this.persist();
    UI.setActions([{ label: "계속", primary: true, on: cont }]);
  }
  private learnPrompt(ln: { mon: Mon; move: string }, cont: () => void): void {
    UI.print(`📘 ${ln.mon.별명}이(가) «${ln.move}»을(를) 배우려 한다! 하지만 기술이 4개라 하나를 잊어야 한다.`, "warn");
    const btns: UI.Btn[] = ln.mon.moves.map((s, i) => ({
      label: `«${s.name}» 잊고 배우기`,
      on: () => { applyLearn(ln.mon, ln.move, i); UI.print(`${ln.mon.별명}은(는) «${s.name}»을(를) 잊고 «${ln.move}»을(를) 배웠다!`, "good"); cont(); },
    }));
    btns.push({ label: `«${ln.move}» 배우지 않기`, on: () => { UI.print(`${ln.mon.별명}은(는) «${ln.move}»을(를) 배우지 않았다.`, "dim"); cont(); } });
    UI.setActions(btns);
  }

  // ───── 센터 / 상점 / 박스 ─────
  private centerMenu(): void {
    UI.head(`포켓몬 센터`);
    UI.setActions([
      { label: "💖 회복", primary: true, on: () => { for (const m of this.p.party) fullHeal(m); this.persist(); UI.print("간호사: 모두 건강해졌어요!", "good"); } },
      { label: "🛒 상점", on: () => this.shop() },
      { label: "📦 박스", on: () => this.boxView() },
      { label: "↩ 돌아가기", on: () => this.hub() },
    ]);
  }
  private shop(): void {
    UI.head(`상점 (보유 ₩${this.p.소지금.toLocaleString()})`);
    const btns: UI.Btn[] = SHOP.map((s) => ({ label: `${s.item} — ₩${s.가격}`, disabled: this.p.소지금 < s.가격, on: () => { this.p.소지금 -= s.가격; this.p.인벤토리[s.item] = (this.p.인벤토리[s.item] ?? 0) + 1; this.persist(); UI.print(`${s.item} 구입 (보유 ${this.p.인벤토리[s.item]})`, "good"); this.shop(); } }));
    UI.print("— 강화 장비 —", "dim");
    for (const k of KEY_ITEMS) {
      const owned = (this.p.인벤토리[k.item] ?? 0) > 0;
      btns.push({ label: owned ? `${k.item} (보유중)` : `${k.item} — ₩${k.가격.toLocaleString()}`, disabled: owned || this.p.소지금 < k.가격, on: () => { this.p.소지금 -= k.가격; this.p.인벤토리[k.item] = 1; this.persist(); UI.print(`${k.item} 구입! ${k.설명}.`, "good"); this.shop(); } });
    }
    btns.push({ label: "↩ 돌아가기", on: () => this.centerMenu() });
    UI.setActions(btns);
  }
  private boxView(): void {
    UI.head(`박스 (${this.p.box.length}마리)`);
    if (this.p.box.length) UI.renderGrid(this.p.box.map((m) => ({ img: this.spr(m), title: `${m.shiny ? "✨" : ""}${m.별명}`, sub: `Lv${m.level}` })));
    else UI.print("박스가 비어 있다.", "dim");
    const btns: UI.Btn[] = [];
    if (this.p.box.length && this.p.party.length < 6) btns.push({ label: "맨 앞 박스 → 파티", on: () => { this.p.party.push(this.p.box.shift()!); this.persist(); this.boxView(); } });
    btns.push({ label: "↩ 돌아가기", on: () => this.centerMenu() });
    UI.setActions(btns);
  }

  // ───── 대회 ─────
  private tournamentList(): void {
    UI.head("대회 — 출전 가능한 무대");
    UI.print(`현재 ${this.p.날짜.월}월 ${this.p.날짜.일}일 ${this.p.시각}시. 대회마다 접수 기간이 정해져 있다.`, "dim");
    const here = TOURNAMENTS.filter((t) => t.현실_개최지?.도시 === this.p.현재_도시 || t.현실_개최지?.국가 === this.p.현재_국가);
    const list = (here.length ? here : TOURNAMENTS.filter((t) => t.티어 === "로컬")).slice(0, 10);
    const btns: UI.Btn[] = list.map((t) => {
      const el = eligible(this.p, t); const lv = tierLevel(t.티어, t.특수룰, this.partyAvg());
      const open = isOpen(t, this.p.날짜.월, this.p.날짜.일, this.p.시각);
      const soon = open && closingSoon(t, this.p.날짜.월, this.p.날짜.일, this.p.시각);
      const tag = !el.ok ? "🔒자격" : soon ? "⏰마감임박" : open ? "🟢접수중" : "🔴마감";
      const star = t.id === GRAND_TOURNAMENT ? "🌟[세계최강] " : "";
      return { label: `${star}${t.이름} [${t.티어}] Lv≤${lv} ${tag}`, on: () => {
        if (!el.ok) { UI.print(`출전 불가: ${el.reasons.join(", ")}`, "warn"); return; }
        if (!open) { UI.print(`지금은 접수 기간이 아니다. 접수: ${regWindow(t).text}`, "warn"); return; }
        this.tournamentEnter(t);
      } };
    });
    btns.push({ label: "티어별 둘러보기", on: () => this.tournamentBrowse() });
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private tournamentBrowse(): void {
    UI.head("티어별 대회");
    UI.setActions(["로컬", "지방", "국가", "대륙", "세계", "특수"].map((tier) => ({ label: tier, on: () => {
      UI.head(`${tier} 대회 (일부)`);
      TOURNAMENTS.filter((t) => t.티어 === tier).slice(0, 12).forEach((t) => { const el = eligible(this.p, t); const star = t.id === GRAND_TOURNAMENT ? "🌟[세계최강] " : ""; UI.print(`${star}${el.ok ? "✅" : "🔒"} ${t.이름} @${t.현실_개최지?.도시} — 명성${t.출전_자격?.최소_명성}/${t.출전_자격?.면허_등급} · 접수 ${regWindow(t).text}`, el.ok ? undefined : "dim"); });
      UI.setActions([{ label: "↩ 티어 목록", on: () => this.tournamentBrowse() }, { label: "↩ 허브", on: () => this.hub() }]);
    } })).concat([{ label: "↩ 돌아가기", on: () => this.tournamentList() }]));
  }
  private tournamentEnter(t: any): void {
    if (!isOpen(t, this.p.날짜.월, this.p.날짜.일, this.p.시각)) { UI.print(`접수 기간이 아니다. 접수: ${regWindow(t).text}`, "warn"); return; }
    if (!this.p.party.some((m) => m.curHP > 0)) { UI.print("출전할 포켓몬이 없다. 회복하자.", "warn"); return; }
    UI.clearLog();
    if (t.id === GRAND_TOURNAMENT) UI.print("🌟 지구상 단 하나의 정점 — 세계 최고의 대회 🌟", "head");
    UI.print(`『${t.이름}』 출전 등록!`, "head"); UI.print(t.설명 ?? "", "dim");
    const entrants = entrantCount(t);
    UI.print(`참가 신청 ${entrants.toLocaleString()}명 — 살벌한 예선을 뚫고 본선에 진출했다!`, "warn");
    const lv = tierLevel(t.티어, t.특수룰, this.partyAvg());
    UI.print(`상대 예상 레벨 ≤ ${lv}. 본선부터는 한 번만 져도 탈락.`, "sys");
    for (const m of this.p.party) fullHeal(m);
    this.tour = { t, rounds: buildRounds(t), idx: 0 }; this.advanceHours(3); this.tournamentRound();
  }
  private tournamentRound(): void {
    const tour = this.tour!;
    if (tour.idx >= tour.rounds.length) { this.tournamentWin(); return; }
    const rd = tour.rounds[tour.idx]; const lv = tierLevel(tour.t.티어, tour.t.특수룰, this.partyAvg());
    const isFinal = tour.idx === tour.rounds.length - 1;
    const bigTier = ["국가", "대륙", "세계", "특수"].includes(tour.t.티어);
    // 결승, 혹은 큰 대회 후반엔 유명 트레이너(명사)가 자주 등장
    const useFamous = isFinal || (bigTier && tour.idx >= tour.rounds.length - 2 && this.rng.rand() < 0.7);
    let label: string, enemy: Mon[], oppName = "";
    if (useFamous) {
      const f = pickFamous(this.rng);
      oppName = displayName(f);
      enemy = this.npcTeam(f, lv, Math.min(6, rd.teamSize + (isFinal ? 2 : 1)));
      UI.head(`${rd.이름} — ⭐ ${oppName}`);
      UI.printHtml(`<span class="npc">"${f.인사}"</span>`);
      UI.print(`에이스: ${this.spName(f.에이스!)}. 만만치 않은 상대다!`, "warn");
    } else {
      enemy = genTrainerTeam(this.rng, lv, tour.t.특수룰, rd.teamSize);
      oppName = `${rd.이름} 상대`;
      UI.head(`${rd.이름}`); UI.print(`정예 트레이너(${rd.teamSize}마리)와 대결!`, "sys");
    }
    this.startBattle(enemy, "trainer", oppName, false, (b) => {
      UI.print("");
      if (b.state === "win") { UI.print(`${rd.이름} 승리!`, "good"); tour.idx++; for (const m of this.p.party) fullHeal(m); UI.setActions([{ label: tour.idx >= tour.rounds.length ? "결과 확인" : "다음 라운드", primary: true, on: () => this.tournamentRound() }]); }
      else this.tournamentLose();
    });
  }
  private tournamentWin(): void {
    const t = this.tour!.t; const prize = t.상금?.우승 ?? 0, fame = t.명성_점수?.우승 ?? 0;
    this.p.소지금 += prize; this.p.명성 += fame;
    this.p.대회_전적.push({ id: t.id, 이름: t.이름, 결과: "우승", 명성: fame, 상금: prize });
    const trophy = trophyName(t); this.p.트로피.push(trophy);
    const grand = t.id === GRAND_TOURNAMENT;
    UI.clearLog();
    if (grand) {
      UI.print("👑👑👑  세 계 최 강  👑👑👑", "head");
      if (!this.p.스토리_플래그.includes("세계_챔피언")) this.p.스토리_플래그.push("세계_챔피언");
      UI.print(`${this.p.이름}, 당신은 마침내 지구상 단 하나의 정점에 올랐다. 전 세계가 당신의 이름을 부른다.`, "good");
    }
    UI.head(`🏆 ${t.이름} 우승!`); UI.print(`상금 ₩${prize.toLocaleString()} · 명성 +${fame}`, "good");
    UI.print(`트로피 획득: ${trophy} (가방에 보관됨)`, "good");
    const reward = t.보상_아이템?.[0]; if (reward) UI.print(`보상: ${reward.아이템}`, "good");
    this.updateLicense(); const tier = t.티어, tourName = t.이름; this.tour = null; this.persist();
    this.showReactions(tourName, tier, () => UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]));
  }
  // 큰 대회일수록 각국·네티즌 반응이 커진다
  private showReactions(tourName: string, tier: string, cont: () => void): void {
    const r = generateReactions(this.rng, this.p.이름, tourName, tier);
    if (r.news.length || r.comments.length) {
      UI.print(""); UI.print("———  🌐 세계의 반응  ———", "head");
      r.news.forEach((n) => UI.print(n, "sys"));
      if (r.comments.length) {
        UI.print("");
        UI.print("💬 네티즌 반응", "head");
        r.comments.forEach((c) => UI.printHtml(`<span class="dim">[${c.country}] @${c.handle}</span> ${c.text}`));
      }
    }
    cont();
  }
  private tournamentLose(): void {
    const t = this.tour!.t; const fame = t.명성_점수?.본선진출 ?? 0; this.p.명성 += fame;
    this.p.대회_전적.push({ id: t.id, 이름: t.이름, 결과: "본선진출", 명성: fame, 상금: 0 });
    UI.print(`아쉽게 탈락… 본선진출 명성 +${fame}.`, "warn");
    for (const m of this.p.party) fullHeal(m); this.updateLicense(); this.tour = null; this.persist();
    UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]);
  }

  // ───── 파티 / 도감 ─────
  private partyView(): void {
    UI.head(`파티 (${this.p.party.length}/6)`);
    this.p.party.forEach((m, i) => {
      UI.printHtml(`<div class="battlerow"><img class="spr md" src="${this.spr(m)}"><div class="info">${i === 0 ? "▶ " : ""}${m.shiny ? "✨" : ""}<b>${m.별명}</b> Lv${m.level} [${m.types.join("·")}] ${m.성별}<br>${UI.hpBarHtml(m.curHP, m.maxHP)}<br><span class="dim">${m.nature} · ${m.moves.map((x) => x.name).join(", ")}</span></div></div>`);
    });
    const btns: UI.Btn[] = [];
    this.p.party.forEach((m, i) => { if (i > 0) btns.push({ label: `${m.별명} 선두로`, on: () => { const [x] = this.p.party.splice(i, 1); this.p.party.unshift(x); this.persist(); this.partyView(); } }); });
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }

  private dexGen = 1;
  private pokedex(gen: number): void {
    this.dexGen = gen;
    const [lo, hi] = GEN_RANGES[gen - 1];
    UI.clearLog();
    UI.head(`포켓몬 도감 — ${gen}세대`);
    UI.print(`본 종 ${this.p.도감_본.length} / 1025 · 잡은 종 ${this.p.도감_잡은.length} / 1025`, "sys");
    const seenSet = new Set(this.p.도감_본), caughtSet = new Set(this.p.도감_잡은);
    const tiles: UI.Tile[] = [];
    for (let id = lo; id <= hi; id++) {
      const sp = SPECIES.get(id); if (!sp) continue;
      const isSeen = seenSet.has(id);
      tiles.push({
        img: sprite(id),
        title: isSeen ? sp.이름.한 : `No.${id}`,
        sub: isSeen ? sp.타입.join("·") : "???",
        dim: !isSeen,
        mark: caughtSet.has(id) ? "✅" : (isSeen ? "👁" : ""),
        on: isSeen ? () => this.dexDetail(id) : undefined,
      });
    }
    UI.renderGrid(tiles);
    const tabs: UI.Btn[] = GEN_RANGES.map((_, i) => ({ label: `${i + 1}세대`, primary: i + 1 === gen, on: () => this.pokedex(i + 1) }));
    tabs.push({ label: "↩ 허브", on: () => this.hub() });
    UI.setActions(tabs);
  }
  private dexDetail(id: number): void {
    const sp = SPECIES.get(id)!;
    UI.clearLog();
    UI.bigImage(artwork(id), `No.${id} ${sp.이름.한}  [${sp.타입.join("·")}]`);
    UI.print(`${sp.분류} · 희귀도 ${sp.희귀도} · 경험치그룹 ${sp.경험치그룹}`, "dim");
    UI.print(`종족값  HP ${sp.종족값.HP} / 공 ${sp.종족값.공격} / 방 ${sp.종족값.방어} / 특공 ${sp.종족값.특공} / 특방 ${sp.종족값.특방} / 스피드 ${sp.종족값.스피드}`);
    if (sp.현실_출현지역?.length) UI.print(`출현지: ${sp.현실_출현지역.join(", ")}`, "sys");
    UI.print(this.p.도감_잡은.includes(id) ? "상태: ✅ 포획 완료" : "상태: 👁 목격", this.p.도감_잡은.includes(id) ? "good" : "dim");
    UI.setActions([{ label: "↩ 도감", on: () => this.pokedex(this.dexGen) }, { label: "↩ 허브", on: () => this.hub() }]);
  }
}
