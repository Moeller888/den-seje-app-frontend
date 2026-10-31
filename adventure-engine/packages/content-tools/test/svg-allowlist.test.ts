import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectAsset, encodeText } from "../src/index.ts";
import { SVG_ATTRIBUTES, SVG_ELEMENTS, svgProblem } from "../src/svg.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XL = ' xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (body: string, attrs = ""): string => `<svg ${NS}${attrs} width="64" height="64" viewBox="0 0 64 64">${body}</svg>`;
const detect = (text: string) => detectAsset("x.svg", encodeText(text));

describe("follow-up: SVG basic static profile", () => {
  it("keeps plain static pictures: shapes, paths, groups, colours, opacity and transforms", () => {
    const pictures = [
      svg('<rect width="64" height="64" fill="#3a6"/><circle cx="32" cy="32" r="8" stroke="rgb(0,0,0)" stroke-width="2" fill="none"/>'),
      svg('<path d="M0 0 L10 10 C 20 20, 40 20, 50 10 Z" fill-rule="evenodd" opacity="0.5"/><polygon points="1,2 3,4 5,6"/><polyline points="0,0 1,1"/><line x1="0" y1="0" x2="1" y2="1"/><ellipse cx="1" cy="1" rx="2" ry="3"/>'),
      svg('<g transform="translate(2 2) rotate(5)" opacity="0.8"><rect id="a" width="9" height="9" rx="2" fill="currentColor" stroke="hsla(1,2%,3%,0.5)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="4"/></g>'),
      svg('<rect style="fill: #f00; stroke:#000 ; stroke-width: 2;" width="1" height="1"/>'),
      svg('<title>Ur</title><desc>Et ur på væggen &amp; en krage &#x2013; &lt;3</desc><g><g><circle r="1"/></g></g>'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- made by hand -->\n${svg("<g/>")}\n`,
      `﻿${svg("<g/>")}`,
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ];
    for (const p of pictures) {
      expect(svgProblem(p), p).toBeNull();
      expect(detect(p), p).toMatchObject({ type: "image/svg+xml" });
    }
  });

  it("refuses scripts, foreignObject, styles, images, links and animations", () => {
    const cases = [
      svg("<script>alert(1)</script>"),
      svg("<foreignObject><div/></foreignObject>"),
      svg("<style>rect{fill:red}</style>"),
      svg('<image href="#x"/>'),
      svg('<a href="#x"><rect/></a>'),
      svg('<animate attributeName="href" to="javascript:alert(1)"/>'),
      svg('<set attributeName="fill" to="red"/>'),
      svg("<iframe/>"),
      svg('<filter id="f"><feImage href="#x"/></filter>'),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
  });

  it("refuses every element that refers to, copies or paints another part, and text", () => {
    const elements = [
      "use", "symbol", "defs", "linearGradient", "radialGradient", "stop", "pattern", "marker", "mask", "clipPath", "filter",
      "feGaussianBlur", "feMorphology", "feTurbulence", "feOffset", "feFlood", "feMerge", "feMergeNode", "feTile", "feConvolveMatrix",
      "text", "tspan", "textPath",
    ];
    for (const e of elements) {
      expect(SVG_ELEMENTS.has(e), e).toBe(false);
      expect(svgProblem(svg(`<${e}/>`)), e).toBe(`element <${e}> is not allowed`);
    }
  });

  it("refuses event attributes in any spelling", () => {
    for (const a of ['onload="x()"', 'onLoad="x()"', 'ONCLICK="x()"', 'onmouseover = "x()"', "onbegin='x()'"]) {
      expect(detect(svg(`<rect ${a} width="1" height="1"/>`)), a).toHaveProperty("forbidden");
    }
  });

  it("refuses namespace prefixes and foreign namespaces (also XLink, now that nothing may refer)", () => {
    const cases = [
      svg('<x:script xmlns:x="http://www.w3.org/2000/svg">1</x:script>'),
      svg("<svg:foreignObject></svg:foreignObject>"),
      svg("<svg:rect/>"),
      svg('<h:div xmlns:h="http://www.w3.org/1999/xhtml"/>'),
      svg("<g/>", ' xmlns:x="http://www.w3.org/1999/xhtml"'),
      svg("<g/>", XL),
      '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>',
      svg('<rect x:onload="x()" width="1"/>'),
      svg('<rect xml:base="http://example.com/" width="1"/>'),
      svg('<rect xml:space="preserve" width="1"/>'),
      svg('<rect inkscape:label="x" width="1"/>'),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
  });

  it("refuses mixed and upper case names (SVG names are case-sensitive)", () => {
    for (const c of [svg("<SCRIPT>1</SCRIPT>"), svg("<Script>1</Script>"), svg("<ForeignObject/>"), svg('<rect Fill="red"/>'), '<SVG xmlns="http://www.w3.org/2000/svg"></SVG>']) {
      expect(detect(c), c).toHaveProperty("forbidden");
    }
  });

  it("refuses href and xlink:href on any element, whatever the value", () => {
    for (const value of ["#a", " #a ", "&#35;a", "&#x23;a", "&#106;avascript:alert(1)", "java\tscript:alert(1)", "other.svg#s", "data:image/svg+xml;base64,PHN2Zz4=", ""]) {
      expect(svgProblem(svg(`<rect id="a"/><g href="${value}"/>`)), value).toBe('"href" is not allowed: a picture may not refer to anything');
      expect(svgProblem(svg(`<rect id="a"/><path xlink:href="${value}"/>`, XL)), value).not.toBeNull();
      expect(svgProblem(svg(`<rect id="a"/><path xlink:href="${value}"/>`)), value).toBe('"xlink:href" is not allowed: a picture may not refer to anything');
    }
    // With whitespace around the name or the "=", in single quotes, and on the root.
    for (const c of [svg("<g\thref\n=\r'#a'/>"), svg('<rect   href  =  "#a"/>'), `<svg ${NS} href="#a"></svg>`]) {
      expect(svgProblem(c), JSON.stringify(c)).toContain("is not allowed: a picture may not refer to anything");
    }
  });

  it("refuses url(…) in every form: attributes, style, entities, case and whitespace variants", () => {
    const url = "url(…) is not allowed";
    const values = [
      "url(#a)", "URL(#a)", "Url( #a )", "url('#a')", "url(&quot;#a&quot;)", "url(http://example.com/x.svg#a)", "url(x.svg#g)",
      "url (#a)", "url\t(#a)", "url&#9;(#a)", "url&#10;(#a)", "u&#x72;l(#a)", "&#117;rl(#a)", "&#x75;&#x72;&#x6c;&#x28;#a)",
      "red url(#a)", "rgb(0,0,0) url(#a)",
    ];
    for (const v of values) {
      for (const attr of ["fill", "stroke", "opacity", "transform", "d", "id"]) {
        expect(svgProblem(svg(`<rect ${attr}="${v}"/>`)), `${attr}=${v}`).not.toBeNull();
      }
      expect(svgProblem(svg(`<rect style="fill:${v}"/>`)), v).not.toBeNull();
      expect(svgProblem(svg(`<rect style="stroke-width: 1; stroke : ${v} ;"/>`)), v).not.toBeNull();
    }
    expect(svgProblem(svg('<rect fill="url(#a)"/>'))).toContain(url);
    expect(svgProblem(svg('<rect style="fill:url(#a)"/>'))).toContain(url);
    // Properties that took a url(#id) before are gone altogether, also in style.
    for (const p of ["mask", "clip-path", "filter", "marker-start", "marker-mid", "marker-end", "stop-color", "flood-color"]) {
      expect(svgProblem(svg(`<rect ${p}="none"/>`)), p).toBe(`attribute "${p}" is not allowed`);
      expect(svgProblem(svg(`<rect style="${p}: none"/>`)), p).toBe(`style property "${p}" is not allowed`);
    }
  });

  it("refuses CSS-wide and context keywords in presentation values (inherit carried the mask bombs)", () => {
    for (const k of ["inherit", "INHERIT", "unset", "revert", "revert-layer", "context-fill", "context-stroke", "Context-Stroke"]) {
      for (const p of ["fill", "stroke", "opacity", "stroke-width", "color", "display"]) {
        expect(svgProblem(svg(`<rect ${p}="${k}"/>`)), `${p}=${k}`).toContain(`the keyword "${k.toLowerCase()}" is not allowed`);
        expect(svgProblem(svg(`<g style="${p}:${k}"><rect/></g>`)), `${p}:${k}`).toContain("is not allowed");
      }
      expect(svgProblem(svg(`<rect fill="&#x20;${k}&#x20;"/>`)), k).toContain("is not allowed");
    }
    // Only whole words: an id or a value that merely contains the letters is fine.
    expect(svgProblem(svg('<rect id="inherited" fill="none" stroke="currentColor"/>'))).toBeNull();
  });

  it("review 5: dashed strokes are refused before rendering (a 0.001 dash took seconds to draw in Chromium)", () => {
    // The reproduced file: 100 diagonal lines under a group with stroke-dasharray="0.001" (2.7 KB, 14 s in Chromium).
    const dashed = `<svg ${NS} width="1000" height="1000" viewBox="0 0 1000 1000"><g stroke="black" stroke-dasharray="0.001">${'<path d="M0 0L1000 1000"/>'.repeat(100)}</g></svg>`;
    expect(svgProblem(dashed)).toBe('attribute "stroke-dasharray" is not allowed');
    expect(detect(dashed)).toHaveProperty("forbidden");
    for (const p of ["stroke-dasharray", "stroke-dashoffset"]) {
      expect(SVG_ATTRIBUTES.has(p), p).toBe(false);
      // As an attribute, on any element and with any value.
      for (const v of ["0.001", "2 1", "none", "0"]) {
        expect(svgProblem(svg(`<path d="M0 0L9 9" ${p}="${v}"/>`)), `${p}=${v}`).toBe(`attribute "${p}" is not allowed`);
        expect(svgProblem(svg(`<g ${p}="${v}"><rect/></g>`)), `${p}=${v}`).toBe(`attribute "${p}" is not allowed`);
      }
      // In style, in any case and with whitespace (XML and CSS) or character references around or inside the name.
      const upper = p.toUpperCase();
      const mixed = p.replace("dash", "Dash");
      const entity = p.replace("d", "&#100;").replace("a", "&#x61;");
      for (const decl of [`${p}:0.001`, `${upper}: 0.001`, `${mixed} :1`, ` \t${p}\n:\r0.001 `, `&#9;${p}&#10;:&#32;0.001`, `${entity}: 0.001`, `fill: red; ${p}: 1 2;`]) {
        expect(svgProblem(svg(`<path d="M0 0L9 9" style="${decl}"/>`)), decl).toContain(`style property "${p}" is not allowed`);
      }
      // Attribute names are case-sensitive and exact: other spellings are no allowed attribute either.
      for (const name of [upper, mixed, `${p}x`]) expect(svgProblem(svg(`<path ${name}="1"/>`)), name).toBe(`attribute "${name}" is not allowed`);
    }
    // Solid strokes are kept.
    expect(svgProblem(svg('<path d="M0 0L9 9" stroke="#000" stroke-width="2" stroke-linecap="round"/>'))).toBeNull();
  });

  it("refuses every earlier bomb early, at the first element or attribute outside the profile", () => {
    // <use> bomb (10 × 10).
    let defs = '<g id="l0"><rect width="1" height="1"/></g>';
    for (let n = 1; n <= 10; n++) defs += `<g id="l${n}">${`<use href="#l${n - 1}"/>`.repeat(10)}</g>`;
    expect(svgProblem(svg(`<defs>${defs}</defs><use href="#l10"/>`))).toBe("element <defs> is not allowed");
    expect(svgProblem(svg(`${defs}<use href="#l10"/>`))).toBe("element <use> is not allowed");
    expect(svgProblem(svg('<g href="#l9"/>'))).toBe('"href" is not allowed: a picture may not refer to anything');
    // The Firefox pattern bomb: patterns whose groups inherit fill="url(#next pattern)".
    let patterns = "";
    for (let k = 1; k <= 7; k++) patterns += `<pattern id="p${k}" width="10" height="10"><g fill="url(#p${k + 1})">${'<rect width="9" height="10"/>'.repeat(10)}</g></pattern>`;
    expect(svgProblem(svg(`${patterns}<rect fill="url(#p1)"/>`))).toBe("element <pattern> is not allowed");
    expect(svgProblem(svg('<g fill="url(#p1)"><rect/></g>'))).toContain("url(…) is not allowed");
    // Marker → mask → marker.
    const vertices = "M0 0 L1 0 L2 3 L3 0 L4 3";
    expect(svgProblem(svg(`<marker id="k1"><rect mask="url(#m2)"/></marker><path d="${vertices}" marker-mid="url(#k1)"/>`))).toBe("element <marker> is not allowed");
    expect(svgProblem(svg(`<path d="${vertices}" marker-mid="url(#k1)"/>`))).toBe('attribute "marker-mid" is not allowed');
    // The mask and clip-path bombs, nested and flat.
    for (const [kind, attr] of [["mask", "mask"], ["clipPath", "clip-path"]] as const) {
      expect(svgProblem(svg(`<${kind} id="m0"><rect/></${kind}><rect ${attr}="url(#m0)"/>`))).toBe(`element <${kind}> is not allowed`);
      expect(svgProblem(svg(`${'<rect width="9" height="9"/>'.repeat(5)}<rect ${attr}="url(#m0)"/>`))).toBe(`attribute "${attr}" is not allowed`);
    }
    // The round-4 inherit bomb: masks whose content inherits the mask through style="mask:inherit".
    expect(svgProblem(svg('<g mask="url(#m0)"><rect style="mask:inherit"/></g>'))).toBe('attribute "mask" is not allowed');
    expect(svgProblem(svg('<g><rect style="mask:inherit"/></g>'))).toBe('style property "mask" is not allowed');
    expect(svgProblem(svg('<g><rect style="fill:inherit"/></g>'))).toContain('the keyword "inherit" is not allowed');
    // Filters.
    expect(svgProblem(svg('<filter id="f"><feMorphology radius="3000"/></filter><rect filter="url(#f)"/>'))).toBe("element <filter> is not allowed");
    expect(svgProblem(svg('<rect style="filter: blur(9px)"/>'))).toBe('style property "filter" is not allowed');
  });

  it("review: shapes of the earlier reviewers' probe files are all refused", () => {
    const probes = [
      svg('<mask id="m0"><rect fill="white"/></mask><g mask="url(#m0)"><mask id="m1" style="mask:inherit"><rect style="mask:inherit"/></mask></g>'),
      svg('<pattern id="p"><rect fill="blue"/></pattern><marker id="k"><rect fill="context-fill"/></marker><path fill="url(#p)" marker-mid="url(#k)" d="M0 0L1 1"/>'),
      svg('<path fill="context-stroke" d="M0 0"/>'),
      svg('<rect fill="url(#p)"/>'),
    ];
    for (const p of probes) expect(svgProblem(p), p).not.toBeNull();
  });

  it("decodes character references before checking, and refuses unknown or unterminated ones", () => {
    const cases = [
      svg('<rect fill="u&#x72;l(http://example.com/x.svg#a)"/>'),
      svg('<rect fill="&#117;rl(data:image/png;base64,AA)"/>'),
      svg('<rect fill="url(&#x27;http://x/y&#x27;)"/>'),
      svg('<rect fill="&#106;avascript:alert(1)"/>'),
      svg('<rect fill="&nbsp;red"/>'),
      svg('<rect fill="a &amp b"/>'),
      svg("<desc>&lol;</desc>"),
      svg("<desc>&</desc>"),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
    // Real references are decoded, not refused.
    expect(svgProblem(svg('<rect id="&#x61;b" width="1" height="1"/>'))).toBeNull();
  });

  it("refuses CSS imports, blocks, comments and escapes in style", () => {
    const cases = [
      svg('<rect style="background-image:linear-gradient(red, blue)"/>'),
      svg('<rect style="behavior:url(#x)"/>'),
      svg('<rect style="fill:red; @import \'x.css\'"/>'),
      svg('<rect style="fill:red;}rect{fill:blue"/>'),
      svg('<rect style="fill:expression(alert(1))"/>'),
      svg('<rect style="fill:\\75 rl(http://x)"/>'),
      svg('<rect style="fill /* hidden */: red"/>'),
      svg('<rect style="red"/>'),
      svg('<rect id="x" fill="data:text/html,x"/>'),
      svg('<rect id="https://example.com/"/>'),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
  });

  it("refuses DOCTYPE, ENTITY, CDATA, processing instructions and malformed documents", () => {
    const cases = [
      `<!DOCTYPE svg>${svg("<g/>")}`,
      `<!DOCTYPE svg [<!ENTITY a "aaaa">]>${svg("<desc>&a;</desc>")}`,
      svg("<desc><![CDATA[<script>1</script>]]></desc>"),
      `<?xml-stylesheet href="x.css"?>${svg("<g/>")}`,
      `${svg("<g/>")}<?xml version="1.0"?>`,
      `<!-- c --><?xml version="1.0"?>${svg("<g/>")}`,
      svg("<?php echo 1 ?>"),
      svg("<!-- never closed"),
      svg("<g>"),
      svg("<g></rect>"),
      svg("</g>"),
      svg("<g x=1/>"),
      svg('<rect width="1" width="2"/>'),
      svg("<rect <script>/>"),
      `${svg("<g/>")}${svg("<g/>")}`,
      `${svg("<g/>")}tail`,
      `head${svg("<g/>")}`,
      '<g xmlns="http://www.w3.org/2000/svg"><svg></svg></g>',
      "<svg ",
    ];
    for (const c of cases) expect(svgProblem(c), c).not.toBeNull();
    expect(svgProblem(`<svg ${NS}><g/>`)).toBe("unclosed element");
    expect(svgProblem("")).toBe("no <svg> element");
    expect(svgProblem("<!-- only a comment -->")).toBe("no <svg> element");
  });

  it("review: only a UTF-8 XML declaration, and no control characters (an ISO-2022-JP escape could hide an onload)", () => {
    const esc = "\u001b";
    const hidden = `<?xml version="1.0" encoding="ISO-2022-JP"?><svg ${NS}><g id="${esc}$B">${esc}(B" onload="window.HIT=1"><rect width="1" height="1"/></g></svg>`;
    expect(detect(hidden)).toHaveProperty("forbidden");
    for (const c of [
      `<?xml version="1.0" encoding="UTF-16"?>${svg("<g/>")}`,
      `<?xml version="1.1"?>${svg("<g/>")}`,
      `<?xml version="1.0" foo="bar"?>${svg("<g/>")}`,
      svg(`<desc>a${esc}b</desc>`),
      svg(`<rect id="a${esc}b"/>`),
      svg("<desc>a\u0000b</desc>"),
      svg('<rect id="a&#1;b"/>'),
      svg('<rect fill="&#x7f;red"/>'),
      svg("<desc>a&#1;b</desc>"),
    ]) {
      expect(svgProblem(c), JSON.stringify(c)).not.toBeNull();
    }
    for (const ok of [`<?xml version="1.0" encoding="utf-8" standalone="no"?>${svg("<g/>")}`, `<?xml version='1.0' encoding='UTF-8'?>\r\n${svg("<desc>a\tb</desc>")}`]) {
      expect(svgProblem(ok), ok).toBeNull();
    }
  });

  it("review: CSS functions other than colours and transforms are refused (image-set could load a relative file)", () => {
    for (const c of [
      svg("<rect style=\"fill: image-set('evil2.png' 1x)\"/>"),
      svg("<rect fill=\"image-set('evil.png' 1x)\"/>"),
      svg('<rect fill="cross-fade(red, blue)"/>'),
      svg("<rect style=\"fill: src('x.png')\"/>"),
      svg('<rect style="fill: element(#x)"/>'),
      svg('<rect fill="var(--x)"/>'),
      svg('<rect fill="(1)"/>'),
    ]) {
      expect(detect(c), c).toHaveProperty("forbidden");
    }
    expect(svgProblem(svg('<rect fill="rgb(1, 2, 3)" stroke="HSLA(1,2%,3%,0.5)" transform="matrix(1 0 0 1 0 0) translate(1,2) scale(2) rotate(5 1 1) skewX(3) skewY(4)" style="fill: rgba(0,0,0,.5)"/>'))).toBeNull();
  });

  it("review: comments that an HTML parser would end early are refused", () => {
    for (const c of [svg("<!--><img src=x onerror=alert(1)>-->"), svg("<!---><g/>-->"), svg("<!-- a -- b -->"), svg("<!-- a --!> -->")]) {
      expect(svgProblem(c), c).not.toBeNull();
    }
    expect(svgProblem(svg("<!-- a - b -->"))).toBeNull();
  });

  it("review 2: Unicode spaces are no whitespace; XML and CSS spaces are kept where the parsers skip them", () => {
    // A Unicode space is no separator between attributes, nor between a declaration's parts.
    for (const c of [svg('<rect onload="x"/>'), svg('<rect style="fill : red"/>'), ` ${svg("<g/>")}`, `${svg("<g/>")}　`]) {
      expect(svgProblem(c), JSON.stringify(c)).not.toBeNull();
    }
    const kept = [
      svg('<g transform="rotate (5) translate&#9;(1 2)"/>'),
      svg('<rect style="&#9;fill&#10;:&#13; red ; stroke: #000&#9;"/>'),
      `\n${svg('<rect\n\twidth="1"\r\n height = "1" />')}\n`,
    ];
    for (const c of kept) expect(svgProblem(c), JSON.stringify(c)).toBeNull();
  });

  it("review 4: all 25 pictures of the project pass", () => {
    const dirs = ["../../app/public/assets", "../fixtures/editor-demo/assets"].map((d) => fileURLToPath(new URL(`${d}/`, import.meta.url)));
    const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".svg")).map((f) => join(d, f)));
    expect(files).toHaveLength(25);
    for (const f of files) expect(detectAsset(f, readFileSync(f)), f).toMatchObject({ type: "image/svg+xml" });
  });

  it("review 4: whitespace is trimmed by index — huge runs of CSS whitespace are handled at once and correctly", () => {
    for (const n of [20000, 40000, 80000]) {
      // CSS whitespace that XML allows literally (a form feed is a control character there).
      const ws = " \t\n\r".repeat(n / 4);
      // Whitespace at both ends of the property and the value: the declaration is still read as its property.
      expect(svgProblem(svg(`<rect style="${ws}fill${ws}:${ws}red${ws}"/>`))).toBeNull();
      expect(svgProblem(svg(`<rect style="${ws}fill${ws}:${ws}url(#a)${ws}"/>`))).toContain("url(…) is not allowed");
      expect(svgProblem(svg(`<rect style="${ws}fill${ws}:${ws}inherit${ws}"/>`))).toContain('the keyword "inherit"');
      // A value of nothing but whitespace, and empty declarations.
      expect(svgProblem(svg(`<rect style="${ws}"/>`))).toBeNull();
      expect(svgProblem(svg(`<rect style="${ws};${ws};fill:red${ws}x"/>`))).toBeNull();
      // Something else after the whitespace still counts: "fill x" is no property.
      expect(svgProblem(svg(`<rect style="fill${ws}x: red"/>`))).toContain("is not allowed");
      // Whitespace between a function name and its "(" is skipped once, not rescanned.
      expect(svgProblem(svg(`<rect fill="url${ws}(#a)"/>`))).toContain("url(…) is not allowed");
      expect(svgProblem(svg(`<rect transform="${`rotate${ws}(1)`.repeat(3)}"/>`))).toBeNull();
    }
  });

  it("review 3: the parser stays linear — large inputs are checked in one forward pass", () => {
    // Before, every "(" re-scanned the whole prefix: 14 KB took 77 s, so these sizes could not finish.
    const letters = svg(`<rect transform="${"a".repeat(40000)}1${"rotate(1)".repeat(4000)}"/>`);
    expect(svgProblem(letters)).toBeNull();
    const colours = svg(`<rect fill="${"rgb(0)".repeat(20000)}"/>`);
    expect(svgProblem(colours)).toBeNull();
    // Many elements, deep groups and long path data.
    const shapes = svg('<g transform="translate(1 1)">'.repeat(2000) + '<circle cx="1" cy="1" r="1" fill="#3a6"/>'.repeat(20000) + "</g>".repeat(2000));
    expect(svgProblem(shapes)).toBeNull();
    expect(svgProblem(svg(`<path d="M0 0${" L1 1".repeat(100000)}"/>`))).toBeNull();
    // A long run of letters is neither copied nor taken for a keyword; the result is still exact.
    expect(svgProblem(svg(`<rect fill="${"a".repeat(100000)}(1)"/>`))).toContain('the function "aaaaaaaaaaaaaa…(" is not allowed');
    expect(svgProblem(svg(`<rect fill="${"inherit".repeat(20000)}"/>`))).toBeNull();
    expect(svgProblem(svg('<rect transform="translate(1) rotateX(1)"/>'))).toContain('the function "rotatex(" is not allowed');
    expect(svgProblem(svg('<rect transform="(1)"/>'))).toContain('the function "(" is not allowed');
    expect(svgProblem(svg('<rect transform="rotate 1 (1)"/>'))).toContain('the function "(" is not allowed');
    // Every function is checked, also after an accepted one.
    expect(svgProblem(svg('<rect fill="rgb(0,0,0) url(x)"/>'))).toContain("url(…) is not allowed");
  });

  it("the allowlists contain no event attributes, no references and no active, external or reusable elements", () => {
    expect([...SVG_ATTRIBUTES].filter((a) => /^on/i.test(a) || /href|mask|clip|filter|marker|dash/i.test(a))).toEqual([]);
    expect([...SVG_ELEMENTS].sort()).toEqual(["circle", "desc", "ellipse", "g", "line", "path", "polygon", "polyline", "rect", "svg", "title"]);
    for (const e of ["script", "style", "foreignObject", "image", "feImage", "a", "animate", "set", "animateTransform", "animateMotion", "iframe", "switch", "metadata"]) {
      expect(SVG_ELEMENTS.has(e), e).toBe(false);
    }
  });
});
