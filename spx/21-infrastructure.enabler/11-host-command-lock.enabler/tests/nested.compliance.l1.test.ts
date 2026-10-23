/**
 * Nested context compliance over an in-memory host: a nested call whose descriptor is absent,
 * changed, or no longer holds the lock never starts its command, and a nested call resolving a
 * different lock file fails as a mismatch.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock } from "@/lib/host-command-lock";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  CLEAN_EXIT_CODE,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost, UNUSABLE_NESTED_CONTEXTS } from "@testing/harnesses/host-command-lock/host-command-lock";

const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const command = sampleGeneratedValue(arbitraryCommand());

describe("a nested guarded call with an unusable context", () => {
  it.each(UNUSABLE_NESTED_CONTEXTS)(
    "never starts its command given %s",
    async (_name, environmentOf, status) => {
      const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
      const environment = environmentOf(host);

      const { exitCode, result } = await createHostCommandLock(host.deps({ environment })).run({ command });

      expect(result).toMatchObject({ started: false, status });
      expect(exitCode).not.toBe(CLEAN_EXIT_CODE);
      expect(host.spawns).toEqual([]);
    },
  );
});
