/**
 * "The game is mounted" hook: extra entry scripts of special builds (phase 6)
 * subscribe here instead of being imported by main.ts, so a normal build has
 * no reference to them at all.
 */

import type { Game } from "./game.ts";

let mounted: Game | null = null;
const waiting: Array<(game: Game) => void> = [];

export function gameReady(game: Game): void {
  mounted = game;
  for (const f of waiting.splice(0)) f(game);
}

/** Call `f` with the game once it is mounted (at once when it already is). */
export function onGameReady(f: (game: Game) => void): void {
  if (mounted !== null) f(mounted);
  else waiting.push(f);
}
