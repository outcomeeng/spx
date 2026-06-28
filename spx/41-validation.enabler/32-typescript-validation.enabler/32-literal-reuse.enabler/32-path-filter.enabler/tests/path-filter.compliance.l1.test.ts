import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES, literalCommand } from "@/commands/validation/literal";
import { VALIDATION_PATH_TOOL_SUBSECTIONS } from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { validateLiteralReuse } from "@/validation/literal/index";
import {
  LITERAL_TEST_GENERATOR,
  sampleIndependentDomainLiterals,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
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

describe("ALWAYS: unmatched validation include intersections produce no literal scope", () => {
  it("returns no indexed files before walking automatic scope", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [literal] = sampleIndependentDomainLiterals(1);
      const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      const sourcePrefix = firstPathSegment(sourceFilePath);
      const toolIncludePrefix = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());

      await env.writeSourceFile(sourceFilePath, literal);

      const result = await validateLiteralReuse({
        productDir: env.productDir,
        pathConfig: validationPathFilterForTool(
          { include: [sourcePrefix], literal: { include: [toolIncludePrefix] } },
          VALIDATION_PATH_TOOL_SUBSECTIONS.LITERAL,
        ),
      });

      expect(result.filteredByValidationPathNoMatches).toBe(true);
      expect(result.indexedOccurrencesByFile.size).toBe(0);
      expect(result.findings).toEqual({ srcReuse: [], testDupe: [] });
    });
  });
});

function firstPathSegment(path: string): string {
  return path.slice(0, path.indexOf("/"));
}

describe("ALWAYS: explicit files bypass validation.paths", () => {
  it("caller-supplied files are parsed even when validation.paths.exclude matches them", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [excludedLiteral, activeLiteral] = sampleIndependentDomainLiterals(2);

      await env.writeSourceFile("excluded/file.ts", excludedLiteral);
      await env.writeSourceFile("active/file.ts", activeLiteral);

      const result = await validateLiteralReuse({
        productDir: env.productDir,
        explicitFiles: ["excluded/file.ts", "active/file.ts"],
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

  it("literal command caller-supplied files are parsed even when validation.paths.exclude matches them", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const [literal] = sampleIndependentDomainLiterals(1);
      const sourceFile = "excluded/source.ts";
      const testFile = "excluded/source.test.ts";
      await env.writeSourceFile(sourceFile, literal);
      await env.writeTestFile(testFile, literal);
      await env.writeTsConfigMarker();

      const result = await literalCommand({
        cwd: env.productDir,
        files: [sourceFile, testFile],
        pathConfig: { exclude: ["excluded"] },
        json: true,
      });
      const findings = JSON.parse(result.output) as { srcReuse: readonly { value: string }[] };

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
      expect(findings.srcReuse.some((finding) => finding.value === literal)).toBe(true);
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
