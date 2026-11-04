// Splits PostgreSQL source into top-level statements, the way the server does: a ';' ends a statement
// only outside dollar-quoted bodies ($tag$ … $tag$), single-quoted strings, double-quoted identifiers
// and comments. Comment-only and blank lines BETWEEN statements are not part of a statement; a
// statement's text runs from its first non-comment character to its ';', verbatim.
//
// Used to prove that a migration that replays another migration's DDL (H5 bootstrap,
// 20261101190000) carries exactly the same statements, byte for byte.
export function splitStatements(sql) {
  const out = [];
  let i = 0;
  let start = -1;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (start < 0) {
      // Between statements: skip whitespace and comments.
      if (/\s/.test(c)) { i++; continue; }
      if (c === "-" && sql[i + 1] === "-") { const e = sql.indexOf("\n", i); i = e < 0 ? n : e + 1; continue; }
      if (c === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); if (e < 0) throw new Error("unterminated block comment"); i = e + 2; continue; }
      start = i;
    }
    if (c === "-" && sql[i + 1] === "-") { const e = sql.indexOf("\n", i); i = e < 0 ? n : e + 1; continue; }
    if (c === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); if (e < 0) throw new Error("unterminated block comment"); i = e + 2; continue; }
    if (c === "'") { i++; while (i < n) { if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } if (sql[i] === "'") break; i++; } if (i >= n) throw new Error("unterminated string"); i++; continue; }
    if (c === '"') { const e = sql.indexOf('"', i + 1); if (e < 0) throw new Error("unterminated identifier"); i = e + 1; continue; }
    if (c === "$") {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (m) { const e = sql.indexOf(m[0], i + m[0].length); if (e < 0) throw new Error(`unterminated ${m[0]}`); i = e + m[0].length; continue; }
    }
    if (c === ";") { out.push(sql.slice(start, i + 1)); start = -1; i++; continue; }
    i++;
  }
  if (start >= 0 && sql.slice(start).trim() !== "") throw new Error("trailing statement without ';'");
  return out;
}
