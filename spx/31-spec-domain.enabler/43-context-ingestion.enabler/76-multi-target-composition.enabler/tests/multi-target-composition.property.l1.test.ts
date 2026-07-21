import { describe, expect, it } from "vitest";

import * as fc from "fast-check";

import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { contextCommand, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context target-order permutation stability", () => {
  it("produces byte-identical structured output for every ordering of the same target set", async () => {
    await withRichContextEnv(async (env, paths) => {
      const targets = [paths.rootDirectory, paths.targetId, paths.higherIndexSiblingPath];
      const canonical = await contextCommand({ targets, cwd: env.productDir });
      const canonicalContent = await contextCommand({ targets, cwd: env.productDir, content: true });
      await assertProperty(
        // Shuffling the operand order over the same target set is the open
        // domain; a composition keyed on operand order breaks byte identity.
        fc.shuffledSubarray(targets, { minLength: targets.length }),
        async (permutation) => {
          expect(await contextCommand({ targets: permutation, cwd: env.productDir })).toBe(canonical);
          expect(await contextCommand({ targets: permutation, cwd: env.productDir, content: true })).toBe(
            canonicalContent,
          );
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
});
