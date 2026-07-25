import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  TEST_ENVIRONMENT_CALLBACK_OUTCOME,
  TEST_ENVIRONMENT_GENERATOR,
} from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — cleanup invariance", () => {
  it("runs cleanup exactly once per invocation under random callback outcomes", async () => {
    await assertProperty(
      TEST_ENVIRONMENT_GENERATOR.lifecycleCase(),
      async ({ awaits, callbackError, outcome }) => {
        let productDir = "";

        const run = (): Promise<void> =>
          withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
            productDir = env.productDir;
            for (let i = 0; i < awaits; i++) {
              await Promise.resolve();
            }
            if (outcome === TEST_ENVIRONMENT_CALLBACK_OUTCOME.THROW) {
              throw callbackError;
            }
          });

        if (outcome === TEST_ENVIRONMENT_CALLBACK_OUTCOME.RETURN) {
          await run();
        } else {
          await expect(run()).rejects.toBe(callbackError);
        }

        expect(productDir.length).toBeGreaterThan(0);
        expect(existsSync(productDir)).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
