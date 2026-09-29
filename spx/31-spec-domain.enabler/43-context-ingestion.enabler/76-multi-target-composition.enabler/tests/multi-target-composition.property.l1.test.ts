import { describe, expect, it } from "vitest";

import * as fc from "fast-check";

import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import {
  contextShowEntries,
  contextShowJson,
  contextShowText,
  entryPaths,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context target-order permutation stability", () => {
  it(
    "produces byte-identical output for every ordering of the same target set",
    async () => {
      await withRichContextEnv(async (env, paths) => {
        const targets = [paths.rootDirectory, paths.targetId, paths.higherIndexSiblingPath];
        const canonicalText = await contextShowText({ targets, cwd: env.productDir });
        const canonicalJson = await contextShowJson({ targets, cwd: env.productDir });
        await assertProperty(
          // Shuffling the operand order over the same set is the open domain;
          // a composition keyed on operand order breaks byte identity.
          fc.shuffledSubarray(targets, { minLength: targets.length }),
          async (permutation) => {
            const options = { targets: permutation, cwd: env.productDir };
            expect(await contextShowText(options)).toBe(canonicalText);
            expect(await contextShowJson(options)).toBe(canonicalJson);
            // The three targets share documents and references; each appears
            // once however the operands are ordered.
            const shown = entryPaths(await contextShowEntries(options));
            expect(new Set(shown).size).toBe(shown.length);
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
