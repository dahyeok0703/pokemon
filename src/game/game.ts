import { RNG } from "../engine/rng";
import {
  SPECIES, MOVES, BIOMES, CITY_BIOME, STARTER_SETS, RARITY_WEIGHT,
  TOURNAMENTS, speciesName, typeMult,
} from "../engine/data";
import { buildMon, Mon, fullHeal } from "../engine/pokemon";
import { Battle, Action, BattleState } from "../engine/battle";
import { BALLS } from "../engine/catch";
import {
  eligible, licenseFor, genTrainerTeam, buildRounds, tierLevel, RoundDef,
} from "../engine/tournament";
import { Player, newPlayer, save, load, hasSave, wipe, seen, caught } from "./save";
import * as UI from "../ui/ui";

const HUB_CITIES = [
  { 도시: "도쿄", 국가: "일본" }, { 도시: "서울", 국가: "대한민국" },
  { 도시: "런던", 국가: "영국" }, { 도시: "파리", 국가: "프랑스" },
  { 도시: "베를린", 국가: "독일" }, { 도시: "로마", 국가: "이탈리아" },
  { 도시: "뉴욕", 국가: "미국" }, { 도시: "라스베이거스", 국가: "미국" },
  { 도시: "상파울루", 국가: "브라질" }, { 도시: "시드니", 국가: "오스트레일리아" },
  { 도시: "카이로", 국가: "이집트" },
];
const SHOP = [
  { item: "몬스터볼", 가격: 200 }, { item: "슈퍼볼", 가격: 600 }, { item: "하이퍼볼", 가격: 1200 },
  { item: "상처약", 가격: 300 }, { item: "고급상처약", 가격: 700 },
];

export class Game {
  p!: Player;
  rng!: RNG;
  battle: Battle | null = null;
  private battleOnEnd: ((b: Battle) => void) | null = null;
  private battleAllowCatch = false;
  private tour: { t: any; rounds: RoundDef[]; idx: number } | null = null;

  // ---- 부트 ----
  start(): void {
    UI.setStatus("");
    UI.clearLog();
    UI.print("포켓몬 · 현실 지구 2035", "head");
    UI.print("2026년, 포켓몬이 진짜 지구에 나타났다. 9년 뒤 — 인간과의 공존은 일상이 되었다.", "dim");
    UI.print("당신은 이제 막 트레이너 면허를 딴 신인이다.", "dim");
    UI.print("");
    const btns: UI.Btn[] = [{ label: "새 게임 시작", on: () => this.newGame(), primary: true }];
    if (hasSave()) btns.unshift({ label: "이어하기", on: () => this.continueGame(), primary: true });
    if (hasSave()) btns.push({ label: "세이브 삭제", on: () => { if (confirm("정말 삭제할까요?")) { wipe(); this.start(); } } });
    UI.setActions(btns);
  }

  private syncRng(): void { this.rng = new RNG(this.p.rng.seed, this.p.rng.counter); }
  private persist(): void { this.p.rng.counter = this.rng.counter; save(this.p); this.refreshStatus(); }
  private refreshStatus(): void {
    UI.setStatus(`${this.p.이름} · ${this.p.현재_도시} · 명성 ${this.p.명성} · ₩${this.p.소지금.toLocaleString()} · ${this.p.면허_등급}`);
  }
  private updateLicense(): void {
    const want = licenseFor(this.p.명성);
    const order = ["신인", "정규", "상급", "마스터"];
    if (order.indexOf(want) > order.indexOf(this.p.면허_등급)) {
      this.p.면허_등급 = want;
      UI.print(`📜 면허가 «${want}» 등급으로 승급했다!`, "good");
    }
  }
  private partyAvg(): number {
    const a = this.p.party; return a.length ? Math.round(a.reduce((s, m) => s + m.level, 0) / a.length) : 5;
  }

  continueGame(): void {
    const p = load(); if (!p) { this.start(); return; }
    this.p = p; this.syncRng();
    UI.clearLog();
    UI.print(`다시 오신 걸 환영합니다, ${p.이름} 트레이너.`, "sys");
    UI.print(`${p.현재_도시}의 포켓몬 센터에서 눈을 뜬다. 파티 ${p.party.length}마리, 명성 ${p.명성}.`, "dim");
    this.hub();
  }

  // ---- 신규 게임 ----
  newGame(): void {
    UI.clearLog();
    UI.print("새로운 여정이 시작된다.", "head");
    UI.print("당신의 이름은?");
    UI.inputPrompt("트레이너 이름 입력", (name) => this.chooseCity(name));
  }
  private chooseCity(name: string): void {
    UI.clearLog();
    UI.print(`반가워요, ${name}. 어디 출신인가요?`, "head");
    UI.print("출신지에 따라 주변에 나타나는 포켓몬이 달라집니다.", "dim");
    UI.setActions(HUB_CITIES.slice(0, 8).map((c) => ({
      label: `${c.도시} (${c.국가})`,
      on: () => { this.p = newPlayer(name, c.국가, c.도시); this.syncRng(); this.chooseStarter(); },
    })));
  }
  private chooseStarter(): void {
    UI.clearLog();
    UI.print(`멘토 사카모토 렌이 다가온다.`, "npc");
    UI.print(`"면허는 받았다며? 자, 첫 파트너를 골라. 신중하게."`, "npc");
    UI.print("");
    const set = STARTER_SETS[0]; // 정통 3종
    const btns: UI.Btn[] = set.ids.map((id) => {
      const sp = SPECIES.get(id)!;
      return {
        label: `${sp.이름.한} [${sp.타입.join("·")}]`,
        on: () => this.startWith(id),
        primary: true,
      };
    });
    btns.push({
      label: "각 후보 정보 보기",
      on: () => {
        set.ids.forEach((id) => {
          const sp = SPECIES.get(id)!;
          const bst = Object.values(sp.종족값).reduce((a, b) => a + b, 0);
          UI.print(`· ${sp.이름.한} [${sp.타입.join("·")}] — ${sp.분류}, 종족값합 ${bst}`, "dim");
        });
      },
    });
    UI.setActions(btns);
  }
  private startWith(id: number): void {
    const starter = buildMon(this.rng, id, 5);
    this.p.party.push(starter);
    caught(this.p, id);
    UI.clearLog();
    UI.print(`${starter.별명}을(를) 파트너로 맞이했다!`, "good");
    UI.print(`"좋은 선택이야. 그 눈빛, 9년 전 내가 처음 그것들을 봤을 때랑 닮았군."`, "npc");
    UI.print("");
    // 라이벌
    const counter = { 4: 7, 7: 1, 1: 4 }[id] ?? 7; // 불→물, 물→풀, 풀→불
    UI.print(`동기 트레이너 유진이 ${speciesName(counter)}을(를) 들고 나타난다.`, "npc");
    UI.print(`"어? 너도 오늘 면허 땄어? 그럼 첫 라이벌은 너로 정했어! 한 판 어때?"`, "npc");
    this.p.스토리_플래그.push("스타터_획득", "멘토_사카모토_만남", "라이벌_유진_만남");
    UI.setActions([{ label: "튜토리얼 배틀!", primary: true, on: () => this.tutorialBattle(counter) }]);
  }
  private tutorialBattle(counterId: number): void {
    const rival = buildMon(this.rng, counterId, 5, { ivFloor: 10, ivCeil: 22 });
    this.startBattle([rival], "trainer", "유진", false, (b) => {
      UI.print("");
      if (b.state === "win") UI.print(`"역시! 이래야 따라잡는 맛이 있지. 다음 대회에서 보자!"`, "npc");
      else UI.print(`"오늘은 내가 이겼네! 그래도 넌 좋은 라이벌이야."`, "npc");
      this.p.스토리_플래그.push("튜토리얼_완료");
      for (const m of this.p.party) fullHeal(m);
      UI.print("멘토가 가까운 로컬 신인배 출전을 권한다. 여정을 시작하자!", "sys");
      this.persist();
      UI.setActions([{ label: "여정 시작 (메인 메뉴)", primary: true, on: () => this.hub() }]);
    });
  }

  // ---- 허브 ----
  hub(): void {
    this.refreshStatus();
    UI.head(`${this.p.현재_도시} — 무엇을 할까?`);
    const lead = this.p.party[0];
    if (lead) UI.printHtml(`선두: <b>${lead.별명}</b> Lv${lead.level} · ${UI.hpBarHtml(lead.curHP, lead.maxHP)}`);
    UI.setActions([
      { label: "🌿 탐험 (야생)", on: () => this.exploreMenu(), primary: true },
      { label: "🏆 대회", on: () => this.tournamentList(), primary: true },
      { label: "🏥 포켓몬 센터", on: () => this.centerMenu() },
      { label: "✈️ 이동", on: () => this.travelMenu() },
      { label: "📋 파티", on: () => this.partyView() },
      { label: "📕 도감", on: () => this.pokedex() },
      { label: "💾 저장", on: () => { this.persist(); UI.print("저장했다.", "good"); } },
    ]);
  }

  // ---- 탐험 / 야생 전투 ----
  private exploreMenu(): void {
    UI.head("어디를 탐험할까?");
    const idxs = CITY_BIOME[this.p.현재_도시] ?? BIOMES.map((_, i) => i);
    const btns: UI.Btn[] = idxs.map((i) => ({ label: BIOMES[i].이름, on: () => this.encounter(i) }));
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private encounter(biomeIdx: number): void {
    const biome = BIOMES[biomeIdx];
    const pool = Array.from(SPECIES.values()).filter(
      (s) => s.타입.some((t) => biome.타입.includes(t)) && (RARITY_WEIGHT[s.희귀도] ?? 0) > 0
    );
    if (!pool.length) { UI.print("이 지형엔 아무것도 없는 것 같다…", "dim"); UI.setActions([{ label: "↩", on: () => this.exploreMenu() }]); return; }
    const weights = pool.map((s) => RARITY_WEIGHT[s.희귀도]);
    const sp = this.rng.weighted(pool, weights);
    const lvl = Math.max(2, this.partyAvg() + this.rng.int(-2, 2));
    const wild = buildMon(this.rng, sp.id, lvl);
    seen(this.p, sp.id);
    UI.clearLog();
    UI.print(`${biome.이름}을(를) 탐험한다…`, "sys");
    UI.print(`야생 ${wild.별명}(Lv${wild.level})이(가) 나타났다! [${sp.타입.join("·")}, ${sp.희귀도}]`, "warn");
    if (!this.p.party.some((m) => m.curHP > 0)) { UI.print("싸울 수 있는 포켓몬이 없다! 센터로.", "warn"); this.whiteOut(); return; }
    this.startBattle([wild], "wild", `야생 ${wild.별명}`, true, (b) => {
      UI.print("");
      if (b.state === "caught" && b.caught) {
        const c = b.caught;
        caught(this.p, c.종_id);
        fullHeal(c);
        if (this.p.party.length < 6) { this.p.party.push(c); UI.print(`${c.별명}이(가) 파티에 합류했다!`, "good"); }
        else { this.p.box.push(c); UI.print(`${c.별명}은(는) 박스로 보내졌다.`, "good"); }
      } else if (b.state === "win") UI.print("야생 포켓몬을 쓰러뜨렸다.", "good");
      else if (b.state === "fled") UI.print("전투에서 벗어났다.", "dim");
      else if (b.state === "lose") { this.whiteOut(); return; }
      this.persist();
      UI.setActions([
        { label: "계속 탐험", on: () => this.exploreMenu(), primary: true },
        { label: "허브로", on: () => this.hub() },
      ]);
    });
  }
  private whiteOut(): void {
    UI.print("눈앞이 캄캄해졌다… 가장 가까운 포켓몬 센터로 옮겨졌다.", "warn");
    for (const m of this.p.party) fullHeal(m);
    const loss = Math.min(this.p.소지금, Math.floor(this.p.소지금 * 0.1));
    this.p.소지금 -= loss;
    if (loss) UI.print(`치료비로 ₩${loss.toLocaleString()}를 지불했다.`, "dim");
    this.persist();
    UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]);
  }

  // ---- 전투 UI (공용) ----
  private startBattle(enemy: Mon[], kind: "wild" | "trainer", label: string, allowCatch: boolean, onEnd: (b: Battle) => void): void {
    this.battle = new Battle(this.rng, this.p.party, enemy, kind, label);
    this.battleAllowCatch = allowCatch;
    this.battleOnEnd = onEnd;
    this.renderBattle();
  }
  private renderBattle(): void {
    const b = this.battle!;
    this.persist();
    if (b.state !== "ongoing") { this.battleOnEnd?.(b); return; }
    if (b.awaitingSwitch) { this.renderForcedSwitch(); return; }
    const me = b.pActive(), en = b.eActive();
    UI.printHtml(`<span class="dim">상대</span> <b>${en.별명}</b> Lv${en.level} [${en.types.join("·")}] · ${UI.hpBarHtml(en.curHP, en.maxHP)}`);
    UI.printHtml(`<span class="dim">내</span> <b>${me.별명}</b> Lv${me.level} [${me.types.join("·")}] · ${UI.hpBarHtml(me.curHP, me.maxHP)}`);
    UI.setActions([
      { label: "⚔️ 싸우다", primary: true, on: () => this.renderMoves() },
      ...(this.battleAllowCatch ? [{ label: "🎯 잡기", on: () => this.renderBalls() }] : []),
      { label: "🎒 가방", on: () => this.renderItems() },
      { label: "🔄 포켓몬", on: () => this.renderSwitch(false) },
      ...(this.battle!.kind === "wild" ? [{ label: "🏃 도망", on: () => this.act({ type: "run" }) }] : []),
    ]);
  }
  private renderMoves(): void {
    const me = this.battle!.pActive();
    const btns: UI.Btn[] = me.moves.map((s, i) => {
      const mv = MOVES[s.name];
      const tag = mv ? `${mv.타입}/${mv.분류}/위${mv.위력 ?? "-"}` : "?";
      return { label: `${s.name} (${tag}) PP${s.pp}/${s.maxpp}`, on: () => this.act({ type: "move", index: i }), disabled: s.pp <= 0 };
    });
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderBalls(): void {
    const btns: UI.Btn[] = [];
    for (const key of Object.keys(BALLS)) {
      const n = this.p.인벤토리[key] ?? 0;
      btns.push({ label: `${key} ×${n}`, disabled: n <= 0, on: () => { this.p.인벤토리[key]--; this.act({ type: "catch", ball: key, ballMod: BALLS[key].mod, ballName: key }); } });
    }
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderItems(): void {
    const btns: UI.Btn[] = [];
    for (const it of ["상처약", "고급상처약"]) {
      const n = this.p.인벤토리[it] ?? 0;
      btns.push({ label: `${it} ×${n}`, disabled: n <= 0, on: () => { this.p.인벤토리[it]--; this.act({ type: "item", item: it }); } });
    }
    btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderSwitch(forced: boolean): void {
    const b = this.battle!;
    const btns: UI.Btn[] = [];
    this.p.party.forEach((m, i) => {
      if (i === b.pIndex && !forced) return;
      btns.push({ label: `${m.별명} Lv${m.level} (${m.curHP}/${m.maxHP})`, disabled: m.curHP <= 0, on: () => {
        if (forced) { b.forceSwitch(i, (t, c) => UI.print(t, c)); this.renderBattle(); }
        else this.act({ type: "switch", partyIndex: i });
      }});
    });
    if (!forced) btns.push({ label: "↩ 뒤로", on: () => this.renderBattle() });
    UI.setActions(btns);
  }
  private renderForcedSwitch(): void {
    UI.print("다음 포켓몬을 내보내자.", "warn");
    this.renderSwitch(true);
  }
  private act(a: Action): void {
    const lines = this.battle!.doTurn(a);
    UI.printLines(lines);
    this.renderBattle();
  }

  // ---- 포켓몬 센터 / 상점 ----
  private centerMenu(): void {
    UI.head(`${this.p.현재_도시} 포켓몬 센터`);
    UI.setActions([
      { label: "💖 회복", primary: true, on: () => { for (const m of this.p.party) fullHeal(m); this.persist(); UI.print("간호사: 모두 건강해졌어요!", "good"); } },
      { label: "🛒 상점", on: () => this.shop() },
      { label: "📦 박스", on: () => this.boxView() },
      { label: "↩ 돌아가기", on: () => this.hub() },
    ]);
  }
  private shop(): void {
    UI.head(`상점 (보유 ₩${this.p.소지금.toLocaleString()})`);
    const btns: UI.Btn[] = SHOP.map((s) => ({
      label: `${s.item} — ₩${s.가격}`, disabled: this.p.소지금 < s.가격,
      on: () => { this.p.소지금 -= s.가격; this.p.인벤토리[s.item] = (this.p.인벤토리[s.item] ?? 0) + 1; this.persist(); UI.print(`${s.item} 구입. (보유 ${this.p.인벤토리[s.item]})`, "good"); this.shop(); },
    }));
    btns.push({ label: "↩ 돌아가기", on: () => this.centerMenu() });
    UI.setActions(btns);
  }
  private boxView(): void {
    UI.head(`박스 (${this.p.box.length}마리)`);
    if (!this.p.box.length) UI.print("박스가 비어 있다.", "dim");
    this.p.box.forEach((m) => UI.print(`· ${m.별명} Lv${m.level} [${m.types.join("·")}]`, "dim"));
    const btns: UI.Btn[] = [];
    if (this.p.box.length && this.p.party.length < 6) {
      btns.push({ label: "맨 앞 박스 → 파티", on: () => { this.p.party.push(this.p.box.shift()!); this.persist(); this.boxView(); } });
    }
    btns.push({ label: "↩ 돌아가기", on: () => this.centerMenu() });
    UI.setActions(btns);
  }

  // ---- 이동 ----
  private travelMenu(): void {
    UI.head("어디로 이동할까? (날짜가 흐른다)");
    const btns: UI.Btn[] = HUB_CITIES.filter((c) => c.도시 !== this.p.현재_도시).map((c) => ({
      label: `${c.도시} (${c.국가})`,
      on: () => { this.p.현재_도시 = c.도시; this.p.현재_국가 = c.국가; this.advanceDays(1); UI.print(`${c.도시}에 도착했다.`, "sys"); this.persist(); this.hub(); },
    }));
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private advanceDays(n: number): void {
    let { 년, 월, 일 } = this.p.날짜;
    일 += n; while (일 > 28) { 일 -= 28; 월++; if (월 > 12) { 월 = 1; 년++; } }
    this.p.날짜 = { 년, 월, 일 };
  }

  // ---- 대회 ----
  private tournamentList(): void {
    UI.head("대회 — 출전 가능한 무대");
    const here = TOURNAMENTS.filter((t) => t.현실_개최지?.도시 === this.p.현재_도시);
    const list = (here.length ? here : TOURNAMENTS.filter((t) => t.티어 === "로컬")).slice(0, 8);
    UI.print(`${this.p.현재_도시} 인근 / 추천 대회:`, "dim");
    const btns: UI.Btn[] = [];
    for (const t of list) {
      const el = eligible(this.p, t);
      const lv = tierLevel(t.티어, t.특수룰, this.partyAvg());
      const label = `${t.이름} [${t.티어}] Lv≤${lv}${el.ok ? "" : " 🔒"}`;
      btns.push({ label, on: () => el.ok ? this.tournamentEnter(t) : (UI.print(`출전 불가: ${el.reasons.join(", ")}`, "warn")) });
    }
    btns.push({ label: "다른 도시 대회 보기", on: () => this.tournamentBrowse() });
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private tournamentBrowse(): void {
    UI.head("티어별 대회");
    UI.setActions(["로컬", "지방", "국가", "대륙", "세계", "특수"].map((tier) => ({
      label: tier, on: () => {
        UI.head(`${tier} 대회 (일부)`);
        TOURNAMENTS.filter((t) => t.티어 === tier).slice(0, 10).forEach((t) => {
          const el = eligible(this.p, t);
          UI.print(`${el.ok ? "✅" : "🔒"} ${t.이름} @${t.현실_개최지?.도시} — 명성${t.출전_자격?.최소_명성}/${t.출전_자격?.면허_등급}`, el.ok ? undefined : "dim");
        });
        UI.setActions([{ label: "↩ 티어 목록", on: () => this.tournamentBrowse() }, { label: "↩ 허브", on: () => this.hub() }]);
      },
    })).concat([{ label: "↩ 돌아가기", on: () => this.tournamentList() }]));
  }
  private tournamentEnter(t: any): void {
    if (!this.p.party.some((m) => m.curHP > 0)) { UI.print("출전할 포켓몬이 없다. 먼저 회복하자.", "warn"); return; }
    UI.clearLog();
    UI.print(`『${t.이름}』 출전 등록 완료!`, "head");
    UI.print(t.설명 ?? "", "dim");
    const lv = tierLevel(t.티어, t.특수룰, this.partyAvg());
    UI.print(`상대 예상 레벨 ≤ ${lv}. 행운을 빈다.`, "sys");
    for (const m of this.p.party) fullHeal(m);
    this.tour = { t, rounds: buildRounds(t), idx: 0 };
    this.advanceDays(1);
    this.tournamentRound();
  }
  private tournamentRound(): void {
    const tour = this.tour!;
    if (tour.idx >= tour.rounds.length) { this.tournamentWin(); return; }
    const rd = tour.rounds[tour.idx];
    const lv = tierLevel(tour.t.티어, tour.t.특수룰, this.partyAvg());
    const enemy = genTrainerTeam(this.rng, lv, tour.t.특수룰, rd.teamSize);
    UI.head(`${rd.이름}`);
    UI.print(`상대 트레이너 (${rd.teamSize}마리)와의 대결!`, "sys");
    this.startBattle(enemy, "trainer", `${rd.이름} 상대`, false, (b) => {
      UI.print("");
      if (b.state === "win") {
        UI.print(`${rd.이름} 승리!`, "good");
        tour.idx++;
        for (const m of this.p.party) fullHeal(m);
        UI.setActions([{ label: tour.idx >= tour.rounds.length ? "결과 확인" : "다음 라운드", primary: true, on: () => this.tournamentRound() }]);
      } else {
        this.tournamentLose();
      }
    });
  }
  private tournamentWin(): void {
    const t = this.tour!.t;
    const prize = t.상금?.우승 ?? 0;
    const fame = t.명성_점수?.우승 ?? 0;
    this.p.소지금 += prize; this.p.명성 += fame;
    this.p.대회_전적.push({ id: t.id, 이름: t.이름, 결과: "우승", 명성: fame, 상금: prize });
    UI.head(`🏆 ${t.이름} 우승!`);
    UI.print(`상금 ₩${prize.toLocaleString()} · 명성 +${fame}`, "good");
    const reward = t.보상_아이템?.[0];
    if (reward) UI.print(`보상: ${reward.아이템}`, "good");
    this.updateLicense();
    this.tour = null;
    this.persist();
    UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]);
  }
  private tournamentLose(): void {
    const t = this.tour!.t;
    const fame = t.명성_점수?.본선진출 ?? 0;
    this.p.명성 += fame;
    this.p.대회_전적.push({ id: t.id, 이름: t.이름, 결과: "본선진출", 명성: fame, 상금: 0 });
    UI.print(`아쉽게 탈락… 본선진출 명성 +${fame}.`, "warn");
    for (const m of this.p.party) fullHeal(m);
    this.updateLicense();
    this.tour = null;
    this.persist();
    UI.setActions([{ label: "허브로", primary: true, on: () => this.hub() }]);
  }

  // ---- 파티 / 도감 ----
  private partyView(): void {
    UI.head(`파티 (${this.p.party.length}/6)`);
    this.p.party.forEach((m, i) => {
      const sp = SPECIES.get(m.종_id)!;
      UI.printHtml(`${i === 0 ? "▶ " : "&nbsp;&nbsp;"}<b>${m.별명}</b> Lv${m.level} [${m.types.join("·")}] ${m.성별} · ${UI.hpBarHtml(m.curHP, m.maxHP)}`);
      UI.print(`     성격 ${m.nature} · 기술 ${m.moves.map((x) => x.name).join(", ")}`, "dim");
    });
    const btns: UI.Btn[] = [];
    this.p.party.forEach((m, i) => { if (i > 0) btns.push({ label: `${m.별명} 선두로`, on: () => { const [x] = this.p.party.splice(i, 1); this.p.party.unshift(x); this.persist(); this.partyView(); } }); });
    btns.push({ label: "↩ 돌아가기", on: () => this.hub() });
    UI.setActions(btns);
  }
  private pokedex(): void {
    UI.head("포켓몬 도감");
    UI.print(`본 종: ${this.p.도감_본.length} / 1025`, "sys");
    UI.print(`잡은 종: ${this.p.도감_잡은.length} / 1025`, "good");
    const names = this.p.도감_잡은.slice(-12).map((id) => speciesName(id)).join(", ");
    if (names) UI.print(`최근 포획: ${names}`, "dim");
    UI.setActions([{ label: "↩ 돌아가기", on: () => this.hub() }]);
  }
}
