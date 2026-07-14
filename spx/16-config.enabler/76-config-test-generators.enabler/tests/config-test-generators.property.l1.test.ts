import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { validatePathFilterConfig } from "@/config/primitives/path-filter";
import { HARNESS_ENVIRONMENT_SECTION, harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { DECISION_KINDS, NODE_KINDS, SPEC_TREE_KIND_CATEGORY, SPEC_TREE_SECTION } from "@/lib/spec-tree";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, testingConfigDescriptor } from "@/test/config";
import { CONFIG_GENERATOR } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";

describe("config test generators properties", () => {
  it("generates spec-tree configs with node and decision kind coverage", () => {
    fc.assert(
      fc.property(CONFIG_GENERATOR.validSpecTreeConfig(), (config) => {
        const specTreeSection = config[SPEC_TREE_SECTION];
        expect(specTreeSection).toBeDefined();

        const kinds = (specTreeSection as { readonly kinds?: Record<string, unknown> }).kinds ?? {};
        expect(NODE_KINDS.some((kind) => Object.hasOwn(kinds, kind))).toBe(true);
        expect(DECISION_KINDS.some((kind) => Object.hasOwn(kinds, kind))).toBe(true);
      }),
    );
  });

  it("generates kind overrides with source-owned kind categories", () => {
    fc.assert(
      fc.property(
        CONFIG_TEST_GENERATOR.kindOverride(SPEC_TREE_KIND_CATEGORY.NODE),
        CONFIG_TEST_GENERATOR.kindOverride(SPEC_TREE_KIND_CATEGORY.DECISION),
        (nodeOverride, decisionOverride) => {
          expect(nodeOverride.definition.category).toBe(SPEC_TREE_KIND_CATEGORY.NODE);
          expect(decisionOverride.definition.category).toBe(SPEC_TREE_KIND_CATEGORY.DECISION);
          expect(nodeOverride.definition.label).toBe(nodeOverride.kind);
          expect(decisionOverride.definition.label).toBe(decisionOverride.kind);
        },
      ),
    );
  });

  it("generates path-filter and descriptor fixtures that validate through owning contracts", () => {
    fc.assert(
      fc.property(
        CONFIG_TEST_GENERATOR.pathFilter(),
        CONFIG_TEST_GENERATOR.testingConfig(),
        CONFIG_TEST_GENERATOR.harnessEnvironmentConfig(),
        (pathFilter, testingConfig, harnessEnvironmentConfig) => {
          const pathFilterResult = validatePathFilterConfig(
            pathFilter,
            `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
          );
          expect(pathFilterResult.ok).toBe(true);
          if (pathFilterResult.ok) {
            expect(pathFilterResult.value).toEqual(pathFilter);
          }

          const testingResult = testingConfigDescriptor.validate(testingConfig.config[TESTING_SECTION]);
          expect(testingResult.ok).toBe(true);
          if (testingResult.ok) {
            expect(testingResult.value).toEqual(testingConfig.expected);
          }

          const harnessEnvironmentResult = harnessEnvironmentConfigDescriptor.validate(
            harnessEnvironmentConfig.config[HARNESS_ENVIRONMENT_SECTION],
          );
          expect(harnessEnvironmentResult.ok).toBe(true);
          if (harnessEnvironmentResult.ok) {
            expect(harnessEnvironmentResult.value).toEqual(harnessEnvironmentConfig.expected);
          }
        },
      ),
    );
  });
});
