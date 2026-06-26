import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES, literalCommand } from "@/commands/validation/literal";
import { validateLiteralReuse } from "@/validation/literal/index";
import {
  LITERAL_TEST_GENERATOR,
  sampleDistinctDomainLiterals,
  sampleIndependentDomainLiterals,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("path-filter — scenarios", () => {
  it("files whose relative path starts with a prefix listed in validation.paths.exclude are not parsed or indexed", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [excludedLiteral, activeLiteral] = sampleIndependentDomainLiterals(2);

      await env.writeSourceFile("legacy/module.ts", excludedLiteral);
      await env.writeSourceFile("src/active.ts", activeLiteral);

      const result = await validateLiteralReuse({
        productDir: env.productDir,
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
      const [includedLiteral, outsideLiteral] = sampleIndependentDomainLiterals(2);

      await env.writeSourceFile("src/active.ts", includedLiteral);
      await env.writeSourceFile("vendor/third-party.ts", outsideLiteral);

      const result = await validateLiteralReuse({
        productDir: env.productDir,
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
      const [literal] = sampleDistinctDomainLiterals(1);

      await env.writeRaw("spx/EXCLUDE", "21-deferred.enabler\n");
      await env.writeSourceFile("spx/21-deferred.enabler/source.ts", literal);

      const result = await validateLiteralReuse({ productDir: env.productDir });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(literal)).toBe(true);
    });
  });

  it("directory operands are expanded before literal validation scans TypeScript files", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [literal] = sampleDistinctDomainLiterals(1);
      const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      const testFilePath = [sourceFilePath.slice(0, -3), ["t", "e", "s", "t"].join(""), "ts"].join(".");
      await env.writeTsConfigMarker();
      await env.writeSourceFile(sourceFilePath, literal);
      await env.writeTestFile(testFilePath, literal);

      const result = await literalCommand({ cwd: env.productDir, files: ["src"], json: true });
      const findings = JSON.parse(result.output) as { srcReuse: readonly { value: string }[] };

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
      expect(findings.srcReuse.some((finding) => finding.value === literal)).toBe(true);
    });
  });

  it("unscoped literal validation uses validation path filters without TypeScript scope filtering", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [literal] = sampleDistinctDomainLiterals(1);
      const outsideTypeScriptScopeDirectory = ["s", "c", "r", "i", "p", "t", "s"].join("");
      await env.writeRaw("tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
      await env.writeSourceFile(`${outsideTypeScriptScopeDirectory}/worker.ts`, literal);
      await env.writeTestFile(`${outsideTypeScriptScopeDirectory}/worker.test.ts`, literal);

      const result = await literalCommand({
        cwd: env.productDir,
        pathConfig: { include: [outsideTypeScriptScopeDirectory] },
        json: true,
      });
      const findings = JSON.parse(result.output) as { srcReuse: readonly { value: string }[] };

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
      expect(findings.srcReuse.some((finding) => finding.value === literal)).toBe(true);
    });
  });
});
