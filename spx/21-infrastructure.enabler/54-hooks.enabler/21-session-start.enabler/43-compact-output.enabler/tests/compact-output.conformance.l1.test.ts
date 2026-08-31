import { describe, expect, it } from "vitest";

import {
  arbitraryBomPrefixedCompactDirectiveText,
  arbitraryCompactDirectiveText,
} from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withResolvedCompactOutputCase } from "@testing/harnesses/hooks/compact-recovery";

describe("compact directive byte conformance", () => {
  it("emits compact-source stdout equal to the exact bytes of the manifest-named compact-recovery resource", async () => {
    await withResolvedCompactOutputCase(
      sampleGeneratedValue(arbitraryCompactDirectiveText()),
      (result, fixture) => {
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.value.stdout).toBe(fixture.directiveText);
      },
    );
  });

  it("preserves a leading byte-order mark in the emitted directive bytes", async () => {
    await withResolvedCompactOutputCase(
      sampleGeneratedValue(arbitraryBomPrefixedCompactDirectiveText()),
      (result, fixture) => {
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.value.stdout).toBe(fixture.directiveText);
      },
    );
  });
});
