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
        runNodeTests: (nodeId: string) =>
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
