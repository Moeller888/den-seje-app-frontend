/**
 * The two origins (D-307). They are fixed at build time — never read from the URL, the other window or a
 * message — because the sender check depends on them. The defaults are the local prototype servers:
 * the host page on port 4320 and the game on port 4321, i.e. two different origins, as in production.
 */
export const HOST_ORIGIN = import.meta.env.VITE_LV_HOST_ORIGIN ?? "http://127.0.0.1:4320";
export const GAME_ORIGIN = import.meta.env.VITE_LV_GAME_ORIGIN ?? "http://127.0.0.1:4321";

/** Crypto-random ids for nonces, tokens, request and submission ids. */
export function randomId(): string {
  return crypto.randomUUID();
}
