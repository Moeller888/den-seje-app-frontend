/**
 * SVG pictures: an allowlist check (follow-up to the review's "SVG blocklist"
 * finding; docs/release-readiness.md §17).
 *
 * The file is read by a small, strict tokenizer (no dependency). Anything it
 * does not recognise is refused, so an unknown construct can never slip
 * through. Accepted:
 * - one root element `<svg>`, an optional `<?xml version="1.0"?>` declaration
 *   (encoding only UTF-8) at the very start, well-formed comments, whitespace;
 * - the elements in `ELEMENTS` (shapes, paths, text, groups, `use`,
 *   gradients, patterns, clip paths, masks, markers and filter primitives),
 *   unprefixed and spelled exactly (SVG names are case-sensitive);
 * - the attributes in `ATTRIBUTES` (geometry, paint, text and filter
 *   parameters), plus `xlink:href`, `xml:space` and `xml:lang`;
 * - `xmlns` only with the SVG namespace and `xmlns:xlink` only with the XLink
 *   namespace;
 * - a `style` attribute whose declarations are all presentation properties.
 *
 * Refused, among others: `<script>`, `<style>`, `<foreignObject>`, `<image>`,
 * `<a>`, animation elements (they can rewrite `href`), event attributes
 * (`onload`, `onClick`, …), other namespaces and prefixes, DOCTYPE/ENTITY
 * declarations, CDATA sections, processing instructions such as
 * `xml-stylesheet`, other encodings (a decoder escape could change how a
 * browser reads the bytes), control characters, comments an HTML parser would
 * end early (`<!-->`, `--` inside), unknown or unterminated character
 * references, CSS escapes (backslashes), functions other than colours,
 * transforms and `url(#id)` (image-set, cross-fade, … can load files), and
 * every reference that is not a fragment of the picture itself: `href` must be
 * `#id`, and `url(…)` must be `url(#id)`. Character
 * references are decoded and whitespace removed before these checks, so
 * `&#106;avascript:` or `java\tscript:` cannot hide; a reference beyond
 * U+10FFFF becomes U+FFFD, as in a browser, and never throws.
 *
 * Pictures are shown with `<img>`/`<image>` anyway, where scripts never run;
 * the allowlist keeps the stored files clean as well.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const FILTER_PRIMITIVES = [
  "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap",
  "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feMerge", "feMergeNode",
  "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
];

/** Elements a picture may use. Not here on purpose: script, style, foreignObject, image, feImage, a, animate*, set, switch, view, metadata. */
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask", "marker", "filter",
  ...FILTER_PRIMITIVES,
]);

/** Paint and presentation properties: allowed as attributes and inside `style`. */
const PRESENTATION = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "color", "display", "visibility", "clip-path",
  "clip-rule", "mask", "filter", "marker-start", "marker-mid", "marker-end", "stop-color", "stop-opacity", "flood-color",
  "flood-opacity", "lighting-color", "font-family", "font-size", "font-weight", "font-style", "font-variant", "text-anchor",
  "dominant-baseline", "alignment-baseline", "baseline-shift", "letter-spacing", "word-spacing", "text-decoration",
  "writing-mode", "shape-rendering", "text-rendering", "image-rendering", "color-interpolation", "color-interpolation-filters",
  "mix-blend-mode", "isolation", "paint-order", "vector-effect", "overflow", "transform-origin",
];

/** Attributes a picture may use (case-sensitive). Event attributes (on…) are never here. */
export const SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  ...PRESENTATION,
  "id", "class", "style", "lang", "transform", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr",
  "width", "height", "d", "points", "pathLength", "viewBox", "preserveAspectRatio", "version", "baseProfile", "href",
  "offset", "gradientUnits", "gradientTransform", "spreadMethod", "patternUnits", "patternContentUnits", "patternTransform",
  "clipPathUnits", "maskUnits", "maskContentUnits", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient",
  "dx", "dy", "rotate", "textLength", "lengthAdjust", "startOffset", "method", "spacing", "side",
  "filterUnits", "primitiveUnits", "in", "in2", "result", "stdDeviation", "mode", "type", "values", "operator",
  "k1", "k2", "k3", "k4", "radius", "tableValues", "slope", "intercept", "amplitude", "exponent", "baseFrequency",
  "numOctaves", "seed", "stitchTiles", "scale", "xChannelSelector", "yChannelSelector", "order", "kernelMatrix", "divisor",
  "bias", "targetX", "targetY", "edgeMode", "kernelUnitLength", "preserveAlpha", "surfaceScale", "diffuseConstant",
  "specularConstant", "specularExponent", "azimuth", "elevation", "z", "pointsAtX", "pointsAtY", "pointsAtZ",
  "limitingConeAngle",
]);

const PRESENTATION_SET: ReadonlySet<string> = new Set(PRESENTATION);
const PREFIXED_ATTRIBUTES: ReadonlySet<string> = new Set(["xlink:href", "xml:space", "xml:lang"]);
const XML_ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** An id inside the picture: `#name`. */
const FRAGMENT = /^#[A-Za-z_][\w.:-]*$/;
const URL_FRAGMENT = /url\((["']?)#[A-Za-z_][\w.:-]*\1\)/iy;

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

/**
 * Functions a value may use: colours, transforms and `url(#id)`. Anything else (image-set, cross-fade, src,
 * element, var, …) is refused, because some of them load files without `url(`.
 */
const FUNCTIONS: ReadonlySet<string> = new Set(["url", "rgb", "rgba", "hsl", "hsla", "matrix", "translate", "scale", "rotate", "skewx", "skewy"]);

/** Every function in a value must be on `FUNCTIONS`, and every `url(` must be `url(#id)`. */
function functionProblem(compact: string): string | null {
  for (let at = compact.indexOf("("); at >= 0; at = compact.indexOf("(", at + 1)) {
    const name = (/[A-Za-z-]*$/.exec(compact.slice(0, at)) as RegExpExecArray)[0].toLowerCase();
    if (!FUNCTIONS.has(name)) return `the function "${name}(" is not allowed (only colours, transforms and url(#id))`;
    if (name !== "url") continue;
    URL_FRAGMENT.lastIndex = at - 3;
    if (!URL_FRAGMENT.test(compact)) return "only url(#id) references inside the picture are allowed";
  }
  return null;
}

/** A `style` attribute: presentation properties only. */
function styleProblem(decoded: string): string | null {
  if (/[@{}]|\/\*|expression\s*\(/i.test(decoded)) return "style attributes may only set presentation properties";
  for (const decl of decoded.split(";")) {
    if (decl.trim() === "") continue;
    const colon = decl.indexOf(":");
    const prop = (colon < 0 ? decl : decl.slice(0, colon)).trim().toLowerCase();
    if (colon < 0 || !PRESENTATION_SET.has(prop)) return `style property "${prop}" is not allowed`;
  }
  return null;
}

/** One attribute: name on the allowlist, value without external or script references. */
function attributeProblem(name: string, raw: string): string | null {
  const value = decodeRefs(raw);
  if (value === null) return `attribute "${name}" has an unknown or unterminated character reference`;
  if (name === "xmlns") return value === SVG_NS ? null : "only the SVG namespace is allowed";
  if (name === "xmlns:xlink") return value === XLINK_NS ? null : "xmlns:xlink must be the XLink namespace";
  if (name.startsWith("xmlns")) return `namespace declaration "${name}" is not allowed`;
  if (name.includes(":") ? !PREFIXED_ATTRIBUTES.has(name) : !SVG_ATTRIBUTES.has(name)) return `attribute "${name}" is not allowed`;
  const compact = value.replace(/[\s\u0000-\u001f]+/g, "");
  if (value.includes("\\")) return `attribute "${name}" contains a backslash (CSS escape)`;
  // The whole value, only trimmed: "#a b" is not one id, and "java\tscript:" is no fragment either.
  if (name === "href" || name === "xlink:href") return FRAGMENT.test(value.trim()) ? null : "href must point inside the picture (#id)";
  if (/(java|vb)script:|data:|\/\//i.test(compact)) return `attribute "${name}" refers to a script or an external resource`;
  return functionProblem(compact) ?? (name === "style" ? styleProblem(value) : null);
}

/** The only XML declaration: version 1.0, optionally UTF-8 (the text is checked as UTF-8) and standalone. */
const XML_DECLARATION = /^<\?xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])utf-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>$/i;

const START_TAG =/<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+[^\s=/<>"']+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const ATTRIBUTE = /\s+([^\s=/<>"']+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g;
const END_TAG = /<\/([A-Za-z_][\w.:-]*)\s*>/y;

/** Why an SVG text is refused, or null when every part of it is on the allowlist. */
export function svgProblem(text: string): string | null {
  // XML forbids them, and an encoding escape (ISO-2022-JP ESC) could make a browser read the bytes differently.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return "control characters are not allowed";
  const open: string[] = [];
  let rootSeen = false;
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = lt < 0 ? text.slice(i) : text.slice(i, lt);
    if (chunk.trim() !== "") {
      if (open.length === 0) return "text outside the <svg> element";
      if (decodeRefs(chunk) === null) return "unknown or unterminated character reference in text";
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
      if (end < 0 || text.slice(0, lt).trim() !== "" || !XML_DECLARATION.test(text.slice(lt, end + 2))) return "processing instructions and XML declarations other than version 1.0 in UTF-8 are not allowed";
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
      const problem = attributeProblem(attr, a[2] ?? (a[3] as string));
      if (problem !== null) return problem;
    }
    if (m[3] !== "/") open.push(name);
    i = START_TAG.lastIndex;
  }
  if (!rootSeen) return "no <svg> element";
  return open.length === 0 ? null : "unclosed element";
}
