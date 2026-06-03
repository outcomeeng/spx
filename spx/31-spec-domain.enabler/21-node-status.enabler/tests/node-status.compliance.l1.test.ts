import { describe, expect, it } from "vitest";

import { createNodeStatusProvider, NODE_STATUS_FILENAME, readNodeStatus, updateNodeStatus } from "@/lib/node-status";
import { createFilesystemSpecTreeSource, readSpecTree } from "@/lib/spec-tree";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";
import { withClassificationTree } from "@testing/harnesses/node-status/node-status";

describe("node-status write authority", () => {
  it("ALWAYS: spx.status.json appears only after the --update path runs", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations }) => {
      // Building a read-path provider and reading the tree must not write any file.
      const provider = createNodeStatusProvider(env.productDir);
      await readSpecTree({
        source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
        evidence: provider,
      });

      for (const expectation of expectations) {
        await expect(env.readFile(expectation.statusPath)).rejects.toThrow();
      }

      // Only the --update path creates the files.
      await updateNodeStatus({
        productDir: env.productDir,
        resolveOutcome: (nodeId: string) =>
          Promise.resolve(expectations.find((e) => e.nodeId === nodeId)?.facts.testsPass ?? false),
      });

      for (const expectation of expectations) {
        const recorded = JSON.parse(await env.readFile(expectation.statusPath));
        expect(recorded.status).toBe(expectation.expectedStatus);
      }
    });
  });
});

describe("node-status absence semantics", () => {
  it("NEVER: a missing spx.status.json is treated as an error — absence returns undefined", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations }) => {
      for (const expectation of expectations) {
        const nodeDir = `${env.productDir}/${expectation.statusPath.replace(`/${NODE_STATUS_FILENAME}`, "")}`;
        expect(readNodeStatus(nodeDir)).toBeUndefined();
      }
    });
  });
});

describe("node-status delegation to the outcome resolver", () => {
  it("ALWAYS: --update consults the resolver only for test-outcome-stage nodes", async () => {
    // The delegation tree spans all three consultation classes, so the expected
    // set is always non-empty and the assertion discriminates on every run.
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.delegationTree());

    await withClassificationTree(fixture, async ({ env, expectations, resolveOutcome }) => {
      const consulted: string[] = [];
      await updateNodeStatus({
        productDir: env.productDir,
        resolveOutcome: (nodeId: string) => {
          consulted.push(nodeId);
          return resolveOutcome(nodeId);
        },
      });

      // Declared (no tests) and specified (excluded) nodes classify structurally,
      // so only the test-outcome-stage node reaches the resolver.
      const testOutcomeStage = expectations
        .filter((expectation) => expectation.facts.hasTests && !expectation.facts.isExcluded)
        .map((expectation) => expectation.nodeId)
        .sort();
      expect([...consulted].sort()).toEqual(testOutcomeStage);
    });
  });
});
