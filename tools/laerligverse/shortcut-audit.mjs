// D-346 (F9): adversarial check of the measurement material — can a pupil get the answers WITHOUT the competence?
//
//   node tools/laerligverse/shortcut-audit.mjs     print the before/after table as JSON
//
// Each STRATEGY is a simple, rule-based way to answer the auto-scored parts (part 2 ja/nej, part 3 and the
// transfer test's source choice) using surface features only: whether the sender is named, opinion words, word
// overlap with the source or the source descriptions, the year, answer positions remembered from the pretest,
// length. A strategy that scores well reveals a shortcut. `audit(forms, transfer)` runs every strategy on a set
// of forms; the tests run it on the current forms (after) and on the frozen v1.1 forms (before,
// fixtures/assessment-v1.1.json). Chance level: part 2 = 50 %, part 3 = 25 %.
//
// LIMITS: the strategies are the shortcuts we could think of and write down as rules. A pupil can find others.
// A low score here is not proof that no shortcut exists.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BEFORE_FIXTURE = join(HERE, "fixtures", "assessment-v1.1.json");

/** The sender as it is named in each form's claims (the same senders in v1.1 and now). */
export const SENDER_TERMS = Object.freeze({ A: ["læge", "holm"], B: ["sundhedskommission", "kommission"], C: ["amtmand"] });
/** Words of opinion, wish, knowledge or experience. */
export const OPINION_WORDS = Object.freeze(["mente", "ønskede", "ville", "syntes", "frygtede", "vidste", "troede", "håbede", "oplevede"]);
export const PERSONAL_LABELS = Object.freeze(["Dagbog", "Brev", "Erindring", "Erindringsbog"]);
const QUANTIFIERS = ["tusindvis", "alle", "hele", "mange", "flere", "fleste"];
const STOP = new Set(["at", "af", "de", "den", "der", "det", "en", "et", "for", "fra", "har", "havde", "han", "hun", "hende", "hans", "hvad", "hvor", "hvornår", "hvordan", "i", "ikke", "med", "når", "og", "om", "på", "sig", "sin", "sit", "sine", "skulle", "som", "til", "var", "ved", "være", "blev", "eller", "også", "deres", "selv", "efter", "over", "under", "meget"]);

export const words = (t) => String(t ?? "").toLowerCase().split(/[^0-9a-zæøåé]+/).filter(Boolean);
/** Content stems: words of 4+ letters (or a year), not stop words, cut to their first 4 letters — a deliberately
 *  generous match, so that »elev«/»eleverne« and »skole«/»skolens« count as the same word. */
export const stems = (t) => [...new Set(words(t).filter((w) => !STOP.has(w) && (w.length >= 4 || /^\d{4}$/.test(w))).map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 4))))];
const overlap = (a, b) => { const B = new Set(stems(b)); return stems(a).filter((s) => B.has(s)).length; };
const mentions = (text, terms) => words(text).some((w) => terms.some((t) => w.startsWith(t)));
const year = (t) => (String(t).match(/\b(1[0-9]{3}|20[0-9]{2})\b/) ?? [])[1] ?? null;

/** Part 2: each strategy returns "ja"/"nej" per claim. `ctx` = { form, pretest } */
export const PART2_STRATEGIES = Object.freeze([
  { id: "afsender-naevnt", name: "Ja, når afsenderen er nævnt i påstanden", run: ({ form }) => form.part2.claims.map((c) => (mentions(c.text, SENDER_TERMS[form.id]) ? "ja" : "nej")) },
  { id: "afsender-foerst", name: "Ja, når påstanden begynder med afsenderen", run: ({ form }) => form.part2.claims.map((c) => (SENDER_TERMS[form.id].some((t) => (words(c.text)[0] ?? "").startsWith(t)) ? "ja" : "nej")) },
  { id: "holdningsord", name: "Ja, når påstanden har et holdningsord (mente, ønskede, vidste …)", run: ({ form }) => form.part2.claims.map((c) => (words(c.text).some((w) => OPINION_WORDS.includes(w)) ? "ja" : "nej")) },
  { id: "ordoverlap", name: "Ja, når påstanden genbruger mindst to ord fra kilden", run: ({ form }) => form.part2.claims.map((c) => (overlap(c.text, `${form.source.header} ${form.source.text}`) >= 2 ? "ja" : "nej")) },
  { id: "maengdeord-nej", name: "Nej, når påstanden har et tal eller et mængdeord (tusindvis, alle, mange …); ellers ja", run: ({ form }) => form.part2.claims.map((c) => (words(c.text).some((w) => QUANTIFIERS.includes(w)) ? "nej" : "ja")) },
  { id: "laengst-ja", name: "Ja til de længste påstande (længere end gennemsnittet)", run: ({ form }) => { const n = form.part2.claims.map((c) => c.text.length); const avg = n.reduce((a, b) => a + b, 0) / n.length; return n.map((x) => (x > avg ? "ja" : "nej")); } },
  { id: "altid-nej", name: "Altid nej", run: ({ form }) => form.part2.claims.map(() => "nej") },
  { id: "altid-ja", name: "Altid ja", run: ({ form }) => form.part2.claims.map(() => "ja") },
  { id: "praetest-raekkefoelge", name: "Prætestens facit i samme rækkefølge (kun B og C)", skip: (f) => f.id === "A", run: ({ form, pretest }) => form.part2.claims.map((_, i) => pretest.part2.claims[i]?.answer ?? "nej") },
  { id: "praetest-omvendt", name: "Det modsatte af prætestens facit (kun B og C)", skip: (f) => f.id === "A", run: ({ form, pretest }) => form.part2.claims.map((_, i) => (pretest.part2.claims[i]?.answer === "ja" ? "nej" : "ja")) },
]);

/** Part 3 and the transfer choice: each strategy returns a source label per claim. `ctx` = { sources, claims, pretest } */
export const CHOICE_STRATEGIES = Object.freeze([
  { id: "noegleord", name: "Den kilde, hvis beskrivelse deler flest ord med påstanden", run: ({ sources, claims }) => claims.map((c) => { let best = sources[0]; let n = -1; for (const s of sources) { const k = overlap(c.text, `${s.label} ${s.meta}`); if (k > n) { n = k; best = s; } } return best.label; }) },
  { id: "faerrest-noegleord", name: "Den kilde, hvis beskrivelse deler færrest ord med påstanden (det omvendte af nøgleord)", run: ({ sources, claims }) => claims.map((c) => { let best = sources[0]; let n = Infinity; for (const s of sources) { const k = overlap(c.text, `${s.label} ${s.meta}`); if (k < n) { n = k; best = s; } } return best.label; }) },
  { id: "samme-aar", name: "Den første kilde fra påstandens år", run: ({ sources, claims }) => claims.map((c) => (sources.find((s) => year(c.text) && s.meta.includes(year(c.text))) ?? sources[0]).label) },
  { id: "altid-personlig", name: "Altid den første personlige kilde (dagbog, brev, erindring)", run: ({ sources, claims }) => claims.map(() => (sources.find((s) => PERSONAL_LABELS.includes(s.label)) ?? sources[0]).label) },
  { id: "samtidig-personlig", name: "Altid den personlige kilde fra påstandens år", run: ({ sources, claims }) => claims.map((c) => (sources.find((s) => PERSONAL_LABELS.includes(s.label) && year(c.text) && s.meta.includes(year(c.text))) ?? sources.find((s) => PERSONAL_LABELS.includes(s.label)) ?? sources[0]).label) },
  { id: "laengste-beskrivelse", name: "Den kilde med den længste beskrivelse", run: ({ sources, claims }) => claims.map(() => sources.reduce((a, b) => (b.meta.length > a.meta.length ? b : a)).label) },
  { id: "foerste-kilde", name: "Altid den første kilde i tabellen", run: ({ sources, claims }) => claims.map(() => sources[0].label) },
  { id: "praetest-undgaa", name: "Undgå prætestens plads: den første kilde på en anden plads end prætestens facit (ikke A)", skip: (id) => id === "A", run: ({ sources, claims, pretest }) => claims.map((_, i) => { const want = pretest.part3.claims[i]?.answer; const pos = pretest.part3.sources.findIndex((s) => s.label === want); return (sources.find((_, k) => k !== pos) ?? sources[0]).label; }) },
  { id: "praetest-position", name: "Samme plads i tabellen som prætestens facit (ikke A)", skip: (id) => id === "A", run: ({ sources, claims, pretest }) => claims.map((_, i) => { const want = pretest.part3.claims[i]?.answer; const pos = pretest.part3.sources.findIndex((s) => s.label === want); return (sources[pos] ?? sources[0]).label; }) },
]);

const pct = (r, n) => (n === 0 ? null : Math.round((100 * r) / n));

/** Run every strategy on a set of forms. Returns per-strategy rows with per-form and total scores. */
export function audit(forms, transfer) {
  const pretest = forms.A;
  const part2 = PART2_STRATEGIES.map((st) => {
    const per = {};
    let right = 0, total = 0;
    for (const f of [forms.A, forms.B, forms.C]) {
      if (st.skip?.(f)) continue;
      const got = st.run({ form: f, pretest });
      const r = f.part2.claims.filter((c, i) => got[i] === c.answer).length;
      per[f.id] = { right: r, of: f.part2.claims.length, answers: got };
      right += r; total += f.part2.claims.length;
    }
    return { id: st.id, name: st.name, per, right, of: total, pct: pct(right, total) };
  });
  const choiceSets = [
    ...[forms.A, forms.B, forms.C].map((f) => ({ id: f.id, sources: f.part3.sources, claims: f.part3.claims })),
    { id: "T", sources: transfer.choice.sources, claims: transfer.choice.claims },
  ];
  const part3 = CHOICE_STRATEGIES.map((st) => {
    const per = {};
    let right = 0, total = 0;
    for (const set of choiceSets) {
      if (st.skip?.(set.id)) continue;
      const got = st.run({ sources: set.sources, claims: set.claims, pretest });
      const r = set.claims.filter((c, i) => got[i] === c.answer).length;
      per[set.id] = { right: r, of: set.claims.length, answers: got };
      right += r; total += set.claims.length;
    }
    return { id: st.id, name: st.name, per, right, of: total, pct: pct(right, total) };
  });
  return { part2, part3 };
}

/** Pairwise agreement of part 2 answer keys by position (memorising the pretest's order). */
export function positionAgreement(forms) {
  const out = {};
  const ids = ["A", "B", "C"];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = forms[ids[i]].part2.claims, b = forms[ids[j]].part2.claims;
    out[`${ids[i]}${ids[j]}`] = a.filter((c, k) => b[k] && b[k].answer === c.answer).length;
  }
  return out;
}

/**
 * Words that appear only on one side (only in "ja" claims, or only in "nej" claims) in at least two forms: a pupil
 * who has seen the pretest could use them as a cue. Topic words of one form are not counted.
 */
export function cueWords(forms) {
  const side = { ja: new Map(), nej: new Map() };
  for (const f of [forms.A, forms.B, forms.C]) for (const c of f.part2.claims) {
    for (const s of stems(c.text)) {
      if (/^\d+$/.test(s)) continue;
      const m = side[c.answer];
      if (!m.has(s)) m.set(s, new Set());
      m.get(s).add(f.id);
    }
  }
  const out = [];
  for (const [ans, other] of [["ja", "nej"], ["nej", "ja"]]) {
    for (const [s, fs] of side[ans]) if (fs.size >= 2 && !side[other].has(s)) out.push({ stem: s, only: ans, forms: [...fs].sort() });
  }
  return out;
}

export function loadBefore() {
  const d = JSON.parse(readFileSync(BEFORE_FIXTURE, "utf8"));
  return { version: d.version, forms: d.forms, transfer: d.transfer };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { FORMS, TRANSFER, VERSION } = await import("./assessment-v1.mjs");
  const before = loadBefore();
  const brief = (a) => ({ part2: a.part2.map((r) => [r.id, `${r.right}/${r.of}`, JSON.stringify(Object.fromEntries(Object.entries(r.per).map(([k, v]) => [k, v.right + "/" + v.of])))]), part3: a.part3.map((r) => [r.id, `${r.right}/${r.of}`, JSON.stringify(Object.fromEntries(Object.entries(r.per).map(([k, v]) => [k, v.right + "/" + v.of])))]) });
  console.log(JSON.stringify({
    before: { version: before.version, ...brief(audit(before.forms, before.transfer)), positions: positionAgreement(before.forms), cueWords: cueWords(before.forms) },
    after: { version: VERSION, ...brief(audit(FORMS, TRANSFER)), positions: positionAgreement(FORMS), cueWords: cueWords(FORMS) },
  }, null, 1));
}
