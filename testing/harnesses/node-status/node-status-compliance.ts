import { join } from "node:path";

import { expect } from "vitest";

import {
  createNodeStatusExcludeReader,
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  createNodeStatusProvider,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_PATH_GRAMMAR,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeOutcomeResolver,
  nodeStatusInvalidExcludeEntryMessage,
  readNodeStatus,
  serializeNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import { createFilesystemSpecTreeSource, readSpecTree, SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withClassificationTree } from "@testing/harnesses/node-status/node-status";

export async function assertNodeStatusFilesOnlyWrittenByUpdate(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

  await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
    // Every public node-status operation that receives a filesystem location
    // other than updateNodeStatus — the projection provider (through readSpecTree),
    // the EXCLUDE reader, and the per-node status reader — runs here against a real
    // tree. Observing that none leaves an spx.status.json behind is name-independent
    // evidence that the --update path alone writes the file: a hidden alternate
    // writer among these paths would create a projection here, whatever its name.
    const provider = createNodeStatusProvider(env.productDir);
    await readSpecTree({
      source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
      evidence: provider,
    });
    createNodeStatusExcludeReader(env.productDir);
    for (const expectation of expectations) {
      const statusFilenameSuffix = `${NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR}${NODE_STATUS_FILENAME}`;
      const nodeDir = join(env.productDir, expectation.statusPath.replace(statusFilenameSuffix, ""));
      expect(readNodeStatus(nodeDir)).toBeUndefined();
    }

    for (const expectation of expectations) {
      await expect(env.readFile(expectation.statusPath)).rejects.toThrow();
    }

    await updateNodeStatus({
      productDir: env.productDir,
      resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
    });

    for (const expectation of expectations) {
      const recorded = JSON.parse(await env.readFile(expectation.statusPath));
      expect(recorded[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);
      const testRecord = recorded.verification[NODE_STATUS_VERIFICATION_MECHANISM.TEST] as
        | Record<string, string>
        | undefined;
      for (const evidencePath of expectation.evidencePaths) {
        expect(testRecord?.[evidencePath]).toBe(expectation.facts.expectedEvidenceOutcome);
      }
    }
  });
}

export async function assertCiRejectsNodeStatusProjectionDrift(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.delegationTree());

  await withClassificationTree(fixture, async ({ env, expectations }) => {
    const target = expectations.find(
      (expectation) => expectation.facts.hasVerificationReferences && !expectation.facts.isExcluded,
    );
    if (target === undefined) {
      throw new Error("delegation tree must contain a test-outcome-stage node");
    }

    // CI regenerates each committed projection from the checkout after running the
    // verification suite, so every covered reference resolves to a fresh run
    // outcome and no committed outcome is carried forward. Model that with an
    // injected resolver reporting each covered reference as freshly passing, then
    // regenerate the true projections.
    const resolveOutcome: NodeOutcomeResolver = (_nodeId, evidencePaths) =>
      Promise.resolve(
        Object.fromEntries(evidencePaths.map((evidencePath) => [evidencePath, NODE_STATUS_EVIDENCE_OUTCOME.PASSED])),
      );
    await updateNodeStatus({ productDir: env.productDir, resolveOutcome });
    const trueProjection = await env.readFile(target.statusPath);

    // Forge a committed projection that disagrees with the recorded evidence, the
    // stale-or-forged state CI exists to reject.
    const forgedProjection = serializeNodeStatus(
      createNodeStatusFile({
        [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(
          Object.fromEntries(
            target.evidencePaths.map((evidencePath) => [evidencePath, NODE_STATUS_EVIDENCE_OUTCOME.FAILED]),
          ),
        ),
      }),
    );
    await env.writeRaw(target.statusPath, forgedProjection);
    expect(await env.readFile(target.statusPath)).not.toBe(trueProjection);

    // Regenerating from the checkout overwrites the forged file with the
    // evidence-derived projection — the byte difference a git comparison rejects.
    await updateNodeStatus({ productDir: env.productDir, resolveOutcome });
    expect(await env.readFile(target.statusPath)).toBe(trueProjection);
  });
}

export async function assertMissingNodeStatusReturnsUndefined(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

  await withClassificationTree(fixture, async ({ env, expectations }) => {
    for (const expectation of expectations) {
      const statusFilenameSuffix = `${NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR}${NODE_STATUS_FILENAME}`;
      const nodeDir = join(env.productDir, expectation.statusPath.replace(statusFilenameSuffix, ""));
      expect(readNodeStatus(nodeDir)).toBeUndefined();
    }
  });
}

export async function assertMalformedExcludeEntriesAreRejected(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());
  const invalidEntry = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.invalidExcludeEntry());

  await withClassificationTree(fixture, async ({ env }) => {
    const excludePath = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_EXCLUDE_FILENAME].join(
      NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
    );
    await env.writeRaw(excludePath, `${invalidEntry}\n`);

    expect(() => createNodeStatusExcludeReader(env.productDir)).toThrow(
      nodeStatusInvalidExcludeEntryMessage(invalidEntry),
    );
  });
}

export async function assertNodeOutcomeResolverConsultationIsScoped(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.delegationTree());

  await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
    const { resolveOutcome } = await recordOutcomeEvidence();
    const consulted: string[] = [];
    await updateNodeStatus({
      productDir: env.productDir,
      resolveOutcome: (nodeId: string, evidencePaths: readonly string[]) => {
        consulted.push(nodeId);
        return resolveOutcome(nodeId, evidencePaths);
      },
    });

    const testOutcomeStage = expectations
      .filter((expectation) => expectation.facts.hasVerificationReferences && !expectation.facts.isExcluded)
      .map((expectation) => expectation.nodeId)
      .sort(compareAsciiStrings);
    expect([...consulted].sort(compareAsciiStrings)).toEqual(testOutcomeStage);

    for (const expectation of expectations) {
      const recorded = JSON.parse(await env.readFile(expectation.statusPath));
      const testRecord = recorded.verification[NODE_STATUS_VERIFICATION_MECHANISM.TEST] as
        | Record<string, string>
        | undefined;
      if (expectation.evidencePaths.length === 0) {
        expect(testRecord).toBeUndefined();
        continue;
      }

      expect(testRecord).toBeDefined();
      expect(
        Object.keys(testRecord ?? {}).filter((key) => key !== NODE_STATUS_FIELD.OVERALL).sort(compareAsciiStrings),
      ).toEqual([...expectation.evidencePaths].sort(compareAsciiStrings));
      for (const evidencePath of expectation.evidencePaths) {
        expect(testRecord?.[evidencePath]).toBe(expectation.facts.expectedEvidenceOutcome);
      }
    }
  });
}

export async function assertUntrackedNodeStatusIsRemoved(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

  await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);

    const staleStatusPath = sampleNodeStatusValue(
      NODE_STATUS_TEST_GENERATOR.untrackedNodeStatusPath(expectations.map((expectation) => expectation.nodeId)),
    );
    await env.writeRaw(staleStatusPath, serializeNodeStatus(createNodeStatusFile({})));

    await updateNodeStatus({
      productDir: env.productDir,
      resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
    });

    await expect(env.readFile(staleStatusPath)).rejects.toThrow();
    for (const expectation of expectations) {
      const recorded = JSON.parse(await env.readFile(expectation.statusPath));
      expect(recorded[NODE_STATUS_FIELD.VERIFICATION]).toBeDefined();
    }
  });
}

export async function assertUnstagedEvidenceInTrackedNodeIsRecorded(): Promise<void> {
  const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

  await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);

    const trackedNode = expectations[0];
    const untrackedEvidence = [
      SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      trackedNode.nodeId,
      SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName()),
    ].join(NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR);
    await env.writeRaw(untrackedEvidence, "");

    await updateNodeStatus({
      productDir: env.productDir,
      resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
    });

    const recorded = JSON.parse(await env.readFile(trackedNode.statusPath));
    expect(Object.keys(recorded.verification[NODE_STATUS_VERIFICATION_MECHANISM.TEST] ?? {})).toContain(
      untrackedEvidence,
    );
  });
}
