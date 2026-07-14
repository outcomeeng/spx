import { describe, expect, it } from "vitest";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { foldMappingCases } from "@testing/generators/diagnose/engine";

export function registerDiagnoseFoldMappings(): void {
  describe("the overall verdict folds the per-check buckets by the fixed precedence broken > unknown > degraded > healthy", () => {
    it.each(foldMappingCases())("$name", ({ buckets, overall }) => {
      expect(foldOverallVerdict(buckets)).toBe(overall);
    });
  });
}
