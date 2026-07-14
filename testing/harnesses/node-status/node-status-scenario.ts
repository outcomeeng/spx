import { dirname, join } from "node:path";

import { expect } from "vitest";

import {
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  createNodeStatusProvider,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  readNodeStatus,
  serializeNodeStatus,
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

export async function assertNodeStatusUpdateWritesVerificationProjection(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTreeWithVerificationReferences());

  await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
    const { resolveOutcome } = await recordOutcomeEvidence();
    await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

    for (const expectation of expectations) {
      const recorded = JSON.parse(await env.readFile(expectation.statusPath));
      expectRecordedEvidence(recorded, expectation);
    }
  });
}

export async function assertNodeStatusUpdateRemovesStaleStatusFile(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

  await withClassificationTree(fixture, async ({ env, recordOutcomeEvidence }) => {
    const { resolveOutcome } = await recordOutcomeEvidence();
    await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

    const staleStatusPath = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.orphanStatusPath());
    const staleNodeDirectory = join(env.productDir, dirname(staleStatusPath));
    await env.writeRaw(staleStatusPath, serializeNodeStatus(createNodeStatusFile({})));
    expect(readNodeStatus(staleNodeDirectory)).toBeDefined();

    await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

    expect(readNodeStatus(staleNodeDirectory)).toBeUndefined();
  });
}

export async function assertMissingNodeStatusRoutesToLiveDerivation(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

  await withClassificationTree(fixture, async ({ env, expectations }) => {
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

    for (const expectation of expectations) {
      expect(nodeStateById(providedSnapshot.nodes, expectation.nodeId)).toBe(
        nodeStateById(liveSnapshot.nodes, expectation.nodeId),
      );
    }
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
