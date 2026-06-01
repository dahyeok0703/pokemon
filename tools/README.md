# tools/ — 데이터 생성·검증 스크립트

> **상태: Phase 2~4에서 채워진다.** 대량 데이터는 손으로 적지 않고 여기 스크립트로 만든다(CLAUDE.md 8절).

예정 스크립트:

- `build_pokemon.*` — PokéAPI 캐싱(가능 시) 또는 대표 세트 생성 → `data/pokemon/*.json` + `index.json`.
  - 현재 환경은 PokéAPI 접근 차단(HTTP 403). 차단 시 대표 세트(타입·세대 망라 수백 종)부터 생성 후 점진 확장.
- `gen_tournaments.*` — 티어별 템플릿으로 약 500개 대회 생성 → `data/tournaments/*.json` + `index.json`.
- `build_calendar.*` — 대회의 개최 주기 규칙을 연도 달력으로 전개 → `data/calendar` 색인.
- `verify_battle.*` — 데미지/포획/능력치 공식의 시드 PRNG 재현성 검증(같은 시드+입력 → 같은 결과).

언어는 의존성이 가벼운 것(파이썬 표준 라이브러리 등)을 우선한다.
