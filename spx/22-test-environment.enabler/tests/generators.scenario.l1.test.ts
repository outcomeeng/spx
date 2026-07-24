import { describe, expect, it } from "vitest";

import { createFilesystemSpecTreeSource, readSpecTree } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { TEST_ENVIRONMENT_GENERATOR } from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("env-scoped generators — produce fixtures materializable inside the callback", () => {
  it("every arbitraryNodePath sample can be written via writeNode and observed on disk", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await assertProperty(
        TEST_ENVIRONMENT_GENERATOR.nodeWriteCase(env.arbitraryNodePath),
        async ({ contents, fixturePath, nodeId }) => {
          await env.writeNode(fixturePath, contents);
          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          });
          expect(await env.readFile(fixturePath)).toBe(contents);
          expect(snapshot.allNodes.map((node) => node.id)).toContain(nodeId);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
});
