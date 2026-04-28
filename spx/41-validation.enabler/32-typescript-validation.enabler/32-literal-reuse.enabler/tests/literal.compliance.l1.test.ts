import { describe, expect, it } from "vitest";

import { withTestEnv } from "@/spec/testing/index";
import {
  collectLiterals,
  defaultVisitorKeys,
  type LiteralAllowlistConfig,
  type LiteralOccurrence,
  resolveAllowlist,
  validateLiteralReuse,
  type VisitorKeysMap,
} from "@/validation/literal/index";

import { DETECTOR_OPTIONS_DEFAULTS, INTEGRATION_CONFIG, writeSourceWithLiteral } from "./support";

const WEB_PRESET_ID = "web";
const WEB_PRESET_TOKEN = "Authorization";
const PROJECT_INCLUDE_TOKEN = "project-include-domain-token";

const ARTIFACT_DIRECTORIES: readonly string[] = [
  "node_modules",
  "dist",
  "build",
  ".next",
  ".source",
  ".git",
  "out",
  "coverage",
];

const MODULE_NAMING_SOURCES: ReadonlyArray<readonly [string, string, string]> = [
  ["ImportDeclaration.source", `import { a } from "./import-decl-path";`, "./import-decl-path"],
  ["ExportNamedDeclaration.source", `export { x } from "./export-named-path";`, "./export-named-path"],
  ["ExportAllDeclaration.source", `export * from "./export-all-path";`, "./export-all-path"],
  ["ImportExpression.source", `const load = () => import("./dynamic-import-path");`, "./dynamic-import-path"],
  ["TSImportType.source", `type X = import("./type-only-path").Thing;`, "./type-only-path"],
  ["TSExternalModuleReference.expression", `import eq = require("./equals-required-path");`, "./equals-required-path"],
];

function collect(
  source: string,
  options = { visitorKeys: defaultVisitorKeys, ...DETECTOR_OPTIONS_DEFAULTS },
): readonly LiteralOccurrence[] {
  return collectLiterals(source, "src/fixture.ts", options);
}

describe("ALWAYS: detection respects spx/EXCLUDE", () => {
  it("files under every EXCLUDE'd node directory are never parsed and contribute no occurrences", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const excludedRelative = "21-hidden.enabler";
      const excludedOnlyLiteral = "only-in-hidden-enabler";

      await env.writeRaw("spx/EXCLUDE", `${excludedRelative}\n`);
      await env.writeRaw(`spx/${excludedRelative}/hidden.md`, `# hidden\n`);
      await writeSourceWithLiteral(env, `spx/${excludedRelative}/secret.ts`, excludedOnlyLiteral);
      await writeSourceWithLiteral(env, "src/normal.ts", "normal-value");

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      const indexedFiles = [...result.indexedOccurrencesByFile.keys()];
      expect(indexedFiles.some((f) => f.startsWith(`spx/${excludedRelative}/`))).toBe(false);

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(excludedOnlyLiteral)).toBe(false);
    });
  });
});

describe("ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares", () => {
  it("unknown node types short-circuit: literals nested below un-registered types are not indexed", () => {
    const minimalKeys: VisitorKeysMap = {
      Program: ["body"],
      VariableDeclaration: ["declarations"],
      VariableDeclarator: ["init"],
    };
    const nestedLiteral = "nested-below-unknown-node-type";
    const source = `const x = { key: "${nestedLiteral}" };`;

    const occurrences = collect(source, { visitorKeys: minimalKeys, ...DETECTOR_OPTIONS_DEFAULTS });

    expect(occurrences.map((o) => o.value)).not.toContain(nestedLiteral);
  });
});

describe("NEVER: descend into artifact directories", () => {
  it.each(ARTIFACT_DIRECTORIES)("skips files under %s regardless of their contents", async (dir) => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const artifactOnlyLiteral = "only-in-artifact-dir";

      await writeSourceWithLiteral(env, `${dir}/junk.ts`, artifactOnlyLiteral);
      await writeSourceWithLiteral(env, "src/active.ts", "active-value");

      const result = await validateLiteralReuse({ projectRoot: env.projectDir });

      const indexedValues = new Set<string>();
      for (const occurrences of result.indexedOccurrencesByFile.values()) {
        for (const o of occurrences) indexedValues.add(o.value);
      }
      expect(indexedValues.has(artifactOnlyLiteral)).toBe(false);
    });
  });
});

describe("NEVER: index literals from module-naming positions", () => {
  it.each(MODULE_NAMING_SOURCES)("%s is excluded from the index", (_label, fixtureSource, modulePath) => {
    const occurrences = collect(fixtureSource);
    const values = occurrences.filter((o) => o.kind === "string").map((o) => o.value);
    expect(values).not.toContain(modulePath);
  });
});

describe("ALWAYS: exclude removes a value from the effective allowlist regardless of which source contributed it", () => {
  const cases: ReadonlyArray<{
    readonly source: string;
    readonly config: LiteralAllowlistConfig;
    readonly value: string;
  }> = [
    {
      source: "preset",
      config: { presets: [WEB_PRESET_ID], exclude: [WEB_PRESET_TOKEN] },
      value: WEB_PRESET_TOKEN,
    },
    {
      source: "include",
      config: { include: [PROJECT_INCLUDE_TOKEN], exclude: [PROJECT_INCLUDE_TOKEN] },
      value: PROJECT_INCLUDE_TOKEN,
    },
    {
      source: "preset+include",
      config: {
        presets: [WEB_PRESET_ID],
        include: [WEB_PRESET_TOKEN],
        exclude: [WEB_PRESET_TOKEN],
      },
      value: WEB_PRESET_TOKEN,
    },
  ];

  it.each(cases)("a value contributed via $source is removed when listed in exclude", ({ config, value }) => {
    const effective = resolveAllowlist(config);

    expect(effective.has(value)).toBe(false);
  });
});
