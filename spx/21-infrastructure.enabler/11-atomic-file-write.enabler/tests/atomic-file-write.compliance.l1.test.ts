import {
  expectedAtomicWriteCollisionExhaustion,
  expectedAtomicWriteCollisionRetry,
  observeAtomicWriteCollisionExhaustion,
  observeAtomicWriteCollisionRetry,
} from "@testing/harnesses/atomic-file-write";
import { describe, expect, it } from "vitest";

describe("writeFileAtomic atomicity contract", () => {
  it("replaces the target only by renaming a fully written temp sibling, never an in-place write", async () => {
    await expect(observeAtomicWriteCollisionRetry()).resolves.toEqual(expectedAtomicWriteCollisionRetry());
  });

  it("preserves every colliding sibling when exclusive-create retries are exhausted", async () => {
    await expect(observeAtomicWriteCollisionExhaustion()).resolves.toEqual(
      expectedAtomicWriteCollisionExhaustion(),
    );
  });
});
