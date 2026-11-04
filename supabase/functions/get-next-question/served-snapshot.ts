// L1 K1 — the SERVER-DELIVERED version of each round (migration 20261103110000, owner decision 2,
// 2026-11-03).
//
// The database owns the snapshot (question_instances.served_snapshot, trigger
// question_instances_served_snapshot). get-next-question's part is to make the response and the snapshot
// the SAME version:
//   * a new instance: get-next-question proposes exactly the row it builds the response from (content,
//     metadata, answer_format, answer_type). The trigger locks the question row and refuses the insert
//     (40001) unless the proposal equals it, so a concurrent edit can never sit between the response and
//     the recorded version; a refused insert is handled like any other failed candidate (next one);
//   * an open round served again (a reload) and a reopened repeat: the response is built FROM the
//     instance's snapshot, never from the current question row, so a later edit does not change what a
//     round delivers;
//   * an instance without a snapshot (opened before K1 or without a proposal) is served as before from
//     the question row; its version stays unknown (NULL) — never guessed.
// "Delivered" is what the server sent; whether the pupil SAW it needs the client's confirmation (K9).
// Nothing here ever reaches the response: toPublicQuestion strips the key and internal fields.
//
// Switched by the Edge secret K1_SERVED_SNAPSHOT: exactly "on" enables it; anything else (unset) keeps
// today's behaviour. It is turned on only after 20261103110000 is applied (separate owner authorisation);
// before that the columns do not exist.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite imports exactly this file.

export const SERVED_SNAPSHOT_ENV = "K1_SERVED_SNAPSHOT";

export function servedSnapshotEnabled(value: string | undefined | null): boolean {
  return value === "on";
}

export type DeliveryRow = {
  content: unknown;
  metadata?: unknown;
  answer_format?: string | null;
  answer_type?: string | null;
};

// The proposal for a new instance: exactly the fields the response is built from. Absent fields are sent
// as null (the trigger compares JSON null with SQL NULL as equal), never omitted.
export function deliveryProposal(q: DeliveryRow): Record<string, unknown> {
  return {
    content: q.content,
    metadata: q.metadata ?? null,
    answer_format: q.answer_format ?? null,
    answer_type: q.answer_type ?? null,
  };
}

export type DeliveredQuestion = {
  content: unknown;
  metadata: unknown;
  answer_format: string | null;
  answer_type: string | null;
  key: unknown;
};

// The delivered version stored on an instance, or null when the instance has none (unknown version).
// A snapshot that is present but malformed is a server fault: it throws, never falls back.
export function deliveredQuestion(snapshot: unknown): DeliveredQuestion | null {
  if (snapshot === null || snapshot === undefined) return null;
  if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("served_snapshot is not an object");
  }
  const s = snapshot as Record<string, unknown>;
  if (!("content" in s) || s.content === null || typeof s.content !== "object") {
    throw new Error("served_snapshot has no content");
  }
  const text = (v: unknown, name: string): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") throw new Error(`served_snapshot.${name} is not text`);
    return v;
  };
  return {
    content: s.content,
    metadata: s.metadata ?? null,
    answer_format: text(s.answer_format, "answer_format"),
    answer_type: text(s.answer_type, "answer_type"),
    key: s.correct_answer ?? null,
  };
}

// The instance columns the due and repeat reads select: served_snapshot only when the switch is on (the
// column does not exist before 20261103110000).
export function instanceColumns(enabled: boolean): string {
  return enabled ? "id, repeat_count, served_snapshot" : "id, repeat_count";
}
