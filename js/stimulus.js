// Stimulus (F-07) — the material shown ABOVE a question: a source excerpt, an image or an audio clip.
// Server contract: supabase/functions/_shared/stimulus.ts (get-next-question sends only what it built
// from the whitelist there). The stimulus is separate from the answer form: the quiz renders the
// question's normal answer control under it, grading and rewards are unchanged.
//
// SAFETY: every text is set with textContent (never innerHTML), and a media `file` is a bare file name
// that is checked again here and loaded only from this site's own folder (`mediaBase`, default
// "assets/stimulus/"), so a stimulus can never load another host, a data: URL or a script.
//
// ACCESSIBILITY
//   * the whole stimulus is a <figure> with a heading-like label ("Kilde", "Billede", "Lyt"), so a screen
//     reader announces what kind of material it is;
//   * a source's text gets the quiz's read-aloud player (passed in as `attachReadAloud`, the same one the
//     question text uses), which pupils with reading difficulties already know;
//   * an image has its required alt text; a caption and the credit are visible text under it;
//   * an audio clip has native controls (keyboard operable) AND its required transcript behind a
//     "Vis teksten" disclosure (<details>), so a pupil who cannot hear it — or cannot play sound in class —
//     can read it instead;
//   * the credit (where the material comes from) is always visible.
//
// The document is injected so the module can be unit-tested without a browser.

export const STIMULUS_MEDIA_BASE = "assets/stimulus/";

export const STIMULUS_TEXT = Object.freeze({
  source: "Kilde",
  image: "Billede",
  audio: "Lyt",
  showTranscript: "Vis teksten",
  imageDescription: "Hør eller læs, hvad billedet viser",
  creditPrefix: "Kilde: ",
  audioUnsupported: "Din browser kan ikke afspille lyden. Åbn teksten herunder.",
});

const IMAGE_EXT = [".svg", ".png", ".webp"];
const AUDIO_EXT = [".wav"];
const FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const optional = (v) => v === undefined || typeof v === "string";
const fileOk = (f, exts) => typeof f === "string" && f.length <= 80 && FILE_NAME.test(f) && exts.some((e) => f.endsWith(e));

// The stimulus from a question payload: null when there is none, the stimulus when it keeps the
// contract, or { invalid: true } when it is present but broken — the caller then shows the quiz's visible
// error instead of a question whose material is missing.
export function readStimulus(content) {
  if (!isObject(content) || content.stimulus === undefined) return null;
  const s = content.stimulus;
  const bad = { invalid: true };
  if (!isObject(s)) return bad;
  const c = s.credit;
  if (!isObject(c) || !nonEmpty(c.source) || !optional(c.creator) || !optional(c.year) || !optional(c.license)) return bad;
  if (s.kind === "source") {
    if (!nonEmpty(s.text) || !optional(s.title)) return bad;
    return s;
  }
  if (s.kind === "image") {
    if (!fileOk(s.file, IMAGE_EXT) || !nonEmpty(s.alt) || !optional(s.caption)) return bad;
    return s;
  }
  if (s.kind === "audio") {
    if (!fileOk(s.file, AUDIO_EXT) || !nonEmpty(s.transcript) || !optional(s.title)) return bad;
    return s;
  }
  return bad;
}

// "Kilde: Danmarks Riges Grundlov · 1849 · Offentligt domæne" — the visible credit line.
export function creditLine(credit) {
  if (!isObject(credit) || !nonEmpty(credit.source)) return "";
  const parts = [credit.creator, credit.source, credit.year, credit.license].filter(nonEmpty).map((p) => p.trim());
  return STIMULUS_TEXT.creditPrefix + parts.join(" · ");
}

function el(doc, tag, className, textContent) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

// Builds the stimulus as a <figure>. `stimulus` must come from readStimulus (not invalid).
// Options: mediaBase (where media files live), attachReadAloud(element, text, context) and its context.
export function buildStimulus(doc, stimulus, { mediaBase = STIMULUS_MEDIA_BASE, attachReadAloud = null, readAloudContext = undefined } = {}) {
  if (!doc || typeof doc.createElement !== "function") throw new Error("buildStimulus: a document is required");
  if (!isObject(stimulus) || stimulus.invalid) throw new Error("buildStimulus: a valid stimulus is required");

  const figure = el(doc, "figure", `stimulus stimulus-kind-${stimulus.kind}`);
  figure.dataset.kind = stimulus.kind;
  const label = el(doc, "p", "stimulus-label", STIMULUS_TEXT[stimulus.kind]);
  label.id = "stimulus-label";
  figure.setAttribute("aria-labelledby", label.id);
  figure.appendChild(label);

  if (nonEmpty(stimulus.title)) figure.appendChild(el(doc, "p", "stimulus-title", stimulus.title.trim()));

  if (stimulus.kind === "source") {
    const body = el(doc, "blockquote", "stimulus-text", stimulus.text);
    body.id = "stimulus-text";
    figure.appendChild(body);
    if (typeof attachReadAloud === "function") {
      try { attachReadAloud(body, stimulus.text, readAloudContext); } catch (_e) { /* fail-soft: the text stays */ }
    }
  } else if (stimulus.kind === "image") {
    const img = el(doc, "img", "stimulus-image");
    img.setAttribute("src", mediaBase + stimulus.file);
    img.setAttribute("alt", stimulus.alt);
    img.setAttribute("decoding", "async");
    figure.appendChild(img);
    if (nonEmpty(stimulus.caption)) figure.appendChild(el(doc, "p", "stimulus-caption", stimulus.caption.trim()));
    // F-07 accessibility: the image's information (its alt text) as text a pupil can open and have read aloud —
    // the same pattern as the audio transcript. For pupils with dyslexia or low vision the picture's labels are
    // otherwise only readable on the image itself.
    const description = el(doc, "details", "stimulus-image-description");
    description.appendChild(el(doc, "summary", "", STIMULUS_TEXT.imageDescription));
    const descText = el(doc, "p", "stimulus-image-text", stimulus.alt.trim());
    descText.id = "stimulus-image-text";
    description.appendChild(descText);
    figure.appendChild(description);
    if (typeof attachReadAloud === "function") {
      const ctx = readAloudContext && typeof readAloudContext === "object" ? { ...readAloudContext, target: "image" } : { target: "image" };
      try { attachReadAloud(descText, stimulus.alt.trim(), ctx); } catch (_e) { /* fail-soft: the text stays */ }
    }
  } else if (stimulus.kind === "audio") {
    const audio = el(doc, "audio", "stimulus-audio", STIMULUS_TEXT.audioUnsupported);
    audio.setAttribute("controls", "");
    audio.setAttribute("preload", "none");
    audio.setAttribute("src", mediaBase + stimulus.file);
    audio.setAttribute("aria-label", nonEmpty(stimulus.title) ? `Lydklip: ${stimulus.title.trim()}` : "Lydklip");
    figure.appendChild(audio);
    const details = el(doc, "details", "stimulus-transcript");
    details.appendChild(el(doc, "summary", "", STIMULUS_TEXT.showTranscript));
    details.appendChild(el(doc, "p", "stimulus-transcript-text", stimulus.transcript));
    figure.appendChild(details);
  }

  figure.appendChild(el(doc, "figcaption", "stimulus-credit", creditLine(stimulus.credit)));
  return figure;
}
