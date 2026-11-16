import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  SPEC_TREE_FIXTURE_PATH_ROLES,
  SPEC_TREE_FIXTURES_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree-fixtures";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { SPEC_TREE_ENV_PATH_ESCAPE_MESSAGE, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withSpecTreeEnv safety", () => {
  it.each(SPEC_TREE_FIXTURE_PATH_ROLES)(
    "ALWAYS: rejects materializing a fixture whose %s slug escapes the temp product directory",
    async (role) => {
      await assertProperty(
        SPEC_TREE_FIXTURES_TEST_GENERATOR.fixtureWithEntrySlug(
          role,
          SPEC_TREE_FIXTURES_TEST_GENERATOR.escapingFixtureSlug(),
        ),
        async ({ fixture }) => {
          await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
            await expect(env.materialize(fixture)).rejects.toThrow(SPEC_TREE_ENV_PATH_ESCAPE_MESSAGE);
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

  it.each(SPEC_TREE_FIXTURE_PATH_ROLES)(
    "ALWAYS: materializes a fixture whose %s slug stays inside the temp product directory into that directory",
    async (role) => {
      await assertProperty(
        SPEC_TREE_FIXTURES_TEST_GENERATOR.fixtureWithEntrySlug(
          role,
          SPEC_TREE_FIXTURES_TEST_GENERATOR.containedFixtureSlug(),
        ),
        async ({ fixture, finalSegment }) => {
          await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
            await expect(env.materialize(fixture)).resolves.toBeUndefined();

            const written = await readdir(env.productDir, { recursive: true });
            expect(written.some((path) => path.includes(finalSegment))).toBe(true);
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
