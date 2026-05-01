import { describe, expect, it } from "vitest";

import { literalCommand } from "@/commands/validation/literal";
import { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/spec/fixture-writer-methods";
import { withTestEnv } from "@/spec/testing/index";
import {
  collectLiterals,
  defaultVisitorKeys,
  FIXTURE_WRITER_CALLS,
  LITERAL_TEST_FIXTURE_WRITER_METHODS,
  type LiteralAllowlistConfig,
  type LiteralOccurrence,
  parseLiteralReuseResult,
  resolveAllowlist,
  validateLiteralReuse,
  type VisitorKeysMap,
} from "@/validation/literal/index";

import {
  DETECTOR_OPTIONS_DEFAULTS,
  INTEGRATION_CONFIG,
  literalTestFixtureWriterMethods,
  writeLiteralOutputFixture,
  writeSourceWithLiteral,
} from "./support";

const WEB_PRESET_ID = "web";
const WEB_PRESET_TOKEN = "Authorization";
const PROJECT_INCLUDE_TOKEN = "project-include-domain-token";
const literalNoReuseProblemsMessage = "Literal: No problems of type reuse";
const literalVerboseReuseHeading = "REUSE";
const literalVerboseDupeHeading = "DUPE";

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

describe("NEVER: change fixture-writer helpers without updating detector classification", () => {
  it("detector environment fixture-writer calls match the spec-tree environment writer methods", () => {
    expect([...FIXTURE_WRITER_CALLS].sort()).toEqual([...SPEC_TREE_ENV_FIXTURE_WRITER_METHODS].sort());
  });

  it("detector local fixture-writer calls match the literal test helper methods", () => {
    expect([...LITERAL_TEST_FIXTURE_WRITER_METHODS].sort()).toEqual([...literalTestFixtureWriterMethods].sort());
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

describe("literal command output compliance", () => {
  it("default text output is one problem per line in parseable [kind] value path:line form", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir });

      expect(result.output.split("\n")).toContain(`[reuse] "${fixture.reuseLiteral}" ${fixture.reuseTestFile}:1`);
      expect(result.output.split("\n")).toContain(`[dupe] "${fixture.dupeLiteral}" ${fixture.dupeFirstTestFile}:1`);
    });
  });

  it("--files-with-problems outputs each unique affected test file path on its own line", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, filesWithProblems: true });
      const lines = result.output.split("\n");

      expect(lines).toEqual([...new Set(lines)].sort());
      expect(lines.every((line) => !line.includes(":"))).toBe(true);
      expect(lines).toContain(fixture.reuseTestFile);
    });
  });

  it("--literals outputs each unique literal value on its own line", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const result = await literalCommand({ cwd: env.projectDir, literals: true });
      const lines = result.output.split("\n");

      expect(lines).toEqual([...new Set(lines)].sort());
      expect(lines).toContain(`"${fixture.reuseLiteral}"`);
      expect(lines).toContain(`"${fixture.dupeLiteral}"`);
    });
  });

  it("--kind applies to default, verbose, files-with-problems, literals, and json output modes", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const fixture = await writeLiteralOutputFixture(env);

      const defaultText = await literalCommand({ cwd: env.projectDir, kind: "reuse" });
      const verboseText = await literalCommand({ cwd: env.projectDir, kind: "reuse", verbose: true });
      const filesText = await literalCommand({ cwd: env.projectDir, kind: "reuse", filesWithProblems: true });
      const literalsText = await literalCommand({ cwd: env.projectDir, kind: "reuse", literals: true });
      const jsonText = await literalCommand({ cwd: env.projectDir, kind: "reuse", json: true });
      const parsed = parseLiteralReuseResult(JSON.parse(jsonText.output) as unknown);

      expect(defaultText.output).toContain(fixture.reuseLiteral);
      expect(defaultText.output).not.toContain(fixture.dupeLiteral);
      expect(verboseText.output).toContain(literalVerboseReuseHeading);
      expect(verboseText.output).not.toContain(literalVerboseDupeHeading);
      expect(filesText.output).toBe(fixture.reuseTestFile);
      expect(literalsText.output).toBe(`"${fixture.reuseLiteral}"`);
      expect(parsed.srcReuse).toHaveLength(1);
      expect(parsed.testDupe).toEqual([]);
    });
  });

  it("--kind with no matching problems returns the no-match message", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeLiteralOutputFixture(env);

      const result = await literalCommand({
        cwd: env.projectDir,
        files: ["tests/dupe-a.test.ts", "tests/dupe-b.test.ts"],
        kind: "reuse",
      });

      expect(result.output).toBe(literalNoReuseProblemsMessage);
    });
  });

  it("exit code reflects filtered problems when --kind is specified", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeLiteralOutputFixture(env);

      const reuseOnly = await literalCommand({
        cwd: env.projectDir,
        files: ["tests/dupe-a.test.ts", "tests/dupe-b.test.ts"],
        kind: "reuse",
      });
      const dupeOnly = await literalCommand({
        cwd: env.projectDir,
        files: ["tests/dupe-a.test.ts", "tests/dupe-b.test.ts"],
        kind: "dupe",
      });

      expect(reuseOnly.exitCode).toBe(0);
      expect(dupeOnly.exitCode).toBe(1);
    });
  });

  it("--kind with --json emits empty arrays for the non-matching problem kind", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeLiteralOutputFixture(env);

      const reuseJson = await literalCommand({ cwd: env.projectDir, kind: "reuse", json: true });
      const dupeJson = await literalCommand({ cwd: env.projectDir, kind: "dupe", json: true });

      expect(parseLiteralReuseResult(JSON.parse(reuseJson.output) as unknown).testDupe).toEqual([]);
      expect(parseLiteralReuseResult(JSON.parse(dupeJson.output) as unknown).srcReuse).toEqual([]);
    });
  });
});
