import { describe, expect, it } from "vitest";

import { createFilesystemSpecTreeSource, readSpecTree } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { arbitraryNodeEntry, arbitrarySpecTree } from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("generated fixtures materialize into a readable temp product state", () => {
  it("materializes every generated node where the spec-tree read operation resolves its spec file", async () => {
    await assertProperty(
      arbitraryNodeEntry(MINIMAL_SPEC_TREE_CONFIG),
      async ({ contents, fixturePath, path }) => {
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          await env.writeNode(fixturePath, contents);
          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          });

          expect(await env.readFile(fixturePath)).toBe(contents);

          const node = snapshot.allNodes.find((candidate) => candidate.id === path);
          expect(node).toBeDefined();
          // The reader derives this path from the directory it parsed, so it is independent of
          // the generator: a spec file not named for its node directory's slug diverges here.
          expect(node?.ref?.path).toBe(fixturePath);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("materializes every generated tree so the reader recognizes each entry it declares", async () => {
    await assertProperty(
      arbitrarySpecTree(MINIMAL_SPEC_TREE_CONFIG),
      async (fixture) => {
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          for (const entry of fixture.entries) {
            await env.writeRaw(entry.fixturePath, entry.contents);
          }

          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          });
          const recognized = new Set(snapshot.entries.map((sourceEntry) => sourceEntry.id));

          for (const entry of fixture.entries) {
            expect(recognized.has(entry.path)).toBe(true);
          }
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
