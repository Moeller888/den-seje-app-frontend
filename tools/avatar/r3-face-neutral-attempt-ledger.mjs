// R3 face-neutral — the attempt ledger: D-159's three accounting axes, derived from what is on disk.
//
// PURE. This module imports nothing, reads no file, no environment and no claim, and cannot reach the network. The
// send adapter (openai-send-r3-face-neutral-d160.mjs) writes the records; this module only formats one record and
// derives the axes from (a) whether the one-shot claim file exists and (b) the lines of the attempt's event log.
//
// D-159 laterAttemptRules.callCounting, implemented exactly:
//   claimState  unconsumed | consumed      — a consumed claim proves only that the claim was written, never a dispatch.
//   dispatch    not-started | undetermined | started
//                 started      a VALID dispatch record exists. It is written immediately before the request is handed to
//                              the network client; it is NOT confirmation that the server received anything.
//                 not-started  a VALID stop record exists and no valid dispatch record does (a documented stop).
//                 undetermined the claim exists, and there is neither a valid stop nor a valid dispatch record (a crash in
//                              the window between the claim and the dispatch record, or a damaged log). Counted neither
//                              as sent nor as not sent.
//   result      none | unknown | http-error | response
//                 Only a VALID answer record (an HTTP status that was actually received) documents a server answer.
//                 An unknown result never turns a documented dispatch into an undetermined one.
//   Every consumed claim excludes automatic retry.
//
// The derivation claims no knowledge the log does not give: a line that does not parse completely, or that is not a
// well-formed record for this call, counts as no evidence at all. An answer without a dispatch record is an
// inconsistent log; it is reported as such and the dispatch is then UNDETERMINED, never silently "started".

export const LEDGER_VERSION = 1;
export const EVENTS = Object.freeze(["dispatch", "stop", "answer", "transport-error"]);
export const DISPATCH = Object.freeze(["not-started", "undetermined", "started"]);
export const RESULT = Object.freeze(["none", "unknown", "http-error", "response"]);

/** One event record as a single JSON line (LF-terminated). Throws on anything that is not a well-formed record. */
export function formatEvent(callId, seq, event, fields = {}) {
  if (typeof callId !== "string" || callId === "") throw new Error("ledger: callId is required");
  if (!Number.isInteger(seq) || seq < 1) throw new Error("ledger: seq must be a positive integer");
  if (!EVENTS.includes(event)) throw new Error("ledger: unknown event " + JSON.stringify(event));
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) throw new Error("ledger: fields must be an object");
  for (const k of ["v", "callId", "seq", "event"]) if (k in fields) throw new Error("ledger: field " + k + " is reserved");
  if (event === "answer" && !Number.isInteger(fields.httpStatus)) throw new Error("ledger: an answer record needs an integer httpStatus");
  return JSON.stringify({ v: LEDGER_VERSION, callId, seq, event, ...fields }) + "\n";
}

/** Parses the log text. Only complete, well-formed records for this call id count; everything else is listed as damage. */
export function parseEvents(text, callId) {
  const records = [], damaged = [];
  if (typeof text !== "string" || text === "") return { records, damaged };
  const lines = text.split("\n");
  const last = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") continue;
    if (i === last) { damaged.push({ line: i + 1, why: "no terminating newline (torn write)" }); continue; }
    let r;
    try { r = JSON.parse(line); } catch (_) { damaged.push({ line: i + 1, why: "not JSON" }); continue; }
    if (r === null || typeof r !== "object" || Array.isArray(r) || r.v !== LEDGER_VERSION || r.callId !== callId
      || !Number.isInteger(r.seq) || r.seq < 1 || !EVENTS.includes(r.event) || (r.event === "answer" && !Number.isInteger(r.httpStatus))) {
      damaged.push({ line: i + 1, why: "not a well-formed record for " + callId });
      continue;
    }
    records.push(r);
  }
  return { records, damaged };
}

/**
 * The three axes and the counter contributions of ONE attempt.
 * @param {{claimPresent: boolean, eventsText: string|null, callId: string}} input
 */
export function deriveAttempt({ claimPresent, eventsText, callId }) {
  if (typeof claimPresent !== "boolean") throw new Error("ledger: claimPresent must be a boolean");
  const { records, damaged } = parseEvents(eventsText === null || eventsText === undefined ? "" : eventsText, callId);
  const has = (e) => records.some((r) => r.event === e);
  const answer = records.find((r) => r.event === "answer") || null;
  const seqs = records.map((r) => r.seq);
  const notes = [];
  let consistent = new Set(seqs).size === seqs.length && seqs.every((s, k) => k === 0 || s > seqs[k - 1]);
  if (!consistent) notes.push("record sequence numbers are not strictly increasing");
  if (records.length > 0 && !claimPresent) { consistent = false; notes.push("event records exist but the claim does not"); }
  if (answer && !has("dispatch")) { consistent = false; notes.push("an answer record exists without a dispatch record"); }
  if (has("dispatch") && has("stop")) { consistent = false; notes.push("both a dispatch and a stop record exist"); }
  if (records.filter((r) => r.event === "dispatch").length > 1 || records.filter((r) => r.event === "answer").length > 1) {
    consistent = false; notes.push("more than one dispatch or answer record");
  }

  const claimState = claimPresent ? "consumed" : "unconsumed";
  let dispatch, result;
  if (!consistent && claimPresent) { dispatch = "undetermined"; result = "unknown"; }
  else if (!claimPresent) { dispatch = "not-started"; result = "none"; }
  else if (has("dispatch")) {
    dispatch = "started";
    result = answer ? (answer.httpStatus >= 200 && answer.httpStatus < 300 ? "response" : "http-error") : "unknown";
  } else if (has("stop")) { dispatch = "not-started"; result = "none"; }
  else { dispatch = "undetermined"; result = "unknown"; }

  return {
    claimState, dispatch, result,
    actuallySent: dispatch === "started" ? 1 : 0,
    dispatchUndetermined: dispatch === "undetermined" ? 1 : 0,
    serverAnswered: result === "response" || result === "http-error",
    automaticRetry: false,
    logConsistent: consistent, damagedLines: damaged, notes,
  };
}
