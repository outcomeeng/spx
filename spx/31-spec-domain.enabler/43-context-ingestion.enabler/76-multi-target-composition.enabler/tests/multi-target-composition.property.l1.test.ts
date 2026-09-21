import { describe, expect, it } from "vitest";

import * as fc from "fast-check";

import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { contextShowJson, contextShowText, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context target-order permutation stability", () => {
  it(
    "produces byte-identical output for every ordering of the same target set and the same loaded-declaration set",
    async () => {
      await withRichContextEnv(async (env, paths) => {
        const targets = [paths.rootDirectory, paths.targetId, paths.higherIndexSiblingPath];
        const loaded = [paths.higherIndexSiblingPath, paths.rootDirectory];
        const canonicalText = await contextShowText({ targets, cwd: env.productDir, loadedTargets: loaded });
        const canonicalJson = await contextShowJson({ targets, cwd: env.productDir, loadedTargets: loaded });
        await assertProperty(
          // Shuffling the operand order and the declaration order over the
          // same sets is the open domain; a composition keyed on either
          // order breaks byte identity.
          fc.tuple(
            fc.shuffledSubarray(targets, { minLength: targets.length }),
            fc.shuffledSubarray(loaded, { minLength: loaded.length }),
          ),
          async ([permutation, declarations]) => {
            const options = { targets: permutation, cwd: env.productDir, loadedTargets: declarations };
            expect(await contextShowText(options)).toBe(canonicalText);
            expect(await contextShowJson(options)).toBe(canonicalJson);
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
