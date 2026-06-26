import { describe, expect, it } from "vitest";

import { validateLiteralReuse } from "@/validation/literal/index";
import { sampleIndependentDomainLiterals } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("ALWAYS: validation.paths.exclude suppresses files by path prefix", () => {
  it("files under every listed prefix are never parsed and contribute no occurrences", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [prefix1Literal, prefix2Literal] = sampleIndependentDomainLiterals(2);

      await env.writeSourceFile("excluded-a/file.ts", prefix1Literal);
      await env.writeSourceFile("excluded-b/nested/file.ts", prefix2Literal);

      const result = await validateLiteralReuse({
        productDir: env.productDir,
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

describe("ALWAYS: explicit files bypass validation.paths", () => {
  it("caller-supplied files are parsed even when validation.paths.exclude matches them", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [excludedLiteral, activeLiteral] = sampleIndependentDomainLiterals(2);

      await env.writeSourceFile("excluded/file.ts", excludedLiteral);
      await env.writeSourceFile("active/file.ts", activeLiteral);

      const result = await validateLiteralReuse({
        productDir: env.productDir,
        files: ["excluded/file.ts", "active/file.ts"],
        pathConfig: { exclude: ["excluded"] },
      });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(excludedLiteral)).toBe(true);
      expect(indexedValues.has(activeLiteral)).toBe(true);
    });
  });
});

describe("ALWAYS: gitignored entries are excluded from the literal walker", () => {
  it("gitignored files contribute no indexed occurrences without validation.paths.exclude", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [ignoredLiteral, activeLiteral] = sampleIndependentDomainLiterals(2);

      await env.writeGitignore(".", "ignored.ts\n");
      await env.writeSourceFile("ignored.ts", ignoredLiteral);
      await env.writeSourceFile("active.ts", activeLiteral);

      const result = await validateLiteralReuse({ productDir: env.productDir });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(ignoredLiteral)).toBe(false);
      expect(indexedValues.has(activeLiteral)).toBe(true);
    });
  });
});
