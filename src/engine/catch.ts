import { RNG } from "./rng";
import { SPECIES } from "./data";
import { Mon } from "./pokemon";

export const BALLS: Record<string, { 이름: string; mod: number }> = {
  몬스터볼: { 이름: "몬스터볼", mod: 1.0 },
  슈퍼볼: { 이름: "슈퍼볼", mod: 1.5 },
  하이퍼볼: { 이름: "하이퍼볼", mod: 2.0 },
};

export function statusMod(status: string | null): number {
  if (status === "잠듦" || status === "얼음") return 2.0;
  if (status === "마비" || status === "독" || status === "맹독" || status === "화상") return 1.5;
  return 1.0;
}

export interface CatchResult { caught: boolean; shakes: number; a: number; }

export function catchAttempt(target: Mon, ballMod: number, rng: RNG): CatchResult {
  const sp = SPECIES.get(target.종_id)!;
  const rate = sp.포획률 ?? 45;
  const a = Math.floor(
    ((3 * target.maxHP - 2 * target.curHP) * rate * ballMod * statusMod(target.status)) /
      (3 * target.maxHP)
  );
  if (a >= 255) return { caught: true, shakes: 3, a };
  const b = Math.floor(65536 / Math.pow(255 / a, 0.1875));
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) < b) shakes++;
    else return { caught: false, shakes, a };
  }
  return { caught: true, shakes: 4, a };
}
