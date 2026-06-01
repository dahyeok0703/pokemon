#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_tournaments.py — 약 500개 대회 + 연간 달력(2035) 생성.

손으로 적지 않는다: 실제 도시 풀 + 티어별 템플릿 + 시드 난수로 생성한다.
산출물(data/tournaments/):
  local.json regional.json national.json continental.json world.json special.json
  index.json   (경량 색인 {id,이름,티어,게임내_개최일,자격요약,도시})
산출물(data/):
  calendar_2035.json  (대회별 2035년 대표 개최일 + 주기 → GM이 다가오는 대회 조회)

성장 경로: 상위 티어의 출전_자격.선행대회_입상 ↔ 하위 티어 id 가 맞물린다.
"""
import json, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "tournaments")
DATA = os.path.join(HERE, "..", "data")
os.makedirs(OUT, exist_ok=True)
R = random.Random(20350601)  # 결정론

# ---- 실제 지리 풀: 대륙 → 국가 → 도시 ---------------------------------------
# (도시코드, 한글명, 규모) 규모 3=대도시 2=중도시 1=소도시
GEO = {
 "아시아": {
  "JP": ("일본","TYO", [("TYO","도쿄",3),("OSA","오사카",3),("NGO","나고야",2),("FUK","후쿠오카",2),("SPK","삿포로",2),("KOB","고베",1),("SEN","센다이",1)]),
  "KR": ("대한민국","SEL", [("SEL","서울",3),("BSN","부산",2),("ICN","인천",2),("DGU","대구",1),("GWJ","광주",1)]),
  "CN": ("중국","BJS", [("BJS","베이징",3),("SHA","상하이",3),("GZH","광저우",2),("CDU","청두",2),("XAN","시안",1)]),
  "IN": ("인도","DEL", [("DEL","델리",3),("MUM","뭄바이",3),("BLR","벵갈루루",2),("KOL","콜카타",1)]),
  "TH": ("태국","BKK", [("BKK","방콕",3),("CNX","치앙마이",1)]),
  "ID": ("인도네시아","JKT", [("JKT","자카르타",3),("DPS","발리",1)]),
 },
 "유럽": {
  "GB": ("영국","LON", [("LON","런던",3),("MAN","맨체스터",2),("EDI","에든버러",1),("LIV","리버풀",1)]),
  "FR": ("프랑스","PAR", [("PAR","파리",3),("LYS","리옹",2),("MRS","마르세유",1)]),
  "DE": ("독일","BER", [("BER","베를린",3),("MUC","뮌헨",2),("ESS","에센(루르)",2),("HAM","함부르크",1)]),
  "IT": ("이탈리아","ROM", [("ROM","로마",3),("MIL","밀라노",2),("CTA","카타니아(시칠리아)",1)]),
  "ES": ("스페인","MAD", [("MAD","마드리드",3),("BCN","바르셀로나",2)]),
  "RU": ("러시아","MOW", [("MOW","모스크바",3),("LED","상트페테르부르크",2),("OVB","노보시비르스크(시베리아)",1)]),
  "IS": ("아이슬란드","REK", [("REK","레이캬비크",1)]),
  "NO": ("노르웨이","OSL", [("OSL","오슬로",2),("TOS","트롬쇠",1)]),
 },
 "북미": {
  "US": ("미국","WAS", [("NYC","뉴욕",3),("LAX","로스앤젤레스",3),("CHI","시카고",2),("LAS","라스베이거스",2),("SEA","시애틀",2),("MIA","마이애미",1),("DEN","덴버",1)]),
  "CA": ("캐나다","OTT", [("TOR","토론토",3),("VAN","밴쿠버",2),("MTL","몬트리올",2)]),
  "MX": ("멕시코","MEX", [("MEX","멕시코시티",3),("CUN","칸쿤",1)]),
 },
 "남미": {
  "BR": ("브라질","BSB", [("SAO","상파울루",3),("RIO","리우데자네이루",2),("MAO","마나우스(아마존)",1)]),
  "AR": ("아르헨티나","BUE", [("BUE","부에노스아이레스",3),("BRC","바릴로체",1)]),
  "PE": ("페루","LIM", [("LIM","리마",2),("CUZ","쿠스코",1)]),
  "CL": ("칠레","SCL", [("SCL","산티아고",2)]),
 },
 "아프리카": {
  "EG": ("이집트","CAI", [("CAI","카이로",3),("LXR","룩소르",1)]),
  "ZA": ("남아프리카공화국","PRY", [("JNB","요하네스버그",2),("CPT","케이프타운",2)]),
  "KE": ("케냐","NBO", [("NBO","나이로비",2)]),
  "MA": ("모로코","RAB", [("CAS","카사블랑카",2),("RAK","마라케시",1)]),
  "NG": ("나이지리아","ABV", [("LOS","라고스",3)]),
 },
 "오세아니아": {
  "AU": ("오스트레일리아","CBR", [("SYD","시드니",3),("MEL","멜버른",2),("ASP","앨리스스프링스",1)]),
  "NZ": ("뉴질랜드","WLG", [("AKL","오클랜드",2),("ZQN","퀸스타운",1)]),
 },
}

TYPES = ["노말","불꽃","물","풀","전기","얼음","격투","독","땅","비행","에스퍼","벌레","바위","고스트","드래곤","악","강철","페어리"]

LOCAL_THEMES = [
 ("신인배","면허만 있으면 누구나 참가하는 등용문",0,None),
 ("주말 오픈","동네 트레이너들이 모이는 주말 정기전",10,None),
 ("3vs3 스피드컵","빠른 템포의 3vs3 단판 토너먼트",20,None),
 ("타입 챌린지","지정 단일 타입 파티만 출전",30,"TYPE"),
 ("주니어 클래식","레벨캡이 낮은 입문자 대회",0,None),
 ("나이트 배틀","야간 개최, 더블 배틀",40,None),
]
REGIONAL_THEMES = [
 ("지방 선수권","지방 최강을 가리는 정규전",120),
 ("광역 컵","권역 도시들이 겨루는 6vs6",150),
 ("더블 마스터스","더블 배틀 전문 지방전",140),
]

def fmt_single(party=3, used=3, double=False):
    return {"방식":"더블" if double else "싱글","파티수":party,"출전수":used,"교체":"허용"}

def base_rules():
    return {"레벨캡":50,"타입제한":None,"전설_금지":True,"환상_금지":True,
            "메가_금지":False,"거다이맥스_금지":False,"아이템_금지":False,"동일종_금지":True,"기타":[]}

def schedule_anchor(seed_int, span):
    """대표 개최 월/일을 결정론적으로."""
    m = (seed_int % 12) + 1
    d = ((seed_int // 12) % 27) + 1
    return m, d

all_t = []          # 모든 대회
by_tier = {"로컬":[], "지방":[], "국가":[], "대륙":[], "세계":[], "특수":[]}
local_by_country = {}   # country_code -> [ids]
regional_by_country = {}
national_by_country = {}
continental_by_continent = {}

# ---- 로컬 ~250 -------------------------------------------------------------
counter = 0
target_local = 250
# 도시별로 균등 분배되도록 라운드로빈
city_list = []
for cont, countries in GEO.items():
    for cc,(cname,cap,cities) in countries.items():
        for (citycode,cityname,size) in cities:
            city_list.append((cont,cc,cname,citycode,cityname,size))
# 큰 도시는 더 많이
def local_count(size): return {3:5,2:4,1:3}[size]
li = 0
while len([t for t in by_tier["로컬"]]) < target_local:
    progressed = False
    for (cont,cc,cname,citycode,cityname,size) in city_list:
        cnt = local_count(size)
        existing = [t for t in by_tier["로컬"] if t["_cc"]==cc and t["_city"]==citycode]
        if len(existing) >= cnt:
            continue
        if len(by_tier["로컬"]) >= target_local:
            break
        progressed = True
        theme = LOCAL_THEMES[len(existing) % len(LOCAL_THEMES)]
        name_t, desc, fame, special = theme
        seq = len(existing)+1
        tid = f"{cc}-{citycode}-L-{seq:02d}"
        rules = base_rules()
        period = R.choice(["매월","격주","매월","분기"])
        double = "더블" in name_t or "나이트" in name_t
        party = 3
        if "타입" in name_t:
            t = R.choice(TYPES); rules["타입제한"] = f"{t} 타입만"
        if "주니어" in name_t or "신인" in name_t:
            rules["레벨캡"] = 30 if "주니어" in name_t else 50
        m,d = schedule_anchor(counter, 12)
        t_obj = {
          "id":tid,"이름":f"{cityname} {name_t}","티어":"로컬",
          "주최주체":{"유형":"지자체","이름":f"{cityname}시"},
          "현실_개최지":{"국가":cname,"도시":cityname,"장소":f"{cityname} 시민 배틀돔"},
          "개최_주기":period,"게임내_개최일":[f"{period} (대표 {m}월 {d}일 전후)"],
          "출전_자격":{"최소_명성":fame,"최소_랭킹":None,"선행대회_입상":[],"면허_등급":"신인","기타_플래그":[]},
          "포맷":fmt_single(party, party, double),
          "특수룰":rules,
          "라운드_구조":{"방식":"싱글엘리미네이션","참가_규모":R.choice([8,16,16,32]),"라운드":["예선","8강","4강","결승"]},
          "상금":{"통화":"현지","우승":R.choice([30000,50000,80000]),"준우승":15000,"4강":6000},
          "보상_아이템":[{"순위":"우승","아이템":R.choice(["상처약 세트","기술머신 교환권","메가스톤 조각"]),"수량":1}],
          "명성_점수":{"우승":50,"준우승":25,"본선진출":5},
          "다음_단계":[],
          "설명":desc,"플레이버":f"{cityname}의 주민들이 모이는 친근한 대회.",
          "_cc":cc,"_city":citycode,"_cont":cont,"_anchor":(m,d),"_period":period,
        }
        by_tier["로컬"].append(t_obj)
        local_by_country.setdefault(cc,[]).append(tid)
        counter += 1
    if not progressed:
        break

# ---- 지방 ~120 -------------------------------------------------------------
target_regional = 120
ri = 0
while len(by_tier["지방"]) < target_regional:
    progressed = False
    for (cont, countries) in GEO.items():
        for cc,(cname,cap,cities) in countries.items():
            if len(by_tier["지방"]) >= target_regional: break
            existing = regional_by_country.get(cc,[])
            # 국가 규모(도시 수)에 비례
            cap_n = len(cities) + 2
            if len(existing) >= cap_n:
                continue
            progressed = True
            theme = REGIONAL_THEMES[len(existing) % len(REGIONAL_THEMES)]
            name_t, desc, fame = theme
            seq = len(existing)+1
            host_city = cities[min(len(existing), len(cities)-1)]
            tid = f"{cc}-R-{seq:02d}"
            rules = base_rules(); rules["레벨캡"]=50
            double = "더블" in name_t
            party = 4 if "6vs6" in desc or "광역" in name_t else 4
            used = 6 if "6vs6" in desc or "광역" in name_t else 3
            # 자격: 해당 국가 로컬 입상
            prereq_pool = local_by_country.get(cc,[])
            prereqs = ([{"id":pid,"최소순위":4} for pid in R.sample(prereq_pool, min(2,len(prereq_pool)))] if prereq_pool else [])
            m,d = schedule_anchor(1000+counter, 4)
            m = R.choice([3,6,9,12])  # 분기
            t_obj = {
              "id":tid,"이름":f"{cname} {name_t}","티어":"지방",
              "주최주체":{"유형":"단체","이름":f"{cname} 배틀협회 지부"},
              "현실_개최지":{"국가":cname,"도시":host_city[1],"장소":f"{host_city[1]} 지방 아레나"},
              "개최_주기":"분기","게임내_개최일":[f"분기 (대표 {m}월 {d}일 전후)"],
              "출전_자격":{"최소_명성":fame,"최소_랭킹":None,"선행대회_입상":prereqs,"면허_등급":"정규","기타_플래그":[]},
              "포맷":fmt_single(party, used, double),
              "특수룰":rules,
              "라운드_구조":{"방식":"싱글엘리미네이션","참가_규모":32,"라운드":["32강","16강","8강","4강","결승"]},
              "상금":{"통화":"현지","우승":300000,"준우승":120000,"4강":40000},
              "보상_아이템":[{"순위":"우승","아이템":R.choice(["메가스톤","고급 기술머신","희귀 볼 세트"]),"수량":1}],
              "명성_점수":{"우승":150,"준우승":80,"본선진출":20},
              "다음_단계":[],
              "설명":desc,"플레이버":f"{cname} 각지의 강자가 모이는 지방 정점.",
              "_cc":cc,"_cont":cont,"_anchor":(m,d),"_period":"분기",
            }
            by_tier["지방"].append(t_obj)
            regional_by_country.setdefault(cc,[]).append(tid)
            # 로컬 다음_단계 연결
            for pid in [p["id"] for p in prereqs]:
                for lt in by_tier["로컬"]:
                    if lt["id"]==pid: lt["다음_단계"].append(tid)
            counter += 1
    if not progressed: break

# ---- 국가 ~70 --------------------------------------------------------------
target_national = 70
while len(by_tier["국가"]) < target_national:
    progressed = False
    for (cont, countries) in GEO.items():
        for cc,(cname,cap,cities) in countries.items():
            if len(by_tier["국가"]) >= target_national: break
            existing = national_by_country.get(cc,[])
            cap_n = 4 if len(cities)>=5 else (3 if len(cities)>=3 else 2)
            if len(existing) >= cap_n: continue
            progressed = True
            seq = len(existing)+1
            names = ["전국 선수권","내셔널 챔피언십","마스터스 토너먼트"]
            name_t = names[len(existing)%len(names)]
            tid = f"{cc}-N-{seq:02d}"
            rules = base_rules(); rules["레벨캡"]=50
            if seq==1: rules["전설_금지"]=True
            prereq_pool = regional_by_country.get(cc,[])
            prereqs = ([{"id":pid,"최소순위":2} for pid in R.sample(prereq_pool,min(2,len(prereq_pool)))] if prereq_pool else [])
            m = R.choice([9,10,11])  # 가을 시즌
            d = R.randint(1,27)
            t_obj = {
              "id":tid,"이름":f"{cname} {name_t}","티어":"국가",
              "주최주체":{"유형":"단체","이름":f"{cname} 포켓몬 배틀 연맹"},
              "현실_개최지":{"국가":cname,"도시":cities[0][1],"장소":f"{cities[0][1]} 내셔널 스타디움"},
              "개최_주기":"연1회","게임내_개최일":[f"매년 {m}월 {d}일 전후"],
              "출전_자격":{"최소_명성":400,"최소_랭킹":None,"선행대회_입상":prereqs,"면허_등급":"상급","기타_플래그":[]},
              "포맷":fmt_single(6,6,False),
              "특수룰":rules,
              "라운드_구조":{"방식":"예선+본선","참가_규모":64,"라운드":["예선리그","32강","16강","8강","4강","결승"]},
              "상금":{"통화":"현지","우승":3000000,"준우승":1200000,"4강":400000},
              "보상_아이템":[{"순위":"우승","아이템":"국가대표 인증 + 메가스톤 세트","수량":1}],
              "명성_점수":{"우승":500,"준우승":250,"본선진출":60},
              "다음_단계":[],
              "설명":f"{cname} 전역의 챔피언을 가리는 최고 권위 국내 대회.",
              "플레이버":f"{cname} 국기를 건 신인부터 베테랑까지의 정점.",
              "_cc":cc,"_cont":cont,"_anchor":(m,d),"_period":"연1회",
            }
            by_tier["국가"].append(t_obj)
            national_by_country.setdefault(cc,[]).append(tid)
            for pid in [p["id"] for p in prereqs]:
                for rt in by_tier["지방"]:
                    if rt["id"]==pid: rt["다음_단계"].append(tid)
            counter += 1
    if not progressed: break

# ---- 대륙 ~40 --------------------------------------------------------------
CONT_CODE = {"아시아":"AS","유럽":"EU","북미":"NA","남미":"SA","아프리카":"AF","오세아니아":"OC"}
target_cont = 40
per_cont = {}
while len(by_tier["대륙"]) < target_cont:
    progressed=False
    for cont in GEO:
        if len(by_tier["대륙"]) >= target_cont: break
        cnt = per_cont.get(cont,0)
        if cnt >= 7: continue
        progressed=True
        seq=cnt+1
        code=CONT_CODE[cont]
        names=["대륙 선수권","컨티넨탈 컵","대륙 마스터스","대륙 오픈","챔피언스 리그","대륙 그랑프리","대륙 인비테이셔널"]
        name_t=names[cnt%len(names)]
        tid=f"{code}-C-{seq:02d}"
        # 자격: 해당 대륙 국가들의 국가대회 입상
        nat_pool=[t["id"] for t in by_tier["국가"] if t["_cont"]==cont]
        prereqs=([{"id":pid,"최소순위":4} for pid in R.sample(nat_pool,min(2,len(nat_pool)))] if nat_pool else [])
        host=R.choice(list(GEO[cont].values()))
        rules=base_rules(); rules["레벨캡"]=None
        if seq%3==0: rules["전설_금지"]=False  # 일부 대륙전은 전설 허용
        m=R.choice([1,2,12]); d=R.randint(1,27)
        t_obj={
          "id":tid,"이름":f"{cont} {name_t}","티어":"대륙",
          "주최주체":{"유형":"단체","이름":f"{cont} 배틀 연합(GPMA {code})"},
          "현실_개최지":{"국가":host[0],"도시":host[2][0][1],"장소":f"{host[2][0][1]} 컨티넨탈 아레나"},
          "개최_주기":R.choice(["연1회","연1회","격년"]),"게임내_개최일":[f"매년 {m}월 {d}일 전후"],
          "출전_자격":{"최소_명성":2000,"최소_랭킹":1000,"선행대회_입상":prereqs,"면허_등급":"마스터","기타_플래그":[]},
          "포맷":fmt_single(6,6,False),
          "특수룰":rules,
          "라운드_구조":{"방식":"예선+본선","참가_규모":128,"라운드":["예선리그","64강","32강","16강","8강","4강","결승"]},
          "상금":{"통화":"USD","우승":50000,"준우승":20000,"4강":8000},
          "보상_아이템":[{"순위":"우승","아이템":"대륙 챔피언 트로피 + 거다이맥스 인증","수량":1}],
          "명성_점수":{"우승":2000,"준우승":1000,"본선진출":200},
          "다음_단계":[],
          "설명":f"{cont} 전역의 국가 챔피언들이 겨루는 대륙 최강전.",
          "플레이버":f"{cont} 대륙의 자존심을 건 무대.",
          "_cc":code,"_cont":cont,"_anchor":(m,d),"_period":"연1회",
        }
        by_tier["대륙"].append(t_obj)
        per_cont[cont]=seq
        for pid in [p["id"] for p in prereqs]:
            for nt in by_tier["국가"]:
                if nt["id"]==pid: nt["다음_단계"].append(tid)
        continental_by_continent.setdefault(cont,[]).append(tid)
    if not progressed: break

# ---- 세계 ~10 --------------------------------------------------------------
WORLD_HOSTS=[("일본","도쿄"),("미국","뉴욕"),("영국","런던"),("프랑스","파리"),
 ("브라질","상파울루"),("오스트레일리아","시드니"),("이집트","카이로"),
 ("대한민국","서울"),("독일","베를린"),("캐나다","토론토")]
WORLD_NAMES=["월드 챔피언십","글로벌 마스터스","세계 그랜드파이널","월드 챔피언스 컵",
 "인터내셔널 인비테이셔널","올스타 월드컵","행성 토너먼트","유니버설 리그",
 "전설의 전당전","월드 시리즈 파이널"]
all_cont_ids=[t["id"] for t in by_tier["대륙"]]
for i in range(10):
    host=WORLD_HOSTS[i]
    tid=f"W-{i+1:02d}"
    rules=base_rules(); rules["레벨캡"]=None
    legendary_ok = i in (8,)  # '전설의 전당전'만 전설 허용
    rules["전설_금지"]= not legendary_ok
    rules["환상_금지"]= not legendary_ok
    prereqs=[{"id":pid,"최소순위":2} for pid in R.sample(all_cont_ids,min(3,len(all_cont_ids)))]
    m=[7,8][i%2]; d=R.randint(1,27)
    t_obj={
      "id":tid,"이름":WORLD_NAMES[i],"티어":"세계",
      "주최주체":{"유형":"단체","이름":"GPMA 세계본부"},
      "현실_개최지":{"국가":host[0],"도시":host[1],"장소":f"{host[1]} 월드 아레나"},
      "개최_주기":R.choice(["연1회","격년","4년마다"]),"게임내_개최일":[f"매년 {m}월 {d}일 전후"],
      "출전_자격":{"최소_명성":8000,"최소_랭킹":100,"선행대회_입상":prereqs,"면허_등급":"마스터","기타_플래그":["대륙_입상"]},
      "포맷":fmt_single(6,6,False),
      "특수룰":rules,
      "라운드_구조":{"방식":"예선+본선","참가_규모":256,"라운드":["월드예선","128강","64강","32강","16강","8강","4강","결승"]},
      "상금":{"통화":"USD","우승":1000000,"준우승":400000,"4강":150000},
      "보상_아이템":[{"순위":"우승","아이템":"세계 챔피언 벨트 + 명예의 전당 등재","수량":1}],
      "명성_점수":{"우승":10000,"준우승":5000,"본선진출":1000},
      "다음_단계":[],
      "설명":"지구 최강의 트레이너를 가리는 정점. 대륙 입상자만이 설 수 있다.",
      "플레이버":"전 세계가 지켜보는 단 하나의 무대." + (" 전설 포켓몬 출전이 허용되는 유일한 세계전." if legendary_ok else ""),
      "_cc":"W","_cont":"세계","_anchor":(m,d),"_period":"연1회",
    }
    by_tier["세계"].append(t_obj)
    for pid in [p["id"] for p in prereqs]:
        for ct in by_tier["대륙"]:
            if ct["id"]==pid: ct["다음_단계"].append(tid)

# ---- 특수 ~30 (기업배·인물배·테마배) ---------------------------------------
SPECIAL=[
 ("실프 컴퍼니 테크 컵","기업","실프 주식회사","도쿄","일본","강철·전기 타입 우대, 메가 의무",{"메가_금지":False,"기타":["메가진화 1마리 이상 의무"]}),
 ("데볼루션 코퍼레이트 컵","기업","데볼루션 사","요하네스버그","남아프리카공화국","아이템 전면 금지",{"아이템_금지":True}),
 ("로켓 언더그라운드","인물","익명의 주최자","마르세유","프랑스","악·독·고스트 타입만, 전설 금지",{"타입제한":"악/독/고스트만"}),
 ("오박사 추모 클래식","인물","오 연구소","상파울루","브라질","1세대 포켓몬만 출전",{"기타":["전국도감 1~151만"]}),
 ("싱글타입 그랑프리","테마","월드 배틀 미디어","런던","영국","단일 타입 파티 의무",{"타입제한":"단일 타입 파티"}),
 ("리틀컵 인터내셔널","테마","주니어 리그","서울","대한민국","레벨 5 미진화 한정",{"레벨캡":5,"기타":["미진화·최종진화 불가"]}),
 ("거다이맥스 페스타","테마","다이맥스 위원회","맨체스터","영국","거다이맥스 가능 종 우대",{"거다이맥스_금지":False,"기타":["거다이맥스 1마리 이상 의무"]}),
 ("노 강화 퓨어 컵","테마","클래식 배틀 협회","로마","이탈리아","메가·거다이맥스 전면 금지",{"메가_금지":True,"거다이맥스_금지":True}),
 ("스피드스타 컵","테마","속공 리그","라스베이거스","미국","스피드 종족값 100 이상만",{"기타":["스피드 종족값 100+"]}),
 ("몬스터볼 마라톤","테마","포획 길드","나이로비","케냐","포획 수+배틀 복합 점수",{"기타":["포획 미션 병행"]}),
 ("드래곤 마스터 인비","테마","드래곤 클랜","레이캬비크","아이슬란드","드래곤 타입 포함 의무",{"타입제한":"드래곤 1마리 이상"}),
 ("고스트 나이트","테마","심야 배틀 클럽","뉴올리언스","미국","야간·고스트 우대 더블",{}),
 ("페어리 가든 컵","테마","가든 소사이어티","파리","프랑스","페어리·풀 테마",{}),
 ("아이언 워크스 컵","기업","우랄 중공업","노보시비르스크(시베리아)","러시아","강철 타입 우대",{}),
 ("선셋 비치 토너먼트","테마","해변 리그","발리","인도네시아","물 타입 우대 해변전",{}),
 ("볼케이노 챌린지","테마","화산 탐사대","카타니아(시칠리아)","이탈리아","불꽃·바위 테마",{}),
 ("아웃백 서바이벌","테마","사막 길드","앨리스스프링스","오스트레일리아","땅·바위 우대 장기전",{}),
 ("히말라야 하이랜드 컵","테마","고산 원정대","카트만두 인근","인도","얼음·비행 테마(고지대)",{}),
 ("파라오스 트라이얼","인물","고고학 재단","룩소르","이집트","에스퍼·고스트 테마 유적전",{}),
 ("아마존 와일드 컵","테마","우림 보전회","마나우스(아마존)","브라질","풀·벌레·물 테마",{}),
 ("코퍼레이트 올스타","기업","글로벌 스폰서 연합","뉴욕","미국","초청 인비테이셔널",{}),
 ("챔피언 인비테이셔널","인물","역대 챔피언 모임","도쿄","일본","역대 입상자 초청전",{}),
 ("루키 오브 더 이어","테마","신인 협회","토론토","캐나다","신인 한정 연말전",{"면허_등급":"신인"}),
 ("미드나잇 더블스","테마","나이트 리그","상하이","중국","심야 더블 배틀",{}),
 ("클래식 6vs6","테마","정통 배틀 협회","베를린","독일","교체 금지 6vs6",{}),
 ("핸디캡 마스터스","테마","밸런스 위원회","멜버른","오스트레일리아","핸디캡 룰 적용",{}),
 ("타입 룰렛","테마","랜덤 배틀 쇼","마이애미","미국","매 라운드 타입 제한 변경",{}),
 ("올드스쿨 컵","테마","레트로 리그","리버풀","영국","1~3세대 한정",{"기타":["전국도감 1~386만"]}),
 ("월드 주니어 파이널","테마","국제 주니어 연맹","멕시코시티","멕시코","미성년 트레이너 세계전",{"레벨캡":50}),
 ("그랜드 채리티 매치","인물","자선 재단","런던","영국","자선 초청 이벤트전",{}),
]
for i,(nm,kind,host_name,city,country,rule_desc,rule_over) in enumerate(SPECIAL):
    tid=f"SP-{i+1:02d}"
    rules=base_rules(); rules.update(rule_over)
    fame=R.choice([300,800,1500,3000])
    t_obj={
      "id":tid,"이름":nm,"티어":"특수",
      "주최주체":{"유형":kind,"이름":host_name},
      "현실_개최지":{"국가":country,"도시":city,"장소":f"{city} 특설 경기장"},
      "개최_주기":R.choice(["연1회","반기","분기"]),"게임내_개최일":[f"매년 {R.randint(1,12)}월 중"],
      "출전_자격":{"최소_명성":fame,"최소_랭킹":None,"선행대회_입상":[],"면허_등급":rule_over.get("면허_등급","정규"),"기타_플래그":[]},
      "포맷":fmt_single(6,6,"더블" in nm or "더블스" in nm),
      "특수룰":rules,
      "라운드_구조":{"방식":R.choice(["싱글엘리미네이션","스위스","예선+본선"]),"참가_규모":R.choice([16,32,64]),"라운드":["예선","8강","4강","결승"]},
      "상금":{"통화":"USD","우승":R.choice([20000,50000,100000]),"준우승":15000,"4강":5000},
      "보상_아이템":[{"순위":"우승","아이템":R.choice(["한정 메가스톤","특별 트로피","희귀 도구 세트"]),"수량":1}],
      "명성_점수":{"우승":R.choice([200,400,800]),"준우승":100,"본선진출":30},
      "다음_단계":[],
      "설명":f"[{kind}배] {rule_desc}.",
      "플레이버":f"{nm} — 독특한 룰로 이름난 화제의 대회.",
      "_cc":"SP","_cont":"특수","_anchor":(R.randint(1,12),R.randint(1,27)),"_period":"연1회",
    }
    by_tier["특수"].append(t_obj)

# ---- 출력 + 색인 + 달력 ----------------------------------------------------
def strip_internal(t):
    return {k:v for k,v in t.items() if not k.startswith("_")}

FILE={"로컬":"local.json","지방":"regional.json","국가":"national.json",
      "대륙":"continental.json","세계":"world.json","특수":"special.json"}
index=[]; calendar=[]
total=0
for tier,lst in by_tier.items():
    clean=[strip_internal(t) for t in lst]
    with open(os.path.join(OUT,FILE[tier]),"w",encoding="utf-8") as f:
        json.dump(clean,f,ensure_ascii=False,indent=1)
    total+=len(lst)
    for t in lst:
        index.append({"id":t["id"],"이름":t["이름"],"티어":tier,
                      "게임내_개최일":t["게임내_개최일"][0],
                      "최소_명성":t["출전_자격"]["최소_명성"],
                      "도시":t["현실_개최지"]["도시"],"국가":t["현실_개최지"]["국가"]})
        m,d=t["_anchor"]
        calendar.append({"월":m,"일":d,"id":t["id"],"이름":t["이름"],"티어":tier,
                         "도시":t["현실_개최지"]["도시"],"국가":t["현실_개최지"]["국가"],
                         "주기":t["_period"]})

with open(os.path.join(OUT,"index.json"),"w",encoding="utf-8") as f:
    json.dump(index,f,ensure_ascii=False,indent=1)
calendar.sort(key=lambda e:(e["월"],e["일"]))
with open(os.path.join(DATA,"calendar_2035.json"),"w",encoding="utf-8") as f:
    json.dump({"연도":2035,"이벤트":calendar},f,ensure_ascii=False,indent=1)

print("대회 생성 합계:",total)
for tier,lst in by_tier.items():
    print(f"  {tier}: {len(lst)}")
print("달력 이벤트:",len(calendar))
# 성장경로 연결 확인
linked=sum(1 for t in by_tier["지방"] if t["출전_자격"]["선행대회_입상"])
print(f"지방 중 선행자격 연결: {linked}/{len(by_tier['지방'])}")
