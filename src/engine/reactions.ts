import { RNG } from "./rng";

const COUNTRIES = ["🇰🇷 대한민국","🇯🇵 일본","🇺🇸 미국","🇬🇧 영국","🇫🇷 프랑스","🇩🇪 독일","🇮🇹 이탈리아","🇧🇷 브라질",
  "🇦🇷 아르헨티나","🇦🇺 호주","🇨🇦 캐나다","🇪🇬 이집트","🇨🇳 중국","🇮🇳 인도","🇲🇽 멕시코","🇿🇦 남아공","🇳🇴 노르웨이","🇮🇸 아이슬란드"];
const HANDLES = ["배틀러99","포켓덕후","코너스톤","나이트오울","subzero","gym_rat","미라지","hoennfan","드래곤테이머",
  "조용한관전러","치즈볼","aurora","montaña","sakura_92","빅웨이브","tundra","피카전도사","midnight"];

const NEWS_BY_TIER: Record<string, string[]> = {
  지방: ["[지역신문] {tour}, {name} 우승… 지역 배틀계 새 얼굴","[로컬방송] {name} 선수, {tour} 제패"],
  국가: ["[전국일보] {name}, {tour} 우승으로 전국구 스타 등극","[스포츠채널] '{name} 신드롬'… {tour} 결승 시청률 급등","[속보] {tour} 새 챔피언 {name} 탄생"],
  대륙: ["[대륙망] {name}, {tour} 정상… 대륙 랭킹 지각변동","[인터내셔널] '{name}을 주목하라' — {tour} 우승","[해외토픽] {country}도 들썩인 {name}의 {tour} 제패","[칼럼] {name}, 세계 무대 진출 유력"],
  세계: ["[GPMA 공식] {name}, {tour} 우승 — 새로운 세계 챔피언 탄생","[글로벌헤드라인] 지구가 {name}을 주목하다","[{country} 1면] '{name} 쇼크'… {tour} 제패","[다큐] 2026 출현 이후 최강, {name}의 시대","[속보] {tour} 결승, 전 세계 동시 생중계 사상 최고 시청"],
};
const COMMENTS_POS = ["와 미쳤다 {name} 진짜 잘한다","이 경기 소름… 다시보기 200번째","{name} 응원합니다 🔥","역대급 결승이었다","파티 구성 보고 배웠음","드디어 새 챔피언!","눈물나는 우승스토리","{name} 굿즈 어디서 사나요"];
const COMMENTS_AWE = ["저 레벨 컨트롤 실화냐","상성 계산 미쳤네","해설진도 할 말 잃음","마지막 한 방 ㄷㄷ","전설 없이 이김?","교과서 같은 운영"];
const COMMENTS_FUN = ["나도 트레이너 할걸 ㅋㅋ","우리 동네 대회나 나가야지…","상대가 불쌍할 지경","치킨 시켜놓고 봄 ㅋㅋ","{handle} 또 밤샘각","포켓몬센터 주식 사야하나"];
const COMMENTS_NEG = ["운빨 아님? (진심 아님 ㅋ)","난 라이벌 응원했는데 ㅠ","다음엔 진다에 한표","흠 글쎄 더 강한 사람 많을걸"];

export interface Reaction { news: string[]; comments: { handle: string; country: string; text: string }[]; }

export function generateReactions(rng: RNG, name: string, tourName: string, tier: string): Reaction {
  const counts: Record<string, [number, number]> = { 로컬: [0, 0], 지방: [1, 2], 국가: [2, 5], 대륙: [3, 8], 세계: [5, 14], 특수: [1, 3] };
  const [nNews, nCom] = counts[tier] ?? [1, 2];
  const fill = (s: string, handle = "") => s.replaceAll("{name}", name).replaceAll("{tour}", tourName).replaceAll("{country}", rng.pick(COUNTRIES)).replaceAll("{handle}", handle);
  const newsPool = NEWS_BY_TIER[tier] ?? NEWS_BY_TIER["지방"];
  const news: string[] = [];
  for (let i = 0; i < nNews && newsPool.length; i++) news.push(fill(rng.pick(newsPool)));
  const pool = [...COMMENTS_POS, ...COMMENTS_AWE, ...COMMENTS_FUN, ...(tier === "세계" || tier === "대륙" ? COMMENTS_NEG : [])];
  const comments: Reaction["comments"] = [];
  for (let i = 0; i < nCom; i++) {
    const handle = rng.pick(HANDLES) + rng.int(1, 99);
    comments.push({ handle, country: rng.pick(COUNTRIES), text: fill(rng.pick(pool), handle) });
  }
  return { news, comments };
}
