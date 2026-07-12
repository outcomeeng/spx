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
    this.closeWithCode(VALIDATION_EXIT_CODES.SUCCESS);
  }

  closeWithCode(code: number): void {
    this.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, code);
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

  constructor(private readonly closeCodes: readonly number[] = [VALIDATION_EXIT_CODES.SUCCESS]) {}

  get spawnOptions(): SpawnOptions | undefined {
    return this.options.at(-1);
  }

  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});

    const child = new RecordingValidationChild();
    this.children.push(child);
    const closeCode = this.closeCodes[this.children.length - 1] ?? VALIDATION_EXIT_CODES.SUCCESS;
    queueMicrotask(() => child.closeWithCode(closeCode));
    return child.asChildProcess();
  }
}

export interface RequiredValidationSpawn {
  readonly command: string;
  readonly args?: readonly string[];
  readonly stdio?: SpawnOptions["stdio"];
}

/** A protocol double that rejects any subprocess invocation outside its declared contract. */
export class RejectingUnexpectedValidationSpawnRunner extends RecordingSpawnOptionsRunner {
  constructor(
    private readonly required: RequiredValidationSpawn,
    closeCodes?: readonly number[],
  ) {
    super(closeCodes);
  }

  override spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    if (command !== this.required.command) {
      throw new Error(`Unexpected validation executable: ${command}`);
    }
    if (this.required.args !== undefined && !sameArguments(args, this.required.args)) {
      throw new Error(`Unexpected validation arguments: ${JSON.stringify(args)}`);
    }
    if (this.required.stdio !== undefined && options?.stdio !== this.required.stdio) {
      throw new Error(`Unexpected validation stdio: ${String(options?.stdio)}`);
    }
    return super.spawn(command, args, options);
  }
}

function sameArguments(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((argument, index) => argument === expected[index]);
}
