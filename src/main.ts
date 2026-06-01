import { Game } from "./game/game";

const game = new Game();
(window as any).__game = game; // 디버그용
game.start();
