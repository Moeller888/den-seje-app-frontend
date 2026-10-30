/**
 * Command-based undo/redo (phase 6, docs/decisions/phase-6.md §6).
 *
 * Every edit is a named command that turns the document into a new document
 * (the old one is never mutated, so unchanged parts are shared). The history
 * keeps the document before and after each command together with the
 * selection, so undo and redo restore exactly the state, references included.
 * It is deterministic, has a configurable limit and tracks the saved point
 * (dirty/clean). Preview runtime state is never part of the document.
 */

export interface Command<D, S> {
  readonly label: string;
  readonly before: D;
  readonly after: D;
  readonly selectionBefore: S;
  readonly selectionAfter: S;
}

export class History<D, S> {
  private doc_: D;
  private selection_: S;
  private readonly done: Command<D, S>[] = [];
  private readonly undone: Command<D, S>[] = [];
  /** Commands since the last save; null when the saved state can no longer be reached. */
  private savedAt: number | null = 0;
  readonly limit: number;

  constructor(doc: D, selection: S, limit = 200) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("history limit must be an integer >= 1");
    this.doc_ = doc;
    this.selection_ = selection;
    this.limit = limit;
  }

  get doc(): D {
    return this.doc_;
  }

  get selection(): S {
    return this.selection_;
  }

  /** Change the selection without an undo step. */
  select(selection: S): void {
    this.selection_ = selection;
  }

  /** Run a command. A command that returns the same document is not recorded. */
  apply(label: string, edit: (doc: D) => D, selectionAfter: S = this.selection_): boolean {
    const after = edit(this.doc_);
    if (after === this.doc_) {
      this.selection_ = selectionAfter;
      return false;
    }
    this.done.push({ label, before: this.doc_, after, selectionBefore: this.selection_, selectionAfter });
    if (this.savedAt !== null && this.savedAt > this.done.length - 1) this.savedAt = null;
    this.undone.length = 0;
    if (this.done.length > this.limit) {
      this.done.shift();
      if (this.savedAt !== null) this.savedAt = this.savedAt === 0 ? null : this.savedAt - 1;
    }
    this.doc_ = after;
    this.selection_ = selectionAfter;
    return true;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** Label of the command undo would revert. */
  get undoLabel(): string | null {
    return this.done[this.done.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.undone[this.undone.length - 1]?.label ?? null;
  }

  undo(): boolean {
    const c = this.done.pop();
    if (c === undefined) return false;
    this.undone.push(c);
    this.doc_ = c.before;
    this.selection_ = c.selectionBefore;
    return true;
  }

  redo(): boolean {
    const c = this.undone.pop();
    if (c === undefined) return false;
    this.done.push(c);
    this.doc_ = c.after;
    this.selection_ = c.selectionAfter;
    return true;
  }

  /** Mark the current state as saved. */
  markSaved(): void {
    this.savedAt = this.done.length;
  }

  get dirty(): boolean {
    return this.savedAt !== this.done.length;
  }

  /** Start over with a new document (open/new project): no history, clean. */
  reset(doc: D, selection: S): void {
    this.doc_ = doc;
    this.selection_ = selection;
    this.done.length = 0;
    this.undone.length = 0;
    this.savedAt = 0;
  }
}
