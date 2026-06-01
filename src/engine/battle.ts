import { RNG } from "./rng";
import { MOVES, typeMult, speciesName, megaForms, gmaxForm, STAT_KEYS } from "./data";
import { Mon, expYield, gainExp, ExpEvents, newExpEvents, calcOne } from "./pokemon";
import { catchAttempt, statusMod } from "./catch";

export type LogLine = { text: string; cls?: string };
export type Action =
  | { type: "move"; index: number }
  | { type: "switch"; partyIndex: number }
  | { type: "item"; item: string }
  | { type: "catch"; ball: string; ballMod: number; ballName: string }
  | { type: "mega"; variant: number }
  | { type: "gmax" }
  | { type: "run" };

export type BattleState = "ongoing" | "win" | "lose" | "fled" | "caught";

// 기술 타입 → 추가효과로 유발하는 상태이상
const STATUS_BY_TYPE: Record<string, string> = { 불꽃: "화상", 전기: "마비", 얼음: "얼음", 독: "독", 풀: "독" };

export class Battle {
  rng: RNG;
  playerTeam: Mon[];
  enemyTeam: Mon[];
  pIndex = 0;
  eIndex = 0;
  kind: "wild" | "trainer";
  enemyLabel: string;
  state: BattleState = "ongoing";
  awaitingSwitch = false;
  caught: Mon | null = null;
  startCounter: number;
  events: ExpEvents = newExpEvents();
  megaUsed = false;
  gmaxUsed = false;

  constructor(rng: RNG, playerTeam: Mon[], enemyTeam: Mon[], kind: "wild" | "trainer", enemyLabel = "") {
    this.rng = rng;
    this.playerTeam = playerTeam;
    this.enemyTeam = enemyTeam;
    this.kind = kind;
    this.enemyLabel = enemyLabel;
    this.startCounter = rng.counter;
    this.pIndex = playerTeam.findIndex((m) => m.curHP > 0);
    if (this.pIndex < 0) this.pIndex = 0;
  }

  pActive(): Mon { return this.playerTeam[this.pIndex]; }
  eActive(): Mon { return this.enemyTeam[this.eIndex]; }
  playerAlive(): boolean { return this.playerTeam.some((m) => m.curHP > 0); }

  private effSpeed(m: Mon): number {
    return m.status === "마비" ? Math.floor(m.stats.스피드 * 0.5) : m.stats.스피드;
  }

  // ── 강화: 메가진화 / 거다이맥스 (배틀당 각 1회, 한 개체는 둘 중 하나만) ──
  doMega(mon: Mon, formIndex: number, log: (t: string, c?: string) => void): void {
    const forms = megaForms(mon.종_id);
    const form = forms[formIndex] ?? forms[0];
    if (!form || this.megaUsed || mon.mega || mon.gmax) return;
    mon._orig = mon._orig ?? { stats: { ...mon.stats }, maxHP: mon.maxHP, types: [...mon.types] };
    const ratio = mon.curHP / mon.maxHP;
    for (const k of STAT_KEYS) mon.stats[k] = calcOne(form.종족값[k], mon.ivs[k], mon.evs[k], mon.level, k, mon.nature);
    mon.maxHP = mon.stats.HP;
    mon.curHP = Math.max(1, Math.min(mon.maxHP, Math.round(mon.maxHP * ratio)));
    mon.types = (form.타입 ?? mon.types).slice();
    const xy = form.식별자?.endsWith("-x") ? " X" : form.식별자?.endsWith("-y") ? " Y" : "";
    mon.mega = true; mon.형태표시 = `메가${xy}`; this.megaUsed = true;
    log(`✨✨ 메가진화${xy}! ${mon.별명}의 능력치가 크게 상승했다! [${mon.types.join("·")}]`, "crit");
  }
  doGmax(mon: Mon, log: (t: string, c?: string) => void): void {
    const form = gmaxForm(mon.종_id); if (this.gmaxUsed || mon.gmax || mon.mega) return;
    mon._orig = mon._orig ?? { stats: { ...mon.stats }, maxHP: mon.maxHP, types: [...mon.types] };
    mon.maxHP = Math.floor(mon.maxHP * 1.8);
    mon.curHP = Math.min(mon.maxHP, Math.floor(mon.curHP * 1.8));
    if (form?.타입) mon.types = form.타입.slice();
    mon.gmax = 3; mon.형태표시 = "거다이맥스"; this.gmaxUsed = true;
    log(`✨✨ 거다이맥스! ${mon.별명}이(가) 거대화했다! HP가 치솟고 공격이 강화된다! (3턴)`, "crit");
  }
  private revertOne(mon: Mon, log?: (t: string, c?: string) => void): void {
    if (!mon._orig) return;
    mon.stats = { ...mon._orig.stats };
    mon.maxHP = mon._orig.maxHP;
    mon.curHP = Math.min(mon.curHP, mon.maxHP);
    mon.types = mon._orig.types.slice();
    mon._orig = undefined; mon.mega = false; mon.gmax = undefined;
    const tag = mon.형태표시; mon.형태표시 = undefined;
    if (log && tag) log(`${mon.별명}의 ${tag} 상태가 풀렸다.`, "dim");
  }
  // 전투 종료 시 모든 변신 원복
  revertForms(): void { for (const m of this.playerTeam) this.revertOne(m); }

  // 상태이상으로 행동 가능한가 (잠듦/얼음/마비)
  private canActStatus(mon: Mon, log: (t: string, c?: string) => void): boolean {
    if (mon.status === "잠듦") {
      if (this.rng.rand() < 0.34) { mon.status = null; log(`${mon.별명}은(는) 잠에서 깼다!`, "dim"); }
      else { log(`${mon.별명}은(는) 새근새근 자고 있다…`, "dim"); return false; }
    }
    if (mon.status === "얼음") {
      if (this.rng.rand() < 0.2) { mon.status = null; log(`${mon.별명}의 얼음이 녹았다!`, "dim"); }
      else { log(`${mon.별명}은(는) 얼어붙어 움직일 수 없다!`, "dim"); return false; }
    }
    if (mon.status === "마비" && this.rng.rand() < 0.25) { log(`${mon.별명}은(는) 몸이 저려 움직일 수 없다!`, "warn"); return false; }
    return true;
  }
  // 턴 종료 상태이상 데미지. 기절하면 true.
  private residualTick(mon: Mon, log: (t: string, c?: string) => void): boolean {
    if (mon.curHP <= 0 || !mon.status) return false;
    let d = 0;
    if (mon.status === "독" || mon.status === "맹독") d = Math.floor(mon.maxHP / 8);
    else if (mon.status === "화상") d = Math.floor(mon.maxHP / 16);
    if (d > 0) { d = Math.max(1, d); mon.curHP = Math.max(0, mon.curHP - d); log(`${mon.별명}이(가) ${mon.status} 피해 ${d}. (HP ${mon.curHP}/${mon.maxHP})`, "dim"); }
    return mon.curHP <= 0;
  }
  // 매 턴 종료 처리: 거다이맥스 카운트 + 상태이상 데미지
  private endOfTurn(log: (t: string, c?: string) => void): void {
    const me = this.pActive();
    if (me.gmax && me.gmax > 0) { me.gmax -= 1; if (me.gmax <= 0) this.revertOne(me, log); }
    if (this.state === "ongoing" && this.eActive().curHP > 0 && this.residualTick(this.eActive(), log)) this.onEnemyFaint(log);
    if (this.state === "ongoing" && !this.awaitingSwitch && this.pActive().curHP > 0 && this.residualTick(this.pActive(), log)) this.onPlayerFaint(log);
  }

  // AI: pp 남은 위력기 중 기대데미지 최고
  aiPick(attacker: Mon, defender: Mon): number {
    let best = -1, bi = 0;
    attacker.moves.forEach((slot, i) => {
      const mv = MOVES[slot.name];
      if (!mv || slot.pp <= 0) return;
      const pw = mv.위력 ?? 0;
      const est = pw * typeMult(mv.타입, defender.types) * (attacker.types.includes(mv.타입) ? 1.5 : 1);
      if (est > best) { best = est; bi = i; }
    });
    if (best <= 0) { // 위력기 없음 → pp 있는 아무 기술
      const idx = attacker.moves.findIndex((s) => s.pp > 0);
      return idx < 0 ? 0 : idx;
    }
    return bi;
  }

  private executeAttack(attacker: Mon, defender: Mon, slotIndex: number, log: (t: string, c?: string) => void): void {
    if (!this.canActStatus(attacker, log)) return; // 상태이상으로 행동 불가
    const slot = attacker.moves[slotIndex];
    const mv = MOVES[slot.name];
    if (!slot || !mv) { log(`${attacker.별명}은(는) 쓸 수 있는 기술이 없다…`, "dim"); return; }
    if (slot.pp <= 0) { log(`${attacker.별명}의 ${slot.name}은(는) PP가 없다!`, "dim"); return; }
    slot.pp -= 1;

    // 명중
    if (mv.명중 != null) {
      const roll = this.rng.int(0, 99);
      if (roll >= mv.명중) { log(`${attacker.별명}의 ${slot.name} — 빗나갔다 (굴림 ${roll} ≥ ${mv.명중})`, "dim"); return; }
    }
    if (mv.위력 == null || mv.위력 === 0 || mv.분류 === "변화") {
      log(`${attacker.별명}의 ${slot.name}! (변화기 — 효과는 적용되지 않음·v1)`, "dim");
      return;
    }
    const tm = typeMult(mv.타입, defender.types);
    if (tm === 0) { log(`${attacker.별명}의 ${slot.name}! …${defender.별명}에게는 효과가 없다.`, "dim"); return; }

    const isPhys = mv.분류 === "물리";
    const A = isPhys ? attacker.stats.공격 : attacker.stats.특공;
    let D = isPhys ? defender.stats.방어 : defender.stats.특방;
    const variation = this.rng.int(85, 100) / 100;
    const crit = this.rng.rand() < 1 / 24 ? 1.5 : 1.0;
    const stab = attacker.types.includes(mv.타입) ? 1.5 : 1.0;
    const burn = attacker.status === "화상" && isPhys ? 0.5 : 1.0;
    const gmaxBoost = attacker.gmax && attacker.gmax > 0 ? 1.3 : 1.0;
    const base = Math.floor(Math.floor(Math.floor(((2 * attacker.level) / 5 + 2) * mv.위력 * A / D) / 50) + 2);
    const dmg = Math.max(1, Math.floor(base * variation * stab * tm * crit * burn * gmaxBoost));

    const eff = tm > 1 ? " 효과가 굉장하다!" : tm < 1 ? " 효과가 별로다…" : "";
    const cs = crit > 1 ? " 급소!" : "";
    log(`${attacker.별명} → ${slot.name} (${mv.분류}/위력${mv.위력}/${mv.타입})`, "sys");
    log(`  변동${variation.toFixed(2)}·자속${stab}·상성${tm}${cs}${eff} → ${dmg} 데미지`, crit > 1 ? "crit" : undefined);
    defender.curHP = Math.max(0, defender.curHP - dmg);
    log(`  ${defender.별명} HP ${defender.curHP + dmg} → ${defender.curHP} / ${defender.maxHP}`);
    // 추가효과 상태이상
    const sec = STATUS_BY_TYPE[mv.타입];
    if (sec && defender.curHP > 0 && !defender.status && mv.추가효과확률 && this.rng.int(0, 99) < mv.추가효과확률) {
      defender.status = sec;
      log(`  ${defender.별명}이(가) ${sec} 상태가 되었다!`, "warn");
    }
  }

  // 적이 기절했을 때 진행
  private onEnemyFaint(log: (t: string, c?: string) => void): void {
    const fainted = this.eActive();
    log(`💥 ${fainted.별명} 기절!`, "warn");
    gainExp(this.pActive(), expYield(fainted), log, this.events);
    const next = this.enemyTeam.findIndex((m) => m.curHP > 0);
    if (next < 0) { this.state = "win"; return; }
    this.eIndex = next;
    log(`${this.enemyLabel || "상대"}(이)가 ${this.eActive().별명}을(를) 내보냈다!`, "npc");
  }

  private onPlayerFaint(log: (t: string, c?: string) => void): void {
    log(`💥 ${this.pActive().별명}이(가) 쓰러졌다!`, "warn");
    if (!this.playerAlive()) { this.state = "lose"; return; }
    this.awaitingSwitch = true;
  }

  // 기절 활성 포켓몬을 교체(게임 루프가 호출)
  forceSwitch(partyIndex: number, log: (t: string, c?: string) => void): void {
    if (this.playerTeam[partyIndex]?.curHP > 0) {
      this.pIndex = partyIndex;
      this.awaitingSwitch = false;
      log(`가라, ${this.pActive().별명}!`, "good");
    }
  }

  // 한 턴 처리. 반환: 이번 턴 로그.
  doTurn(action: Action): LogLine[] {
    const lines: LogLine[] = [];
    const log = (t: string, c?: string) => lines.push({ text: t, cls: c });
    if (this.state !== "ongoing" || this.awaitingSwitch) return lines;

    // 강화 발동(턴을 소모하지 않음 — 변신 후 같은 턴에 행동)
    if (action.type === "mega") { this.doMega(this.pActive(), action.variant ?? 0, log); return lines; }
    if (action.type === "gmax") { this.doGmax(this.pActive(), log); return lines; }

    const enemyMoveIdx = this.aiPick(this.eActive(), this.pActive());

    // 비공격 행동 처리
    if (action.type === "run") {
      const ok = this.effSpeed(this.pActive()) >= this.effSpeed(this.eActive()) || this.rng.rand() < 0.5;
      if (ok) { log("무사히 달아났다!", "good"); this.state = "fled"; return lines; }
      log("달아나지 못했다!", "dim");
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
      this.endOfTurn(log);
      return lines;
    }
    if (action.type === "catch") {
      const res = catchAttempt(this.eActive(), action.ballMod, this.rng);
      log(`${action.ballName}을(를) 던졌다! (포획치 a=${res.a})`, "sys");
      log("  " + "● ".repeat(res.shakes) + "○ ".repeat(Math.max(0, 3 - res.shakes)).trim(), "dim");
      if (res.caught) { log(`✅ ${this.eActive().별명}을(를) 잡았다!`, "good"); this.caught = this.eActive(); this.state = "caught"; return lines; }
      log(`아쉽다! ${this.eActive().별명}이(가) 볼에서 튀어나왔다. (${res.shakes}회 흔들림)`, "dim");
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
      this.endOfTurn(log);
      return lines;
    }
    if (action.type === "item") {
      const m = this.pActive();
      if (action.item === "상처약") { const h = Math.min(20, m.maxHP - m.curHP); m.curHP += h; log(`${m.별명}의 HP를 ${h} 회복했다.`, "good"); }
      else if (action.item === "고급상처약") { const h = Math.min(60, m.maxHP - m.curHP); m.curHP += h; log(`${m.별명}의 HP를 ${h} 회복했다.`, "good"); }
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
      this.endOfTurn(log);
      return lines;
    }
    if (action.type === "switch") {
      this.pIndex = action.partyIndex;
      log(`가라, ${this.pActive().별명}!`, "good");
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
      this.endOfTurn(log);
      return lines;
    }

    // 둘 다 기술 — 순서 결정
    const pMove = MOVES[this.pActive().moves[action.index]?.name];
    const eMove = MOVES[this.eActive().moves[enemyMoveIdx]?.name];
    const pPrio = pMove?.우선도 ?? 0, ePrio = eMove?.우선도 ?? 0;
    let playerFirst: boolean;
    if (pPrio !== ePrio) playerFirst = pPrio > ePrio;
    else {
      const ps = this.effSpeed(this.pActive()), es = this.effSpeed(this.eActive());
      playerFirst = ps !== es ? ps > es : this.rng.rand() < 0.5;
    }

    const doPlayer = () => {
      if (this.pActive().curHP <= 0 || this.eActive().curHP <= 0) return;
      this.executeAttack(this.pActive(), this.eActive(), action.index, log);
      if (this.eActive().curHP <= 0) this.onEnemyFaint(log);
    };
    const doEnemy = () => {
      if (this.state !== "ongoing") return;
      if (this.eActive().curHP <= 0 || this.pActive().curHP <= 0) return;
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
    };

    if (playerFirst) { doPlayer(); doEnemy(); } else { doEnemy(); doPlayer(); }
    this.endOfTurn(log);
    return lines;
  }
}
