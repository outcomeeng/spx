import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  DECISION_SUFFIXES,
  NODE_KINDS,
  NODE_SUFFIXES,
  readSpecTree,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  arbitraryDecisionPath,
  arbitraryNodePath,
  arbitrarySpecTree,
} from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("arbitraryNodePath — free-function form", () => {
  it("generates paths whose trailing segment carries one of the Config's node suffixes", () => {
    assertProperty(
      arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG),
      (path) => {
        expect(path.endsWith(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)).toBe(false);
        expect(NODE_SUFFIXES.some((suffix) => path.endsWith(suffix))).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("arbitraryDecisionPath — free-function form", () => {
  it("generates paths whose trailing segment carries one of the Config's decision suffixes", () => {
    assertProperty(
      arbitraryDecisionPath(MINIMAL_SPEC_TREE_CONFIG),
      (path) => {
        expect(DECISION_SUFFIXES.some((suffix) => path.endsWith(suffix))).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("arbitrarySpecTree — free-function form", () => {
  it("generates tree descriptors whose entries have kind-appropriate paths", () => {
    assertProperty(
      arbitrarySpecTree(MINIMAL_SPEC_TREE_CONFIG),
      (tree) => {
        for (const entry of tree.entries) {
          if (NODE_KINDS.some((kind) => kind === entry.kind)) {
            expect(NODE_SUFFIXES.some((suffix) => entry.path.endsWith(suffix))).toBe(true);
          } else {
            expect(DECISION_SUFFIXES.some((suffix) => entry.path.endsWith(suffix))).toBe(true);
          }
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("generated paths parse through the filesystem read operation", () => {
  it("recognizes every arbitraryNodePath sample as a node source entry", () => {
    assertProperty(
      arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG),
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

  it("recognizes every arbitraryDecisionPath sample as a decision source entry", () => {
    assertProperty(
      arbitraryDecisionPath(MINIMAL_SPEC_TREE_CONFIG),
      (path) => {
        const entry = recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: path,
        });
        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
        expect(entry?.id).toBe(path);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("generated spec trees parse through readSpecTree", () => {
  it("materializes every arbitrarySpecTree fixture into a tree readSpecTree recognizes entry-for-entry", async () => {
    await assertProperty(
      arbitrarySpecTree(MINIMAL_SPEC_TREE_CONFIG),
      async (fixture) => {
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          for (const entry of fixture.entries) {
            if (NODE_KINDS.some((kind) => kind === entry.kind)) {
              await env.writeNode(entry.fixturePath, entry.contents);
            } else {
              await env.writeDecision(entry.fixturePath, entry.contents);
            }
          }

          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          });
          const recognizedIds = new Set(snapshot.entries.map((sourceEntry) => sourceEntry.id));

          for (const entry of fixture.entries) {
            expect(recognizedIds.has(entry.path)).toBe(true);
          }
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
