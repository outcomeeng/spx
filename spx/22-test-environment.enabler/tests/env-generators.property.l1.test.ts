import { describe, expect, it } from "vitest";

import { createFilesystemSpecTreeSource, readSpecTree, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { TEST_ENVIRONMENT_GENERATOR } from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("env-scoped generators — produce fixtures materializable inside the callback", () => {
  it("materializes every arbitraryNodePath sample into a node the spec-tree read operation recognizes", async () => {
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

          const specFileName = fixturePath.slice(
            fixturePath.lastIndexOf(SPEC_TREE_GRAMMAR.PATH_SEPARATOR) + 1,
          );
          expect(specFileName.endsWith(SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX)).toBe(true);
          expect(nodeId).toContain(
            specFileName.slice(0, -SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX.length),
          );
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
});
