import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";

/**
 * Validation subprocess spy used when the test needs to observe child-process
 * options or output forwarding through dependency injection.
 */
export class RecordingValidationChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }

  closeSuccessfully(): void {
    this.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, VALIDATION_EXIT_CODES.SUCCESS);
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

export class RecordingSpawnOptionsRunner implements ProcessRunner {
  readonly commands: string[] = [];
  readonly args: Array<readonly string[]> = [];
  readonly options: SpawnOptions[] = [];
  readonly children: RecordingValidationChild[] = [];

  get spawnOptions(): SpawnOptions | undefined {
    return this.options.at(-1);
  }

  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});

    const child = new RecordingValidationChild();
    this.children.push(child);
    queueMicrotask(() => child.closeSuccessfully());
    return child.asChildProcess();
  }
}
