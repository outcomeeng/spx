import { describe, expect, it } from "vitest";

import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  detectReuse,
  type LiteralIndex,
  type LiteralOccurrence,
  REMEDIATION,
} from "@/validation/literal/index.js";

import { DETECTOR_OPTIONS_DEFAULTS, EMPTY_ALLOWLIST } from "./support.js";

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

  it("test↔test duplication findings carry remediation === REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT", () => {
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
      expect(f.remediation).toBe(REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT);
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
