# 157N/157O/157P — Read-Aloud (TTS): Decision + Implementation

Status: **157P built — cached Azure Neural voice, awaiting owner approval after the real Edge/Chrome audio test (2026-10-19); not merged or deployed.** Until 157P ships, production runs 157O (Web Speech, `52e7a04`; per-MC-option 🔊 `eb6d5fc`; player `74f741b`). **§7 supersedes the 157N strategy and the §6 parked option** — read §7 first.
Date: 2026-06-30 (built) · 2026-07-03 (activated). Owner: project owner (solo). Gate: **SOFT** (built, now live).
Service: `js/read-aloud/`. Wiring: `app.js`. Builds on the `js/audio.js` graceful-playback pattern.
Rules: [AI_GUIDELINES.md](./AI_GUIDELINES.md) (privacy), [PROJECT_VISION.md](./PROJECT_VISION.md) (accessibility).

---

## 1. 157N — Strategy decision (SUPERSEDED by §7, 2026-10-19)

**Decided: pre-generated Piper clips as the primary path, with an on-device Web Speech fallback —
no live TTS service.** Rationale (from the 157A audit): a live TTS server is unreachable from the
hosted frontend and adds cost/ops; pre-generated clips give consistent Danish quality and are served
as first-party static assets; Web Speech (`speechSynthesis`) is a zero-cost, on-device fallback so the
feature works **before** clips exist. **No audio is uploaded anywhere; no third-party service.**

## 2. 157O — What was built (`js/read-aloud/`)

A provider-abstracted read-aloud service (consistent with the OCR/AI layers), **live in prod**
(`ENABLE_READ_ALOUD=true`, `52e7a04`), fail-soft, zero-cost:

| File | Role |
|---|---|
| `provider.js` | `ReadAloudProvider` contract + `assertReadAloudProvider()`. App depends only on this. |
| `manifest.js` | `clipPathFor(clipKey)` (empty by default) + `hashKey(text)` (stable djb2 key). |
| `provider-prerecorded.js` | **Primary** — plays a Piper clip (via `Audio`) when one exists; else returns false. |
| `provider-webspeech.js` | **Fallback** — browser `speechSynthesis` (`da-DK`); speed, device-voice selection, pause/resume and word boundaries where supported. |
| `index.js` | `createReadAloud()` facade → availability, speak/stop/pause/resume and device voices. Order: prerecorded → web speech. |
| `adapters/quiz.js` | `attachReadAloudControl(container, text)` — prompt player with visual reading track. Plus `attachOptionReadAloudControl(row, text)` — per-MC-option "🔊" button (reads one option). Both no-op when disabled. |

### Player upgrade (2026-10-18)

The prompt control is now a compact reading player shared by quiz, placement and every text-based
student task:

- play/pause/resume and "Forfra";
- speed choices 0.75×, normal, 1.25× and 1.5×;
- ~~a list of the Danish voices actually available on the device~~ — removed in 157P (§7): one fixed voice;
- speed and voice saved locally on that device (no profile data or database write);
- word highlighting driven by browser boundary events; speech still works without highlighting in
  browsers that do not emit them;
- visible status, keyboard focus, 44 px controls, responsive wrapping and reduced-motion support.

The provider contract remains the single integration boundary. (157O added no paid service; 157P
adds the cached Azure provider — §7.) `css/read-aloud.css` is included on all student
surfaces that use the shared adapter.

**Support rule.** Controls render only when the facade's `canSpeak(text)` is true, i.e. at least
one provider can voice *that* text. Web Speech can voice any text once the browser supports it; the
pre-recorded provider counts as supported only when the manifest ships at least one clip, and can
voice a text only when a clip exists for its `hashKey`. With no Web Speech and no matching clip the
prompt stays plain text, no 🔊 is added, and the quiz is unaffected. A future provider (e.g. a paid
cloud voice) joins by implementing the optional `canSpeak(req)` in `provider.js` — no UI change.

**Wiring:** every text-based student task uses this adapter, not a second speaker.
`app.js` calls `attachReadAloudControl(questionElement, question.content.question)` right
after the question text is set, including the placement round. For **MC** questions each option renders as a row `[answer button][🔊]`
and `app.js` calls `attachOptionReadAloudControl(row, option)` — the 🔊 is a **separate sibling** of the
answer button (never nested; `stopPropagation`/`preventDefault`), so it reads only that option and can
never submit the answer (commit `eb6d5fc`, 2026-07-03). Only MC gets per-option 🔊; text/number/open
formats do not. **Layout** (`index.html`, `#options .option-row` flex row): the answer button fills the
row and wraps long text; the 🔊 is a fixed **52×52** square (≥44px tap target), `align-items: center` so
it stays a compact square vertically centered beside the answer regardless of its height (commit
`89b4cec`, 2026-07-04). All of it is inert when `ENABLE_READ_ALOUD` is off (no button, no audio, no change).

## 3. The Piper clips (offline deliverable)

The actual audio is produced **offline by Piper** (a content task — not generated in-app, like the
avatar art). Convention: name each clip `hashKey(questionText)` and add it to `manifest.js` →
`/assets/avatar/...` ❌ → `/assets/audio/readaloud/<key>.mp3`. The frontend and pipeline agree on keys
with no per-question wiring. Until clips exist, the pre-recorded provider returns "no clip" and the
service falls back to Web Speech. Immutable, versioned filenames (long cache); never mutate a shipped clip.

## 4. Validation

### A. Verified now (default-off)
| # | Check | Method | Result |
|---|---|---|---|
| A1 | All 6 read-aloud files + `app.js` valid ESM | `node --check` | ✅ Pass |
| A2 | Default-off → no control, no audio | `attachReadAloudControl` no-ops when `isAvailable()` false | ✅ Pass (review) |
| A3 | Strict provider abstraction | app imports only the facade/adapter; `assertReadAloudProvider` guards the contract | ✅ Pass (review) |
| A4 | Fallback order | facade tries prerecorded → web speech; first to produce audio wins | ✅ Pass (review) |
| A5 | No upload / on-device | Web Speech is on-device; clips are first-party static assets | ✅ Pass (review) |
| A6 | Fail-soft | every path try/catch; `speak` returns false on failure; adapter swallows errors | ✅ Pass (review) |
| A7 | Quiz render unchanged | production smoke green (button absent with flag off) | ✅ Pass |

### B. Activation acceptance test (browser, flag on)
Set `ENABLE_READ_ALOUD=true`, serve/deploy a preview:
- B1 "🔊 Læs op" appears on questions.
- B2 with no clips → Web Speech reads the question (`da-DK`) on supported browsers.
- B3 add a Piper clip + manifest entry for a question → that clip plays instead of Web Speech.
- B4 click while speaking → stops; no overlap.
- B5 unsupported browser + no clip → button absent (or no audio), quiz unaffected.
- B6 flag off → no button, no audio.

## 5. Scope / non-goals

- **No Piper clips produced here** (offline content task).
- **No live TTS service** (decided against).
- **Activated (Web Speech)** — the flag is `true` in prod (`52e7a04`, 2026-07-03); Web Speech works
  immediately and a Danish (`da-DK`) voice is preferred when available (fail-soft to the default voice).
  Among the device's Danish voices the **most natural** one is chosen (2026-10-02): Edge neural
  "Natural" (Christel/Jeppe) > Apple "Premium" > Apple "Enhanced" > Chrome "Google dansk" > anything
  else; ties keep the browser's list order. Before this, the first Danish voice in the list won,
  which on Windows was often the robotic "Microsoft Helle". Note: Edge "Online (Natural)" and
  "Google" voices are synthesised by the browser vendor's cloud (the browser sends the question
  text; no student data, nothing from our code). Tests: `tests/unit/read-aloud-voice-choice.test.mjs`.
  The voice list is requested when the provider is created (i.e. when the 🔊 button renders),
  because Chrome only starts loading voices on the first `getVoices()` call and returns `[]`
  until then — otherwise the first click on a page fell back to the default voice.
- **Danish/English switching (English subject, 2026-10-02).** English questions mix both
  languages ("Hvad betyder 'sun'?", options like "mum og dad"). `js/read-aloud/lang-segments.js`
  splits the text into language runs (`da-DK` / `en-GB`); Web Speech queues one utterance per run,
  each with the most natural voice of its language (English falls back to any `en*` voice, never
  to a Danish one). Only when the quiz passes `{ subject: "engelsk" }` (question: `segmentQuestion`;
  MC option: `segmentOption` with the question and all options) — every other subject is read in
  Danish exactly as before. Rule-based and deterministic (no network/model): quotes, apostrophes,
  "på engelsk"/"betyder" frames, small DA/EN word lists, æ/ø/å and contractions; one-word options
  keep their group's language (false friends like "kylling", "leg"); punctuation never becomes a
  run of its own. Checked by hand against all 1,090 English questions; a wrong guess only changes
  the voice. Tests: `tests/unit/read-aloud-lang-segments.test.mjs` (incl. a no-text-lost invariant
  over the whole English corpus). New question patterns may need a word-list/frame rule here.
  Piper clips remain a future quality upgrade; adding them needs no further activation.
- The full player is reserved for prompts; MC options deliberately keep the compact one-tap button.
- **Rule:** any new text-based student task (question, option, prompt) gets
  `attachReadAloudControl` on the prompt and `attachOptionReadAloudControl` on each
  multiple-choice option. The 🔊 stays a sibling of the answer control, so it can never submit.
  Call `stopReadAloud()` when the task moves to the next text. No new TTS service.

## 6. Parked option — pre-generated neural clips (owner decision 2026-10-02)

**Status: STARTED as 157P (§7, owner decision 2026-10-19)** — originally parked. Kept as the candidate fix if on-device voices prove
too weak for the pilot.

**Why it came up (measured 2026-10-02, owner's own machine):**
- Chrome on Windows exposes only one Danish voice, *Microsoft Helle* (old, robotic); there is no
  "Google dansk" on desktop Chrome. English sounds fluent (Google UK English, cloud voice).
- The Danish→English switch has an audible pause (~0.5 s measured before the Google voice starts;
  cloud fetch per utterance, inside the browser — not fixable in our code).
- **Edge** (neural Christel/Jeppe + neural English) sounds much better and its switch pause is
  acceptable — owner verdict: good enough for now. Chromebooks/iPads still depend on their own voices.

**The option:** produce the read-aloud audio offline with a neural TTS voice and serve it as static
clips through the existing pre-recorded provider (`manifest.js`, key = `hashKey(text)`). A
multilingual neural voice can read a mixed Danish/English sentence as **one** clip — no switch pause,
same quality on every device. Web Speech stays the fallback.

**Before it can start (owner gates):**
1. Owner approval to send question text (never student data) once to an external TTS service
   (e.g. Azure) — this changes the 157N decision ("no third-party service") and must be recorded.
2. Scope analysis first: number of questions + options, total size vs Cloudflare static-asset
   limits, cost vs free quotas, and whether a voice reads Danish *and* English naturally in one clip.

## 7. 157P — One voice in every browser: cached Azure Neural (owner decision 2026-10-19)

**Why.** Web Speech plays whatever voice the device has: neural Christel in Edge, robotic
*Microsoft Helle* in Chrome on Windows, something else on iPad. The owner did not accept that
difference. **Decision:** every supported browser plays the **same Microsoft Neural voice from the
same cached file**. This replaces the 157N "no third-party service" rule and starts the §6 option:
question and answer text (never pupil data) is sent once to Azure Speech.

**Voices.** `da-DK-ChristelNeural` (default, Danish) and `en-GB-SoniaNeural` (English runs in the
English subject). Defined once in `TTS_VOICES` (`js/read-aloud/tts-key.js`).

### Architecture

```
browser (provider-azure.js)                 Cloudflare Worker (worker/)                 Azure Speech
 key = SHA-256(canonical request)
 GET /tts/v1/<key>.json ── hit ──────────▶ R2 laerlig-readaloud ─▶ metadata + word timings
   │ 404                                       (immutable, public, 1-year cache)
   ▼
 POST /api/tts {segments} + user JWT ────▶ verify Supabase JWT (ES256, JWKS)
                                           R2 hit? → return it (no limit, no Azure)
                                           rate limit (per user 20/min, global 60/min)
                                           Durable Object per key (single flight) ──▶ WebSocket TTS
                                           write MP3, then metadata (commit marker)  ◀── MP3 + WordBoundary
 <audio src=/tts/v1/<key>.mp3>  ◀── Range/206 from R2 (Safari)
```

- **Provider order:** `provider-azure.js` is the first and only production provider. The provider
  contract (`provider.js`) is unchanged, so another provider can still be added without UI change.
- **No silent fallback.** If the clip cannot be fetched or synthesised (network, Azure error,
  timeouts: metadata 8 s, synthesis 25 s, playback start 12 s) the player shows
  "Oplæsningen kunne ikke hentes lige nu. Prøv igen om lidt." and the option 🔊 dims. Web Speech
  stays in the code only behind `ENABLE_WEBSPEECH_DEV_FALLBACK` (`js/read-aloud/index.js`, `false`
  in Git) for offline development.
- **No voice picker.** The voice select is removed; only the speed (0,75×–1,5×) remains a local
  preference (`dsj_read_aloud_rate`).
- **Word highlighting** uses Azure's `WordBoundary` events, collected during synthesis and stored in
  the clip metadata (`words: [{w, t, d}]`, milliseconds of audio). The browser maps each word onto
  the shown text in order and highlights from the audio element's own media clock (`currentTime`).
  That clock already runs 1,5× or 0,75× with `playbackRate`, so the timings are scaled correctly at
  every speed and across pause/resume without re-synthesis (`wordIndexAt`, `wallClockMs`).
- **Pause, fortsæt, "Forfra", stop on next question and per-option 🔊** behave as in 157O; "Forfra"
  reuses the in-memory metadata and the browser's HTTP cache.

### Storage and the cache key

- **R2 bucket `laerlig-readaloud`**, binding `TTS_BUCKET`. Objects `tts/v<N>/<sha256>.mp3`
  (`audio/mpeg`, 24 kHz 48 kbit/s mono) and `tts/v<N>/<sha256>.json` (key, audio path, runs,
  voices, text, word timings, bytes, createdAt). Served by the Worker at the same path on lærlig.dk
  with `Cache-Control: public, max-age=31536000, immutable`; a missing clip is `404 no-store`.
- **Key** = SHA-256 of `{v: TTS_CACHE_VERSION, format, segments: [[lang, voice, text]…]}` where
  text is NFC-normalised with whitespace collapsed and same-language neighbours merged. The browser,
  the Worker and the generator import the same function, so Edge and Chrome request the **same URL**
  and receive the **same bytes**. The Worker recomputes the key itself; it never trusts a client key.
- **Invalidation.** A shipped clip is never overwritten. Edited text → new key → new clip on the
  next play. Another voice or format → new key automatically. To re-voice everything (e.g. a better
  voice model), bump `TTS_CACHE_VERSION`: all URLs move to `/tts/v<N+1>/` and the generator fills
  them; old objects can then be deleted from R2 by prefix.

### Cost control and safety

- Azure key: Worker secret `AZURE_SPEECH_KEY` (+ `AZURE_SPEECH_REGION`). Sent only from the Worker
  to Azure as a request header; never in Git, a response, a log line, a URL or the browser bundle.
- `POST /api/tts` requires a Supabase access token (or the generator's `TTS_ADMIN_TOKEN`), accepts
  only `{text}` / `{segments:[{text, lang}]}` (any other field → 400), `da-DK`/`en-GB` only, at most
  800 characters and 24 runs, body ≤ 16 KB, same-origin. Only the token's `sub` is used, as the
  rate-limit key; nothing about the user reaches Azure.
- **Single flight:** every miss for one key is routed to one Durable Object (`TtsClipCoordinator`,
  `idFromName(key)`); concurrent requests share one Azure call and one write.
- Logs are key-free: `tts_clip_created {key, chars, bytes}` and `tts_clip_failed {code}`.

### New and changed texts — the generator

```
node --env-file=.env tools/read-aloud/generate-clips.mjs --dry-run           # count only
TTS_ADMIN_TOKEN=… node --env-file=.env tools/read-aloud/generate-clips.mjs   # fill production
```

It reads the active questions (service role, `.env`) and the six game introductions, builds the
same requests as the quiz adapter (English language runs via `lang-segments.js`), and asks the
Worker only for clips whose metadata does not exist yet (one `HEAD` per clip). Run it after
importing or editing questions; until then a missing clip is generated once, on its first play.
`--base http://127.0.0.1:8787` targets `wrangler dev`; `--limit N`, `--concurrency N` (default 2,
keeps inside Azure's request quota; 429/5xx are retried with back-off).

**Volume (2026-10-19 dry run):** 2.101 active questions → 10.503 texts → **9.221 unique clips,
585.768 characters**. One-time fill ≈ 0,59 M Neural characters; afterwards only new or edited
texts cost anything. Azure's free F0 tier covers 0,5 M Neural characters per month (the fill then
spans two months), or it is one small S0 bill at the per-million list price. R2 storage for ~9.200
short MP3s is far inside the free 10 GB, and reads through the Worker are not billed as egress.

### Configuration (owner)

1. Azure Speech resource (F0 or S0), e.g. region `northeurope`.
2. `npx wrangler r2 bucket create laerlig-readaloud`
3. `npx wrangler secret put AZURE_SPEECH_KEY`, `… AZURE_SPEECH_REGION`, `… TTS_ADMIN_TOKEN`
   (≥ 32 random characters; the generator uses the same value).
4. Merge → Cloudflare deploys the script, the Durable Object migration (`v1-tts-clip`) and the rate
   limiters together with the assets.
5. Run the generator against production.

Local: `.dev.vars` (gitignored) with the same three names, `npm run build:cloudflare`, then
`npx wrangler dev` — R2, the Durable Object and the rate limiters run locally; Azure is real.

### Tests

`tests/unit/read-aloud-azure.test.mjs`: clip identity, input validation, cache hit/miss, 12
concurrent requests → 1 Azure call, Azure error/timeout → nothing stored, WebSocket protocol
(audio + WordBoundary, timeout, early close), Supabase JWT (valid/expired/foreign/tampered/HS256),
admin token, HTTP surface (404 no-store, Range 206, 401/400/403/405/413/429/503/504), provider
(hit, miss, error, timeout, stop-while-loading, timing at 0,75× and 1,5×).
`tests/unit/read-aloud-player.test.mjs`: production never uses Web Speech.
