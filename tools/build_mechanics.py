#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_mechanics.py — 전투 엔진용 수치 데이터 생성.

산출물(data/):
  type_chart.json   18타입 상성표 {공격타입: {방어타입: 배율}}  (0 / 0.5 / 1 / 2)
  natures.json      25성격 보정 {성격: {상승, 하강}}
  exp_tables.json   경험치 그룹별 레벨1~100 누적 경험치

출처: PokéAPI CSV(tools/cache). 한국어=language_id 3.
"""
import csv, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data")
KO = 3

def load(name):
    with open(os.path.join(CACHE, name + ".csv"), encoding="utf-8") as f:
        return list(csv.DictReader(f))

# 타입 한글명
type_ko = {}
for r in load("type_names"):
    if int(r["local_language_id"]) == KO:
        type_ko[int(r["type_id"])] = r["name"].strip()

REAL_TYPES = list(range(1, 19))  # 노말~페어리 (스텔라 19, 특수 제외)

# ---- 타입 상성표 -----------------------------------------------------------
FACTOR = {0: 0.0, 50: 0.5, 100: 1.0, 200: 2.0}
chart = {type_ko[a]: {type_ko[d]: 1.0 for d in REAL_TYPES} for a in REAL_TYPES}
for r in load("type_efficacy"):
    a, d = int(r["damage_type_id"]), int(r["target_type_id"])
    if a in REAL_TYPES and d in REAL_TYPES:
        chart[type_ko[a]][type_ko[d]] = FACTOR[int(r["damage_factor"])]

# ---- 성격 ------------------------------------------------------------------
STAT = {2: "공격", 3: "방어", 4: "특공", 5: "특방", 6: "스피드"}
nat_ko = {}
for r in load("nature_names"):
    if int(r["local_language_id"]) == KO:
        nat_ko[int(r["nature_id"])] = r["name"]
natures = {}
for r in load("natures"):
    nid = int(r["id"])
    dec, inc = int(r["decreased_stat_id"]), int(r["increased_stat_id"])
    natures[nat_ko[nid]] = {
        "상승": None if dec == inc else STAT[inc],
        "하강": None if dec == inc else STAT[dec],
    }

# ---- 경험치 그룹별 누적 테이블 (레벨 1~100) --------------------------------
def fast(n):        return (4 * n**3) // 5
def medium(n):      return n**3
def slow(n):        return (5 * n**3) // 4
def medium_slow(n): return (6 * n**3) // 5 - 15 * n**2 + 100 * n - 140
def erratic(n):     # slow-then-very-fast
    if n <= 50:  return n**3 * (100 - n) // 50
    if n <= 68:  return n**3 * (150 - n) // 100
    if n <= 98:  return n**3 * (1274 + (n % 3)**2 - 9 * (n % 3) - 20 * (n // 3)) // 1000
    return n**3 * (160 - n) // 100
def fluctuating(n): # fast-then-very-slow
    if n <= 15:  return n**3 * ((n + 1) // 3 + 24) // 50
    if n <= 36:  return n**3 * (n + 14) // 50
    return n**3 * (n // 2 + 32) // 50

GROUPS = {
    "빠름": fast, "중간": medium, "느림": slow, "중속": medium_slow,
    "변칙(저속후고속)": erratic, "변칙(고속후저속)": fluctuating,
}
exp_tables = {}
for label, fn in GROUPS.items():
    # index 0 = level 1 (누적 0), ... index 99 = level 100
    exp_tables[label] = [max(0, fn(lv)) for lv in range(1, 101)]
    exp_tables[label][0] = 0  # 레벨1 = 0

def dump(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

dump("type_chart.json", chart)
dump("natures.json", natures)
dump("exp_tables.json", exp_tables)

print(f"타입 상성표: {len(chart)}x{len(chart)}")
print(f"  예) 불꽃→풀={chart['불꽃']['풀']}, 물→불꽃={chart['물']['불꽃']}, 전기→땅={chart['전기']['땅']}, 노말→고스트={chart['노말']['고스트']}")
print(f"성격: {len(natures)}종  예) 고집={natures['고집']}, 성실={natures['성실']}")
print(f"경험치 그룹: {list(exp_tables)}")
print(f"  중속 Lv100 누적={exp_tables['중속'][99]}, 느림 Lv50={exp_tables['느림'][49]}")
