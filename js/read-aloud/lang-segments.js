// ── Read-aloud language segmentation (Danish / English) ──────────────────────
// English-subject questions mix Danish and English in one text ("Hvad betyder
// 'sun'?", "mum og dad"). This module splits a text into runs that are each read
// with their own voice: [{ text, lang: "da-DK" | "en-GB" }].
//
// Pure, deterministic, rule-based (no network, no model): every word is scored from
// small word lists + spelling cues (æ/ø/å, w, th-, contractions). Words without
// evidence take the language of the nearest word that has it, then the chunk's
// majority, then a context prior (quoted text / options / question frame).
// It is a best-effort reading aid: a wrong guess only changes the voice, never the
// question. Only used for the English subject; everything else stays Danish-only.

export const LANG_DA = "da-DK";
export const LANG_EN = "en-GB";

// Danish words (lowercase). Function words + common school/everyday vocabulary.
const DA_WORDS = new Set((
  "og i på af til med fra om ud ind op ned hen hjem ved efter før under mellem uden " +
  "jeg du han hun vi de dig mig ham hende os dem sig jer det der hvad hvem hvor hvordan " +
  "hvorfor hvornår hvilken hvilket hvilke hvis hvor mange en et ét den de det dette disse " +
  "min mit mine din dit dine sin sit sine hans hendes vores jeres deres ikke ikk nej ja " +
  "også men eller så som end når mens fordi selv mere mest meget lidt lille små stor " +
  "store større største godt god gode dårlig dårligt ny nyt nye gammel gammelt gamle " +
  "er var være været bliver blev blive har havde haft kan kunne skal skulle vil ville " +
  "må måtte gør gjorde gøre får fik få går gik gå kommer kom komme siger sagde sige " +
  "ser så se hedder hed hedde betyder betød betyde mangler manglede passer passede " +
  "laver lavede lave spiser spiste spise drikker drak drikke leger legede lege læser " +
  "læste læse skriver skrev skrive sover sov sove løber løb løbe hopper hoppe svømmer " +
  "svømme synger sang synge danser danse tegner tegne bor boede bo elsker elske " +
  "hader hade vil gerne lide kunne lide ønsker tager tog tage giver gav give finder fandt " +
  "finde leder lede bruger bruge spørger spurgte spørge svarer svarede svare hjælper " +
  "hjælpe køber købte købe sælger sælge åbner åbnede lukker lukkede venter vente " +
  "ord ordet ordene sætning sætningen sætninger spørgsmål spørgsmålet svar svaret " +
  "rigtig rigtigt rigtige forkert forkerte bedst bedste næsten samme modsatte modsat " +
  "datid nutid fremtid flertal ental tillægsform form eksempel engelsk engelske " +
  "dansk danske danmark læs farve farven farver tal tallet tallene dyr dyret dyrene " +
  "kropsdel ting tingen mand manden kvinde kvinden dreng drengen pige pigen barn børn " +
  "børnene mor moren far faren bror broren søster søsteren søskende bedstemor bedstefar " +
  "familie familien ven venner veninde lærer læreren klasse klassen skole skolen " +
  "hus huset hjemme værelse værelset køkken køkkenet stue stuen have haven bil bilen " +
  "cykel cyklen tog toget fly flyet båd båden vej vejen by byen land landet " +
  "hund hunden kat katten fugl fuglen hest hesten ko koen gris grisen får fisk fisken " +
  "mus musen ræv ræven bjørn bjørnen løve løven abe aben elefant kanin kaninen and anden " +
  "and ænder høne hønen ged geden ugle slange frø " +
  "rød rødt røde blå grøn grønt grønne gul gult gule sort sorte hvid hvidt hvide " +
  "brun brunt brune lyserød lilla grå " +
  "en to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten " +
  "sytten atten nitten tyve hundrede tusind første anden tredje fjerde femte sidste " +
  "dag dagen nat natten morgen morgenen aften aftenen uge ugen måned måneden år året " +
  "tid tiden time timen minut sekund i dag i morgen i går nu snart altid aldrig ofte " +
  "mandag tirsdag onsdag torsdag fredag lørdag søndag januar februar marts april maj " +
  "juni juli august september oktober november december sommer vinter forår efterår " +
  "sol solen sne sneen regn regnen vind vinden sky skyen himmel himlen hav havet sø søen " +
  "skov skoven træ træet blomst blomsten græs vand vandet ild jord " +
  "hoved hovedet hånd hånden hænder fod foden fødder ben benet arm armen øje øjet øjne " +
  "øre øret ører næse næsen mund munden tand tænder hår håret hals halsen hæl knæ mave " +
  "ryg skulder finger fingre tå tæer ansigt " +
  "mad maden æble æblet banan bananen pære gulerod brød brødet mælk mælken ost kage " +
  "kagen is suppe kartoffel kartofler æg sukker salt frugt grøntsager morgenmad " +
  "frokost aftensmad slik vand " +
  "bog bogen blyant blyanten taske tasken bord bordet stol stolen dør døren vindue " +
  "seng sengen lampe ur uret penge bold bolden legetøj tøj trøje bukser sko kjole " +
  "jakke hue kasket handsker " +
  "glad ked trist sur vred træt sulten tørstig syg rask bange sjov sjovt sjove kedelig " +
  "flot pæn pænt rodet tom tomt fuld varm varmt kold koldt hurtig hurtigt langsom " +
  "høj højt lav lavt lang langt kort tidlig tidligt sent let svær svært nem nemt " +
  "farlig lækker anderledes vanskelig derfor alligevel gennem tanke mening betydning menneske ung yngste ældste højeste sjoveste " +
  "hej farvel tak undskyld velkommen tillykke fødselsdag godmorgen godnat goddag " +
  "værsgo pas tag gave gaver fest jul nytår ferie sommerferie " +
  "butikken butik åbnede lukket købte boller bager bageriet personen person " +
  "hvad hedder hvordan hvem gamle gammel yndlingsdyr yndlings gerne mens"
).split(/\s+/).filter(Boolean));

// English words (lowercase). Function words + common school/everyday vocabulary.
const EN_WORDS = new Set((
  "the a an of and to in on at is are was were be been being am do does did done " +
  "have has had having will would shall should can could may might must not no yes " +
  "you he she it we they me him her us them my your his its our their mine yours " +
  "this that these those what who whom whose where when why how which there here " +
  "with from into onto about after before under over between without up down out off " +
  "very much many more most some any all every each few little lot lots too also " +
  "just only still again always never often sometimes usually now then today tomorrow " +
  "yesterday tonight soon later early late first last next " +
  "i'm you're he's she's it's we're they're i've you've we've they've i'll you'll " +
  "he'll she'll we'll they'll i'd you'd don't doesn't didn't isn't aren't wasn't weren't " +
  "can't couldn't won't wouldn't shouldn't haven't hasn't hadn't let's what's where's " +
  "who's how's that's there's " +
  "go goes went gone going come comes came coming get gets got getting make makes made " +
  "take takes took taken give gives gave given see sees saw seen look looks looked " +
  "say says said tell told know knew known think thought want wants wanted like likes " +
  "liked love loves loved eat eats ate eaten eating drink drinks drank drunk play plays " +
  "played playing run runs ran running swim swims swam swum swimming sing sings sang " +
  "sung dance danced read reads reading write writes wrote written writing sleep sleeps " +
  "slept walk walks walked talk talked live lives lived work works worked help helped " +
  "find found buy bought sell sold open opens opened close closes closed wait waited " +
  "put puts sit sits sat stand stood jump jumped climb ride rode ridden fly flies flew " +
  "flown fall fell fallen catch caught throw threw thrown begin began begun bring brought " +
  "think learn learned teach taught speak spoke spoken listen watch watched cook cooking " +
  "cooks wash clean draw drew drawn feel felt keep kept leave left meet met pay paid " +
  "send win won lose lost choose chose break broke broken forget forgot understand " +
  "arrive arrived ask asked answer answered skate cry laugh smile hurry " +
  "boy girl man woman men women child children people baby family mum mom dad mother " +
  "father brother sister sisters brothers grandma grandmother grandpa grandfather aunt " +
  "uncle friend friends teacher pupil student class school home house room kitchen " +
  "garden street town city country world " +
  "dog dogs cat cats bird birds horse horses cow cows pig pigs sheep fish mouse mice " +
  "fox bear lion monkey elephant rabbit duck ducks hen goat owl snake frog animal " +
  "animals puppy kitten " +
  "red blue green yellow black white brown pink purple grey gray colour color " +
  "one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
  "fifteen sixteen seventeen eighteen nineteen twenty thirty hundred thousand second third " +
  "day days night morning afternoon evening week month year time hour minute " +
  "monday tuesday wednesday thursday friday saturday sunday january february march " +
  "april june july august september october november december summer winter spring autumn " +
  "sun rain snow wind cloud sky sea lake forest tree trees flower water fire " +
  "head hand hands foot feet leg arm eye eyes ear ears nose mouth tooth teeth hair " +
  "neck knee stomach back shoulder finger face " +
  "food apple apples banana bananas pear carrot bread milk cheese cake ice cream soup " +
  "potato egg eggs sugar fruit breakfast lunch dinner sweets " +
  "book pencil pen bag table chair door window bed lamp clock money ball toy toys " +
  "clothes shirt trousers shoes dress jacket coat cap gloves " +
  "happy sad angry tired hungry thirsty sick ill scared afraid funny boring nice " +
  "messy empty full hot warm cold fast quick slow high tall low long short easy " +
  "hard difficult dangerous different delicious beautiful ugly big small tiny large " +
  "young old new good bad best better worse worst right wrong same opposite " +
  "hello hi goodbye bye please thank thanks sorry welcome birthday christmas " +
  "excuse well done great fine ok okay " +
  "shop bakery bun buns room everywhere favourite favorite because but or so if than " +
  "as while until since for by"
).split(/\s+/).filter(Boolean));

// Written the same in both languages (or too ambiguous) → no evidence either way.
const SHARED_WORDS = new Set((
  "is and far kind glad gift fast store hat bad under over film bus by to for at man " +
  "den time tag bare fine sky barn hold sent land sand rose pizza sport taxi hotel " +
  "radio tv ok mine her arm fly ring hit stop orange juice bag sad sat ride person dog"
).split(/\s+/).filter(Boolean));

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const WORD_RE = new RegExp(`[${LETTER}0-9]+(?:'[${LETTER}]+)*`, "g");
const IS_LETTER = new RegExp(`[${LETTER}]`);

const NO_EVIDENCE = { lang: null, strong: false };

// Evidence for one word: { lang: "da" | "en" | null, strong }. Strong evidence may
// switch language inside a chunk ("mum og dad"); weak evidence only counts towards
// the chunk's majority. Weak = capitalised word-list hits (names like "Tom", "Ben"
// are also Danish words) and ending-based guesses ("kylling" ends in -ing). Never throws.
function wordEvidence(word) {
  if (typeof word !== "string" || word.length === 0) return NO_EVIDENCE;
  if (word === "I" || word.indexOf("I'") === 0) return { lang: "en", strong: true }; // "I", "I'm"
  const w = word.toLowerCase();
  if (/'(s|t|m|re|ll|ve|d)$/.test(w)) return { lang: "en", strong: true };          // contractions
  if (SHARED_WORDS.has(w)) return NO_EVIDENCE;
  const capital = word[0] !== w[0];
  const da = DA_WORDS.has(w);
  const en = EN_WORDS.has(w);
  if (da && en) return NO_EVIDENCE;
  if (da || en) return { lang: da ? "da" : "en", strong: !capital, lexical: true };
  if (/[æøå]/.test(w)) return { lang: "da", strong: true };
  if (/^[0-9]+$/.test(w)) return NO_EVIDENCE;
  // w / th- are rare in Danish but common in loanwords ("weekend", "sandwich"), so
  // they count towards a chunk's majority without switching a Danish sentence.
  if (w.indexOf("w") !== -1) return { lang: "en", strong: false };
  if (w.indexOf("th") === 0) return { lang: "en", strong: false };
  if (w.length > 5 && /(tion|ness|ing|ly)$/.test(w) && !/ning$/.test(w)) return { lang: "en", strong: false };
  if (w.length > 4 && /(lig|lige|ligt|hed|heden|erne|ende)$/.test(w)) return { lang: "da", strong: false };
  return NO_EVIDENCE;
}

/** Language evidence for one word: "da", "en" or null. Never throws. */
export function wordLang(word) {
  return wordEvidence(word).lang;
}

// Split text into tokens: { text, word: bool }. Spaces/punctuation are non-word.
function tokenize(text) {
  const out = [];
  let last = 0;
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), word: false });
    out.push({ text: m[0], word: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false });
  return out;
}

// Majority evidence of a text: "da", "en" or null on a tie / no evidence.
// Strong evidence counts 1, weak evidence ½.
export function textLang(text) {
  if (typeof text !== "string") return null;
  let da = 0;
  let en = 0;
  for (const t of tokenize(text)) {
    if (!t.word) continue;
    const ev = wordEvidence(t.text);
    const w = ev.strong ? 1 : 0.5;
    if (ev.lang === "da") da += w;
    else if (ev.lang === "en") en += w;
  }
  if (da > en) return "da";
  if (en > da) return "en";
  return null;
}

// Label every word of one chunk, then merge into runs. The chunk language is
// `fixedLang` when given, else the chunk's own majority, else `prior`. A word only
// switches away from the chunk language on strong evidence; `mode` narrows that:
//   "quote"  — quoted text is one language; only spelling evidence (æ/ø/å, w, th-,
//              contractions) switches, never the word lists ("juice", "let", "end"
//              inside an English quote stay English).
//   "option" — an MC option; a ONE-word option never switches on the word lists: it is
//              a deliberate distractor in the group's language, often a false friend
//              ("kylling", "leg"). Multi-word options may switch ("mum og dad").
//   "free"   — question text outside quotes.
// A word without (usable) evidence continues a switched run when that run is a real
// switch — it began after sentence punctuation ("Hvad er dato? – It's Monday.") or
// is 2+ words long — within the same sentence; otherwise it takes the chunk language
// (so a lone "og" in "teacher og parent" does not drag "parent" into Danish).
function labelChunk(text, prior, fixedLang, mode) {
  const tokens = tokenize(text);
  const chunkLang = fixedLang || textLang(text) || prior;
  const oneWord = tokens.filter((t) => t.word).length === 1;
  const labels = tokens.map((t) => {
    if (!t.word) return null;
    const ev = wordEvidence(t.text);
    if (ev.lang === null) return null;
    if (ev.lang === chunkLang) return chunkLang;
    if (!ev.strong) return null;
    if (ev.lexical && (mode === "quote" || (mode === "option" && oneWord))) return null;
    return ev.lang;
  });
  let runLang = null;
  let runLen = 0;
  let runAfterPunct = false;
  let punct = true; // chunk start counts as a sentence boundary
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].word) {
      if (/[.?!:–—]/.test(tokens[i].text)) punct = true;
      continue;
    }
    let l = labels[i];
    if (l === null) {
      const follow = runLang !== null && runLang !== chunkLang && !punct && (runLen >= 2 || runAfterPunct);
      l = follow ? runLang : chunkLang;
    }
    if (l === runLang && !punct) runLen++;
    else { runLang = l; runLen = 1; runAfterPunct = punct; }
    punct = false;
    labels[i] = l;
  }
  // Non-word tokens join the run before them (or the next run at the start).
  const runs = [];
  for (let i = 0; i < tokens.length; i++) {
    let l = labels[i];
    if (!tokens[i].word) {
      if (runs.length > 0) l = runs[runs.length - 1].lang;
      else {
        l = chunkLang;
        for (let j = i + 1; j < tokens.length; j++) if (tokens[j].word) { l = labels[j]; break; }
      }
    }
    if (runs.length > 0 && runs[runs.length - 1].lang === l) runs[runs.length - 1].text += tokens[i].text;
    else runs.push({ text: tokens[i].text, lang: l });
  }
  return runs;
}

// Split a question into chunks: quoted spans ('…' whose quote marks are not
// between two letters, so "don't" / "Oscar's" stay inside) and the text around them.
function splitQuotes(text) {
  const chunks = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === "‘" || c === "’") {
      const before = i > 0 && IS_LETTER.test(text[i - 1]);
      const after = i + 1 < text.length && IS_LETTER.test(text[i + 1]);
      const isApostrophe = before && after;
      if (!isApostrophe) {
        if (!inQuote && !before) {                       // opening quote
          if (buf) chunks.push({ text: buf, quoted: false });
          buf = c;
          inQuote = true;
          continue;
        }
        if (inQuote && !after) {                         // closing quote
          chunks.push({ text: buf + c, quoted: true });
          buf = "";
          inQuote = false;
          continue;
        }
      }
    }
    buf += c;
  }
  if (buf) chunks.push({ text: buf, quoted: inQuote });
  return chunks;
}

// An unquoted word list after the question ("Hvilket ord passer IKKE ind?
// red – blue – dog – green"): items of 1-2 words joined by dashes. It becomes its own
// chunk with an English prior. Returns [before, list] or null.
const DASH_LIST_RE = /^(.*[?:]\s*)((?:[^\s–—?]+(?: [^\s–—?]+)?\s+[–—]\s+)+[^\s–—?]+(?: [^\s–—?]+)?\s*)$/;
function splitDashList(text) {
  const m = DASH_LIST_RE.exec(text);
  return m ? [m[1], m[2]] : null;
}

// Prior for quoted text in a question frame: the quote is Danish when the question
// asks for the English word/sentence ("Hvad hedder 'kat' på engelsk?",
// "Hvilket ord betyder 'farlig'?"), else English. Synonym / opposite questions
// ("…næsten det samme som 'big'") quote English.
function quotePrior(frame) {
  const f = frame.toLowerCase();
  if (f.indexOf("på engelsk") !== -1) return "da";
  if (/samme som|modsatte/.test(f)) return "en";
  if (/hvilke[nt]?\s+[a-zæøå]+\s+betyder/.test(f)) return "da";
  return "en";
}

// Language of the answer options as fixed by the question frame, or null when the
// frame does not decide it:
//   "…på engelsk" / quoted Danish ("Hvilket ord betyder 'farlig'?") → English;
//   "Hvad betyder …", "Læs: …", colour / body part → Danish (a translation/answer).
function optionFrameLang(question) {
  const q = typeof question === "string" ? question : "";
  const chunks = splitQuotes(q);
  const frame = chunks.filter((c) => !c.quoted).map((c) => c.text).join(" ").toLowerCase();
  const quoted = chunks.filter((c) => c.quoted).map((c) => c.text).join(" ");
  if (frame.indexOf("på engelsk") !== -1) return "en";
  if (/samme som|modsatte/.test(frame)) return "en"; // synonym / opposite of an English word
  if (quoted && (textLang(quoted) || quotePrior(frame)) === "da") return "en";
  if (/^\s*læs\s*:/.test(frame)) return "da";
  if (/\bhvad\s+betyder\b/.test(frame)) return "da";
  if (/\bhvilke[nt]?\s+(farve|kropsdel)\b/.test(frame)) return "da";
  return null;
}

// Join runs of the same language. A run without letters/digits ("?", " – ") is glued
// to the run before it (or the next one at the start): spoken on its own, some voices
// read the punctuation aloud ("spørgsmålstegn").
function merge(runs) {
  const out = [];
  let lead = "";
  for (const r of runs) {
    if (!r || typeof r.text !== "string" || r.text.length === 0) continue;
    const lang = r.lang === "en" ? LANG_EN : LANG_DA;
    const spoken = /[\p{L}\p{N}]/u.test(r.text);
    if (!spoken) {
      if (out.length > 0) out[out.length - 1].text += r.text;
      else lead += r.text;
      continue;
    }
    if (out.length > 0 && out[out.length - 1].lang === lang) out[out.length - 1].text += r.text;
    else { out.push({ text: lead + r.text, lang }); lead = ""; }
  }
  return out.map((s) => ({ text: s.text.trim(), lang: s.lang })).filter((s) => s.text.length > 0);
}

/**
 * Segment a question text into Danish / English runs.
 * @param {string} question
 * @returns {{text:string, lang:string}[]} empty when there is nothing to read
 */
export function segmentQuestion(question) {
  try {
    if (typeof question !== "string" || question.trim().length === 0) return [];
    const chunks = splitQuotes(question);
    const frame = chunks.filter((c) => !c.quoted).map((c) => c.text).join(" ");
    const runs = [];
    for (const c of chunks) {
      if (c.quoted) {
        const lang = textLang(c.text) || quotePrior(frame);
        for (const r of labelChunk(c.text, lang, lang, "quote")) runs.push(r);
        continue;
      }
      const parts = splitDashList(c.text);
      if (parts) {
        for (const r of labelChunk(parts[0], "da", null, "free")) runs.push(r);
        const listLang = textLang(parts[1]) || "en";
        for (const r of labelChunk(parts[1], listLang, listLang, "quote")) runs.push(r);
        continue;
      }
      for (const r of labelChunk(c.text, "da", null, "free")) runs.push(r);
    }
    return merge(runs);
  } catch (_e) {
    return [{ text: String(question), lang: LANG_DA }];
  }
}

/**
 * Segment one MC option. All options of a question share one language: fixed by the
 * question frame when it decides it (optionFrameLang), else the options' combined
 * evidence, else English (the English subject's answers are mostly English).
 * @param {string} option
 * @param {string} question
 * @param {string[]} [allOptions]
 * @returns {{text:string, lang:string}[]}
 */
export function segmentOption(option, question, allOptions) {
  try {
    if (typeof option !== "string" || option.trim().length === 0) return [];
    const list = Array.isArray(allOptions) ? allOptions.filter((o) => typeof o === "string") : [option];
    const groupLang = optionFrameLang(question) || textLang(list.join(" ")) || "en";
    // Quoted words inside an option ("'Their' betyder deres") are read like quotes in
    // the question: their own evidence, else English.
    const runs = [];
    for (const c of splitQuotes(option)) {
      if (c.quoted) {
        const lang = textLang(c.text) || "en";
        for (const r of labelChunk(c.text, lang, lang, "quote")) runs.push(r);
      } else {
        for (const r of labelChunk(c.text, groupLang, groupLang, "option")) runs.push(r);
      }
    }
    return merge(runs);
  } catch (_e) {
    return [{ text: String(option), lang: LANG_DA }];
  }
}
