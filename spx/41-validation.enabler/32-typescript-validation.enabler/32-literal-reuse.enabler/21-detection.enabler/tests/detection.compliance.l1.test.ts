import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  collectLiterals,
  DEFAULT_LITERAL_COLLECT_OPTIONS,
  defaultVisitorKeys,
  LITERAL_KIND,
  MODULE_NAMING_SKIP,
  validateLiteralReuse,
  type VisitorKeysMap,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  literalModuleNamingFixtures,
  sampleLiteralPair,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { buildStringDeclaration } from "@testing/harnesses/literal/snippets";

import { collectFromSource } from "@testing/harnesses/literal-reuse/detection";

describe("ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares", () => {
  it("unknown node types short-circuit: literals nested below un-registered types are not indexed", () => {
    const emptyKeys: VisitorKeysMap = {};
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
    const source = `const x = { key: "${literal}" };`;

    const occurrences = collectFromSource(source, filename, {
      ...DEFAULT_LITERAL_COLLECT_OPTIONS,
      visitorKeys: emptyKeys,
    });

    expect(occurrences.map((o) => o.value)).not.toContain(literal);
  });

  it("default visitor-keys map indexes literals from positions beneath registered node types", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
    const source = `const x = { key: "${literal}" };`;

    const occurrences = collectFromSource(source, filename, {
      ...DEFAULT_LITERAL_COLLECT_OPTIONS,
      visitorKeys: defaultVisitorKeys,
    });

    expect(occurrences.map((o) => o.value)).toContain(literal);
  });
});

describe("ALWAYS: domain path filters narrow literal reuse indexing", () => {
  it("skips files excluded through pathConfig while indexing other git-visible files", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [excludedLiteral, activeLiteral] = sampleLiteralPair();
      const generatedPaths = sampleLiteralTestValue(
        fc.uniqueArray(arbitrarySourceFilePath(), { minLength: 2, maxLength: 2 }),
      );
      const excludedRelativePath = generatedPaths[0];
      const activeRelativePath = generatedPaths[1];
      if (excludedRelativePath === undefined || activeRelativePath === undefined) {
        throw new Error("literal detection compliance: source path generator returned too few paths");
      }

      await env.writeTracked(excludedRelativePath, buildStringDeclaration(excludedLiteral));
      await env.writeTracked(activeRelativePath, buildStringDeclaration(activeLiteral));

      const result = await validateLiteralReuse({
        productDir: env.productDir,
        pathConfig: { exclude: [excludedRelativePath] },
      });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const occurrence of occurrences) indexedValues.add(occurrence.value);
      }
      expect(indexedValues.has(excludedLiteral)).toBe(false);
      expect(indexedValues.has(activeLiteral)).toBe(true);
    });
  });
});

describe("NEVER: index literals from module-naming positions", () => {
  it("every fixture exercises a position that the source-side MODULE_NAMING_SKIP enumerates", () => {
    for (const fixture of literalModuleNamingFixtures()) {
      const skipFields = MODULE_NAMING_SKIP[fixture.nodeType];
      expect(skipFields).toBeDefined();
      expect(skipFields?.has(fixture.field)).toBe(true);
    }
  });

  it.each(literalModuleNamingFixtures())(
    "$nodeType.$field is excluded from the index",
    ({ source, path }) => {
      const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
      const occurrences = collectLiterals(source, filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
      const stringValues = occurrences.filter((o) => o.kind === LITERAL_KIND.STRING).map((o) => o.value);
      expect(stringValues).not.toContain(path);
    },
  );
});
