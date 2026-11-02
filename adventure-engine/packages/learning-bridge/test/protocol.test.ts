import { describe, expect, it } from "vitest";
import { PROTOCOL, helloProtocols, messageBytes, parseAction, parseHostMessage } from "../src/protocol.ts";

const present = {
  protocol: PROTOCOL, type: "task.present", nonce: "n1", requestId: "q1", instanceToken: "t1", kind: "choice",
  stimulus: { prompt: "Hvilken kilde?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
  mode: "check", hintsAvailable: 2, contextKey: "arkivskab",
};

describe("bridge/2 protocol — the game validates host messages strictly too", () => {
  it("accepts a well-formed task.present", () => {
    expect(parseHostMessage(present).ok).toBe(true);
  });

  it("rejects an answer key smuggled into a stimulus, or any unknown field", () => {
    expect(parseHostMessage({ ...present, correct: "a" }).ok).toBe(false);
    expect(parseHostMessage({ ...present, stimulus: { ...present.stimulus, answer: "a" } }).ok).toBe(false);
    expect(parseHostMessage({ ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A", correct: true }, { id: "b", label: "B" }] } }).ok).toBe(false);
  });

  it("rejects duplicate option ids, too few options, wrong modes and hint counts", () => {
    expect(parseHostMessage({ ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A" }, { id: "a", label: "B" }] } }).ok).toBe(false);
    expect(parseHostMessage({ ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A" }] } }).ok).toBe(false);
    expect(parseHostMessage({ ...present, mode: "mastered" }).ok).toBe(false);
    expect(parseHostMessage({ ...present, hintsAvailable: 4 }).ok).toBe(false);
    expect(parseHostMessage({ ...present, hintsAvailable: 1.5 }).ok).toBe(false);
  });

  it("validates init.openTask, task.result feedback and error codes", () => {
    const { protocol, type, nonce, requestId, ...body } = present;
    void type; void requestId;
    expect(parseHostMessage({ protocol, type: "init", msgId: "m", replyTo: "h", nonce, openTask: body }).ok).toBe(true);
    expect(parseHostMessage({ protocol, type: "init", msgId: "m", replyTo: "h", nonce, openTask: { ...body, extra: 1 } }).ok).toBe(false);
    const result = { protocol, type: "task.result", nonce, requestId: "q", instanceToken: "t", outcome: "correct", feedback: { text: null, correctAnswer: "A" }, evidence: "evidence", retryable: false };
    expect(parseHostMessage(result).ok).toBe(true);
    expect(parseHostMessage({ ...result, retryable: "no" }).ok).toBe(false);
    expect(parseHostMessage({ ...result, feedback: { text: 5, correctAnswer: null } }).ok).toBe(false);
    expect(parseHostMessage({ protocol, type: "error", nonce: null, requestId: null, code: "pwned" }).ok).toBe(false);
    expect(parseHostMessage({ protocol, type: "hint.show", nonce, requestId: "q", instanceToken: "t", level: 1, text: "Tip", hintsRemaining: 2 }).ok).toBe(true);
    expect(parseHostMessage({ protocol, type: "ack", nonce, requestId: "q", state: "done" }).ok).toBe(false);
    expect(parseHostMessage({ protocol, type: "teleport", nonce }).ok).toBe(false);
    expect(parseHostMessage({ protocol, nonce }).ok).toBe(false);
  });

  it("measures size as UTF-8 and treats unserialisable values as too large", () => {
    expect(messageBytes({ t: "æøå" })).toBe(JSON.stringify({ t: "æøå" }).length + 3);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(messageBytes(cyclic)).toBe(Number.POSITIVE_INFINITY);
    expect(messageBytes(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(parseHostMessage(cyclic).ok).toBe(false);
  });

  it("parseAction rejects unknown kinds and malformed payloads by throwing", () => {
    expect(() => parseAction({ kind: "grant", payload: {} })).toThrow();
    expect(() => parseAction({ kind: "order", payload: { order: ["a"] } })).toThrow();
    expect(() => parseAction({ kind: "short_text", payload: { text: "" } })).toThrow();
  });

  it("helloProtocols reads only what the version decision needs", () => {
    expect(helloProtocols({ type: "hello", supports: ["x/1", "y/2"] })).toEqual(["x/1", "y/2"]);
    expect(helloProtocols({ type: "hello", supports: [1] })).toBeNull();
    expect(helloProtocols({ type: "task.request" })).toBeNull();
    expect(helloProtocols(null)).toBeNull();
  });

  it("an option may carry a 'detail' description (D-310), but nothing else", () => {
    const withDetail = { ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A", detail: "Hvem: kongen. Hvornår: 1940." }, { id: "b", label: "B" }] } };
    expect(parseHostMessage(withDetail).ok).toBe(true);
    expect(parseHostMessage({ ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A", detail: 5 }, { id: "b", label: "B" }] } }).ok).toBe(false);
    expect(parseHostMessage({ ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A", detail: "x".repeat(401) }, { id: "b", label: "B" }] } }).ok).toBe(false);
    expect(parseHostMessage({ ...present, stimulus: { prompt: "x", options: [{ id: "a", label: "A", detail: "d", correct: true }, { id: "b", label: "B" }] } }).ok).toBe(false);
  });
});
