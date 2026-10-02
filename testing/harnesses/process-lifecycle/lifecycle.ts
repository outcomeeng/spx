/**
 * Test doubles for the process-lifecycle module.
 *
 * RecordingChild and RecordingExitController are dependency-injected real
 * implementations of the ChildHandle and ExitController interfaces; they
 * are NOT mocks. Tests construct them, pass them through DI, and inspect
 * the recorded interactions afterward.
 */

import {
  type ChildHandle,
  type ChildRegistry,
  type ExitController,
  type LifecycleSpawn,
  SIGTERM_NAME,
} from "@/lib/process-lifecycle";

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
 * A controlled spawn primitive for the lifecycle runner: each call returns a fresh
 * {@link RecordingChild} in place of a real process, recorded in call order. The
 * runner's registration step is the behavior under test, so the spawn primitive is
 * the boundary this replaces — the runner itself runs unchanged.
 */
export class RecordingLifecycleSpawn {
  readonly children: RecordingChild[] = [];

  readonly spawn: LifecycleSpawn = ((..._args: readonly unknown[]) => {
    const child = new RecordingChild();
    this.children.push(child);
    return child;
  }) as unknown as LifecycleSpawn;
}

/** The handles a registry currently tracks, in iteration order. */
export function trackedChildren(registry: ChildRegistry): ChildHandle[] {
  const tracked: ChildHandle[] = [];
  registry.forEach((child) => tracked.push(child));
  return tracked;
}
