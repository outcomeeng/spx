import { describe, expect, it } from "vitest";

import { validateLiteralReuse } from "@/validation/literal/index";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("path-filter — scenarios", () => {
  it("files whose relative path starts with a prefix listed in validation.paths.exclude are not parsed or indexed", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const excludedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
      const activeLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeSourceFile("legacy/module.ts", excludedLiteral);
      await env.writeSourceFile("src/active.ts", activeLiteral);

      const result = await validateLiteralReuse({
        projectRoot: env.projectDir,
        pathConfig: { exclude: ["legacy"] },
      });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(excludedLiteral)).toBe(false);
      expect(indexedValues.has(activeLiteral)).toBe(true);
    });
  });

  it("when validation.paths.include lists a prefix, only files matching at least one include prefix are parsed and indexed", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const includedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
      const outsideLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeSourceFile("src/active.ts", includedLiteral);
      await env.writeSourceFile("vendor/third-party.ts", outsideLiteral);

      const result = await validateLiteralReuse({
        projectRoot: env.projectDir,
        pathConfig: { include: ["src"] },
      });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(includedLiteral)).toBe(true);
      expect(indexedValues.has(outsideLiteral)).toBe(false);
    });
  });

  it("node directory listed in spx/EXCLUDE but absent from validation.paths.exclude is parsed and indexed normally", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const literal = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw("spx/EXCLUDE", "21-deferred.enabler\n");
      await env.writeSourceFile("spx/21-deferred.enabler/source.ts", literal);

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(literal)).toBe(true);
    });
  });
});
