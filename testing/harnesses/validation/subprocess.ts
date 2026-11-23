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

/** What every child a recording runner spawns does before it closes. */
export interface ValidationChildScript {
  /** Text the child delivers on stdout. */
  readonly stdout?: string;
  /** Text the child delivers on stderr. */
  readonly stderr?: string;
  /** Message of an `error` event the child emits before it closes. */
  readonly errorMessage?: string;
  /** Exit code every child closes with, in place of the runner's per-child close codes. */
  readonly closeCode?: number;
  /** Ends each stream after its text, in place of writing the text and leaving the stream open. */
  readonly endStreams?: boolean;
  /** Settles the child on the next macrotask, in place of the next microtask. */
  readonly settleOnImmediate?: boolean;
}

/** Observes each spawn call before the runner records it. */
export type ValidationSpawnObserver = (command: string, args: readonly string[], options?: SpawnOptions) => void;

export interface RecordingSpawnOptionsRunnerConfig {
  /** Exit code of each spawned child in spawn order; a child past the list closes with success. */
  readonly closeCodes?: readonly number[];
  readonly script?: ValidationChildScript;
  readonly observeSpawn?: ValidationSpawnObserver;
}

export class RecordingSpawnOptionsRunner implements ProcessRunner {
  readonly commands: string[] = [];
  readonly args: Array<readonly string[]> = [];
  readonly options: SpawnOptions[] = [];
  readonly children: RecordingValidationChild[] = [];
  private readonly config: RecordingSpawnOptionsRunnerConfig;

  constructor(config: readonly number[] | RecordingSpawnOptionsRunnerConfig = {}) {
    this.config = isCloseCodeList(config) ? { closeCodes: config } : config;
  }

  get spawnOptions(): SpawnOptions | undefined {
    return this.options.at(-1);
  }

  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.config.observeSpawn?.(command, args, options);
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});

    const child = new RecordingValidationChild();
    const script = this.config.script ?? {};
    const closeCode = script.closeCode
      ?? this.config.closeCodes?.[this.children.length]
      ?? VALIDATION_EXIT_CODES.SUCCESS;
    this.children.push(child);
    const settle = (): void => settleValidationChild(child, script, closeCode);
    if (script.settleOnImmediate === true) setImmediate(settle);
    else queueMicrotask(settle);
    return child.asChildProcess();
  }
}

function isCloseCodeList(config: readonly number[] | RecordingSpawnOptionsRunnerConfig): config is readonly number[] {
  return Array.isArray(config);
}

function settleValidationChild(
  child: RecordingValidationChild,
  script: ValidationChildScript,
  closeCode: number,
): void {
  if (script.endStreams === true) {
    endStream(child.stdout, script.stdout);
    endStream(child.stderr, script.stderr);
  } else {
    if (script.stdout !== undefined) child.stdout.write(script.stdout);
    if (script.stderr !== undefined) child.stderr.write(script.stderr);
  }
  if (script.errorMessage !== undefined) {
    child.emit(VALIDATION_SUBPROCESS_EVENTS.ERROR, new Error(script.errorMessage));
  }
  child.closeWithCode(closeCode);
}

function endStream(stream: PassThrough, text: string | undefined): void {
  if (text === undefined) stream.end();
  else stream.end(text);
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
