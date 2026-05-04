import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARTIFACT_DIRECTORIES_DEFAULT } from "@/lib/file-inclusion/predicates/artifact-directory";
import {
  collectLiterals,
  defaultVisitorKeys,
  LITERAL_KIND,
  MODULE_NAMING_SKIP,
  validateLiteralReuse,
  type VisitorKeysMap,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

import { collectFromSource, DETECTOR_OPTIONS } from "./support";

// Source code examples for each node type in MODULE_NAMING_SKIP.
// Unquoted property names are Identifier nodes, not StringLiterals — not indexed by the literal checker.
const IMPORT_SYNTAX_EXAMPLES: Record<string, { readonly source: string; readonly path: string }> = {
  ImportDeclaration: {
    source: `import { a } from "./import-decl-path";`,
    path: "./import-decl-path",
  },
  ExportNamedDeclaration: {
    source: `export { x } from "./export-named-path";`,
    path: "./export-named-path",
  },
  ExportAllDeclaration: {
    source: `export * from "./export-all-path";`,
    path: "./export-all-path",
  },
  ImportExpression: {
    source: `const load = () => import("./dynamic-import-path");`,
    path: "./dynamic-import-path",
  },
  TSImportType: {
    source: `type X = import("./type-only-path").Thing;`,
    path: "./type-only-path",
  },
  TSExternalModuleReference: {
    source: `import eq = require("./equals-required-path");`,
    path: "./equals-required-path",
  },
};

const MODULE_NAMING_FIXTURES = Object.entries(MODULE_NAMING_SKIP).flatMap(([nodeType, fields]) => {
  const example = IMPORT_SYNTAX_EXAMPLES[nodeType];
  if (!example) return [];
  return [...fields].map((field) => ({ nodeType, field, source: example.source, path: example.path }));
});

describe("ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares", () => {
  it("unknown node types short-circuit: literals nested below un-registered types are not indexed", () => {
    const emptyKeys: VisitorKeysMap = {};
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
    const source = `const x = { key: "${literal}" };`;

    const occurrences = collectFromSource(source, filename, {
      ...DETECTOR_OPTIONS,
      visitorKeys: emptyKeys,
    });

    expect(occurrences.map((o) => o.value)).not.toContain(literal);
  });

  it("default visitor-keys map indexes literals from positions beneath registered node types", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
    const source = `const x = { key: "${literal}" };`;

    const occurrences = collectFromSource(source, filename, {
      ...DETECTOR_OPTIONS,
      visitorKeys: defaultVisitorKeys,
    });

    expect(occurrences.map((o) => o.value)).toContain(literal);
  });
});

describe("NEVER: descend into artifact directories", () => {
  it.each(ARTIFACT_DIRECTORIES_DEFAULT)(
    "skips files under %s regardless of their contents",
    async (artifactDir) => {
      await withLiteralFixtureEnv({}, async (env) => {
        const artifactLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
        const activeLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
        const activeRelativePath = sampleLiteralTestValue(arbitrarySourceFilePath());
        const artifactRelativePath = join(artifactDir, "junk.ts");

        await env.writeSourceFile(artifactRelativePath, artifactLiteral);
        await env.writeSourceFile(activeRelativePath, activeLiteral);

        const result = await validateLiteralReuse({ projectRoot: env.projectDir });

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
    for (const fixture of MODULE_NAMING_FIXTURES) {
      const skipFields = MODULE_NAMING_SKIP[fixture.nodeType];
      expect(skipFields).toBeDefined();
      expect(skipFields?.has(fixture.field)).toBe(true);
    }
  });

  it.each(MODULE_NAMING_FIXTURES)(
    "$nodeType.$field is excluded from the index",
    ({ source, path }) => {
      const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
      const occurrences = collectLiterals(source, filename, DETECTOR_OPTIONS);
      const stringValues = occurrences.filter((o) => o.kind === LITERAL_KIND.STRING).map((o) => o.value);
      expect(stringValues).not.toContain(path);
    },
  );
});
