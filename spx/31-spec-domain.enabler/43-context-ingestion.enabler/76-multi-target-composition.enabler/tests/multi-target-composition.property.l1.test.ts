import { describe, expect, it } from "vitest";

import { arbitraryRichContextTargetRequest } from "@testing/generators/spec-tree/rich-context";
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
    "produces byte-identical output for every reordering of every requested operand set, with each shared entry once",
    async () => {
      await withRichContextEnv(async (env, paths) => {
        await assertProperty(
          // Any multiset of accepted operands — aliases of one identity,
          // repeated operands, and any mix of product-root, ancestor, target,
          // and sibling targets — beside a reordering of the same operands.
          arbitraryRichContextTargetRequest(paths),
          async ({ operands, reordered }) => {
            const requested = { targets: operands, cwd: env.productDir };
            const permuted = { targets: reordered, cwd: env.productDir };
            expect(await contextShowText(permuted)).toBe(await contextShowText(requested));
            expect(await contextShowJson(permuted)).toBe(await contextShowJson(requested));
            const shown = entryPaths(await contextShowEntries(requested));
            expect(new Set(shown).size).toBe(shown.length);
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
