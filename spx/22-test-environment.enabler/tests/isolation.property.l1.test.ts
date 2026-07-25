import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { TEST_ENVIRONMENT_GENERATOR } from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — concurrent isolation", () => {
  it("gives every concurrent invocation a distinct temp directory and isolates writes across any cardinality of parallel runs", async () => {
    await assertProperty(
      TEST_ENVIRONMENT_GENERATOR.isolationCase(),
      async ({ environments }) => {
        const observations = await Promise.all(
          environments.map(async ({ marker, relativePath }): Promise<{ dir: string; readBack: string }> => {
            let dir = "";
            let readBack = "";
            await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
              dir = env.productDir;
              await env.writeRaw(relativePath, marker);
              readBack = await env.readFile(relativePath);
            });
            return { dir, readBack };
          }),
        );

        const directories = observations.map((o) => o.dir);
        expect(new Set(directories).size).toBe(directories.length);

        observations.forEach(({ readBack }, index) => {
          expect(readBack).toBe(environments[index]?.marker);
        });

        for (const dir of directories) {
          expect(existsSync(dir)).toBe(false);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
