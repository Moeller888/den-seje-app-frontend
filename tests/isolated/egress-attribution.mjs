// Attribution of the isolated suite's tripwire refusals to the test that was running (D-110 diagnostics).
//
// Pure: takes the tripwire's events ({ at, kind, host, agent }) and the reporter's timeline lines
// ({ at, ev: "begin"|"end", project, file, line, title, retry }) and says, for each refusal, which test
// was running at that moment — or that it fell between two tests, before the first or after the last
// (setup, browser start, teardown). The suite runs one worker, so "running" is unambiguous; should
// several tests overlap, every one of them is named.
//
// It decides nothing: the run fails on any refusal whether or not it can be attributed (run-suite.mjs).

export function parseTimeline(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (Number.isFinite(e?.at) && (e.ev === "begin" || e.ev === "end")) out.push(e);
    } catch { /* a torn line is skipped; attribution is best effort */ }
  }
  return out.sort((a, b) => a.at - b.at);
}

const key = (e) => `${e.project}|${e.file}|${e.line}|${e.title}|${e.retry}`;
export const describeTest = (e) => `[${e.project}] ${e.file}:${e.line} › ${e.title}${e.retry ? ` (retry ${e.retry})` : ""}`;

// One interval per test run: [begin, end] (end = Infinity when the end line is missing).
export function testIntervals(timeline) {
  const open = new Map();
  const out = [];
  for (const e of timeline) {
    if (e.ev === "begin") open.set(key(e), e);
    else {
      const b = open.get(key(e));
      if (b) { out.push({ test: b, begin: b.at, end: e.at, status: e.status }); open.delete(key(e)); }
    }
  }
  for (const b of open.values()) out.push({ test: b, begin: b.at, end: Infinity, status: "no end" });
  return out.sort((a, b) => a.begin - b.begin);
}

export function attributeEgress(events, timeline, { t0 = null } = {}) {
  const intervals = testIntervals(timeline);
  return (events ?? []).map((ev) => {
    const during = intervals.filter((i) => i.begin <= ev.at && ev.at <= i.end);
    const before = intervals.filter((i) => i.end < ev.at).pop() ?? null;
    const after = intervals.find((i) => i.begin > ev.at) ?? null;
    let where;
    if (during.length) where = "during " + during.map((i) => describeTest(i.test)).join(" + ");
    else if (!before && !after) where = "no test timeline recorded";
    else if (!before) where = `before the first test (${describeTest(after.test)})`;
    else if (!after) where = `after the last test (${describeTest(before.test)}, ${Math.round(ev.at - before.end)} ms after its end)`;
    else where = `between tests: ${Math.round(ev.at - before.end)} ms after ${describeTest(before.test)} ended, ${Math.round(after.begin - ev.at)} ms before ${describeTest(after.test)}`;
    const rel = t0 === null ? "" : ` at +${((ev.at - t0) / 1000).toFixed(1)} s`;
    return { ...ev, during: during.map((i) => i.test), where, text: `${ev.kind} ${ev.host} from ${ev.agent}${rel} — ${where}` };
  });
}
