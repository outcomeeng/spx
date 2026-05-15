import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalDescriptorJson, type DescriptorJsonValue } from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

class NonPlainDescriptorRecord {}

function expectCanonical(value: unknown, path: string): string {
  const result = canonicalDescriptorJson(value, path);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function expectCanonicalRejected(value: unknown, path: string): void {
  const result = canonicalDescriptorJson(value, path);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(path);
  }
}

function arbitraryDescriptorJsonValue(maxDepth = 3): fc.Arbitrary<DescriptorJsonValue> {
  return fc.jsonValue({ maxDepth }) as fc.Arbitrary<DescriptorJsonValue>;
}

function sampleDistinctAsciiKeys(count: number): readonly string[] {
  const samples = fc.sample(CONFIG_TEST_GENERATOR.key(), { numRuns: count * 3 });
  const keys = [...new Set(samples)].slice(0, count);
  expect(keys).toHaveLength(count);
  expect(keys.every((key) => /^[a-z][a-z0-9]+$/.test(key))).toBe(true);
  return keys;
}

function indexOfKey(canonicalJson: string, key: string): number {
  return canonicalJson.indexOf(JSON.stringify(key));
}

describe("canonical descriptor JSON compliance", () => {
  it("sorts object keys recursively and preserves array order", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const [firstKey, secondKey, thirdKey] = [...sampleDistinctAsciiKeys(3)].sort();
    const canonicalJson = expectCanonical({
      [secondKey]: {
        [secondKey]: true,
        [firstKey]: false,
      },
      [firstKey]: [
        { [thirdKey]: 3, [firstKey]: 1, [secondKey]: 2 },
        secondKey,
        firstKey,
      ],
    }, path);

    expect(indexOfKey(canonicalJson, firstKey)).toBeLessThan(indexOfKey(canonicalJson, secondKey));
    expect(indexOfKey(canonicalJson, secondKey)).toBeLessThan(indexOfKey(canonicalJson, thirdKey));
    expect(JSON.parse(canonicalJson)).toEqual({
      [firstKey]: [
        { [firstKey]: 1, [secondKey]: 2, [thirdKey]: 3 },
        secondKey,
        firstKey,
      ],
      [secondKey]: {
        [firstKey]: false,
        [secondKey]: true,
      },
    });
  });

  it("serializes JSON primitives and null with no insignificant whitespace", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const [textKey, numberKey, booleanKey, nullKey, arrayKey] = sampleDistinctAsciiKeys(5);
    const textValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const canonicalJson = expectCanonical({
      [textKey]: textValue,
      [numberKey]: 7,
      [booleanKey]: true,
      [nullKey]: null,
      [arrayKey]: [false, null, {}],
    }, path);

    expect(canonicalJson).not.toMatch(/\s/);
    expect(JSON.parse(canonicalJson)).toEqual({
      [arrayKey]: [false, null, {}],
      [booleanKey]: true,
      [nullKey]: null,
      [numberKey]: 7,
      [textKey]: textValue,
    });
  });

  it("emits stable bytes for generated equivalent resolved sections", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    fc.assert(
      fc.property(arbitraryDescriptorJsonValue(), (section) => {
        const first = canonicalDescriptorJson(section, path);
        const second = canonicalDescriptorJson(section, path);

        expect(first).toEqual(second);
      }),
    );
  });

  it("rejects values that descriptor sections cannot represent as JSON", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const [nestedKey, symbolDescription] = sampleDistinctAsciiKeys(2);
    const symbolKey = Symbol(symbolDescription);
    const circular: Record<string, unknown> = {};
    circular[nestedKey] = circular;

    const cases: readonly unknown[] = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      BigInt(1),
      () => null,
      Symbol(symbolDescription),
      { [nestedKey]: undefined },
      { [nestedKey]: () => null },
      [undefined],
      { [symbolKey]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()) },
      new Date(),
      new Map(),
      new Set(),
      new NonPlainDescriptorRecord(),
      circular,
    ];

    for (const value of cases) {
      expectCanonicalRejected(value, path);
    }
  });

  it("accepts DAG-shared objects without treating them as circular references", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const [firstKey, secondKey, sharedKey] = sampleDistinctAsciiKeys(3);
    const shared = {
      [sharedKey]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()),
    };
    const canonicalJson = expectCanonical({ [secondKey]: shared, [firstKey]: shared }, path);

    expect(JSON.parse(canonicalJson)).toEqual({ [firstKey]: shared, [secondKey]: shared });
  });
});
