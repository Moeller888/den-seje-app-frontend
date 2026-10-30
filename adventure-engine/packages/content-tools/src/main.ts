/** `content` command entry point (Node with type stripping): see cli.ts. */

import { runCli } from "./cli.ts";

process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (text) => console.log(text),
  err: (text) => console.error(text),
});
