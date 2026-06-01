import { RNG } from "../engine/rng";
import { SPECIES, MOVES, RARITY_WEIGHT, TOURNAMENTS, speciesName, Species } from "../engine/data";
import { buildMon, Mon, fullHeal } from "../engine/pokemon";
import { Battle, Action } from "../engine/battle";
import { BALLS } from "../engine/catch";
import { eligible, licenseFor, genTrainerTeam, buildRounds, tierLevel, RoundDef } from "../engine/tournament";
import { WORLD, CONTINENTS, locsByContinent, LOC_BY_ID, rollEncounter, Method, Location } from "../engine/world";
import { artwork, sprite } from "../engine/sprites";
import { Player, newPlayer, save, load, hasSave, wipe, seen, caught } from "./save";
import * as UI from "../ui/ui";

const SHOP = [
  { item: "몬스터볼", 가격: 200 }, { item: "슈퍼볼", 가격: 600 }, { item: "하이퍼볼", 가격: 1200 },
  { item: "상처약", 가격: 300 }, { item: "고급상처약", 가격: 700 },
];
const GEN_RANGES: [number, number][] = [
  [1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025],
];
const ALL_TYPES = ["노말","불꽃","물","풀","전기","얼음","격투","독","땅","비행","에스퍼","벌레","바위","고스트","드래곤","악","강철","페어리"];

// 스타팅 가능 풀: 전설/환상 제외
const STARTER_POOL: Species[] = Array.from(SPECIES.values()).filter((s) => s.희귀도 !== "전설" && s.희귀도 !== "환상");

const ARCHETYPES = [
  (sp: Species, loc: Location) => [
    `당신은 ${loc.이름}의 생태 연구소 보조였다.`,
    `어느 날 ${loc.기후} 지대에서 다친 어린 ${sp.이름.한}을(를) 발견해 밤새 돌봤고,`,
    `회복한 그 ${sp.분류 || "포켓몬"}은(는) 당신 곁을 떠나지 않았다. 그렇게 당신의 첫 파트너가 되었다.`,
  ],
  (sp: Species, loc: Location) => [
    `당신의 가족은 대대로 ${loc.이름}에서 재난구조대로 일해 왔다.`,
    `${sp.이름.한}은(는) 할아버지가 마지막 출동에서 구한 포켓몬의 후손으로, 가문이 함께 키워 왔다.`,
    `이제 그 인연을 이어받아, 당신과 ${sp.이름.한}이(가) 세상으로 나선다.`,
  ],
  (sp: Species, loc: Location) => [
    `세계를 떠도는 유랑 트레이너였던 당신은 ${loc.이름}에 잠시 머물렀다.`,
    `그곳 ${loc.기후} 지대에서 ${sp.이름.한}와(과) 맺은 우정이 너무 깊어, 함께 길을 떠나기로 했다.`,
    `${sp.분류 || "그 포켓몬"}답게, ${sp.이름.한}은(는) 낯선 길을 두려워하지 않는다.`,
  ],
  (sp: Species, loc: Location) => [
    `${loc.이름} 토박이인 당신은 어릴 때부터 ${sp.서식_환경 || "그 지역"}을 누비며 자랐다.`,
    `동네에서 가장 영리한 ${sp.이름.한}이(가) 면허를 딴 당신을 스스로 따라나섰다.`,
    `둘은 이미 서로를 누구보다 잘 안다.`,
  ],
];

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
    UI.setStatus(`${this.p.이름} · ${this.p.현재_도시}${this.p.밤 ? " 🌙" : " ☀️"} · 명성 ${this.p.명성} · ₩${this.p.소지금.toLocaleString()} · ${this.p.면허_등급}`);
  }
  private updateLicense(): void {
    const want = licenseFor(this.p.명성);
    const order = ["신인", "정규", "상급", "마스터"];
    if (order.indexOf(want) > order.indexOf(this.p.면허_등급)) { this.p.면허_등급 = want; UI.print(`📜 면허가 «${want}» 등급으로 승급했다!`, "good"); }
  }
  private loc(): Location { return LOC_BY_ID.get(this.p.현재_장소) ?? WORLD[0]; }
  private partyAvg(): number { const a = this.p.party; return a.length ? Math.round(a.reduce((s, m) => s + m.level, 0) / a.length) : 5; }
  private addMoney(n: number, why: string): void { this.p.소지금 += n; UI.print(`💰 ₩${n.toLocaleString()} 획득 (${why})`, "dim"); }

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
    UI.inputPrompt("트레이너 이름 입력", (name) => { (this as any)._name = name; this.starterBrowse(); });
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
    // 출신지: 스타터 타입에 맞는 거점 지역
    const cities = WORLD.filter((l) => l.도시 && l.주요타입.some((t) => sp.타입.includes(t)));
    const loc = (cities.length ? this.rng.pick(cities) : this.rng.pick(WORLD.filter((l) => l.도시)));
    const bgLines = this.rng.pick(ARCHETYPES)(sp, loc);
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
    UI.head(`${loc.이름} — ${this.p.밤 ? "🌙 밤" : "☀️ 낮"}`);
    UI.print(loc.설명, "dim");
    const lead = this.p.party.find((m) => m.curHP > 0) ?? this.p.party[0];
    if (lead) UI.printHtml(`<img class="spr sm" src="${sprite(lead.종_id)}"> 선두 <b>${lead.별명}</b> Lv${lead.level} · ${UI.hpBarHtml(lead.curHP, lead.maxHP)}`);
    const btns: UI.Btn[] = [
      { label: "🌿 탐험", primary: true, on: () => this.exploreMenu() },
      { label: "🗺️ 세계로 이동", primary: true, on: () => this.worldMap() },
      { label: this.p.밤 ? "☀️ 낮으로" : "🌙 밤으로", on: () => { this.p.밤 = !this.p.밤; this.advanceDays(0); this.persist(); this.hub(); } },
      { label: "🏆 대회", on: () => this.tournamentList() },
      { label: "🏥 센터", on: () => this.centerMenu() },
      { label: "📋 파티", on: () => this.partyView() },
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
    this.advanceDays(0);
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
        for (const m of this.p.party) if (m.curHP > 0) {/* keep */}
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
    if (method === "잠복") this.advanceDays(1);
    const enc = rollEncounter(this.rng, loc, method, this.p.밤);
    const wild = buildMon(this.rng, enc.species.id, enc.level);
    seen(this.p, enc.species.id);
    UI.clearLog();
    UI.print(`[${loc.이름} · ${method}${this.p.밤 ? " · 밤" : ""}]`, "dim");
    UI.bigImage(artwork(enc.species.id), `${enc.legend ? "✨전설✨ " : ""}야생 ${wild.별명} Lv${wild.level}  [${enc.species.타입.join("·")}, ${enc.species.희귀도}]`);
    if (enc.legend) UI.print("전설의 포켓몬이 모습을 드러냈다! 놓치지 마라!", "crit");
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
    } else if (b.state === "win") {
      UI.print("야생 포켓몬을 쓰러뜨렸다.", "good");
      this.addMoney(b.enemyTeam[0].level * this.rng.int(20, 45), "야생 처치 보상");
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

  // ───── 세계 지도 이동 ─────
  private worldMap(): void {
    UI.head("세계로 이동 (이동 시 날짜가 흐른다)");
    UI.setActions(CONTINENTS.map((c) => ({ label: c, on: () => this.continentMenu(c) })).concat([{ label: "↩ 돌아가기", on: () => this.hub() }]));
  }
  private continentMenu(c: string): void {
    UI.head(`${c}`);
    const here = this.p.현재_장소;
    const btns: UI.Btn[] = locsByContinent(c).map((l) => ({
      label: `${l.도시 ? "🏙️ " : "⛰️ "}${l.이름}${l.id === here ? " (현재)" : ""}`,
      disabled: l.id === here,
      on: () => { this.p.현재_장소 = l.id; this.p.현재_도시 = l.이름; this.p.현재_국가 = l.국가; this.advanceDays(this.rng.int(1, 3)); UI.clearLog(); UI.print(`${l.이름}에 도착했다.`, "sys"); UI.print(l.설명, "dim"); this.persist(); this.hub(); },
    }));
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
    if (b.state !== "ongoing") { this.battleOnEnd?.(b); return; }
    if (b.awaitingSwitch) { UI.print("다음 포켓몬을 내보내자.", "warn"); this.renderSwitch(true); return; }
    const me = b.pActive(), en = b.eActive();
    UI.printHtml(`<div class="battlerow"><img src="${artwork(en.종_id)}"><div class="info"><b>${en.별명}</b> Lv${en.level} [${en.types.join("·")}]<br>${UI.hpBarHtml(en.curHP, en.maxHP)}</div></div>`);
    UI.printHtml(`<div class="battlerow"><img src="${artwork(me.종_id)}"><div class="info"><b>${me.별명}</b> Lv${me.level} [${me.types.join("·")}]<br>${UI.hpBarHtml(me.curHP, me.maxHP)}</div></div>`);
    UI.setActions([
      { label: "⚔️ 싸우다", primary: true, on: () => this.renderMoves() },
      ...(this.battleAllowCatch ? [{ label: "🎯 잡기", on: () => this.renderBalls() }] : []),
      { label: "🎒 가방", on: () => this.renderItems() },
      { label: "🔄 포켓몬", on: () => this.renderSwitch(false) },
      ...(b.kind === "wild" ? [{ label: "🏃 도망", on: () => this.act({ type: "run" }) }] : []),
    ]);
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
  private act(a: Action): void { UI.printLines(this.battle!.doTurn(a)); this.renderBattle(); }

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
    btns.push({ label: "↩ 돌아가기", on: () => this.centerMenu() });
    UI.setActions(btns);
  }
  private boxView(): void {
    UI.head(`박스 (${this.p.box.length}마리)`);
    if (this.p.box.length) UI.renderGrid(this.p.box.map((m) => ({ img: sprite(m.종_id), title: m.별명, sub: `Lv${m.level}` })));
    else UI.print("박스가 비어 있다.", "dim");
    const btns: UI.Btn[] = [];
    if (this.p.box.length && this.p.party.length < 6) btns.push({ label: "맨 앞 박스 → 파티", on: () => { this.p.party.push(this.p.box.shift()!); this.persist(); this.boxView(); } });
    btns.push({ label: "↩ 돌아가기", on: () => this.centerMenu() });
    UI.setActions(btns);
  }

  // ───── 대회 ─────
  private tournamentList(): void {
    UI.head("대회 — 출전 가능한 무대");
    const here = TOURNAMENTS.filter((t) => t.현실_개최지?.도시 === this.p.현재_도시 || t.현실_개최지?.국가 === this.p.현재_국가);
    const list = (here.length ? here : TOURNAMENTS.filter((t) => t.티어 === "로컬")).slice(0, 8);
    const btns: UI.Btn[] = list.map((t) => {
      const el = eligible(this.p, t); const lv = tierLevel(t.티어, t.특수룰, this.partyAvg());
      return { label: `${t.이름} [${t.티어}] Lv≤${lv}${el.ok ? "" : " 🔒"}`, on: () => el.ok ? this.tournamentEnter(t) : UI.print(`출전 불가: ${el.reasons.join(", ")}`, "warn") };
    });
    btns.push({ label: "티어별 둘러보기", on: () => this.tournamentBrowse() });
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private tournamentBrowse(): void {
    UI.head("티어별 대회");
    UI.setActions(["로컬", "지방", "국가", "대륙", "세계", "특수"].map((tier) => ({ label: tier, on: () => {
      UI.head(`${tier} 대회 (일부)`);
      TOURNAMENTS.filter((t) => t.티어 === tier).slice(0, 12).forEach((t) => { const el = eligible(this.p, t); UI.print(`${el.ok ? "✅" : "🔒"} ${t.이름} @${t.현실_개최지?.도시} — 명성${t.출전_자격?.최소_명성}/${t.출전_자격?.면허_등급}`, el.ok ? undefined : "dim"); });
      UI.setActions([{ label: "↩ 티어 목록", on: () => this.tournamentBrowse() }, { label: "↩ 허브", on: () => this.hub() }]);
    } })).concat([{ label: "↩ 돌아가기", on: () => this.tournamentList() }]));
  }
  private tournamentEnter(t: any): void {
    if (!this.p.party.some((m) => m.curHP > 0)) { UI.print("출전할 포켓몬이 없다. 회복하자.", "warn"); return; }
    UI.clearLog(); UI.print(`『${t.이름}』 출전 등록!`, "head"); UI.print(t.설명 ?? "", "dim");
    const lv = tierLevel(t.티어, t.특수룰, this.partyAvg());
    UI.print(`상대 예상 레벨 ≤ ${lv}.`, "sys");
    for (const m of this.p.party) fullHeal(m);
    this.tour = { t, rounds: buildRounds(t), idx: 0 }; this.advanceDays(1); this.tournamentRound();
  }
  private tournamentRound(): void {
    const tour = this.tour!;
    if (tour.idx >= tour.rounds.length) { this.tournamentWin(); return; }
    const rd = tour.rounds[tour.idx]; const lv = tierLevel(tour.t.티어, tour.t.특수룰, this.partyAvg());
    const enemy = genTrainerTeam(this.rng, lv, tour.t.특수룰, rd.teamSize);
    UI.head(`${rd.이름}`); UI.print(`상대 트레이너(${rd.teamSize}마리)와 대결!`, "sys");
    this.startBattle(enemy, "trainer", `${rd.이름} 상대`, false, (b) => {
      UI.print("");
      if (b.state === "win") { UI.print(`${rd.이름} 승리!`, "good"); tour.idx++; for (const m of this.p.party) fullHeal(m); UI.setActions([{ label: tour.idx >= tour.rounds.length ? "결과 확인" : "다음 라운드", primary: true, on: () => this.tournamentRound() }]); }
      else this.tournamentLose();
    });
  }
  private tournamentWin(): void {
    const t = this.tour!.t; const prize = t.상금?.우승 ?? 0, fame = t.명성_점수?.우승 ?? 0;
    this.p.소지금 += prize; this.p.명성 += fame;
    this.p.대회_전적.push({ id: t.id, 이름: t.이름, 결과: "우승", 명성: fame, 상금: prize });
    UI.head(`🏆 ${t.이름} 우승!`); UI.print(`상금 ₩${prize.toLocaleString()} · 명성 +${fame}`, "good");
    const reward = t.보상_아이템?.[0]; if (reward) UI.print(`보상: ${reward.아이템}`, "good");
    this.updateLicense(); this.tour = null; this.persist();
    UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]);
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
      UI.printHtml(`<div class="battlerow"><img class="spr md" src="${sprite(m.종_id)}"><div class="info">${i === 0 ? "▶ " : ""}<b>${m.별명}</b> Lv${m.level} [${m.types.join("·")}] ${m.성별}<br>${UI.hpBarHtml(m.curHP, m.maxHP)}<br><span class="dim">${m.nature} · ${m.moves.map((x) => x.name).join(", ")}</span></div></div>`);
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
