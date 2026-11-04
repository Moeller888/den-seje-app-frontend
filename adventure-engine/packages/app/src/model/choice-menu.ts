/**
 * Keyboard and pointer model of the choice menu (spec 04 D6.4, TS-D11):
 * arrow keys move the highlight (wrapping), Enter/Space choose the highlighted
 * option, digits 1–9 choose directly, hover moves the highlight.
 */

export type MenuAction = { readonly kind: "move"; readonly index: number } | { readonly kind: "choose"; readonly index: number } | null;

export class ChoiceMenuModel {
  readonly count: number;
  private index_ = 0;

  constructor(count: number) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError(`a choice menu needs at least one option, got ${count}`);
    this.count = count;
  }

  get index(): number {
    return this.index_;
  }

  hover(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < this.count) this.index_ = index;
  }

  /** Handle a `KeyboardEvent.key`; null = not a menu key. */
  key(key: string): MenuAction {
    switch (key) {
      case "ArrowDown":
      case "ArrowRight":
        return this.move((this.index_ + 1) % this.count);
      case "ArrowUp":
      case "ArrowLeft":
        return this.move((this.index_ - 1 + this.count) % this.count);
      case "Home":
        return this.move(0);
      case "End":
        return this.move(this.count - 1);
      case "Enter":
      case " ":
        return { kind: "choose", index: this.index_ };
      default: {
        if (!/^[1-9]$/.test(key)) return null;
        const n = Number(key) - 1;
        return n < this.count ? { kind: "choose", index: n } : null;
      }
    }
  }

  private move(index: number): MenuAction {
    this.index_ = index;
    return { kind: "move", index };
  }
}

/** Keys that confirm a speech bubble (spec 04 D6.3). */
export function confirmsSay(key: string): boolean {
  return key === "Enter" || key === " ";
}
