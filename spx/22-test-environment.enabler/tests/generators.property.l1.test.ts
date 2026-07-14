import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  DECISION_SUFFIXES,
  NODE_KINDS,
  NODE_SUFFIXES,
  readSpecTree,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  arbitraryDecisionPath,
  arbitraryNodePath,
  arbitrarySpecTree,
  withTestEnv,
} from "@testing/harnesses/spec-tree/spec-tree";

const nodeKindValues: ReadonlySet<string> = new Set(NODE_KINDS);

function hasRegisteredNodeSuffix(path: string): boolean {
  return NODE_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

function hasRegisteredDecisionSuffix(path: string): boolean {
  return DECISION_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

function hasRegisteredNodeKind(kind: string): boolean {
  return nodeKindValues.has(kind);
}

describe("arbitraryNodePath — free-function form", () => {
  it("generates paths whose trailing segment carries one of the Config's node suffixes", () => {
    fc.assert(
      fc.property(arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG), (path) => {
        expect(path.endsWith("/")).toBe(false);
        expect(hasRegisteredNodeSuffix(path)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

describe("arbitraryDecisionPath — free-function form", () => {
  it("generates paths whose trailing segment carries one of the Config's decision suffixes", () => {
    fc.assert(
      fc.property(arbitraryDecisionPath(MINIMAL_SPEC_TREE_CONFIG), (path) => {
        expect(hasRegisteredDecisionSuffix(path)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

describe("arbitrarySpecTree — free-function form", () => {
  it("generates tree descriptors whose entries have kind-appropriate paths", () => {
    fc.assert(
      fc.property(arbitrarySpecTree(MINIMAL_SPEC_TREE_CONFIG), (tree) => {
        for (const entry of tree.entries) {
          if (hasRegisteredNodeKind(entry.kind)) {
            expect(hasRegisteredNodeSuffix(entry.path)).toBe(true);
          } else {
            expect(hasRegisteredDecisionSuffix(entry.path)).toBe(true);
          }
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("generated paths parse through the filesystem read operation", () => {
  it("recognizes every arbitraryNodePath sample as a node source entry", () => {
    fc.assert(
      fc.property(arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG), (path) => {
        const entry = recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
          relativePath: path,
        });
        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        expect(entry?.id).toBe(path);
      }),
      { numRuns: 50 },
    );
  });

  it("recognizes every arbitraryDecisionPath sample as a decision source entry", () => {
    fc.assert(
      fc.property(arbitraryDecisionPath(MINIMAL_SPEC_TREE_CONFIG), (path) => {
        const entry = recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: path,
        });
        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
        expect(entry?.id).toBe(path);
      }),
      { numRuns: 50 },
    );
  });
});

describe("generated spec trees parse through readSpecTree", () => {
  it("materializes every arbitrarySpecTree fixture into a tree readSpecTree recognizes entry-for-entry", async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySpecTree(MINIMAL_SPEC_TREE_CONFIG), async (fixture) => {
        await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          for (const entry of fixture.entries) {
            if (hasRegisteredNodeKind(entry.kind)) {
              await env.writeNode(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${entry.path}/node.md`, "# generated fixture\n");
            } else {
              await env.writeDecision(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${entry.path}`, "# generated fixture\n");
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
      }),
      { numRuns: 10 },
    );
  });
});
