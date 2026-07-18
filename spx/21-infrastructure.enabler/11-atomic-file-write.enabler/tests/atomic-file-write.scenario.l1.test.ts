import { describe, expect, it } from "vitest";

import {
  observeAtomicWriteRenameFailure,
  observeAtomicWriteSuccess,
  observeAtomicWriteWriteFailure,
} from "@testing/harnesses/atomic-file-write";

describe("writeFileAtomic success", () => {
  it("leaves the target holding the new content and no temp sibling behind", async () => {
    await observeAtomicWriteSuccess().then((observation) => {
      expect(new Map(observation.files).get(observation.targetPath)).toBe(observation.content);
      expect(new Map(observation.files).has(observation.temporaryPath)).toBe(false);
    });
  });
});

describe("writeFileAtomic failure", () => {
  it("removes the temp sibling and propagates the error when the rename throws", async () => {
    await observeAtomicWriteRenameFailure().then((observation) => {
      expect(observation.thrown).toBe(observation.error);
      expect(observation.removed).toContain(observation.temporaryPath);
      expect(new Map(observation.files).has(observation.temporaryPath)).toBe(false);
      expect(new Map(observation.files).has(observation.targetPath)).toBe(false);
    });
  });

  it("removes the temp sibling and propagates the error when the write throws", async () => {
    await observeAtomicWriteWriteFailure().then((observation) => {
      expect(observation.thrown).toBe(observation.error);
      expect(observation.removed).toContain(observation.temporaryPath);
      expect(new Map(observation.files).has(observation.temporaryPath)).toBe(false);
      expect(new Map(observation.files).has(observation.targetPath)).toBe(false);
    });
  });
});
