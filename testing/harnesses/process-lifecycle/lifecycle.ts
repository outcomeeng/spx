/**
 * Test doubles for the process-lifecycle module.
 *
 * RecordingChild and RecordingExitController are dependency-injected real
 * implementations of the ChildHandle and ExitController interfaces; they
 * are NOT mocks. Tests construct them, pass them through DI, and inspect
 * the recorded interactions afterward.
 */

import type { ChildProcess } from "node:child_process";

import { type ChildHandle, type ExitController, type LifecycleSpawn, SIGTERM_NAME } from "@/lib/process-lifecycle";

const DEFAULT_KILL_SIGNAL: NodeJS.Signals = SIGTERM_NAME;
export const RECORDING_CHILD_EXIT_EVENT = "exit";

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

  on(event: typeof RECORDING_CHILD_EXIT_EVENT, listener: (code: number | null) => void): this {
    this.exitListeners.push(listener);
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

/**
 * Controlled spawn primitive for the lifecycle runner: each call returns a fresh
 * `RecordingChild` in place of a real child process and records it, so a test observes which
 * handles the runner received without launching a process. It stands in for Node's `spawn`
 * under the observability exception — the registry membership the runner establishes is the
 * signal under test, and a real child would add nothing to it.
 */
export class RecordingLifecycleSpawn {
  readonly children: RecordingChild[] = [];

  readonly spawn: LifecycleSpawn = (): ChildProcess => {
    const child = new RecordingChild();
    this.children.push(child);
    // RecordingChild implements the ChildHandle subset the runner and registry use.
    return child as unknown as ChildProcess;
  };
}
