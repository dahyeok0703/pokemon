// PokéAPI 스프라이트(공개 CDN). 브라우저에서 URL로 직접 로드 — 번들에 포함하지 않는다.
const ROOT = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

// 고화질 공식 아트워크 (배틀/도감 상세/조우)
export function artwork(id: number): string {
  return `${ROOT}/other/official-artwork/${id}.png`;
}
// 작은 기본 스프라이트 (목록/그리드/파티)
export function sprite(id: number): string {
  return `${ROOT}/${id}.png`;
}
// 픽셀아트가 없는 신세대용 대체: 아트워크
export function icon(id: number): string {
  return sprite(id);
}
// 색이 다른 포켓몬(이로치)
export function shinyArtwork(id: number): string { return `${ROOT}/other/official-artwork/shiny/${id}.png`; }
export function shinySprite(id: number): string { return `${ROOT}/shiny/${id}.png`; }
