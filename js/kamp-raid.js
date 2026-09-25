// Videnkamp — pure raid engine. No DOM, no network, no rewards.
// A daily 7-question clash against "Gåden". Client-side grading only.
// XP and coins stay in the quiz (index.html + process-event). This mode never
// writes progression. Question order is a deterministic function of the date.

export const RAID_SIZE = 7;

export const QUESTION_POOL = Object.freeze([
  {
    id: "ww2-start",
    topic: "Anden verdenskrig",
    prompt: "Hvornår begyndte Anden verdenskrig i Europa?",
    options: ["1937", "1939", "1941"],
    correct: "1939",
  },
  {
    id: "ww2-poland",
    topic: "Anden verdenskrig",
    prompt: "Hvilket land invaderede Tyskland den 1. september 1939?",
    options: ["Frankrig", "Polen", "Danmark"],
    correct: "Polen",
  },
  {
    id: "ww2-axis",
    topic: "Anden verdenskrig",
    prompt: "Hvad hed alliancen mellem Tyskland, Italien og Japan?",
    options: ["NATO", "Aksemagterne", "Ententen"],
    correct: "Aksemagterne",
  },
  {
    id: "ww2-dday",
    topic: "Anden verdenskrig",
    prompt: "Hvad var D-dag?",
    options: [
      "Tysklands invasion af Polen",
      "De allieredes invasion i Normandiet",
      "Atombomben over Hiroshima",
    ],
    correct: "De allieredes invasion i Normandiet",
  },
  {
    id: "ww2-end-eu",
    topic: "Anden verdenskrig",
    prompt: "Hvilket år sluttede Anden verdenskrig i Europa?",
    options: ["1943", "1945", "1947"],
    correct: "1945",
  },
  {
    id: "ww2-pearl",
    topic: "Anden verdenskrig",
    prompt: "Hvilket land blev angrebet ved Pearl Harbor i 1941?",
    options: ["Storbritannien", "USA", "Frankrig"],
    correct: "USA",
  },
  {
    id: "dk-occupation",
    topic: "Danmark",
    prompt: "Hvornår blev Danmark besat under Anden verdenskrig?",
    options: ["9. april 1940", "9. april 1945", "1. september 1939"],
    correct: "9. april 1940",
  },
  {
    id: "dk-lib",
    topic: "Danmark",
    prompt: "Hvornår blev Danmark befriet?",
    options: ["4. maj 1945", "5. maj 1945", "8. maj 1945"],
    correct: "5. maj 1945",
  },
  {
    id: "vik-era",
    topic: "Vikinger",
    prompt: "Hvornår regner man typisk vikingetiden for at begynde i Norden?",
    options: ["Omkring år 500", "Omkring år 800", "Omkring år 1200"],
    correct: "Omkring år 800",
  },
  {
    id: "vik-ships",
    topic: "Vikinger",
    prompt: "Hvad gjorde vikingeskibet særligt velegnet til både hav og flod?",
    options: [
      "Det havde dampkedel og skrue",
      "Det var langsmalt med lav køl",
      "Det var bygget af jernplader",
    ],
    correct: "Det var langsmalt med lav køl",
  },
  {
    id: "vik-runes",
    topic: "Vikinger",
    prompt: "Hvad er runer i vikingetiden?",
    options: [
      "Et skriftsystem ridset i sten og træ",
      "Et slags skattefund",
      "Navnet på vikingernes guder",
    ],
    correct: "Et skriftsystem ridset i sten og træ",
  },
  {
    id: "vik-vinland",
    topic: "Vikinger",
    prompt: "Hvad kaldes det område i Nordamerika, vikingerne nåede omkring år 1000?",
    options: ["Grønland", "Vinland", "Markland"],
    correct: "Vinland",
  },
  {
    id: "cw-start",
    topic: "Den kolde krig",
    prompt: "Hvad var den kolde krig primært et opgør mellem?",
    options: [
      "USA og Sovjetunionen",
      "Tyskland og Frankrig",
      "Kina og Japan",
    ],
    correct: "USA og Sovjetunionen",
  },
  {
    id: "cw-wall",
    topic: "Den kolde krig",
    prompt: "I hvilket år faldt Berlinmuren?",
    options: ["1985", "1989", "1991"],
    correct: "1989",
  },
  {
    id: "cw-nato",
    topic: "Den kolde krig",
    prompt: "Hvad er NATO?",
    options: [
      "En militær alliance mellem vestlige lande",
      "Sovjetunionens planøkonomi",
      "FN's flygtningeorganisation",
    ],
    correct: "En militær alliance mellem vestlige lande",
  },
  {
    id: "cw-iron",
    topic: "Den kolde krig",
    prompt: "Hvad mente Churchill med 'jerntæppet'?",
    options: [
      "En toldmur omkring Storbritannien",
      "Skellet mellem Øst- og Vesteuropa",
      "En tysk panserlinje",
    ],
    correct: "Skellet mellem Øst- og Vesteuropa",
  },
  {
    id: "ind-steam",
    topic: "Industrialisering",
    prompt: "Hvilken opfindelse drev den tidlige industrielle revolution i Storbritannien?",
    options: ["Dampmaskinen", "Benzinmotoren", "Atomkraft"],
    correct: "Dampmaskinen",
  },
  {
    id: "ind-where",
    topic: "Industrialisering",
    prompt: "Hvor begyndte den industrielle revolution?",
    options: ["Frankrig", "Storbritannien", "Danmark"],
    correct: "Storbritannien",
  },
  {
    id: "ind-urban",
    topic: "Industrialisering",
    prompt: "Hvad skete der med byerne under industrialiseringen?",
    options: [
      "De blev tømt, fordi folk flyttede på landet",
      "De voksede, fordi fabrikkerne trak arbejdskraft",
      "De blev forbudt af kongen",
    ],
    correct: "De voksede, fordi fabrikkerne trak arbejdskraft",
  },
  {
    id: "dem-three",
    topic: "Demokrati",
    prompt: "Hvad betyder magtens tredeling?",
    options: [
      "Kongen, adelen og kirken deler magten",
      "Lovgivende, udøvende og dømmende magt skilles ad",
      "Tre partier skal altid danne regering",
    ],
    correct: "Lovgivende, udøvende og dømmende magt skilles ad",
  },
  {
    id: "dem-folketing",
    topic: "Demokrati",
    prompt: "Hvor sidder den lovgivende magt i Danmark?",
    options: ["Højesteret", "Folketinget", "Kommunalbestyrelsen"],
    correct: "Folketinget",
  },
  {
    id: "dem-1849",
    topic: "Demokrati",
    prompt: "Hvornår fik Danmark sin første frie grundlov?",
    options: ["1660", "1849", "1901"],
    correct: "1849",
  },
  {
    id: "dem-vote",
    topic: "Demokrati",
    prompt: "Hvornår fik kvinder valgret til Folketinget i Danmark?",
    options: ["1849", "1908", "1915"],
    correct: "1915",
  },
  {
    id: "geo-capital",
    topic: "Danmark",
    prompt: "Hvad hedder Danmarks hovedstad?",
    options: ["Aarhus", "København", "Odense"],
    correct: "København",
  },
]);

export function dayKey(date) {
  const d = date instanceof Date ? date : new Date();
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function pickRaidQuestions(isoDate, pool, size) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length === 0) return [];
  const n = Math.min(Number(size) > 0 ? Number(size) : RAID_SIZE, list.length);
  const digits = String(isoDate ?? "").replace(/\D/g, "");
  const seed = Number(digits) || 0;
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let idx = (seed + i * 11) % list.length;
    let guard = 0;
    while (used.has(idx) && guard < list.length) {
      idx = (idx + 1) % list.length;
      guard += 1;
    }
    used.add(idx);
    out.push(list[idx]);
  }
  return out;
}

export function gradeAnswer(question, answer) {
  if (!question || typeof question.correct !== "string") return false;
  if (typeof answer !== "string") return false;
  return answer === question.correct;
}

export const BOSSES = Object.freeze({
  vikings:              { id: "jarl",  name: "Jarlen"  },
  world_war_1:          { id: "skygg", name: "Skyggen" },
  world_war_2:          { id: "skygg", name: "Skyggen" },
  cold_war:             { id: "mur",   name: "Muren"   },
  industrialisation:    { id: "kedel", name: "Kedlen"  },
  democracy_power:      { id: "ting",  name: "Tinget"  },
  revolutions_democracy:{ id: "ting",  name: "Tinget"  },
  denmark:              { id: "gaade", name: "Gåden"   },
  default:              { id: "gaade", name: "Gåden"   },
});

export function bossForTopic(topic) {
  const raw = String(topic ?? "").trim();
  if (!raw) return BOSSES.default;
  if (Object.prototype.hasOwnProperty.call(BOSSES, raw)) return BOSSES[raw];
  const t = raw.toLowerCase();
  if (t.includes("viking")) return BOSSES.vikings;
  if (t.includes("verdenskrig") || t.includes("world_war") || t === "ww2" || t === "ww1") return BOSSES.world_war_2;
  if (t.includes("kold") || t.includes("cold")) return BOSSES.cold_war;
  if (t.includes("industri")) return BOSSES.industrialisation;
  if (t.includes("demokrati") || t.includes("magt") || t.includes("revolution")) return BOSSES.democracy_power;
  if (t.includes("danmark") || t.includes("denmark")) return BOSSES.denmark;
  return BOSSES.default;
}

export function normalizeLiveQuestion(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.step === "no_questions") return { step: "no_questions" };
  const content = parsed.content;
  if (!content || typeof content.question !== "string" || content.question.trim().length === 0) return null;
  const formatRaw = String(parsed.answer_format ?? "mc").toLowerCase();
  let format = "mc";
  if (formatRaw.includes("number")) format = "number";
  else if (formatRaw.includes("text") || content.force_text === true) format = "text";
  const options = Array.isArray(content.options)
    ? content.options.filter((o) => typeof o === "string" && o.length > 0)
    : [];
  const domain = (parsed.metadata && typeof parsed.metadata.domain === "string")
    ? parsed.metadata.domain
    : "";
  const instanceId = parsed.question_instance_id ?? null;
  return {
    id: instanceId,
    live: true,
    instanceId,
    format,
    topic: domain || "Gåden",
    prompt: content.question,
    options,
    correct: typeof content.correct === "string" ? content.correct : null,
  };
}

export function raidVerdict(hits, total) {
  const t = Number(total);
  const h = Number(hits);
  const safeT = Number.isFinite(t) && t > 0 ? t : 0;
  const safeH = Number.isFinite(h) && h > 0 ? h : 0;
  if (safeT <= 0) {
    return { id: "empty", title: "Gåden venter", line: "Der er ingen slag i dag." };
  }
  if (safeH >= safeT) {
    return { id: "open", title: "Gåden åbner sig", line: "Du ramte hver eneste kerne." };
  }
  if (safeH >= Math.ceil(safeT * 0.7)) {
    return { id: "yield", title: "Gåden viger", line: "Den husker dig." };
  }
  if (safeH >= Math.ceil(safeT * 0.4)) {
    return { id: "stand", title: "Du holdt stand", line: "Næste raid er din." };
  }
  return { id: "wait", title: "Gåden venter", line: "Den går ingen steder." };
}
