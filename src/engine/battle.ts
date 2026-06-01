import { RNG } from "./rng";
import { MOVES, typeMult, speciesName } from "./data";
import { Mon, expYield, gainExp, ExpEvents, newExpEvents } from "./pokemon";
import { catchAttempt, statusMod } from "./catch";

export type LogLine = { text: string; cls?: string };
export type Action =
  | { type: "move"; index: number }
  | { type: "switch"; partyIndex: number }
  | { type: "item"; item: string }
  | { type: "catch"; ball: string; ballMod: number; ballName: string }
  | { type: "run" };

export type BattleState = "ongoing" | "win" | "lose" | "fled" | "caught";

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
    const base = Math.floor(Math.floor(Math.floor(((2 * attacker.level) / 5 + 2) * mv.위력 * A / D) / 50) + 2);
    const dmg = Math.max(1, Math.floor(base * variation * stab * tm * crit * burn));

    const eff = tm > 1 ? " 효과가 굉장하다!" : tm < 1 ? " 효과가 별로다…" : "";
    const cs = crit > 1 ? " 급소!" : "";
    log(`${attacker.별명} → ${slot.name} (${mv.분류}/위력${mv.위력}/${mv.타입})`, "sys");
    log(`  변동${variation.toFixed(2)}·자속${stab}·상성${tm}${cs}${eff} → ${dmg} 데미지`, crit > 1 ? "crit" : undefined);
    defender.curHP = Math.max(0, defender.curHP - dmg);
    log(`  ${defender.별명} HP ${defender.curHP + dmg} → ${defender.curHP} / ${defender.maxHP}`);
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

    const enemyMoveIdx = this.aiPick(this.eActive(), this.pActive());

    // 비공격 행동 처리
    if (action.type === "run") {
      const ok = this.effSpeed(this.pActive()) >= this.effSpeed(this.eActive()) || this.rng.rand() < 0.5;
      if (ok) { log("무사히 달아났다!", "good"); this.state = "fled"; return lines; }
      log("달아나지 못했다!", "dim");
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
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
      return lines;
    }
    if (action.type === "item") {
      const m = this.pActive();
      if (action.item === "상처약") { const h = Math.min(20, m.maxHP - m.curHP); m.curHP += h; log(`${m.별명}의 HP를 ${h} 회복했다.`, "good"); }
      else if (action.item === "고급상처약") { const h = Math.min(60, m.maxHP - m.curHP); m.curHP += h; log(`${m.별명}의 HP를 ${h} 회복했다.`, "good"); }
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
      return lines;
    }
    if (action.type === "switch") {
      this.pIndex = action.partyIndex;
      log(`가라, ${this.pActive().별명}!`, "good");
      this.executeAttack(this.eActive(), this.pActive(), enemyMoveIdx, log);
      if (this.pActive().curHP <= 0) this.onPlayerFaint(log);
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
    return lines;
  }
}
