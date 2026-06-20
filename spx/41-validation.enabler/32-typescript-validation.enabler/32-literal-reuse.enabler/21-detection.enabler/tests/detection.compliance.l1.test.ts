import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARTIFACT_DIRECTORIES_DEFAULT } from "@/lib/file-inclusion/predicates/artifact-directory";
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
  literalEmptyConfig,
  literalModuleNamingFixtures,
  sampleLiteralPair,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

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

describe("NEVER: descend into artifact directories", () => {
  it.each(ARTIFACT_DIRECTORIES_DEFAULT)(
    "skips files under %s regardless of their contents",
    async (artifactDir) => {
      await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        const [artifactLiteral, activeLiteral] = sampleLiteralPair();
        const activeRelativePath = sampleLiteralTestValue(arbitrarySourceFilePath());
        const artifactRelativePath = join(artifactDir, "junk.ts");

        await env.writeSourceFile(artifactRelativePath, artifactLiteral);
        await env.writeSourceFile(activeRelativePath, activeLiteral);

        const result = await validateLiteralReuse({ productDir: env.productDir });

        const indexedValues = new Set<string>();
        for (const occurrences of result.indexedOccurrencesByFile.values()) {
          for (const occurrence of occurrences) indexedValues.add(occurrence.value);
        }
        expect(indexedValues.has(artifactLiteral)).toBe(false);
      });
    },
  );
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
