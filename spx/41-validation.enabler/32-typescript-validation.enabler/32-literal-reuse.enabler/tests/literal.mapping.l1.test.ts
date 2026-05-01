import { describe, expect, it } from "vitest";

import {
  filterLiteralFindings,
  formatDefaultLiteralProblems,
  formatFilesWithProblems,
  formatLiteralValues,
  formatVerboseLiteralProblems,
} from "@/commands/validation/literal";
import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  type DetectionResult,
  detectReuse,
  type LiteralIndex,
  type LiteralOccurrence,
  REMEDIATION,
  resolveAllowlist,
} from "@/validation/literal/index";

import { DETECTOR_OPTIONS_DEFAULTS, EMPTY_ALLOWLIST } from "./support";

const WEB_PRESET_ID = "web";

const WEB_PRESET_TOKENS: readonly string[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "Content-Type",
  "Authorization",
  "Accept",
  "status",
  "message",
  "error",
  "data",
  "class",
  "id",
  "href",
  "src",
  "type",
  "name",
  "value",
];

const DEFAULT_OPTIONS = {
  visitorKeys: defaultVisitorKeys,
  ...DETECTOR_OPTIONS_DEFAULTS,
};

const sampleProblems: DetectionResult = {
  srcReuse: [
    {
      test: { file: "tests/reuse-z.test.ts", line: 7 },
      kind: "string",
      value: "source-z-token",
      src: [{ file: "src/reuse-z.ts", line: 1 }],
      remediation: REMEDIATION.IMPORT_FROM_SOURCE,
    },
    {
      test: { file: "tests/reuse-a.test.ts", line: 3 },
      kind: "number",
      value: "30000",
      src: [{ file: "src/reuse-a.ts", line: 2 }],
      remediation: REMEDIATION.IMPORT_FROM_SOURCE,
    },
  ],
  testDupe: [
    {
      test: { file: "tests/dupe-b.test.ts", line: 5 },
      kind: "string",
      value: "dupe-token",
      otherTests: [{ file: "tests/dupe-a.test.ts", line: 2 }],
      remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
    },
    {
      test: { file: "tests/dupe-a.test.ts", line: 2 },
      kind: "string",
      value: "dupe-token",
      otherTests: [{ file: "tests/dupe-b.test.ts", line: 5 }],
      remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
    },
  ],
};

function indexSources(
  ...sources: ReadonlyArray<readonly [string, string]>
): LiteralIndex {
  const all: LiteralOccurrence[] = [];
  for (const [filename, source] of sources) {
    all.push(...collectLiterals(source, filename, DEFAULT_OPTIONS));
  }
  return buildIndex(all);
}

function testOccurrences(
  ...entries: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, readonly LiteralOccurrence[]> {
  const map = new Map<string, readonly LiteralOccurrence[]>();
  for (const [filename, source] of entries) {
    map.set(filename, collectLiterals(source, filename, DEFAULT_OPTIONS));
  }
  return map;
}

describe("finding-kind → remediation mapping", () => {
  it("src↔test reuse findings carry remediation === REMEDIATION.IMPORT_FROM_SOURCE", () => {
    const reuseValue = "reuse-value-alpha";
    const srcIndex = indexSources(["src/a.ts", `export const A = "${reuseValue}";`]);
    const tests = testOccurrences(
      ["tests/reuse.test.ts", `expect(v).toBe("${reuseValue}");`],
    );

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const finding = result.srcReuse.find((f) => f.value === reuseValue);
    expect(finding).toBeDefined();
    expect(finding?.remediation).toBe(REMEDIATION.IMPORT_FROM_SOURCE);
  });

  it("test↔test duplication findings carry remediation === REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR", () => {
    const dupeValue = "dupe-value-delta";
    const srcIndex = indexSources(["src/a.ts", `export const A = "unrelated";`]);
    const tests = testOccurrences(
      ["tests/d1.test.ts", `expect(v).toBe("${dupeValue}");`],
      ["tests/d2.test.ts", `expect(v).toBe("${dupeValue}");`],
    );

    const result = detectReuse({
      srcIndex,
      testOccurrencesByFile: tests,
      allowlist: EMPTY_ALLOWLIST,
    });

    const findings = result.testDupe.filter((f) => f.value === dupeValue);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    for (const f of findings) {
      expect(f.remediation).toBe(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR);
    }
  });
});

describe("AST node → occurrence-kind mapping", () => {
  it.each(
    [
      ["Literal with string value", `export const S = "stringdomainvalue";`, "stringdomainvalue", "string"],
      ["Literal with numeric value of meaningful magnitude", `export const N = 123456;`, "123456", "number"],
      ["TemplateElement cooked string", "export const T = `templatedomainvalue`;", "templatedomainvalue", "string"],
    ] as const,
  )("%s produces an occurrence with the expected kind and value", (_label, source, expectedValue, expectedKind) => {
    const occurrences = collectLiterals(source, "src/kinds.ts", DEFAULT_OPTIONS);
    const match = occurrences.find((o) => o.value === expectedValue);
    expect(match).toBeDefined();
    expect(match?.kind).toBe(expectedKind);
  });
});

describe("effective allowlist = ⋃(presets) ∪ include \\ exclude", () => {
  it.each([
    {
      label: "presets only — every preset value present",
      config: { presets: [WEB_PRESET_ID] },
      members: ["GET", "POST", "Content-Type"],
      nonMembers: ["bespoke-domain-token"],
    },
    {
      label: "include only — non-preset values added",
      config: { include: ["custom-domain-token"] },
      members: ["custom-domain-token"],
      nonMembers: ["GET"],
    },
    {
      label: "include extends presets",
      config: { presets: [WEB_PRESET_ID], include: ["custom-domain-token"] },
      members: ["GET", "custom-domain-token"],
      nonMembers: ["other-domain-token"],
    },
    {
      label: "exclude removes a preset value",
      config: { presets: [WEB_PRESET_ID], exclude: ["GET"] },
      members: ["POST", "Content-Type"],
      nonMembers: ["GET"],
    },
    {
      label: "exclude removes an include value",
      config: { include: ["a-domain-token", "b-domain-token"], exclude: ["b-domain-token"] },
      members: ["a-domain-token"],
      nonMembers: ["b-domain-token"],
    },
    {
      label: "preset + include + exclude composition",
      config: {
        presets: [WEB_PRESET_ID],
        include: ["mine-domain-token"],
        exclude: ["GET", "mine-domain-token"],
      },
      members: ["POST", "Content-Type"],
      nonMembers: ["GET", "mine-domain-token"],
    },
  ])("$label", ({ config, members, nonMembers }) => {
    const effective = resolveAllowlist(config);

    for (const value of members) {
      expect(effective.has(value)).toBe(true);
    }
    for (const value of nonMembers) {
      expect(effective.has(value)).toBe(false);
    }
  });
});

describe("'web' preset bundle membership", () => {
  it.each(WEB_PRESET_TOKENS)("'%s' is bundled in the 'web' preset", (token) => {
    const effective = resolveAllowlist({ presets: [WEB_PRESET_ID] });

    expect(effective.has(token)).toBe(true);
  });
});

describe("literal output mode mappings", () => {
  it("--kind selects src↔test reuse or test↔test duplication arrays", () => {
    expect(filterLiteralFindings(sampleProblems, "reuse")).toEqual({
      srcReuse: [sampleProblems.srcReuse[1], sampleProblems.srcReuse[0]],
      testDupe: [],
    });
    expect(filterLiteralFindings(sampleProblems, "dupe")).toEqual({
      srcReuse: [],
      testDupe: [sampleProblems.testDupe[1], sampleProblems.testDupe[0]],
    });
  });

  it("default text output maps each problem to [kind] value path:line sorted by kind then location", () => {
    expect(formatDefaultLiteralProblems(sampleProblems)).toBe(
      [
        `[reuse] 30000 tests/reuse-a.test.ts:3`,
        `[reuse] "source-z-token" tests/reuse-z.test.ts:7`,
        `[dupe] "dupe-token" tests/dupe-a.test.ts:2`,
        `[dupe] "dupe-token" tests/dupe-b.test.ts:5`,
      ].join("\n"),
    );
  });

  it("--verbose maps problems to kind sections, file headers, and indented problem lines", () => {
    expect(formatVerboseLiteralProblems(sampleProblems)).toBe(
      [
        "Literal: 4 problems (reuse: 2, dupe: 2)",
        "REUSE",
        "tests/reuse-a.test.ts",
        "  line 3: 30000 also in src/reuse-a.ts:2",
        "tests/reuse-z.test.ts",
        "  line 7: \"source-z-token\" also in src/reuse-z.ts:1",
        "DUPE",
        "tests/dupe-a.test.ts",
        "  line 2: \"dupe-token\" also in tests/dupe-b.test.ts:5",
        "tests/dupe-b.test.ts",
        "  line 5: \"dupe-token\" also in tests/dupe-a.test.ts:2",
      ].join("\n"),
    );
  });

  it("--files-with-problems maps matching problems to unique sorted test file paths", () => {
    expect(formatFilesWithProblems(sampleProblems)).toBe(
      [
        "tests/dupe-a.test.ts",
        "tests/dupe-b.test.ts",
        "tests/reuse-a.test.ts",
        "tests/reuse-z.test.ts",
      ].join("\n"),
    );
  });

  it("--literals maps matching problems to unique sorted values with strings quoted and numbers decimal", () => {
    expect(formatLiteralValues(sampleProblems)).toBe(
      [
        "30000",
        "\"dupe-token\"",
        "\"source-z-token\"",
      ].join("\n"),
    );
  });
});
