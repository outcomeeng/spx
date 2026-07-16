import { describe, expect, it } from "vitest";

import {
  withDirectoryOptionObservation,
  withInvocationDirectoryObservation,
  withNonWorktreeRootObservation,
  withProductDirectoryRootObservation,
  withSubdirectoryRootObservation,
} from "@testing/harnesses/config/root-resolution";

describe("config CLI product root resolution", () => {
  it("returns the worktree root when invoked from the product directory", async () => {
    await withProductDirectoryRootObservation(({ actualProductDir, expectedProductDir, warning }) => {
      expect(actualProductDir).toBe(expectedProductDir);
      expect(warning).toBeUndefined();
    });
  });

  it("returns the worktree root when invoked from a subdirectory", async () => {
    await withSubdirectoryRootObservation(({ actualProductDir, expectedProductDir, warning }) => {
      expect(actualProductDir).toBe(expectedProductDir);
      expect(warning).toBeUndefined();
    });
  });

  it("uses the -C target as the effective invocation directory", () => {
    withDirectoryOptionObservation(({ context, expectedInvocationDir, observedInvocationDir }) => {
      expect(context).toEqual({
        effectiveInvocationDir: expectedInvocationDir,
        productDir: expectedInvocationDir,
      });
      expect(observedInvocationDir).toBe(expectedInvocationDir);
    });
  });

  it("uses process.cwd() when -C is absent", () => {
    withInvocationDirectoryObservation(({ context, expectedInvocationDir, observedInvocationDir }) => {
      expect(context).toEqual({
        effectiveInvocationDir: expectedInvocationDir,
        productDir: expectedInvocationDir,
      });
      expect(observedInvocationDir).toBe(expectedInvocationDir);
    });
  });

  it("falls back to the supplied invocation directory and emits a warning outside a worktree", async () => {
    await withNonWorktreeRootObservation(({
      context,
      expectedInvocationDir,
      observedInvocationDir,
      writtenWarning,
    }) => {
      expect(context.productDir).toBe(expectedInvocationDir);
      expect(observedInvocationDir).toBe(expectedInvocationDir);
      expect(context.warning).toBeDefined();
      expect(writtenWarning).toBe(context.warning);
    });
  });
});
