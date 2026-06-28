import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_STATUS_METADATA_LABEL, statusCommand } from "@/commands/spec/status";
import { createNodeStatusProvider, NODE_STATUS_FILENAME, readNodeStatus, updateNodeStatus } from "@/lib/node-status";
import { createFilesystemSpecTreeSource, readSpecTree, type SpecTreeNode } from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";
import {
  commitNodeStatusProductPath,
  initializeNodeStatusGitHistory,
  NODE_STATUS_CLASSIFICATION_SPEC_CONTENT,
  requireNodeStatusRecordedExpectation,
  withClassificationTree,
} from "@testing/harnesses/node-status/node-status";

function nodeStateById(nodes: readonly SpecTreeNode[], id: string): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.state;
    const childState = nodeStateById(node.children, id);
    if (childState !== undefined) return childState;
  }
  return undefined;
}

describe("spx spec status --update", () => {
  it("writes each node's verification projection to its co-located spx.status.json", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations, resolveOutcome }) => {
      await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

      for (const expectation of expectations) {
        const recorded = JSON.parse(await env.readFile(expectation.statusPath));
        expect(recorded).toEqual(expectation.expectedStatusFile);
      }
    });
  });

  it("removes a stale status file outside the live node set", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, resolveOutcome }) => {
      await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

      const staleStatusPath = `spx/orphan/${NODE_STATUS_FILENAME}`;
      const staleNodeDirectory = join(env.productDir, dirname(staleStatusPath));
      await env.writeRaw(staleStatusPath, "{\"schemaVersion\":1,\"verification\":{}}\n");
      expect(readNodeStatus(staleNodeDirectory)).toBeDefined();

      await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

      expect(readNodeStatus(staleNodeDirectory)).toBeUndefined();
    });
  });

  it("routes a node with no spx.status.json to live derivation rather than reading a file", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations }) => {
      // No --update has run, so no status file exists for any node.
      for (const expectation of expectations) {
        const statusFilenameSuffix = `/${NODE_STATUS_FILENAME}`;
        const nodeDir = `${env.productDir}/${expectation.statusPath.replace(statusFilenameSuffix, "")}`;
        expect(readNodeStatus(nodeDir)).toBeUndefined();
      }

      const liveSnapshot = await readSpecTree({
        source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
      });
      const providedSnapshot = await readSpecTree({
        source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
        evidence: createNodeStatusProvider(env.productDir),
      });

      // Absence routes to live derivation: the provider returns undefined for every
      // node, so the provided snapshot's states equal the live-derived states.
      for (const expectation of expectations) {
        expect(nodeStateById(providedSnapshot.nodes, expectation.nodeId)).toBe(
          nodeStateById(liveSnapshot.nodes, expectation.nodeId),
        );
      }
    });
  });

  it("marks a recorded node stale without changing its recorded lifecycle state", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.delegationTree());

    await withClassificationTree(fixture, async ({ env, expectations, resolveOutcome }) => {
      const recordedNode = requireNodeStatusRecordedExpectation(expectations);

      await initializeNodeStatusGitHistory(env.productDir);
      await commitNodeStatusProductPath(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);

      await updateNodeStatus({ productDir: env.productDir, resolveOutcome });
      await commitNodeStatusProductPath(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);

      const specPath = [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        recordedNode.nodeId,
        `${recordedNode.slug}.md`,
      ].join("/");
      await env.writeNode(specPath, `${NODE_STATUS_CLASSIFICATION_SPEC_CONTENT}\n`);
      await commitNodeStatusProductPath(env.productDir, specPath);

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(
        `${recordedNode.nodeId} [${recordedNode.expectedStatus}] [${SPEC_STATUS_METADATA_LABEL.STALE}]`,
      );
    });
  });
});
