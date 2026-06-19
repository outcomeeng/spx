/**
 * Recording ProcessRunner for the agent launcher.
 *
 * `launchAgent` spawns the foreground agent through an injected `ProcessRunner`
 * and resolves on the child's `exit` or `error`. This harness records each
 * spawn and hands back a child the test drives — `emitExit` for a clean or
 * signal exit, `emitError` for a spawn failure (a missing or non-executable
 * binary) — so launcher tests own the lifecycle event, not Node's spawn
 * primitive or its event names.
 *
 * @module session/testing/launch-runner
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";

import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

const CHILD_EXIT_EVENT = "exit";
const CHILD_ERROR_EVENT = "error";

/** A spawned child the test drives to emit one lifecycle event. */
export class RecordingLaunchChild extends EventEmitter {
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }

  /** Emit `exit` with `code` (null models a signal-killed child reporting no code). */
  emitExit(code: number | null): void {
    this.emit(CHILD_EXIT_EVENT, code);
  }

  /** Emit `error`, modelling a spawn failure where no `exit` ever follows. */
  emitError(error: Error): void {
    this.emit(CHILD_ERROR_EVENT, error);
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

/** Records each spawn's command, args, and options, returning a child the test drives. */
export class RecordingLaunchRunner implements ProcessRunner {
  readonly commands: string[] = [];
  readonly args: Array<readonly string[]> = [];
  readonly options: SpawnOptions[] = [];
  readonly children: RecordingLaunchChild[] = [];

  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});

    const child = new RecordingLaunchChild();
    this.children.push(child);
    return child.asChildProcess();
  }
}

/**
 * Records suspend and restore calls so a launcher test asserts that the handoff
 * suspends the parent's signal handling before spawning and restores it on the
 * agent's exit — without touching real process signals.
 */
export class RecordingSuspender implements SignalSuspender {
  suspendCount = 0;
  restoreCount = 0;

  suspend(): () => void {
    this.suspendCount += 1;
    return () => {
      this.restoreCount += 1;
    };
  }
}
