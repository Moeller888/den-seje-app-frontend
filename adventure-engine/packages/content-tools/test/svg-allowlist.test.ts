import { describe, expect, it } from "vitest";
import { detectAsset, encodeText } from "../src/index.ts";
import { SVG_ATTRIBUTES, SVG_ELEMENTS, svgProblem } from "../src/svg.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (body: string, attrs = ""): string => `<svg ${NS}${attrs} width="64" height="64" viewBox="0 0 64 64">${body}</svg>`;
const detect = (text: string) => detectAsset("x.svg", encodeText(text));

describe("follow-up: SVG allowlist", () => {
  it("keeps ordinary local pictures: shapes, colours, paths, text, gradients, patterns, filters and #fragment references", () => {
    const pictures = [
      svg('<rect width="64" height="64" fill="#3a6"/><circle cx="32" cy="32" r="8" stroke="rgb(0,0,0)" stroke-width="2" fill="none"/>'),
      svg('<path d="M0 0 L10 10 C 20 20, 40 20, 50 10 Z" fill-rule="evenodd" opacity="0.5"/><polygon points="1,2 3,4 5,6"/><polyline points="0,0 1,1"/><line x1="0" y1="0" x2="1" y2="1"/><ellipse cx="1" cy="1" rx="2" ry="3"/>'),
      svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></linearGradient><radialGradient id="r" fx="0.5" fy="0.5"><stop offset="0"/></radialGradient></defs><rect width="10" height="10" fill="url(#g)" stroke="url( \'#r\' )"/>'),
      svg('<defs><clipPath id="c"><rect width="5" height="5"/></clipPath><mask id="m"><rect width="5" height="5" fill="#fff"/></mask><pattern id="p" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2"/></pattern><marker id="k" markerWidth="3" markerHeight="3" refX="1" refY="1" orient="auto"><path d="M0 0L2 1L0 2z"/></marker></defs><g clip-path="url(#c)" mask="url(#m)"><path d="M0 0H9" marker-end="url(#k)" fill="url(#p)"/></g>'),
      svg('<defs><filter id="f" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b"/><feOffset dx="1" dy="1"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#f)" transform="translate(2 2) rotate(5)"><rect width="9" height="9"/></g>'),
      svg('<defs><symbol id="s" viewBox="0 0 4 4"><rect width="4" height="4"/></symbol></defs><use href="#s" x="1" y="1"/><use xlink:href="#s"/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"'),
      svg('<title>Ur</title><desc>Et ur på væggen &amp; en krage &#x2013; &lt;3</desc><text x="1" y="10" font-family="Atkinson Hyperlegible" font-size="8" text-anchor="middle">Tik <tspan dx="2">tak</tspan></text>'),
      svg('<rect style="fill: #f00; stroke:url(#g) ; stroke-width: 2;" width="1" height="1"/>'),
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

  it("refuses event attributes in any spelling", () => {
    for (const a of ['onload="x()"', 'onLoad="x()"', 'ONCLICK="x()"', 'onmouseover = "x()"', "onbegin='x()'"]) {
      expect(detect(svg(`<rect ${a} width="1" height="1"/>`)), a).toHaveProperty("forbidden");
    }
  });

  it("refuses namespace prefixes and foreign namespaces", () => {
    const cases = [
      svg('<x:script xmlns:x="http://www.w3.org/2000/svg">1</x:script>'),
      svg("<svg:foreignObject></svg:foreignObject>"),
      svg("<svg:rect/>"),
      svg('<h:div xmlns:h="http://www.w3.org/1999/xhtml"/>'),
      svg("<g/>", ' xmlns:x="http://www.w3.org/1999/xhtml"'),
      svg("<g/>", ' xmlns:xlink="http://example.com/"'),
      '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>',
      svg('<rect x:onload="x()" width="1"/>'),
      svg('<rect xml:base="http://example.com/" width="1"/>'),
      svg('<rect inkscape:label="x" width="1"/>'),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
  });

  it("refuses mixed and upper case names (SVG names are case-sensitive)", () => {
    for (const c of [svg("<SCRIPT>1</SCRIPT>"), svg("<Script>1</Script>"), svg("<ForeignObject/>"), svg('<rect Fill="red"/>'), '<SVG xmlns="http://www.w3.org/2000/svg"></SVG>']) {
      expect(detect(c), c).toHaveProperty("forbidden");
    }
  });

  it("decodes character references before checking, and refuses unknown or unterminated ones", () => {
    const cases = [
      svg('<use href="&#106;avascript:alert(1)"/>'),
      svg('<use href="&#x6A;avascript:alert(1)"/>'),
      svg('<use href="java\tscript:alert(1)"/>'),
      svg('<use href="&#x23;x&#x3A;//evil"/>'),
      svg('<rect fill="u&#x72;l(http://example.com/x.svg#a)"/>'),
      svg('<rect fill="&#117;rl(data:image/png;base64,AA)"/>'),
      svg('<rect fill="url(&#x27;http://x/y&#x27;)"/>'),
      svg('<rect fill="&nbsp;red"/>'),
      svg('<rect fill="a &amp b"/>'),
      svg("<desc>&lol;</desc>"),
      svg("<desc>&</desc>"),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
    // Real references are decoded, not refused.
    expect(svgProblem(svg('<rect id="&#x61;b" width="1" height="1"/>'))).toBeNull();
  });

  it("refuses CSS URLs, imports and escapes in attributes and in style", () => {
    const cases = [
      svg('<rect fill="url(http://example.com/p.svg#g)"/>'),
      svg('<rect fill="url(//example.com/p.svg#g)"/>'),
      svg('<rect fill="URL(other.svg#g)"/>'),
      svg('<rect filter="url(#f) url(x.svg#g)"/>'),
      svg('<rect style="fill:url(http://example.com/x)"/>'),
      svg('<rect style="background-image:url(#g)"/>'),
      svg('<rect style="behavior:url(#x)"/>'),
      svg('<rect style="fill:red; @import \'x.css\'"/>'),
      svg('<rect style="fill:red;}rect{fill:blue"/>'),
      svg('<rect style="fill:expression(alert(1))"/>'),
      svg('<rect style="fill:\\75 rl(http://x)"/>'),
      svg('<rect style="fill /* hidden */: red"/>'),
      svg('<rect style="red"/>'),
    ];
    for (const c of cases) expect(detect(c), c).toHaveProperty("forbidden");
  });

  it("refuses external resources and every href that is not a #fragment", () => {
    const cases = [
      svg('<use href="other.svg#s"/>'),
      svg('<use href="http://example.com/a.svg#s"/>'),
      svg('<use href="data:image/svg+xml;base64,PHN2Zz4="/>'),
      svg('<use xlink:href="//example.com/s.svg#a"/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"'),
      svg('<use href="#"/>'),
      svg('<use href="#a b"/>'),
      svg('<rect id="x" fill="data:text/html,x"/>'),
      svg('<rect class="https://example.com/"/>'),
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
    const hidden = `<?xml version="1.0" encoding="ISO-2022-JP"?><svg ${NS}><g id="g1" class="${esc}$B">${esc}(B" onload="window.HIT=1"><rect width="1" height="1"/></g></svg>`;
    expect(detect(hidden)).toHaveProperty("forbidden");
    for (const c of [
      `<?xml version="1.0" encoding="UTF-16"?>${svg("<g/>")}`,
      `<?xml version="1.1"?>${svg("<g/>")}`,
      `<?xml version="1.0" foo="bar"?>${svg("<g/>")}`,
      svg(`<desc>a${esc}b</desc>`),
      svg(`<rect class="a${esc}b"/>`),
      svg("<desc>a\u0000b</desc>"),
    ]) {
      expect(svgProblem(c), JSON.stringify(c)).not.toBeNull();
    }
    for (const ok of [`<?xml version="1.0" encoding="utf-8" standalone="no"?>${svg("<g/>")}`, `<?xml version='1.0' encoding='UTF-8'?>\r\n${svg("<desc>a\tb</desc>")}`]) {
      expect(svgProblem(ok), ok).toBeNull();
    }
  });

  it("review: CSS functions other than url(#id), colours and transforms are refused (image-set could load a relative file)", () => {
    for (const c of [
      svg("<rect style=\"mask: image-set('evil2.png' 1x)\"/>"),
      svg("<rect mask=\"image-set('evil.png' 1x)\"/>"),
      svg("<rect fill=\"cross-fade(url(#a), url(#b))\"/>"),
      svg("<rect style=\"fill: src('x.png')\"/>"),
      svg("<rect style=\"fill: element(#x)\"/>"),
      svg("<rect fill=\"var(--x)\"/>"),
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

  it("the allowlists contain no event attributes and no active or external elements", () => {
    expect([...SVG_ATTRIBUTES].filter((a) => /^on/i.test(a))).toEqual([]);
    for (const e of ["script", "style", "foreignObject", "image", "feImage", "a", "animate", "set", "animateTransform", "animateMotion", "iframe", "switch", "metadata"]) {
      expect(SVG_ELEMENTS.has(e), e).toBe(false);
    }
  });
});
