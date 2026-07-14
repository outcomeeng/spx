import { EventEmitter } from "node:events";

import { MANAGED_SUBPROCESS_STDIO } from "@/lib/process-lifecycle";
import {
  forwardValidationSubprocessOutput,
  VALIDATION_SUBPROCESS_EVENTS,
  type ValidationWritableStream,
} from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import { LITERAL_TEST_GENERATOR } from "@testing/generators/literal/literal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { RecordingSpawnOptionsRunner, RecordingValidationChild } from "@testing/harnesses/validation/subprocess";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

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

export function registerTypeCheckCompliance(): void {
  describe("Compliance: tsc subprocess output is owned by the parent process", () => {
    it("spawns tsc with piped stdio so lifecycle handlers can observe parent output closure", async () => {
      const runner = new RecordingSpawnOptionsRunner();

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          productDir: process.cwd(),
        },
        { runner },
      );

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
    });

    it("forwards child stdout and stderr chunks through injected parent streams", () => {
      assertProperty(
        LITERAL_TEST_GENERATOR.domainLiteralPair(),
        ([stdoutChunk, stderrChunk]) => {
          const child = new RecordingValidationChild();
          const stdout = new RecordingWritable();
          const stderr = new RecordingWritable();

          forwardValidationSubprocessOutput(child, { stdout, stderr });
          child.stdout.write(stdoutChunk);
          child.stderr.write(stderrChunk);

          expect(stdout.chunks).toEqual([stdoutChunk]);
          expect(stderr.chunks).toEqual([stderrChunk]);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("pauses child output until the parent stream drains", () => {
      assertProperty(
        LITERAL_TEST_GENERATOR.domainLiteral(),
        (stdoutChunk) => {
          const child = new RecordingValidationChild();
          const stdout = new BackpressuredWritable();
          const stderr = new RecordingWritable();

          forwardValidationSubprocessOutput(child, { stdout, stderr });
          child.stdout.write(stdoutChunk);

          expect(child.stdout.isPaused()).toBe(true);

          stdout.emit(VALIDATION_SUBPROCESS_EVENTS.DRAIN);

          expect(child.stdout.isPaused()).toBe(false);
          expect(stdout.chunks).toEqual([stdoutChunk]);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}

export const typeCheckComplianceCases = collectHarnessTestCases(registerTypeCheckCompliance);
