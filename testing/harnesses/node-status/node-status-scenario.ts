import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createNodeStatusMechanismRecord,
  createNodeStatusProvider,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  readNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import { createFilesystemSpecTreeSource, readSpecTree, type SpecTreeNode } from "@/lib/spec-tree";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";
import {
  type ClassificationTreeNodeExpectation,
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

export function registerNodeStatusScenarioEvidence(): void {
  describe("spx spec status --update", () => {
    it("writes each node's verification projection to its co-located spx.status.json", async () => {
      const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

      await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
        const resolveOutcome = await recordOutcomeEvidence();
        await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

        for (const expectation of expectations) {
          const recorded = JSON.parse(await env.readFile(expectation.statusPath));
          expectRecordedEvidence(recorded, expectation);
        }
      });
    });

    it("removes a stale status file outside the live node set", async () => {
      const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

      await withClassificationTree(fixture, async ({ env, recordOutcomeEvidence }) => {
        const resolveOutcome = await recordOutcomeEvidence();
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
  });
}

function expectRecordedEvidence(recorded: unknown, expectation: ClassificationTreeNodeExpectation): void {
  const verification = (recorded as { readonly verification: Record<string, Record<string, string>> }).verification;
  if (expectation.evidencePaths.length === 0) {
    expect(verification).toEqual({});
    return;
  }

  const testRecord = verification[NODE_STATUS_VERIFICATION_MECHANISM.TEST];
  expect(testRecord).toBeDefined();
  const expectedOutcomes = Object.fromEntries(
    expectation.evidencePaths.map((path) => [path, expectation.facts.expectedEvidenceOutcome]),
  );
  expect(testRecord[NODE_STATUS_FIELD.OVERALL]).toBe(
    createNodeStatusMechanismRecord(expectedOutcomes)[NODE_STATUS_FIELD.OVERALL],
  );
  for (const evidencePath of expectation.evidencePaths) {
    expect(testRecord[evidencePath]).toBe(expectation.facts.expectedEvidenceOutcome);
  }
}
