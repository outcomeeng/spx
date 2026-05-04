import { describe, expect, it } from "vitest";

import { validateLiteralReuse } from "@/validation/literal/index";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("ALWAYS: validation.paths.exclude suppresses files by path prefix", () => {
  it("files under every listed prefix are never parsed and contribute no occurrences", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const prefix1Literal = sampleLiteralTestValue(arbitraryDomainLiteral());
      const prefix2Literal = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeSourceFile("excluded-a/file.ts", prefix1Literal);
      await env.writeSourceFile("excluded-b/nested/file.ts", prefix2Literal);

      const result = await validateLiteralReuse({
        projectRoot: env.projectDir,
        pathConfig: { exclude: ["excluded-a", "excluded-b"] },
      });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(prefix1Literal)).toBe(false);
      expect(indexedValues.has(prefix2Literal)).toBe(false);
    });
  });
});
