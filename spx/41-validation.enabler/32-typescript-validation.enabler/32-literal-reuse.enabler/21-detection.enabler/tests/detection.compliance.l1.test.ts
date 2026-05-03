import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARTIFACT_DIRECTORIES_DEFAULT } from "@/lib/file-inclusion/predicates/artifact-directory";
import {
  collectLiterals,
  defaultVisitorKeys,
  MODULE_NAMING_SKIP,
  validateLiteralReuse,
  type VisitorKeysMap,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { collectFromSource, DETECTOR_OPTIONS } from "./support";

const PROGRAM_NODE_TYPE = "Program";
const VARIABLE_DECLARATION_NODE_TYPE = "VariableDeclaration";
const VARIABLE_DECLARATOR_NODE_TYPE = "VariableDeclarator";

const MODULE_NAMING_FIXTURES: ReadonlyArray<{
  readonly nodeType: string;
  readonly field: string;
  readonly source: string;
  readonly path: string;
}> = [
  {
    nodeType: "ImportDeclaration",
    field: "source",
    source: `import { a } from "./import-decl-path";`,
    path: "./import-decl-path",
  },
  {
    nodeType: "ExportNamedDeclaration",
    field: "source",
    source: `export { x } from "./export-named-path";`,
    path: "./export-named-path",
  },
  {
    nodeType: "ExportAllDeclaration",
    field: "source",
    source: `export * from "./export-all-path";`,
    path: "./export-all-path",
  },
  {
    nodeType: "ImportExpression",
    field: "source",
    source: `const load = () => import("./dynamic-import-path");`,
    path: "./dynamic-import-path",
  },
  {
    nodeType: "TSImportType",
    field: "source",
    source: `type X = import("./type-only-path").Thing;`,
    path: "./type-only-path",
  },
  {
    nodeType: "TSExternalModuleReference",
    field: "expression",
    source: `import eq = require("./equals-required-path");`,
    path: "./equals-required-path",
  },
];

describe("ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares", () => {
  it("unknown node types short-circuit: literals nested below un-registered types are not indexed", () => {
    const minimalKeys: VisitorKeysMap = {
      [PROGRAM_NODE_TYPE]: ["body"],
      [VARIABLE_DECLARATION_NODE_TYPE]: ["declarations"],
      [VARIABLE_DECLARATOR_NODE_TYPE]: ["init"],
    };
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const filename = sampleLiteralTestValue(arbitrarySourceFilePath());
    const source = `const x = { key: "${literal}" };`;

    const occurrences = collectFromSource(source, filename, {
      ...DETECTOR_OPTIONS,
      visitorKeys: minimalKeys,
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
      await withTestEnv({}, async (env) => {
        const artifactLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
        const activeLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
        const activeRelativePath = sampleLiteralTestValue(arbitrarySourceFilePath());
        const artifactRelativePath = join(artifactDir, "junk.ts");

        await env.writeRaw(
          artifactRelativePath,
          `export const ARTIFACT = "${artifactLiteral}";\n`,
        );
        await env.writeRaw(
          activeRelativePath,
          `export const ACTIVE = "${activeLiteral}";\n`,
        );

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
      const stringValues = occurrences.filter((o) => o.kind === "string").map((o) => o.value);
      expect(stringValues).not.toContain(path);
    },
  );
});
