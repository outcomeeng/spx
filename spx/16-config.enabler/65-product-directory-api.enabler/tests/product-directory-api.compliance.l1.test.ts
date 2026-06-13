import { describe, expect, it } from "vitest";

import { resolveProductDir } from "@/domains/config/root";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("product directory API vocabulary", () => {
  it("resolveProductDir exposes productDir without legacy root aliases", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = resolveProductDir(productDir);
      const legacyFieldNames = ["projectRoot", "projectDir"] as const;

      expect(result.productDir).toBe(productDir);
      for (const legacyField of legacyFieldNames) {
        expect(legacyField in result).toBe(false);
      }
    });
  });
});
