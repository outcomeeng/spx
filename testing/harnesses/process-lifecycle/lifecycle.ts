/**
 * Test doubles for the process-lifecycle module.
 *
 * RecordingChild and RecordingExitController are dependency-injected real
 * implementations of the ChildHandle and ExitController interfaces; they
 * are NOT mocks. Tests construct them, pass them through DI, and inspect
 * the recorded interactions afterward (Stage 5 exception 2: interaction
 * protocols, per `/testing` methodology).
 */

import type { ChildHandle, ExitController } from "@/lib/process-lifecycle";

const DEFAULT_KILL_SIGNAL: NodeJS.Signals = "SIGTERM";

export class RecordingChild implements ChildHandle {
  readonly pid: number | undefined = undefined;
  killed = false;
  readonly killCalls: Array<NodeJS.Signals | number> = [];
  private readonly exitListeners: Array<(code: number | null) => void> = [];

  kill(signal: NodeJS.Signals | number = DEFAULT_KILL_SIGNAL): boolean {
    this.killCalls.push(signal);
    if (this.killed) return false;
    this.killed = true;
    return true;
  }

  on(event: "exit", listener: (code: number | null) => void): this {
    if (event === "exit") this.exitListeners.push(listener);
    return this;
  }

  triggerExit(code: number | null = null): void {
    for (const listener of this.exitListeners) listener(code);
  }
}

export class RecordingExitController implements ExitController {
  readonly exits: number[] = [];

  exit(code: number): void {
    this.exits.push(code);
  }
}
