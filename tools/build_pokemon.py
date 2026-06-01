#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_pokemon.py — PokéAPI CSV(로컬 캐시: tools/cache/)에서 포켓몬 종 DB를 생성한다.

산출물:
  data/pokemon/gen1.json ... gen9.json   세대별 전 종(기본 폼)
  data/pokemon/forms.json                 메가/거다이맥스/리전폼 등 대체 폼(종족값·타입·특성)
  data/pokemon/moves.json                 기술 사전(타입·분류·위력·PP·명중·우선도) — 전투 엔진용
  data/pokemon/index.json                 경량 색인 {id, 이름, 파일, 타입, 희귀도, 메가, 거다이맥스}

데이터 출처: github.com/PokeAPI/pokeapi (data/v2/csv). 한국어=language_id 3.
현실_출현지역/서식_환경은 타입 기반 휴리스틱(아래 표)으로 시드한다 — regions.md에서 정교화 가능.
"""
import csv, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "..", "data", "pokemon")
KO = 3   # 한국어 language_id
EN = 9

def load(name):
    path = os.path.join(CACHE, name + ".csv")
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))

def to_int(v, default=None):
    try:
        return int(v)
    except (ValueError, TypeError):
        return default

# ---- 타입: id → 한글명 -------------------------------------------------------
type_ko = {}
type_en = {}
for r in load("types"):
    type_en[int(r["id"])] = r["identifier"]
for r in load("type_names"):
    if int(r["local_language_id"]) == KO:
        type_ko[int(r["pokemon_id"] if "pokemon_id" in r else r["type_id"])] = r["name"].strip()
# type_names 컬럼명은 type_id
type_ko = {}
for r in load("type_names"):
    if int(r["local_language_id"]) == KO:
        type_ko[int(r["type_id"])] = r["name"].strip()

def tname(tid):
    return type_ko.get(int(tid)) or type_en.get(int(tid), "노말")

# ---- 능력치: stat_id → 키 ----------------------------------------------------
STAT = {1: "HP", 2: "공격", 3: "방어", 4: "특공", 5: "특방", 6: "스피드"}

# ---- 성장(경험치 그룹) ------------------------------------------------------
GROWTH_KO = {
    "slow": "느림", "medium": "중간", "fast": "빠름", "medium-slow": "중속",
    "slow-then-very-fast": "변칙(저속후고속)", "fast-then-very-slow": "변칙(고속후저속)",
}
growth = {}
for r in load("growth_rates"):
    growth[int(r["id"])] = GROWTH_KO.get(r["identifier"], r["identifier"])

# ---- 이름/분류: species_id → ko/en ------------------------------------------
sp_name_ko, sp_genus_ko, sp_name_en = {}, {}, {}
for r in load("pokemon_species_names"):
    sid, lang = int(r["pokemon_species_id"]), int(r["local_language_id"])
    if lang == KO:
        sp_name_ko[sid] = r["name"]
        sp_genus_ko[sid] = (r.get("genus") or "").strip()
    elif lang == EN:
        sp_name_en[sid] = r["name"]

def name_ko(sid):
    return sp_name_ko.get(sid) or sp_name_en.get(sid, f"#{sid}")

# ---- 특성: ability_id → 한글명 ----------------------------------------------
abil_ko = {}
for r in load("ability_names"):
    if int(r["local_language_id"]) == KO:
        abil_ko[int(r["ability_id"])] = r["name"]
abil_en = {}
for r in load("abilities"):
    abil_en[int(r["id"])] = r["identifier"]
def aname(aid):
    return abil_ko.get(int(aid)) or abil_en.get(int(aid), "")

# ---- 기술: move_id → 데이터 + 한글명 ----------------------------------------
DCLASS = {1: "변화", 2: "물리", 3: "특수"}
move_ko = {}
for r in load("move_names"):
    if int(r["local_language_id"]) == KO:
        move_ko[int(r["move_id"])] = r["name"]
moves_db = {}        # 한글기술명 → 데이터
move_id_to_ko = {}
for r in load("moves"):
    mid = int(r["id"])
    ko = move_ko.get(mid) or r["identifier"]
    move_id_to_ko[mid] = ko
    moves_db[ko] = {
        "타입": tname(r["type_id"]) if r["type_id"] else "노말",
        "분류": DCLASS.get(to_int(r["damage_class_id"]), "변화"),
        "위력": to_int(r["power"]),
        "PP": to_int(r["pp"]),
        "명중": to_int(r["accuracy"]),     # None이면 필중
        "우선도": to_int(r["priority"], 0),
        "추가효과확률": to_int(r["effect_chance"]),
    }

# ---- 진화 ------------------------------------------------------------------
trigger = {}
for r in load("evolution_triggers"):
    trigger[int(r["id"])] = r["identifier"]
evo_into = {}   # evolved_species_id → 조건dict
for r in load("pokemon_evolution"):
    sid = int(r["evolved_species_id"])
    trig = trigger.get(to_int(r["evolution_trigger_id"]), "기타")
    cond = {}
    if r["minimum_level"]:
        cond = {"방식": "레벨", "값": int(r["minimum_level"])}
    elif trig == "trade":
        cond = {"방식": "교환", "값": None}
    elif trig == "use-item":
        cond = {"방식": "돌/도구", "값": to_int(r["trigger_item_id"])}
    elif r["minimum_happiness"]:
        cond = {"방식": "친밀도", "값": int(r["minimum_happiness"])}
    elif r["location_id"]:
        cond = {"방식": "장소", "값": to_int(r["location_id"])}
    elif r["known_move_id"]:
        cond = {"방식": "기술습득", "값": move_id_to_ko.get(to_int(r["known_move_id"]))}
    else:
        cond = {"방식": trig, "값": None}
    if r["time_of_day"]:
        cond["시간대"] = r["time_of_day"]
    evo_into.setdefault(sid, cond)

# ---- 종 메타 ----------------------------------------------------------------
species = {}     # sid → row
evolves_from = {}
children = defaultdict(list)
for r in load("pokemon_species"):
    sid = int(r["id"])
    species[sid] = r
    ef = to_int(r["evolves_from_species_id"])
    if ef:
        evolves_from[sid] = ef
        children[ef].append(sid)

# ---- pokemon(폼 포함): 기본폼 + 대체폼 --------------------------------------
pokemons = load("pokemon")
base_exp = {}
for r in pokemons:
    base_exp[int(r["id"])] = to_int(r["base_experience"], 0)

# 능력치/타입/특성을 pokemon_id 기준으로 모은다
stats_by_poke = defaultdict(dict)
for r in load("pokemon_stats"):
    pid = int(r["pokemon_id"]); st = to_int(r["stat_id"])
    if st in STAT:
        stats_by_poke[pid][STAT[st]] = int(r["base_stat"])
types_by_poke = defaultdict(list)
for r in load("pokemon_types"):
    types_by_poke[int(r["pokemon_id"])].append((to_int(r["slot"]), tname(r["type_id"])))
abil_by_poke = defaultdict(lambda: {"일반": [], "숨김": None})
for r in load("pokemon_abilities"):
    pid = int(r["pokemon_id"])
    nm = aname(r["ability_id"])
    if r["is_hidden"] == "1":
        abil_by_poke[pid]["숨김"] = nm
    elif nm:
        abil_by_poke[pid]["일반"].append(nm)

def types_of(pid):
    return [t for _, t in sorted(types_by_poke[pid])]

# ---- 기술풀: pokemon_id → 최신 버전그룹의 학습 목록 -------------------------
MOVE_METHOD = {1: "레벨업", 2: "유전", 3: "교육", 4: "기술머신"}
moves_raw = defaultdict(list)   # pid → list of (vg, move_id, method, level)
with open(os.path.join(CACHE, "pokemon_moves.csv"), encoding="utf-8") as f:
    for r in csv.DictReader(f):
        method = to_int(r["pokemon_move_method_id"])
        if method not in MOVE_METHOD:
            continue
        moves_raw[int(r["pokemon_id"])].append(
            (to_int(r["version_group_id"]), to_int(r["move_id"]), method, to_int(r["level"], 0))
        )

def movepool(pid):
    rows = moves_raw.get(pid)
    if not rows:
        return []
    latest = max(r[0] for r in rows)
    seen = {}
    for vg, mid, method, lvl in rows:
        if vg != latest:
            continue
        ko = move_id_to_ko.get(mid)
        if not ko:
            continue
        key = (ko, method)
        if key in seen:
            continue
        entry = {"기술": ko, "방식": MOVE_METHOD[method]}
        if method == 1:
            entry["레벨"] = lvl
        seen[key] = entry
    out = list(seen.values())
    out.sort(key=lambda e: (0 if e["방식"] == "레벨업" else 1, e.get("레벨", 99)))
    return out

# ---- 현실 지리 휴리스틱 (타입 → 실제 지역/환경) -----------------------------
TYPE_REGION = {
    "불꽃": (["이탈리아 시칠리아(에트나)", "하와이", "인도네시아", "사하라"], "화산·고온 건조지대"),
    "물":   (["지중해 연안", "동남아 군도", "노르웨이 피오르", "아마존"], "해안·하천·호수"),
    "풀":   (["아마존", "콩고분지", "동남아 정글", "뉴질랜드"], "우림·삼림·초원"),
    "전기": (["도쿄 수도권", "독일 루르", "디트로이트", "상하이"], "대도시·산업지대"),
    "얼음": (["시베리아", "그린란드", "알프스", "안데스 고지"], "극지·고산"),
    "격투": (["오키나와", "타이", "브라질", "히말라야 기슭"], "산악·도장가"),
    "독":   (["갠지스 삼각주", "동유럽 폐공업지대", "루이지애나 습지"], "습지·산업폐역"),
    "땅":   (["사하라", "호주 아웃백", "그랜드캐니언", "고비사막"], "사막·협곡·동굴"),
    "비행": (["안데스", "히말라야", "스코틀랜드 절벽", "대평원"], "산악·해안절벽·평원"),
    "에스퍼":(["이집트 유적", "페루 마추픽추", "그리스 델포이", "티베트"], "고대유적·사원"),
    "벌레": (["아마존", "보르네오", "중부 유럽 삼림"], "삼림·우림"),
    "바위": (["그랜드캐니언", "안데스", "호주 아웃백", "돌로미티"], "협곡·광산·고원"),
    "고스트":(["트란실바니아", "프라하 고성", "교토 폐사", "뉴올리언스"], "폐허·묘지·고성"),
    "드래곤":(["히말라야", "아이슬란드", "안데스 외딴 협곡"], "고산·화산·오지"),
    "악":   (["이스탄불 뒷골목", "마르세유", "리우 favela", "동굴"], "대도시 이면·동굴"),
    "강철": (["루르", "피츠버그", "우랄 광산지대"], "광산·산업도시"),
    "페어리":(["아일랜드", "스코틀랜드 고원", "북유럽 숲"], "숲속 빈터·고대 신전"),
    "노말": (["대평원", "도시 근교", "온대 초원"], "초원·평원·도시근교"),
}
def geo(types):
    regions, env = [], []
    for t in types:
        rg, ev = TYPE_REGION.get(t, ([], ""))
        for x in rg:
            if x not in regions:
                regions.append(x)
        if ev:
            env.append(ev)
    return regions[:4], " / ".join(dict.fromkeys(env))

def rarity(sp):
    if sp["is_mythical"] == "1":
        return "환상"
    if sp["is_legendary"] == "1":
        return "전설"
    cr = to_int(sp["capture_rate"], 45)
    if cr >= 190: return "흔함"
    if cr >= 90:  return "보통"
    if cr >= 45:  return "희귀"
    return "매우희귀"

def gender(sp):
    gr = to_int(sp["gender_rate"], -1)
    if gr is None or gr < 0:
        return {"무성": 100}
    f = round(gr / 8 * 100, 1)
    return {"수": round(100 - f, 1), "암": f}

# 메가/거다이맥스 가능 종 판별 (폼 identifier 기준)
mega_species, gmax_species = set(), set()
for r in pokemons:
    ident = r["identifier"]
    sid = to_int(r["species_id"])
    if "-mega" in ident:
        mega_species.add(sid)
    if "-gmax" in ident:
        gmax_species.add(sid)

# ---- 종 객체 빌드 (기본 폼) -------------------------------------------------
def build_species_obj(pid, sp):
    sid = int(sp["id"])
    types = types_of(pid)
    regions, env = geo(types)
    ab = abil_by_poke[pid]
    obj = {
        "id": sid,
        "form": "기본",
        "이름": {"한": name_ko(sid), "영": sp_name_en.get(sid, sp["identifier"])},
        "분류": sp_genus_ko.get(sid, ""),
        "타입": types,
        "종족값": {k: stats_by_poke[pid].get(k, 0) for k in ["HP", "공격", "방어", "특공", "특방", "스피드"]},
        "특성": ab["일반"],
        "숨겨진특성": ab["숨김"],
        "기술풀": movepool(pid),
        "진화": None,
        "현실_출현지역": regions,
        "서식_환경": env,
        "희귀도": rarity(sp),
        "메가진화_가능여부": sid in mega_species,
        "거다이맥스_가능여부": sid in gmax_species,
        "기본경험치": base_exp.get(pid, 0),
        "경험치그룹": growth.get(to_int(sp["growth_rate_id"]), "중간"),
        "포획률": to_int(sp["capture_rate"], 45),
        "성별비": gender(sp),
        "플레이버": "",
    }
    # 진화 트리
    frm = evolves_from.get(sid)
    kids = children.get(sid, [])
    if frm or kids:
        obj["진화"] = {
            "from": {"id": frm, "이름": name_ko(frm)} if frm else None,
            "조건": evo_into.get(sid),
            "to": [{"id": c, "이름": name_ko(c)} for c in kids],
        }
    return obj

# 각 species의 기본 pokemon row 찾기
default_poke = {}
for r in pokemons:
    if r["is_default"] == "1":
        default_poke[int(r["species_id"])] = int(r["id"])

by_gen = defaultdict(list)
index = []
for sid in sorted(species):
    sp = species[sid]
    pid = default_poke.get(sid)
    if pid is None:
        continue
    obj = build_species_obj(pid, sp)
    gen = to_int(sp["generation_id"], 1)
    by_gen[gen].append(obj)
    index.append({
        "id": sid, "이름": obj["이름"]["한"], "파일": f"gen{gen}.json",
        "타입": obj["타입"], "희귀도": obj["희귀도"],
        "메가": obj["메가진화_가능여부"], "거다이맥스": obj["거다이맥스_가능여부"],
    })

# ---- 대체 폼 (메가/거다이맥스/리전폼 등) ------------------------------------
forms = []
for r in pokemons:
    if r["is_default"] == "1":
        continue
    pid = int(r["id"]); sid = to_int(r["species_id"])
    ident = r["identifier"]
    if "-mega" in ident:
        kind = "메가"
    elif "-gmax" in ident:
        kind = "거다이맥스"
    elif any(reg in ident for reg in ("-alola", "-galar", "-hisui", "-paldea")):
        kind = "리전폼"
    else:
        continue
    ab = abil_by_poke[pid]
    forms.append({
        "기반_id": sid, "기반_이름": name_ko(sid), "form": kind, "식별자": ident,
        "타입": types_of(pid),
        "종족값": {k: stats_by_poke[pid].get(k, 0) for k in ["HP", "공격", "방어", "특공", "특방", "스피드"]},
        "특성": ab["일반"], "숨겨진특성": ab["숨김"],
    })

# ---- 출력 ------------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
def dump(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

for gen, lst in sorted(by_gen.items()):
    dump(f"gen{gen}.json", lst)
dump("forms.json", forms)
dump("moves.json", moves_db)
dump("index.json", index)

print(f"종(기본폼): {len(index)}개  | 세대: {sorted(by_gen)}")
for gen in sorted(by_gen):
    print(f"  gen{gen}: {len(by_gen[gen])}종")
print(f"대체폼(메가/거다이맥스/리전): {len(forms)}개")
print(f"기술 사전: {len(moves_db)}개")
print(f"전설: {sum(1 for i in index if i['희귀도']=='전설')}  환상: {sum(1 for i in index if i['희귀도']=='환상')}")
print(f"메가가능: {len(mega_species)}종  거다이맥스가능: {len(gmax_species)}종")
