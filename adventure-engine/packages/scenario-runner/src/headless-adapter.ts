import type { Command, CommandType, Disposition, PresentationAdapter } from "@adventure-engine/core";

/**
 * Headless presentation adapter (spec 06 F1, 10 §2).
 *
 * Records every command in order. Commands other than Say/Choose are completed
 * by core after a simulated duration (default 0 ms). Say and Choose are never
 * auto-completed: the scenario must answer them (`confirmSay`, `choose`, `done`).
 */
export class HeadlessAdapter implements PresentationAdapter {
  readonly log: Command[] = [];
  private readonly durations: Readonly<Partial<Record<CommandType, number>>>;

  constructor(durations: Readonly<Partial<Record<CommandType, number>>> = {}) {
    this.durations = durations;
  }

  onCommand(command: Command): Disposition {
    this.log.push(command);
    return { kind: "auto", afterMs: this.durations[command.type] ?? 0 };
  }
}
