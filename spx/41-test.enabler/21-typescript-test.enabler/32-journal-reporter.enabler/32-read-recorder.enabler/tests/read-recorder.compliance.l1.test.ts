import { describe, expect, it } from "vitest";

import { READ_ENTRY_POINTS } from "@/test/languages/read-recorder-install";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { READ_RECORDER_GENERATOR } from "@testing/generators/testing/read-recorder";
import {
  observeEntryPointDelegation,
  observeFsRestoration,
  READ_TARGET,
} from "@testing/harnesses/testing/read-recorder";

describe("read recorder wrapped entry points", () => {
  it("delegates every read entry point to the original function with its arguments, returns its result unchanged, and fails a failing read with the same error", async () => {
    const readCase = sampleGeneratedValue(READ_RECORDER_GENERATOR.readCase());

    for (const entryPoint of READ_ENTRY_POINTS) {
      for (const targetState of Object.values(READ_TARGET)) {
        const { original, wrapped } = await observeEntryPointDelegation(entryPoint, readCase, targetState);

        expect(wrapped, `${entryPoint.surface}.${entryPoint.name} over a ${targetState} file`).toEqual(original);
      }
    }
  });

  it("restores every wrapped node:fs function and every named binding of the module to its original value", () => {
    const { before, installed, after } = observeFsRestoration();

    for (const [key, originalValue] of before) {
      expect(after.get(key), key).toBe(originalValue);
    }
    expect([...installed].some(([key, value]) => before.get(key) !== value)).toBe(true);
  });
});
