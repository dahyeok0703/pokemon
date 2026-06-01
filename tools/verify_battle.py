#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_battle.py — 전투 엔진 공식의 결정론·재현성 검증.

CLAUDE.md 3절의 Mulberry32 PRNG와 mechanics/*.md의 공식을 구현해,
(1) 같은 시드+같은 행동 → 항상 같은 결과,
(2) 능력치/데미지/타입상성/포획 공식의 정합성을 점검한다.

GM(나)은 이 파일과 동일한 공식·PRNG로 전투를 계산한다.
"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

TYPE_CHART = json.load(open(os.path.join(DATA, "type_chart.json"), encoding="utf-8"))
NATURES = json.load(open(os.path.join(DATA, "natures.json"), encoding="utf-8"))
MOVES = json.load(open(os.path.join(DATA, "pokemon", "moves.json"), encoding="utf-8"))

MASK = 0xFFFFFFFF

# ---- PRNG (CLAUDE.md 3절 Mulberry32) ---------------------------------------
class RNG:
    def __init__(self, seed, counter=0):
        self.seed = seed & MASK
        self.counter = counter

    def _raw(self, counter):
        t = (self.seed + counter * 0x6D2B79F5) & MASK
        t = ((t ^ (t >> 15)) * (t | 1)) & MASK
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & MASK))) & MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296.0

    def rand(self):
        self.counter += 1
        return self._raw(self.counter)

    def randint(self, lo, hi):
        return lo + math.floor(self.rand() * (hi - lo + 1))

# ---- 능력치 ----------------------------------------------------------------
def calc_stat(base, iv, ev, level, key, nature):
    core = (2 * base + iv + ev // 4) * level // 100
    if key == "HP":
        return core + level + 10
    mult = 1.0
    if NATURES[nature]["상승"] == key: mult = 1.1
    elif NATURES[nature]["하강"] == key: mult = 0.9
    return math.floor((core + 5) * mult)

# ---- 타입 상성 -------------------------------------------------------------
def type_mult(atk_type, def_types):
    m = 1.0
    for dt in def_types:
        m *= TYPE_CHART[atk_type][dt]
    return m

# ---- 데미지 (mechanics/battle.md) ------------------------------------------
def damage(level, power, A, D, variation, stab, tmult, crit):
    base = math.floor(math.floor(math.floor((2 * level / 5 + 2) * power * A / D) / 50) + 2)
    return math.floor(base * variation * stab * tmult * crit), base

# ---- 포획 (mechanics/catching.md) ------------------------------------------
def catch(maxhp, curhp, rate, ball, status, rng):
    a = math.floor((3 * maxhp - 2 * curhp) * rate * ball * status / (3 * maxhp))
    if a >= 255:
        return True, 3, a
    b = math.floor(65536 / ((255 / a) ** 0.1875))
    shakes = 0
    for _ in range(4):
        if rng.randint(0, 65535) < b:
            shakes += 1
        else:
            return False, shakes, a
    return True, 4, a


def main():
    print("=" * 64)
    print("1) PRNG 재현성: 같은 시드(counter=0)에서 8회 굴림을 두 번")
    a = RNG(777123456); seqA = [round(a.rand(), 6) for _ in range(8)]
    b = RNG(777123456); seqB = [round(b.rand(), 6) for _ in range(8)]
    print("  A:", seqA)
    print("  B:", seqB)
    assert seqA == seqB, "PRNG 비결정적!"
    print("  ✅ 동일 — 결정론 확인")

    print("=" * 64)
    print("2) 능력치 산출 (리자몽 Lv50, 고집, IV31/EV252공격 등)")
    base = {"HP": 78, "공격": 84, "방어": 78, "특공": 109, "특방": 85, "스피드": 100}
    iv = {"HP": 31, "공격": 31, "방어": 31, "특공": 31, "특방": 31, "스피드": 31}
    ev = {"HP": 0, "공격": 252, "방어": 0, "특공": 0, "특방": 4, "스피드": 252}
    stats = {k: calc_stat(base[k], iv[k], ev[k], 50, k, "고집") for k in base}
    print("  ", stats)
    assert stats["HP"] == 153, stats["HP"]
    assert stats["공격"] == 149, stats["공격"]   # 고집 +10% (131→149)
    assert stats["특공"] == 116, stats["특공"]   # 고집 -10% (124→116)
    print("  ✅ HP153 / 공격149(+10%) / 특공116(-10%) — 본가 값 일치")

    print("=" * 64)
    print("3) 데미지 + 재현성: 리자몽→이상해꽃 플레어드라이브 ×3 (같은 시드)")
    mv = MOVES["플레어드라이브"]
    print(f"  기술: {mv}")
    target_types = ["풀", "독"]   # 이상해꽃
    tmult = type_mult(mv["타입"], target_types)
    stab = 1.5  # 리자몽 불꽃
    def run():
        rng = RNG(424242, 0)
        out = []
        for _ in range(3):
            var = rng.randint(85, 100) / 100
            crit = 1.5 if rng.rand() < 1/24 else 1.0
            dmg, base = damage(50, mv["위력"], 130, 80, var, stab, tmult, crit)
            out.append((round(var, 2), crit, dmg))
        return out
    r1, r2 = run(), run()
    for var, crit, dmg in r1:
        print(f"  변동{var} 자속1.5 상성{tmult}(풀×2/독×1) 급소{crit} → {dmg}")
    assert r1 == r2, "데미지 비결정적!"
    print("  ✅ 두 실행 동일 — 시드 재현성 확인")

    print("=" * 64)
    print("4) 타입 상성 점검")
    cases = [("불꽃", ["풀"], 2.0), ("물", ["불꽃"], 2.0), ("전기", ["땅"], 0.0),
             ("얼음", ["드래곤", "비행"], 4.0), ("노말", ["고스트"], 0.0),
             ("격투", ["악", "고스트"], 0.0)]
    for at, dt, exp in cases:
        got = type_mult(at, dt)
        print(f"  {at}→{'/'.join(dt)} = {got} (기대 {exp})")
        assert got == exp
    print("  ✅ 상성 일치")

    print("=" * 64)
    print("5) 포획 재현성: 빈사 직전 이상해씨(포획률45, 하이퍼볼2.0, 잠듦2.0)")
    def caprun():
        rng = RNG(555, 0)
        return catch(120, 8, 45, 2.0, 2.0, rng)
    c1, c2 = caprun(), caprun()
    print(f"  결과 {c1}  /  재실행 {c2}")
    assert c1 == c2
    print("  ✅ 포획 판정 재현성 확인")

    print("=" * 64)
    print("모든 검증 통과 ✅  — 엔진은 결정론적이며 시드로 재현 가능하다.")


if __name__ == "__main__":
    main()
