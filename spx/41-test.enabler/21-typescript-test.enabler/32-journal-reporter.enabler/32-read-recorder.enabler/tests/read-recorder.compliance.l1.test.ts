import { describe, expect, it } from "vitest";

import { READ_ENTRY_POINTS } from "@/test/languages/read-recorder-install";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { READ_ENCODING, READ_RECORDER_GENERATOR } from "@testing/generators/testing/read-recorder";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import {
  observeEntryPointDelegation,
  observeFsRestoration,
  observeInvalidTargetRead,
  READ_OUTCOME_KIND,
  READ_TARGET,
} from "@testing/harnesses/testing/read-recorder";

describe("read recorder wrapped entry points", () => {
  // Assertion design record
  // - Assertion: ALWAYS - every wrapped node:fs read entry point delegates to the original function with the original
  //   arguments, returns its result unchanged, and a read that fails fails with the same error. Quantifier: universal
  //   over every entry point, every encoding option, and every target state; evidence type compliance.
  // - Production subject: each wrapped read entry point of the read recorder installed over the real node:fs module;
  //   the observation is the outcome of one read made before installation and the same read made while installed.
  // - Case provenance: the production entry-point registry (every member, none sampled), the encoding members the
  //   generator owns for the option a read passes (utf8 and none, every member), both target states (present and
  //   missing), and a generated file name and content for the incidental values.
  // - Oracle owner: the original node:fs function itself, read before installation; the real system response is
  //   the oracle, so the recorder's delegation is judged against an implementation it does not contain.
  // - Rejected mutation: a wrapper drops the encoding argument it forwards (delegates with a subset of the original
  //   arguments), or swallows the original error.
  // - Failure observation: the wrapped outcome then yields a Buffer where the original decoded a string, or reads
  //   successfully where the original failed, so expect(wrapped).toEqual(original) fails for the affected combination.
  it("delegates every read entry point, for each encoding option, to the original function with its arguments, returns its result unchanged, and fails a failing read with the same error", async () => {
    const readCase = sampleGeneratedValue(READ_RECORDER_GENERATOR.readCase());

    for (const entryPoint of READ_ENTRY_POINTS) {
      for (const encoding of Object.values(READ_ENCODING)) {
        for (const targetState of Object.values(READ_TARGET)) {
          const { original, wrapped } = await observeEntryPointDelegation(entryPoint, readCase, encoding, targetState);

          expect(wrapped, [entryPoint.surface, entryPoint.name, encoding, targetState].join(".")).toEqual(original);
        }
      }
    }
  });

  // Assertion design record
  // - Assertion: ALWAYS - a read that fails fails with the same error; applied to a target that is not a valid read
  //   target, the original function raises its own error and the recorder records nothing for that call. Quantifier:
  //   universal over every entry point and every invalid target; evidence type compliance.
  // - Production subject: the wrapper's derivation of an observed path from the target it was handed, crossed at each
  //   wrapped read entry point; observations are the original and wrapped outcomes and the collected paths.
  // - Case provenance: the production entry-point registry (every member) and READ_RECORDER_GENERATOR.invalidReadTarget,
  //   an open generated domain of values node:fs rejects as targets (no value, null, a non-file URL, a boolean).
  // - Oracle owner: the original node:fs function, whose own rejection is the expected outcome, and the recorder's
  //   invariant that only a path that resolves to an existing file is recorded.
  // - Rejected mutation: path derivation runs outside its failure guard, so an invalid target makes the wrapper throw
  //   its own error before the original function is reached.
  // - Failure observation: the wrapped outcome then carries the wrapper's error (a different message or code) instead
  //   of the original's, so expect(wrapped).toEqual(original) fails.
  it(
    "fails a read of an invalid target with the original function's own error and records nothing for it",
    async () => {
      for (const entryPoint of READ_ENTRY_POINTS) {
        await assertProperty(
          READ_RECORDER_GENERATOR.invalidReadTarget(),
          async (target) => {
            const { original, wrapped, recordedPaths } = await observeInvalidTargetRead(entryPoint, target);

            expect(original.kind).toBe(READ_OUTCOME_KIND.FAILED);
            expect(wrapped).toEqual(original);
            expect(recordedPaths).toBeUndefined();
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      }
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1) * READ_ENTRY_POINTS.length,
  );

  it("restores every wrapped node:fs function and every named binding of the module to its original value", () => {
    const { before, installed, after } = observeFsRestoration();

    for (const [key, originalValue] of before) {
      expect(after.get(key), key).toBe(originalValue);
    }
    expect([...installed].some(([key, value]) => before.get(key) !== value)).toBe(true);
  });
});
