import { describe, expect, it } from "vitest";

import { READ_ENTRY_POINTS } from "@/test/languages/read-recorder-install";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { READ_RECORDER_GENERATOR } from "@testing/generators/testing/read-recorder";
import {
  observeEntryPointDelegation,
  observeFsRestoration,
  observeUnresolvedPathReads,
  READ_OUTCOME_KIND,
  READ_TARGET,
} from "@testing/harnesses/testing/read-recorder";

describe("read recorder wrapped entry points", () => {
  it("delegates every read entry point to the original function with its arguments, returns its result unchanged, and fails a failing read with the same error", async () => {
    const readCase = sampleGeneratedValue(READ_RECORDER_GENERATOR.readCase());

    for (const entryPoint of READ_ENTRY_POINTS) {
      for (const targetState of Object.values(READ_TARGET)) {
        const { original, wrapped } = await observeEntryPointDelegation(entryPoint, readCase, targetState);

        expect(wrapped, [entryPoint.surface, entryPoint.name, targetState].join(".")).toEqual(original);
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

  it("records the file a symbolic link resolves to and not the link, and drops a path that resolves to no file while its read fails unchanged", async () => {
    const names = sampleGeneratedValue(READ_RECORDER_GENERATOR.unresolvedPathNames());

    for (const entryPoint of READ_ENTRY_POINTS) {
      const observation = await observeUnresolvedPathReads(entryPoint, names);
      const label = [entryPoint.surface, entryPoint.name].join(".");

      expect(observation.recordedPaths, label).toEqual([observation.targetPath]);
      expect(observation.recordedPaths, label).not.toContain(observation.linkPath);
      expect(observation.recordedPaths, label).not.toContain(observation.missingPath);
      expect(observation.missingReadWrapped, label).toEqual(observation.missingReadOriginal);
      expect(observation.missingReadWrapped.kind, label).toBe(READ_OUTCOME_KIND.FAILED);
    }
  });
});
