/**
 * Entry script of the DEV_TOOLS=true build only: vite.config.ts injects it into
 * index.html for that build. A normal build never sees this file.
 */

import { onGameReady } from "../ready.ts";
import { installDevtools } from "./panel.ts";

onGameReady(installDevtools);
