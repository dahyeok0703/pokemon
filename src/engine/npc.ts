import { RNG } from "./rng";
import { WORLD } from "./world";

export const NPC_TOTAL = 5000;

const SURNAME = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","전",
  "Smith","García","Müller","Sato","Rossi","Dubois","Silva","Kim","Chen","Ivanov","Okafor","Khan","Nakamura","Brown","Tanaka"];
const GIVEN = ["민준","서연","도윤","하윤","지호","수아","예준","지유","주원","서윤","건우","채원","현우","다은","우진","유나",
  "Alex","Maria","Liam","Yuki","Noah","Emma","Lucas","Olivia","Hiro","Sofia","Omar","Aria","Mateo","Lena","Kai","Nadia"];
const TITLE = ["등산가","낚시꾼","연구원","회사원","학생","군인","상인","캠퍼","관광객","챔피언 지망생","택배기사","수의사",
  "사진작가","요리사","경비원","바리스타","음악가","엔지니어","농부","구조대원","기자","파일럿","해녀","고고학자"];
const TRAIT = ["쾌활한","과묵한","열혈","느긋한","신중한","수다스러운","엉뚱한","진지한","친절한","경쟁심 강한","낙천적인","까칠한"];

const GREET = [
  "안녕! 좋은 날씨네요.","오, 트레이너시군요. 반가워요.","여기서 또 만나네!","흠… 강해 보이는데?",
  "이 동네는 처음이세요?","포켓몬이랑 같이 다니니 든든하죠.","한 수 가르쳐 주실래요?","요즘 대회 시즌이라 다들 바쁘네요.",
];
const CHAT = [
  "이 근처엔 희귀한 녀석이 가끔 나온대요. 잠복해 보세요.","밤이 되면 다른 포켓몬이 나와요.","센터 커피가 은근 맛있어요.",
  "지난주 로컬 대회 봤어요? 엄청났죠.","전설 포켓몬을 봤다는 사람이 있대요… 믿거나 말거나.","트레이너는 발품이 재산이죠.",
  "큰 대회는 접수 기간이 정해져 있으니 달력 잘 보세요.","포켓몬은 도구가 아니라 동료예요.","여행은 결국 사람과 포켓몬을 만나는 일이죠.",
  "강해지고 싶으면 다양한 타입을 길러봐요.","이 기후엔 그 타입이 잘 살아요.","언젠가 세계 무대에서 봤으면 좋겠네요!",
];
const HINT = [
  "여기선 잠복하면 시그니처 포켓몬이 나올 확률이 높아요.","밤에 나오는 고스트 계열을 노려봐요.",
  "물가에서 낚시하면 의외의 대물이 걸려요.","동굴 깊은 곳엔 강한 개체가 있어요.","고지대 등산은 위험하지만 보상도 커요.",
];

// 유명 트레이너 칭호 & 에이스 풀(강력한 최종진화/유사전설)
const FAMOUS_TITLES = ["불꽃의 명인","북방의 빙제","심해의 지배자","번개추적자","대지의 수호자","창공의 매","유령술사","강철의 벽",
  "맹독의 여왕","요정 군주","용의 후예","그림자칼날","태양의 투사","폭풍을 부르는 자","천년의 현자","바위산의 거인",
  "독설가","쌍검사","사막의 매","오로라의 무희","불사조","해일","지진","월광","혜성","검은표범","백은의 기사","홍련","질풍","현무"];
const ACE_POOL = [6,9,3,149,248,257,282,373,376,445,448,462,530,609,612,635,658,663,700,706,784,887,901,248,330,409,612,621];
export const FAMOUS_COUNT = 160;

export interface NPC { id: number; 이름: string; 호칭: string; locId: string; 성격: string; 인사: string; tier: number; famous: boolean; 칭호?: string; 에이스?: number; }

export function makeNPC(id: number): NPC {
  const r = new RNG((id * 2654435761) >>> 0, 7);
  const 이름 = r.pick(SURNAME) + r.pick(GIVEN);
  const loc = WORLD[id % WORLD.length];
  const famous = id < FAMOUS_COUNT;
  return {
    id, 이름,
    호칭: famous ? "명사 트레이너" : r.pick(TITLE),
    locId: loc.id,
    성격: r.pick(TRAIT),
    인사: famous ? "오, 도전자인가? 명성에 누가 되지 않게 해보겠네." : r.pick(GREET),
    tier: famous ? 6 : 1 + (id % 5),
    famous,
    칭호: famous ? FAMOUS_TITLES[id % FAMOUS_TITLES.length] : undefined,
    에이스: famous ? ACE_POOL[id % ACE_POOL.length] : undefined,
  };
}

export function displayName(n: NPC): string { return n.famous && n.칭호 ? `[${n.칭호}] ${n.이름}` : `${n.호칭} ${n.이름}`; }
export function pickFamous(rng: RNG): NPC { return makeNPC(rng.int(0, FAMOUS_COUNT - 1)); }

let _byLoc: Map<string, number[]> | null = null;
export function npcsAtLocation(locId: string): NPC[] {
  if (!_byLoc) {
    _byLoc = new Map();
    for (let i = 0; i < NPC_TOTAL; i++) {
      const loc = WORLD[i % WORLD.length].id;
      if (!_byLoc.has(loc)) _byLoc.set(loc, []);
      _byLoc.get(loc)!.push(i);
    }
  }
  return (_byLoc.get(locId) ?? []).map(makeNPC);
}

// 그날 그곳에 '현재 보이는' NPC (날짜로 회전)
export function npcsPresent(locId: string, 일: number, count = 8): NPC[] {
  const all = npcsAtLocation(locId);
  if (all.length <= count) return all;
  const start = (일 * 3) % all.length;
  const out: NPC[] = [];
  for (let i = 0; i < count; i++) out.push(all[(start + i) % all.length]);
  return out;
}

export function npcChat(r: RNG): string { return r.pick(CHAT); }
export function npcHint(r: RNG): string { return r.pick(HINT); }
