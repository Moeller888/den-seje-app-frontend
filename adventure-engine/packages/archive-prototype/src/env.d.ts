/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin the host page accepts the game from, e.g. https://verden.lærlig.dk (punycode). */
  readonly VITE_LV_GAME_ORIGIN?: string;
  /** Origin the game accepts the host from. */
  readonly VITE_LV_HOST_ORIGIN?: string;
}
