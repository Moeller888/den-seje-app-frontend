// Preloaded (NODE_OPTIONS=--import) into every process of a mutant run by mutate-guards.mjs.
// LAERLIG_MUTANT (base64 JSON { file, from, to }) names ONE module and ONE textual change. The change
// exists only in memory:
//   - imports of that module get the mutated source (mutant-hooks.mjs);
//   - fs.readFileSync of that file returns the mutated text, so the static contract tests see the
//     same mutant the runtime tests run.
// Without LAERLIG_MUTANT this file does nothing. It never writes a file.
import fs from "node:fs";
import { register, syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const encoded = process.env.LAERLIG_MUTANT;
if (typeof encoded === "string" && encoded !== "") {
  const { file, from, to } = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const target = resolve(file);
  const original = fs.readFileSync(target, "utf8");
  if (original.split(from).length - 1 !== 1) throw new Error(`mutant does not apply exactly once to ${target}`);
  const mutated = original.replace(from, () => to);

  const norm = (p) => {
    let s = p instanceof URL ? fileURLToPath(p) : String(p);
    if (s.startsWith("file:")) s = fileURLToPath(s);
    s = resolve(s);
    return process.platform === "win32" ? s.toLowerCase() : s;
  };
  const wanted = norm(target);
  const realRead = fs.readFileSync;
  fs.readFileSync = function readFileSyncWithMutant(path, options) {
    if ((typeof path === "string" || path instanceof URL) && norm(path) === wanted) {
      const encoding = typeof options === "string" ? options : options?.encoding;
      return encoding ? mutated : Buffer.from(mutated, "utf8");
    }
    return realRead.apply(this, arguments);
  };
  syncBuiltinESMExports(); // named `import { readFileSync } from "node:fs"` sees the wrapper too

  register("./mutant-hooks.mjs", import.meta.url, { data: { url: pathToFileURL(target).href, source: mutated } });
}
