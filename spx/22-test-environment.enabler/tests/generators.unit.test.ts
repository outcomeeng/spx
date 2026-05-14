import { access } from "node:fs/promises";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DECISION_SUFFIXES, NODE_KINDS, NODE_SUFFIXES } from "@/lib/spec-tree/config";
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
        expect(path.endsWith("/") === false).toBe(true);
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

describe("env-scoped generators — produce fixtures materializable inside the callback", () => {
  it("every arbitraryNodePath sample can be written via writeNode and observed on disk", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await fc.assert(
        fc.asyncProperty(env.arbitraryNodePath, async (path) => {
          const specRelative = `${path}/spec.md`;
          await env.writeNode(specRelative, `# ${path}\n`);
          await access(join(env.productDir, specRelative));
        }),
        { numRuns: 10 },
      );
    });
  });

  it("env-scoped and free-function generators produce values of the same shape", () => {
    fc.assert(
      fc.property(arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG), (free) => {
        expect(hasRegisteredNodeSuffix(free)).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});
