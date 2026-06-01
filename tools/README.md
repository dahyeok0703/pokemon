# tools/ — 데이터 생성·검증 스크립트

대량 데이터는 손으로 적지 않고 여기 스크립트로 만든다(CLAUDE.md 8절). 언어: **Python 표준 라이브러리**.

## build_pokemon.py  ✅ (Phase 2)

PokéAPI의 공개 CSV 데이터셋에서 전 종 포켓몬 DB를 생성한다.

- **출처**: `github.com/PokeAPI/pokeapi` 의 `data/v2/csv/*.csv` (정식 PokéAPI API는 이 환경에서 403, 그러나 raw.githubusercontent는 접근 가능).
- **캐시**: `tools/cache/` 에 원본 CSV를 둔다(대용량, `.gitignore`로 제외). 없으면 아래로 재다운로드:
  ```bash
  BASE="https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
  mkdir -p tools/cache
  for f in pokemon pokemon_species pokemon_stats stats pokemon_types types \
           pokemon_abilities abilities languages pokemon_species_names type_names \
           ability_names growth_rates pokemon_evolution evolution_triggers \
           pokemon_move_methods version_groups moves move_names pokemon_moves; do
    curl -s -o "tools/cache/$f.csv" "$BASE/$f.csv"
  done
  ```
- **실행**: `python3 tools/build_pokemon.py`
- **산출**:
  - `data/pokemon/gen1.json … gen9.json` — 전 1025종(기본 폼): 종족값·타입·특성·기술풀·진화·희귀도·메가/거다이맥스 가능여부·경험치그룹·포획률·성별비.
  - `data/pokemon/forms.json` — 190개 대체 폼(메가/거다이맥스/리전폼)의 타입·종족값·특성. (강화 폼 상세는 `mechanics/mega.md`·`gigantamax.md`가 참조.)
  - `data/pokemon/moves.json` — 919개 기술 사전: `{타입, 분류(물리/특수/변화), 위력, PP, 명중, 우선도, 추가효과확률}`. **전투 엔진의 기술 데이터 소스.**
  - `data/pokemon/index.json` — 경량 색인(전 종 id/이름/파일/타입/희귀도/메가/거다이맥스). GM은 전체 로드 없이 여기서 종을 찾는다.
- **휴리스틱**: `현실_출현지역`/`서식_환경`은 타입 기반 표(`TYPE_REGION`)로 시드(자세히는 `data/regions.md`).
- 한국어=`language_id 3`. 한글명 없는 신종은 영문명 폴백.

## 예정

- `gen_tournaments.py` (Phase 4) — 티어별 템플릿으로 약 500개 대회 생성.
- `build_calendar.py` (Phase 4) — 개최 주기 규칙 → 연도 달력 전개.
- `verify_battle.py` (Phase 3) — 데미지/포획/능력치 공식의 시드 PRNG 재현성 검증.
