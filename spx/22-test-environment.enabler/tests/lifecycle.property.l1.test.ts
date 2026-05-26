import { existsSync } from "node:fs";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — cleanup invariance", () => {
  it("runs cleanup exactly once per invocation under random callback outcomes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          outcome: fc.oneof(fc.constant("return" as const), fc.constant("throw" as const)),
          awaits: fc.integer({ min: 0, max: 3 }),
        }),
        async ({ outcome, awaits }) => {
          let productDir = "";

          const run = (): Promise<void> =>
            withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
              productDir = env.productDir;
              for (let i = 0; i < awaits; i++) {
                await Promise.resolve();
              }
              if (outcome === "throw") {
                throw new Error("callback failure");
              }
            });

          if (outcome === "return") {
            await run();
          } else {
            await expect(run()).rejects.toBeInstanceOf(Error);
          }

          expect(productDir.length).toBeGreaterThan(0);
          expect(existsSync(productDir)).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });
});
