/**
 * SVG pictures: a basic static profile (follow-up to the review's "SVG
 * blocklist" finding; docs/release-readiness.md §17, docs/decisions/phase-6.md §8).
 *
 * The file is read by a small, strict tokenizer (no dependency). Anything it
 * does not recognise is refused, so an unknown construct can never slip
 * through. The profile is frozen to what plain, static pictures need — the
 * project's 25 pictures use only shapes, paths, groups, colours and
 * `translate`/`scale` — so a picture can never refer to anything, not even to
 * a part of itself. Accepted:
 * - one root element `<svg>`, an optional `<?xml version="1.0"?>` declaration
 *   (encoding only UTF-8) at the very start, well-formed comments, whitespace;
 * - the elements in `SVG_ELEMENTS`: `svg`, `g`, `title`, `desc` and the basic
 *   shapes (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`,
 *   `polygon`), unprefixed and spelled exactly (SVG names are case-sensitive);
 * - the attributes in `SVG_ATTRIBUTES`: geometry, `transform`, `id`, and fill,
 *   stroke (without dashes) and opacity properties; `xmlns` only with the SVG
 *   namespace;
 * - a `style` attribute whose declarations are all such presentation
 *   properties (common in exported pictures);
 * - functions only for colours (`rgb`, `rgba`, `hsl`, `hsla`) and transforms
 *   (`matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`).
 *
 * Refused, among others: every reference — `href`, `xlink:href` and any
 * `url(…)`, also `url(#id)` —, dashed strokes (`stroke-dasharray`,
 * `stroke-dashoffset`), `<use>`, `<symbol>`, gradients, patterns,
 * markers, masks, clip paths, filters and their primitives, text, `<script>`,
 * `<style>`, `<foreignObject>`, `<image>`, `<a>`, animation elements, event
 * attributes (`onload`, `onClick`, …), other namespaces and prefixes,
 * DOCTYPE/ENTITY declarations, CDATA sections, processing instructions such as
 * `xml-stylesheet`, other encodings (a decoder escape could change how a
 * browser reads the bytes), control characters, comments an HTML parser would
 * end early (`<!-->`, `--` inside), unknown or unterminated character
 * references, CSS escapes (backslashes), and the CSS-wide and context keywords
 * `inherit`, `unset`, `revert`, `revert-layer`, `context-fill` and
 * `context-stroke` in presentation values. Character references are decoded
 * before these checks, so `u&#x72;l(` or `&#106;avascript:` cannot hide; a
 * reference beyond U+10FFFF becomes U+FFFD, as in a browser, and never throws.
 *
 * Whitespace: only the whitespace the parsers themselves skip counts — XML
 * `[ \t\r\n]` in the markup, CSS `[ \t\n\r\f]` inside `style` and values.
 * A function name is read up to its `(` across that whitespace, so `url (`
 * is refused like `url(`.
 *
 * Complexity: one forward pass over the text; each attribute value is decoded
 * once and scanned a constant number of times (function names, keywords,
 * whitespace trimming and `style` declarations by index, no prefix scanned
 * again): O(input size).
 *
 * Limits on purpose: the profile keeps out the constructs that were shown to
 * multiply drawing work (references, reusable subgraphs, dashes). It does not
 * bound sizes, numbers or the amount of geometry, so a large or detailed
 * picture still costs what its geometry costs to draw.
 *
 * Pictures are shown with `<img>`/`<image>` anyway, where scripts never run;
 * the profile keeps the stored files plain as well.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Elements a picture may use: structure and the basic shapes. Nothing that refers to, copies or paints another part. */
export const SVG_ELEMENTS: ReadonlySet<string> = new Set(["svg", "g", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

/**
 * Paint and presentation properties: allowed as attributes and inside `style`. None of them can refer to anything here.
 * Not here on purpose: `stroke-dasharray` and `stroke-dashoffset` (follow-up review 5: a dash of 0.001 on a few
 * lines took seconds to draw in Chromium) — no picture of the project uses dashes.
 */
const PRESENTATION = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "opacity", "color", "display", "visibility", "shape-rendering", "vector-effect", "paint-order",
];

/** Attributes a picture may use (case-sensitive). Event attributes (on…) and references (href) are never here. */
export const SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  ...PRESENTATION,
  "id", "style", "transform", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "d", "points",
  "pathLength", "viewBox", "preserveAspectRatio", "version",
]);

const PRESENTATION_SET: ReadonlySet<string> = new Set(PRESENTATION);
const XML_ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Control characters (also from a character reference): XML forbids most, and a browser could skip them. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const isXmlSpace = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 13;
const isCssSpace = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 12;

/** Whether `s` is only XML whitespace: one scan by index. */
function onlyXmlSpace(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (!isXmlSpace(s.charCodeAt(i))) return false;
  return true;
}

/** CSS whitespace trimmed from both ends by index (each character looked at once, one copy). */
function cssTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isCssSpace(s.charCodeAt(start))) start++;
  while (end > start && isCssSpace(s.charCodeAt(end - 1))) end--;
  return start === 0 && end === s.length ? s : s.slice(start, end);
}

const char = (cp: number): string => (Number.isInteger(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : "�");

/** Decode character and entity references; null when one is unknown or unterminated (an XML error). */
function decodeRefs(s: string): string | null {
  let bad = false;
  const out = s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)?(;)?/g, (_m, ref: string | undefined, semi: string | undefined) => {
    if (ref === undefined || semi === undefined) {
      bad = true;
      return "";
    }
    if (ref.startsWith("#x") || ref.startsWith("#X")) return char(Number.parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return char(Number(ref.slice(1)));
    const named = XML_ENTITIES[ref];
    if (named === undefined) bad = true;
    return named ?? "";
  });
  return bad ? null : out;
}

/** Functions a value may use: colours and transforms. `url` is not among them, nor anything that can load a file (image-set, src, …). */
const FUNCTIONS: ReadonlySet<string> = new Set(["rgb", "rgba", "hsl", "hsla", "matrix", "translate", "scale", "rotate", "skewx", "skewy"]);

/** Keywords refused in presentation values: CSS-wide keywords and context paint (they take paint from elsewhere). */
const KEYWORDS: ReadonlySet<string> = new Set(["inherit", "unset", "revert", "revert-layer", "context-fill", "context-stroke"]);

/** No allowed function name or refused keyword is longer; a longer run of letters is neither and is not copied. */
const MAX_NAME = 14;
const isNameChar = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45;

/**
 * One forward scan (linear in the value): every `(` must follow a name on `FUNCTIONS` (only CSS whitespace
 * between, as in `rotate (45)`); in a presentation value no run of name characters may be one of `KEYWORDS`.
 */
function valueProblem(value: string, presentation: boolean): string | null {
  let runStart = -1; // start of the current run of name characters
  let nameStart = -1; // the last complete run …
  let nameEnd = -1; // … and where it ended; -1 once anything but whitespace followed it
  for (let i = 0; i <= value.length; i++) {
    const c = i < value.length ? value.charCodeAt(i) : -1;
    if (isNameChar(c)) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0) {
      nameStart = runStart;
      nameEnd = i;
      runStart = -1;
      if (presentation && i - nameStart <= MAX_NAME) {
        const word = value.slice(nameStart, i).toLowerCase();
        if (KEYWORDS.has(word)) return `the keyword "${word}" is not allowed (a value must not take paint or properties from elsewhere)`;
      }
    }
    if (c < 0 || isCssSpace(c)) continue;
    if (c === 40) {
      const length = nameEnd < 0 ? 0 : nameEnd - nameStart;
      const name = nameEnd < 0 || length > MAX_NAME ? "" : value.slice(nameStart, nameEnd).toLowerCase();
      if (name === "url") return "url(…) is not allowed: a picture may not refer to anything";
      if (!FUNCTIONS.has(name)) return `the function "${length > MAX_NAME ? value.slice(nameStart, nameStart + MAX_NAME) + "…" : name}(" is not allowed (only colours and transforms)`;
    }
    nameEnd = -1;
  }
  return null;
}

/** A `style` attribute: presentation properties only, each value checked like the attribute of that name. */
function styleProblem(decoded: string): string | null {
  if (/[@{}]|\/\*/.test(decoded)) return "style attributes may only set presentation properties";
  for (const decl of decoded.split(";")) {
    const colon = decl.indexOf(":");
    const prop = cssTrim(colon < 0 ? decl : decl.slice(0, colon)).toLowerCase();
    if (colon < 0 && prop === "") continue;
    if (colon < 0 || !PRESENTATION_SET.has(prop)) return `style property "${prop}" is not allowed`;
    const problem = valueProblem(decl.slice(colon + 1), true);
    if (problem !== null) return problem;
  }
  return null;
}

/** One attribute (decoded value): name on the allowlist, value without references, scripts or foreign functions. */
function attributeProblem(name: string, value: string): string | null {
  if (name === "xmlns") return value === SVG_NS ? null : "only the SVG namespace is allowed";
  if (name === "href" || name === "xlink:href") return `"${name}" is not allowed: a picture may not refer to anything`;
  if (name.startsWith("xmlns")) return `namespace declaration "${name}" is not allowed`;
  if (name.includes(":") || !SVG_ATTRIBUTES.has(name)) return `attribute "${name}" is not allowed`;
  if (CONTROL.test(value)) return `attribute "${name}" contains a control character`;
  if (value.includes("\\")) return `attribute "${name}" contains a backslash (CSS escape)`;
  // A backstop only (the value check below decides): removing every kind of space finds more, never less.
  const compact = value.replace(/[\s\u0000-\u001f]+/g, "");
  if (/(java|vb)script:|data:|\/\//i.test(compact)) return `attribute "${name}" refers to a script or a resource`;
  if (name === "style") return styleProblem(value);
  return valueProblem(value, PRESENTATION_SET.has(name));
}

/** The only XML declaration: version 1.0, optionally UTF-8 (the text is checked as UTF-8) and standalone. */
const XML_DECLARATION = /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(["'])1\.0\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(["'])utf-8\2)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(["'])(?:yes|no)\3)?[ \t\r\n]*\?>$/i;

// XML whitespace only: a U+00A0 between attributes is no separator for an XML parser, so it is none here either.
const START_TAG = /<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:[ \t\r\n]+[^ \t\r\n=/<>"']+[ \t\r\n]*=[ \t\r\n]*(?:"[^"<]*"|'[^'<]*'))*)[ \t\r\n]*(\/?)>/y;
const ATTRIBUTE = /[ \t\r\n]+([^ \t\r\n=/<>"']+)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<]*)"|'([^'<]*)')/g;
const END_TAG = /<\/([A-Za-z_][\w.:-]*)[ \t\r\n]*>/y;

/** Why an SVG text is refused, or null when every part of it is in the basic static profile. */
export function svgProblem(file: string): string | null {
  // One byte order mark at the very start is allowed (XML skips it); anywhere else it is no whitespace.
  const text = file.startsWith("﻿") ? file.slice(1) : file;
  // XML forbids them, and an encoding escape (ISO-2022-JP ESC) could make a browser read the bytes differently.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return "control characters are not allowed";
  const open: string[] = [];
  let rootSeen = false;
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = lt < 0 ? text.slice(i) : text.slice(i, lt);
    if (!onlyXmlSpace(chunk)) {
      if (open.length === 0) return "text outside the <svg> element";
      const decoded = decodeRefs(chunk);
      if (decoded === null) return "unknown or unterminated character reference in text";
      if (CONTROL.test(decoded)) return "control character in text";
    }
    if (lt < 0) break;
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end < 0) return "unterminated comment";
      // XML forbids "--" inside a comment; "<!-->" and "<!--->" would end the comment early in an HTML parser.
      const body = text.slice(lt + 4, end);
      if (body.includes("--") || body.startsWith(">") || body.startsWith("->") || body.endsWith("-")) return "malformed comment";
      i = end + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt);
      // Only the XML declaration, and only at the very start (xml-stylesheet and others are refused).
      if (end < 0 || !onlyXmlSpace(text.slice(0, lt)) || !XML_DECLARATION.test(text.slice(lt, end + 2))) return "processing instructions and XML declarations other than version 1.0 in UTF-8 are not allowed";
      i = end + 2;
      continue;
    }
    // DOCTYPE/ENTITY allow entity expansion ("billion laughs"); CDATA could hide markup. Pictures need neither.
    if (text.startsWith("<!", lt)) return "DOCTYPE, ENTITY and CDATA sections are not allowed";
    if (text.startsWith("</", lt)) {
      END_TAG.lastIndex = lt;
      const m = END_TAG.exec(text);
      if (m === null || open.pop() !== m[1]) return "malformed or mismatched end tag";
      i = END_TAG.lastIndex;
      continue;
    }
    START_TAG.lastIndex = lt;
    const m = START_TAG.exec(text);
    if (m === null) return "malformed start tag";
    const name = m[1] as string;
    if (open.length === 0) {
      if (rootSeen) return "more than one root element";
      if (name !== "svg") return "the root element must be <svg>";
      rootSeen = true;
    }
    if (name.includes(":")) return `element "${name}" with a namespace prefix is not allowed`;
    if (!SVG_ELEMENTS.has(name)) return `element <${name}> is not allowed`;
    const seen = new Set<string>();
    for (const a of (m[2] as string).matchAll(ATTRIBUTE)) {
      const attr = a[1] as string;
      if (seen.has(attr)) return `attribute "${attr}" appears twice`;
      seen.add(attr);
      const value = decodeRefs(a[2] ?? (a[3] as string));
      if (value === null) return `attribute "${attr}" has an unknown or unterminated character reference`;
      const problem = attributeProblem(attr, value);
      if (problem !== null) return problem;
    }
    if (m[3] !== "/") open.push(name);
    i = START_TAG.lastIndex;
  }
  if (!rootSeen) return "no <svg> element";
  return open.length === 0 ? null : "unclosed element";
}
