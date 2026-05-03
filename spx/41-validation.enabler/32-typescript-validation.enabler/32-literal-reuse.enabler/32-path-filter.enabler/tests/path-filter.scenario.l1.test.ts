import { describe, expect, it } from "vitest";

import { validateLiteralReuse } from "@/validation/literal/index";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("path-filter — scenarios", () => {
  it("files whose relative path starts with a prefix listed in validation.paths.exclude are not parsed or indexed", async () => {
    await withTestEnv({}, async (env) => {
      const excludedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
      const activeLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw("legacy/module.ts", `export const V = "${excludedLiteral}";\n`);
      await env.writeRaw("src/active.ts", `export const V = "${activeLiteral}";\n`);

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
    await withTestEnv({}, async (env) => {
      const includedLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
      const outsideLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw("src/active.ts", `export const V = "${includedLiteral}";\n`);
      await env.writeRaw("vendor/third-party.ts", `export const V = "${outsideLiteral}";\n`);

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
    await withTestEnv({}, async (env) => {
      const literal = sampleLiteralTestValue(arbitraryDomainLiteral());

      await env.writeRaw("spx/EXCLUDE", "21-deferred.enabler\n");
      await env.writeRaw("spx/21-deferred.enabler/source.ts", `export const V = "${literal}";\n`);

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(literal)).toBe(true);
    });
  });
});
