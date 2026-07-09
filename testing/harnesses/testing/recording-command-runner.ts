import * as fc from "fast-check";
import { expect } from "vitest";

import type { TestRunnerDependencies } from "@/test/languages/types";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

// The recording command runner each language test-harness provides: it captures the commands
// the runner constructs and returns a configured outcome. The structure is identical across
// language harnesses (kept parallel per `spx/41-test.enabler/ISSUES.md` until a third language
// arrives), so this shared contract accepts any factory producing that shape.
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: ReadonlyArray<{ readonly command: string; readonly args: readonly string[] }>;
}

export type RecordingCommandRunnerFactory = (options: {
  readonly present: boolean;
  readonly exitCode: number;
}) => RecordingCommandRunner;

// Asserts the shared recording-command-runner contract over a language harness's factory: the
// runner reports its configured language presence, appends every `runCommand` invocation to its
// `calls` in order, and returns the configured exit code for each call. The `present` and
// `exitCode` arbitraries come from the calling language's source-owned generator so each language
// verifies its own copy.
export async function assertRecordingCommandRunnerContract(
  createRunner: RecordingCommandRunnerFactory,
  generators: { readonly present: fc.Arbitrary<boolean>; readonly exitCode: fc.Arbitrary<number> },
  productDir: string,
): Promise<void> {
  await assertProperty(
    fc.tuple(
      generators.present,
      generators.exitCode,
      fc.array(fc.tuple(arbitraryDomainLiteral(), fc.array(arbitraryDomainLiteral()))),
    ),
    async ([present, exitCode, invocations]) => {
      const runner = createRunner({ present, exitCode });

      expect(runner.isLanguagePresent?.(productDir)).toBe(present);

      for (const [command, args] of invocations) {
        const result = await runner.runCommand(command, args);
        expect(result.exitCode).toBe(exitCode);
      }

      expect(runner.calls).toEqual(invocations.map(([command, args]) => ({ command, args })));
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}
