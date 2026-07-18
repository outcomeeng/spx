import {
  observeAtomicWriteCollisionExhaustion,
  observeAtomicWriteCollisionRetry,
} from "@testing/harnesses/atomic-file-write";
import { describe, expect, it } from "vitest";

describe("writeFileAtomic atomicity contract", () => {
  it("replaces the target only by renaming a fully written temp sibling, never an in-place write", async () => {
    await observeAtomicWriteCollisionRetry().then((observation) => {
      expect(observation.files).toEqual([
        [observation.temporaryPaths[0], observation.input.collidingContent[0]],
        [observation.input.targetPath, observation.input.content],
      ]);
      expect(observation.writeAttempts).toEqual(observation.temporaryPaths);
      expect(observation.written).toEqual([observation.temporaryPaths[1]]);
      expect(observation.renamed).toEqual([
        { from: observation.temporaryPaths[1], to: observation.input.targetPath },
      ]);
      expect(observation.removed).toEqual([]);
      expect(observation.error).toBeUndefined();
    });
  });

  it("preserves every colliding sibling when exclusive-create retries are exhausted", async () => {
    await observeAtomicWriteCollisionExhaustion().then((observation) => {
      expect(observation.files).toEqual([
        [observation.temporaryPaths[0], observation.input.collidingContent[0]],
        [observation.temporaryPaths[1], observation.input.collidingContent[1]],
      ]);
      expect(observation.writeAttempts).toEqual(observation.temporaryPaths);
      expect(observation.written).toEqual([]);
      expect(observation.renamed).toEqual([]);
      expect(observation.removed).toEqual([]);
      expect(observation.error).toBe(observation.collisionError);
    });
  });
});
