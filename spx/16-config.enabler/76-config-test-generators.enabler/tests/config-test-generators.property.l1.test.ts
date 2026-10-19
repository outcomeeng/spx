import { describe, expect, it } from "vitest";

import { validatePathFilterConfig } from "@/config/primitives/path-filter";
import { harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { HARNESS_ENVIRONMENT_SECTION } from "@/lib/harness-environment-section";
import { KIND_REGISTRY, SPEC_TREE_CONFIG_FIELDS, SPEC_TREE_SECTION, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, testingConfigDescriptor } from "@/test/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("config test generators properties", () => {
  it("carries no kinds field in spec-tree fixtures and a source-owned kinds field in rejected sections", () => {
    const validSection = MINIMAL_SPEC_TREE_CONFIG[SPEC_TREE_SECTION];
    expect(Object.hasOwn(validSection as object, SPEC_TREE_CONFIG_FIELDS.KINDS)).toBe(false);
    expect(specTreeConfigDescriptor.validate(validSection).ok).toBe(true);

    assertProperty(
      CONFIG_TEST_GENERATOR.specTreeRejectedKindMapConfig(),
      (rejected) => {
        const section = rejected[SPEC_TREE_SECTION] as { readonly [SPEC_TREE_CONFIG_FIELDS.KINDS]: object };
        const definitions = Object.entries(section[SPEC_TREE_CONFIG_FIELDS.KINDS]);
        expect(definitions.length).toBeGreaterThan(0);
        for (const [name, definition] of definitions) {
          expect(Object.hasOwn(KIND_REGISTRY, name)).toBe(true);
          expect(definition).toEqual(KIND_REGISTRY[name as keyof typeof KIND_REGISTRY]);
        }
        expect(specTreeConfigDescriptor.validate(section).ok).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );

    assertProperty(
      CONFIG_TEST_GENERATOR.specTreeArrayKindsConfig(),
      (rejected) => {
        const section = rejected.config[SPEC_TREE_SECTION] as { readonly [SPEC_TREE_CONFIG_FIELDS.KINDS]: unknown };
        expect(section[SPEC_TREE_CONFIG_FIELDS.KINDS]).toEqual(rejected.selectedKinds);
        expect(rejected.selectedKinds.length).toBeGreaterThan(0);
        for (const name of rejected.selectedKinds) {
          expect(Object.hasOwn(KIND_REGISTRY, name)).toBe(true);
        }
        expect(specTreeConfigDescriptor.validate(section).ok).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates test-scoped descriptors whose sections validate to their generated expected values", () => {
    assertProperty(
      CONFIG_TEST_GENERATOR.tokenDescriptor(),
      (generated) => {
        const result = generated.descriptor.validate(generated.defaults);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(generated.defaults);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );

    assertProperty(
      CONFIG_TEST_GENERATOR.modeDescriptor(),
      (generated) => {
        expect(generated.descriptor.section).toBe(generated.section);
        for (const accepted of [generated.defaults, generated.override]) {
          const result = generated.descriptor.validate(accepted);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toEqual(accepted);
          }
        }
        expect(generated.descriptor.validate(generated.invalid).ok).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates path-filter and descriptor fixtures that validate through owning contracts", () => {
    assertProperty(
      CONFIG_TEST_GENERATOR.pathFilter(),
      (pathFilter) => {
        const result = validatePathFilterConfig(
          pathFilter,
          `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(pathFilter);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );

    assertProperty(
      CONFIG_TEST_GENERATOR.testingConfig(),
      (generated) => {
        const result = testingConfigDescriptor.validate(generated.config[TESTING_SECTION]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(generated.expected);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );

    assertProperty(
      CONFIG_TEST_GENERATOR.harnessEnvironmentConfig(),
      (generated) => {
        const result = harnessEnvironmentConfigDescriptor.validate(generated.config[HARNESS_ENVIRONMENT_SECTION]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(generated.expected);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
