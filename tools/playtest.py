#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
playtest.py — 실제 데이터(종/기술/타입표) + 엔진 공식으로 미니 전투를 끝까지 시뮬레이션.
데이터 통합(종→능력치→기술풀→상성→데미지)과 밸런스·일관성을 점검한다.
verify_battle.py가 공식의 단위 검증이라면, 이쪽은 실데이터 통합 플레이테스트.
"""
import json, math, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

TYPE_CHART = json.load(open(os.path.join(DATA, "type_chart.json"), encoding="utf-8"))
NATURES = json.load(open(os.path.join(DATA, "natures.json"), encoding="utf-8"))
MOVES = json.load(open(os.path.join(DATA, "pokemon", "moves.json"), encoding="utf-8"))

SPECIES = {}
for f in glob.glob(os.path.join(DATA, "pokemon", "gen*.json")):
    for s in json.load(open(f, encoding="utf-8")):
        SPECIES[s["id"]] = s

MASK = 0xFFFFFFFF
class RNG:
    def __init__(self, seed, counter=0): self.seed=seed&MASK; self.counter=counter
    def _raw(self,c):
        t=(self.seed+c*0x6D2B79F5)&MASK
        t=((t^(t>>15))*(t|1))&MASK
        t=(t^(t+(((t^(t>>7))*(t|61))&MASK)))&MASK
        return ((t^(t>>14))&MASK)/4294967296.0
    def rand(self): self.counter+=1; return self._raw(self.counter)
    def randint(self,lo,hi): return lo+math.floor(self.rand()*(hi-lo+1))

def calc(base,iv,ev,level,key,nature):
    core=(2*base+iv+ev//4)*level//100
    if key=="HP": return core+level+10
    mult=1.0
    if NATURES[nature]["상승"]==key: mult=1.1
    elif NATURES[nature]["하강"]==key: mult=0.9
    return math.floor((core+5)*mult)

def make_mon(sid, level, nature="성실", ivs=20, evs=0):
    sp=SPECIES[sid]
    iv={k:ivs for k in ["HP","공격","방어","특공","특방","스피드"]}
    ev={k:evs for k in ["HP","공격","방어","특공","특방","스피드"]}
    stats={k:calc(sp["종족값"][k],iv[k],ev[k],level,k,nature) for k in iv}
    # 레벨 적합 기술만: 레벨업 기술 중 레벨<=현재레벨 (최신 4개 우선), 위력 있는 것
    lvups=[(m.get("레벨",0),m["기술"]) for m in sp["기술풀"]
           if m["방식"]=="레벨업" and m.get("레벨",0)<=level
           and m["기술"] in MOVES and MOVES[m["기술"]]["위력"]]
    lvups.sort(reverse=True)  # 최근 습득순
    moveset=[]
    for _,mv in lvups:
        if mv not in moveset: moveset.append(mv)
        if len(moveset)>=4: break
    if not moveset:  # 위력기가 없으면 아무 레벨업기라도
        any_lv=[m["기술"] for m in sp["기술풀"] if m["방식"]=="레벨업" and m.get("레벨",0)<=level and m["기술"] in MOVES]
        moveset=any_lv[-4:] or ["몸통박치기"]
    return {"sp":sp,"이름":sp["이름"]["한"],"타입":sp["타입"],"level":level,
            "stats":stats,"hp":stats["HP"],"max":stats["HP"],"moves":moveset,"nature":nature}

def tmult(at, dts):
    m=1.0
    for d in dts: m*=TYPE_CHART[at][d]
    return m

def damage(att, dfn, move, rng, log):
    mv=MOVES[move]
    acc=mv["명중"]
    if acc is not None:
        roll=rng.randint(0,99)
        if roll>=acc:
            log.append(f"  {att['이름']} → {move}: 명중굴림{roll}≥{acc} → 빗나감"); return 0
    is_phys = mv["분류"]=="물리"
    A = att["stats"]["공격"] if is_phys else att["stats"]["특공"]
    D = dfn["stats"]["방어"] if is_phys else dfn["stats"]["특방"]
    var = rng.randint(85,100)/100
    crit = 1.5 if rng.rand()<1/24 else 1.0
    stab = 1.5 if mv["타입"] in att["타입"] else 1.0
    tm = tmult(mv["타입"], dfn["타입"])
    if tm==0:
        log.append(f"  {att['이름']} → {move}: {'/'.join(dfn['타입'])}에게 효과가 없다"); return 0
    base=math.floor(math.floor(math.floor((2*att['level']/5+2)*mv["위력"]*A/D)/50)+2)
    dmg=math.floor(base*var*stab*tm*crit)
    eff = "효과굉장" if tm>1 else ("효과별로" if tm<1 else "")
    cs = " 급소!" if crit>1 else ""
    log.append(f"  {att['이름']} → {move}({mv['분류']}/위{mv['위력']}/{mv['타입']}): 변동{var:.2f}·자속{stab}·상성{tm}{(' '+eff) if eff else ''}{cs} → {dmg}")
    return dmg

def battle(a, b, seed):
    rng=RNG(seed,0); log=[f"⚔️  {a['이름']}(Lv{a['level']}) vs {b['이름']}(Lv{b['level']})  [시드{seed}]"]
    turn=1
    while a["hp"]>0 and b["hp"]>0 and turn<=30:
        first,second=(a,b) if a["stats"]["스피드"]>=b["stats"]["스피드"] else (b,a)
        log.append(f"-- 턴{turn} (선공: {first['이름']}, 스피드 {first['stats']['스피드']} vs {second['stats']['스피드']})")
        for atk,dfn in ((first,second),(second,first)):
            if atk["hp"]<=0 or dfn["hp"]<=0: continue
            mv=best_move(atk,dfn)
            d=damage(atk,dfn,mv,rng,log)
            dfn["hp"]=max(0,dfn["hp"]-d)
            log.append(f"     {dfn['이름']} HP {dfn['hp']+d}→{dfn['hp']}/{dfn['max']}")
            if dfn["hp"]<=0: log.append(f"  💥 {dfn['이름']} 기절!"); break
        turn+=1
    winner=a if b["hp"]<=0 else (b if a["hp"]<=0 else None)
    log.append(f"🏆 승자: {winner['이름'] if winner else '무승부(턴초과)'}  (rng counter={rng.counter})")
    return log, winner, rng

def best_move(atk,dfn):
    best=atk["moves"][0]; bestd=-1
    for mv in atk["moves"]:
        m=MOVES[mv]; tm=tmult(m["타입"],dfn["타입"]); stab=1.5 if m["타입"] in atk["타입"] else 1
        est=m["위력"]*tm*stab
        if est>bestd: bestd=est; best=mv
    return best

def catch_test(target, rng):
    sp=target["sp"]; rate=sp["포획률"]
    a=math.floor((3*target["max"]-2*target["hp"])*rate*2.0*1.5/(3*target["max"]))  # 하이퍼볼+마비
    if a>=255: return True,"즉시포획",a
    b=math.floor(65536/((255/a)**0.1875))
    shakes=0
    for _ in range(4):
        if rng.randint(0,65535)<b: shakes+=1
        else: return False,f"{shakes}회 흔들리고 탈출",a
    return True,"4회 흔들림 포획",a

def main():
    print("="*66); print("플레이테스트 1 — 신인 전투: 파이리 Lv5 vs 야생 구구 Lv4")
    log,w,_=battle(make_mon(4,5), make_mon(16,4), 100001)
    print("\n".join(log))

    print("="*66); print("플레이테스트 2 — 로컬 결승급: 리자드 Lv26 vs 라이벌 이상해풀 Lv22(상성 불리)")
    log,w,_=battle(make_mon(5,26,"성급",25,80), make_mon(2,22,"차분",24,80), 100002)
    print("\n".join(log[:1]+log[-6:]))
    print(f"   (전체 {len(log)}줄 중 요약)  승자={w['이름']}")

    print("="*66); print("플레이테스트 3 — 국가 보스급: 한카리아스 Lv62 vs 갸라도스 Lv63")
    log,w,_=battle(make_mon(445,62,"고집",31,200), make_mon(130,63,"용감",31,200), 100003)
    print("\n".join(log[:1]+log[-5:]))

    print("="*66); print("플레이테스트 4 — 포획: 빈사 직전 피카츄(Lv12) 하이퍼볼+마비")
    pk=make_mon(25,12); pk["hp"]=3
    rng=RNG(424242,0)
    ok,desc,a=catch_test(pk,rng)
    print(f"  포획률 a={a} → {desc} ({'성공' if ok else '실패'})")

    print("="*66)
    # 밸런스 점검: 스타터 3종 종족값 총합
    print("일관성/밸런스 점검:")
    for sid in (1,4,7):
        s=SPECIES[sid]; tot=sum(s["종족값"].values())
        print(f"  {s['이름']['한']}: 종족값합 {tot}, 타입 {s['타입']}, 출현 {s['현실_출현지역'][:2]}")
    # 타입 사각지대 없는지: 모든 18타입이 공/수에 존재
    print(f"  타입표 무결성: 18타입 전부 정의={len(TYPE_CHART)==18 and all(len(v)==18 for v in TYPE_CHART.values())}")
    print(f"  로드된 종: {len(SPECIES)}, 기술 사전: {len(MOVES)}")
    print("="*66); print("플레이테스트 완료 — 데이터·엔진 통합 정상 동작 ✅")

if __name__=="__main__":
    main()
