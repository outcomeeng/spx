import { access } from "node:fs/promises";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arbitraryDecisionPath, arbitraryNodePath, arbitrarySpecTree, withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

const MINIMAL_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

const NODE_SUFFIX_PATTERN = /\.(enabler|outcome)$/;
const DECISION_SUFFIX_PATTERN = /\.(adr|pdr)\.md$/;

describe("arbitraryNodePath — free-function form", () => {
  it("generates paths whose trailing segment carries one of the Config's node suffixes", () => {
    fc.assert(
      fc.property(arbitraryNodePath(MINIMAL_CONFIG), (path) => {
        expect(path.endsWith("/") === false).toBe(true);
        expect(NODE_SUFFIX_PATTERN.test(path)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

describe("arbitraryDecisionPath — free-function form", () => {
  it("generates paths whose trailing segment carries one of the Config's decision suffixes", () => {
    fc.assert(
      fc.property(arbitraryDecisionPath(MINIMAL_CONFIG), (path) => {
        expect(DECISION_SUFFIX_PATTERN.test(path)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

describe("arbitrarySpecTree — free-function form", () => {
  it("generates tree descriptors whose entries have kind-appropriate paths", () => {
    fc.assert(
      fc.property(arbitrarySpecTree(MINIMAL_CONFIG), (tree) => {
        for (const entry of tree.entries) {
          if (entry.kind === "enabler" || entry.kind === "outcome") {
            expect(NODE_SUFFIX_PATTERN.test(entry.path)).toBe(true);
          } else {
            expect(DECISION_SUFFIX_PATTERN.test(entry.path)).toBe(true);
          }
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("env-scoped generators — produce fixtures materializable inside the callback", () => {
  it("every arbitraryNodePath sample can be written via writeNode and observed on disk", async () => {
    await withTestEnv(MINIMAL_CONFIG, async (env) => {
      await fc.assert(
        fc.asyncProperty(env.arbitraryNodePath, async (path) => {
          const specRelative = `${path}/spec.md`;
          await env.writeNode(specRelative, `# ${path}\n`);
          await access(join(env.projectDir, specRelative));
        }),
        { numRuns: 10 },
      );
    });
  });

  it("env-scoped and free-function generators produce values of the same shape", () => {
    fc.assert(
      fc.property(arbitraryNodePath(MINIMAL_CONFIG), (free) => {
        expect(NODE_SUFFIX_PATTERN.test(free)).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});
