/**
 * Pure helpers for the save/load UI (phase 5): what a slot shows, which slot
 * "Fortsæt" on the title screen continues, and the player's scene of a save
 * (preloaded before the save is loaded). Saves are read defensively: the
 * engine validates them on load; these helpers only pick out display fields.
 */

import type { LoadedContent } from "@adventure-engine/content";
import { parseSave } from "@adventure-engine/core";
import type { SlotStatus, WriteResult } from "@adventure-engine/save";

export interface SlotInfo {
  readonly slot: string;
  readonly state: "ok" | "empty" | "corrupt";
  /** ISO time of a valid save. */
  readonly savedAt: string | null;
  readonly playTimeMs: number | null;
  /** A damaged slot with a valid `.bak`. */
  readonly backup: boolean;
  /** Why a slot is not "ok": damaged bytes, or an intact save this content cannot load. */
  readonly reason: "damaged" | "unloadable" | null;
}

const record = (raw: string): Record<string, unknown> | null => {
  try {
    const d: unknown = JSON.parse(raw);
    return typeof d === "object" && d !== null && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export function slotInfo(slot: string, status: SlotStatus): SlotInfo {
  if (status.state === "empty") return { slot, state: "empty", savedAt: null, playTimeMs: null, backup: false, reason: null };
  if (status.state === "corrupt") return { slot, state: "corrupt", savedAt: null, playTimeMs: null, backup: status.backup !== null, reason: status.reason };
  const d = record(status.raw);
  const savedAt = d?.["savedAt"];
  const play = d?.["playTimeMs"];
  return {
    slot,
    state: "ok",
    savedAt: typeof savedAt === "string" ? savedAt : null,
    playTimeMs: typeof play === "number" && Number.isFinite(play) && play >= 0 ? play : null,
    backup: false,
    reason: null,
  };
}

/**
 * Status text of a slot that is not "ok": why, and that a backup can be
 * restored when there is one (so the choice is visible before the click).
 */
export function corruptStatus(row: { readonly reason: SlotInfo["reason"]; readonly backup: boolean }, t: (key: string) => string): string {
  const what = t(row.reason === "unloadable" ? "ui.unloadable" : "ui.corrupt");
  return row.backup ? `${what} – ${t("ui.backup_available")}` : what;
}

/**
 * Whether the running content can load a save (follow-up: slot status): the
 * same validation and migration as a real load, without touching the game. A
 * slot is only "ok" when this holds; the slot manager caches the verdict.
 */
export function saveLoadable(content: LoadedContent, devBuild: boolean): (raw: string) => boolean {
  return (raw) => parseSave(raw, content, { allowChecksumMismatch: devBuild }).ok;
}

/** What a finished slot write shows: data-last-save, and the notice (if any). */
export interface WriteFeedback {
  /** "<slot>:<seq>" once the write is confirmed in the store, "<slot>:failed" otherwise. */
  readonly lastSave: string;
  /** "saved" ("Gemt") only after a confirmed write; "failed" with a reason otherwise. */
  readonly notice: { readonly kind: "saved" } | { readonly kind: "failed"; readonly reason: string } | null;
}

/**
 * Feedback for one slot write (review M7, follow-up F5): "Gemt" and
 * data-last-save "<slot>:<seq>" only once this write's own commit is
 * confirmed. A refused write or a failed commit shows the failure instead.
 */
export async function writeFeedback(slot: string, result: WriteResult, seq: number, announce: boolean): Promise<WriteFeedback> {
  if (!result.ok) return { lastSave: `${slot}:failed`, notice: { kind: "failed", reason: result.message } };
  if (!(await result.committed)) return { lastSave: `${slot}:failed`, notice: { kind: "failed", reason: "storage" } };
  return { lastSave: `${slot}:${seq}`, notice: announce ? { kind: "saved" } : null };
}

/**
 * Save status in call order (follow-up review): every operation takes a ticket when it starts, and its
 * result may update the shared status (`data-last-save`, "Gemt") only if no newer operation's result was
 * shown already. A failure is always reported by its own notice.
 */
export function statusOrder(): { ticket(): number; isLatest(ticket: number): boolean } {
  let issued = 0;
  let shown = 0;
  return {
    ticket: () => ++issued,
    isLatest: (ticket) => {
      if (ticket < shown) return false;
      shown = ticket;
      return true;
    },
  };
}

/**
 * What "Fortsæt" does (TS-A03): the valid slot saved last (ISO times compare
 * as text; on a tie the earlier slot in the list wins), else the first damaged
 * slot that offers its backup, else nothing (the button is not shown).
 */
export function continueChoice(infos: readonly SlotInfo[]): { readonly slot: string; readonly fromBackup: boolean } | null {
  let best: SlotInfo | null = null;
  for (const i of infos) {
    if (i.state !== "ok") continue;
    if (best === null || (i.savedAt ?? "") > (best.savedAt ?? "")) best = i;
  }
  if (best !== null) return { slot: best.slot, fromBackup: false };
  const bak = infos.find((i) => i.state === "corrupt" && i.backup);
  return bak === undefined ? null : { slot: bak.slot, fromBackup: true };
}

/** Play time as h:mm:ss (or m:ss under an hour). */
export function formatPlayTime(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The player's scene in a save text, or null when it cannot be read. */
export function savePlayerScene(raw: string): string | null {
  const d = record(raw);
  const player = d?.["playerId"];
  const actors = d?.["actors"];
  if (typeof player !== "string" || !Array.isArray(actors)) return null;
  for (const a of actors as unknown[]) {
    if (typeof a !== "object" || a === null) continue;
    const r = a as Record<string, unknown>;
    if (r["id"] === player) return typeof r["scene"] === "string" ? r["scene"] : null;
  }
  return null;
}
