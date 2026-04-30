import { describe, expect, it } from "vitest";

import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
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
