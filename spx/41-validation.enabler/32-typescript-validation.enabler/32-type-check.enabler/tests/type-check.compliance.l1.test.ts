import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  forwardValidationSubprocessOutput,
  VALIDATION_SUBPROCESS_EVENTS,
  VALIDATION_SUBPROCESS_STDIO,
  type ValidationWritableStream,
} from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import type { ProcessRunner, ScopeConfig } from "@/validation/types";
import { VALIDATION_SCOPES } from "@/validation/types";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

class RecordingWritable implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

class BackpressuredWritable extends EventEmitter implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return false;
  }
}

class RecordingValidationChild extends EventEmitter {
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

function createEmptyScopeConfig(): ScopeConfig {
  return {
    directories: [],
    filePatterns: [],
    excludePatterns: [],
  };
}

class ImmediateCloseRunner implements ProcessRunner {
  spawnOptions: SpawnOptions | undefined;

  spawn(_command: string, _args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.spawnOptions = options;
    const child = new RecordingValidationChild();
    queueMicrotask(() => child.closeSuccessfully());
    return child.asChildProcess();
  }
}

describe("Compliance: tsc subprocess output is owned by the parent process", () => {
  it("spawns tsc with piped stdio so lifecycle handlers can observe parent output closure", async () => {
    const runner = new ImmediateCloseRunner();

    const result = await validateTypeScript(
      VALIDATION_SCOPES.FULL,
      createEmptyScopeConfig(),
      undefined,
      runner,
    );

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(VALIDATION_SUBPROCESS_STDIO);
  });

  it("forwards child stdout and stderr chunks through injected parent streams", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), arbitraryDomainLiteral(), (stdoutChunk, stderrChunk) => {
        const child = new RecordingValidationChild();
        const stdout = new RecordingWritable();
        const stderr = new RecordingWritable();

        forwardValidationSubprocessOutput(child, { stdout, stderr });
        child.stdout.write(stdoutChunk);
        child.stderr.write(stderrChunk);

        expect(stdout.chunks).toEqual([stdoutChunk]);
        expect(stderr.chunks).toEqual([stderrChunk]);
      }),
    );
  });

  it("pauses child output until the parent stream drains", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), (stdoutChunk) => {
        const child = new RecordingValidationChild();
        const stdout = new BackpressuredWritable();
        const stderr = new RecordingWritable();

        forwardValidationSubprocessOutput(child, { stdout, stderr });
        child.stdout.write(stdoutChunk);

        expect(child.stdout.isPaused()).toBe(true);

        stdout.emit(VALIDATION_SUBPROCESS_EVENTS.DRAIN);

        expect(child.stdout.isPaused()).toBe(false);
        expect(stdout.chunks).toEqual([stdoutChunk]);
      }),
    );
  });
});
