import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function rooted(relativePath: string): string {
  return [SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}

describe("env-scoped generators — produce fixtures materializable inside the callback", () => {
  it("materializes every generated node where the spec-tree read operation resolves its spec file", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await assertProperty(
        env.arbitraryNodeEntry,
        async ({ contents, fixturePath, path }) => {
          await env.writeNode(fixturePath, contents);
          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          });

          expect(await env.readFile(fixturePath)).toBe(contents);

          const node = snapshot.allNodes.find((candidate) => candidate.id === path);
          expect(node).toBeDefined();
          // The reader derives this path from the directory it parsed, so it is independent of the
          // generator: a spec file named anything other than its node directory's slug diverges here.
          expect(node?.ref?.path).toBe(fixturePath);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });

  it("draws node directory paths the reader recognizes as nodes", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await assertProperty(
        env.arbitraryNodePath,
        (path) => {
          const entry = recognizeSpecTreeFilesystemEntry({
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
            relativePath: path,
          });

          expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
          expect(entry?.id).toBe(path);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });

  it("draws decision paths the reader recognizes as decisions once written", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await assertProperty(
        env.arbitraryDecisionPath,
        async (path) => {
          const entry = recognizeSpecTreeFilesystemEntry({
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
            relativePath: path,
          });

          expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
          expect(entry?.id).toBe(path);

          const contents = `# ${path}\n`;
          await env.writeDecision(rooted(path), contents);
          expect(await env.readFile(rooted(path))).toBe(contents);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });

  it("materializes every generated tree so the reader recognizes each entry it declares", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await assertProperty(
        env.arbitrarySpecTree,
        async (fixture) => {
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
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
});
