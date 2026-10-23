/**
 * Nested context compliance over an in-memory host: a nested call whose descriptor is absent,
 * changed, or no longer holds the lock never starts its command, and a nested call resolving a
 * different lock file fails as a mismatch.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, LOCK_ENV, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost } from "@testing/harnesses/host-command-lock/host-command-lock";

const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const command = sampleGeneratedValue(arbitraryCommand());
const CLEAN_EXIT = 0;

type NestedCase = readonly [string, (host: MemoryHost) => Record<string, string>, string];

const WITHOUT_DESCRIPTOR: NestedCase = [
  "a descriptor variable that is absent",
  (host) => ({ [LOCK_ENV.FILE_ID]: host.identity.fileId }),
  RESULT_STATUS.NESTED_CONTEXT_INVALID,
];
const UNOPENED_DESCRIPTOR: NestedCase = [
  "a descriptor that is not open",
  (host) => ({ [LOCK_ENV.FD]: String(host.unopenedDescriptor), [LOCK_ENV.FILE_ID]: host.identity.fileId }),
  RESULT_STATUS.NESTED_CONTEXT_INVALID,
];
const WITHOUT_FILE_ID: NestedCase = [
  "a file identity variable that is absent",
  (host) => ({ [LOCK_ENV.FD]: String(host.holdOuterSlot().descriptor) }),
  RESULT_STATUS.NESTED_CONTEXT_INVALID,
];
const CHANGED_DESCRIPTOR: NestedCase = [
  "a descriptor that refers to another file",
  (host) => host.holdOuterSlot({ descriptorFileId: host.identity.otherFileId }).environment,
  RESULT_STATUS.NESTED_CONTEXT_INVALID,
];
const RELEASED_LOCK: NestedCase = [
  "a descriptor whose description no longer holds the lock",
  (host) => host.holdOuterSlot({ holdsLock: false }).environment,
  RESULT_STATUS.NESTED_CONTEXT_INVALID,
];
const OTHER_LOCK_FILE: NestedCase = [
  "a lock file other than the one it resolves",
  (host) => ({ ...host.holdOuterSlot().environment, [LOCK_ENV.FILE_ID]: host.identity.otherFileId }),
  RESULT_STATUS.NESTED_LOCK_MISMATCH,
];

describe("a nested guarded call with an unusable context", () => {
  it.each([WITHOUT_DESCRIPTOR, UNOPENED_DESCRIPTOR, WITHOUT_FILE_ID, CHANGED_DESCRIPTOR, RELEASED_LOCK, OTHER_LOCK_FILE])(
    "never starts its command given %s",
    async (_name, environmentOf, status) => {
      const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
      const environment = environmentOf(host);

      const { exitCode, result } = await createHostCommandLock(host.deps({ environment })).run({ command });

      expect(result).toMatchObject({ started: false, status });
      expect(exitCode).not.toBe(CLEAN_EXIT);
      expect(host.spawns).toEqual([]);
    },
  );
});
