import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createNodeStatusExcludeReader,
  createNodeStatusFile,
  createNodeStatusProvider,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_PROJECTION_DIFF_COMMAND,
  NODE_STATUS_PROJECTION_DRIFT_CHECK_COMMAND,
  NODE_STATUS_PROJECTION_FAILURE_COMMAND,
  NODE_STATUS_PROJECTION_STEP_NAME,
  NODE_STATUS_PROJECTION_UPDATE_COMMAND,
  NODE_STATUS_PROJECTION_WORKFLOW_PATHS,
  parseNodeStatusProjectionWorkflowSteps,
  readNodeStatus,
  serializeNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  KIND_REGISTRY,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_FILE,
} from "@/lib/spec-tree";
import { compareAsciiStrings, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";
import {
  orderedDirectoryName,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
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
        resolveOutcome: (nodeId: string, evidencePaths: readonly string[]) =>
          Promise.resolve(
            Object.fromEntries(
              evidencePaths.map((path) => [
                path,
                expectations.find((e) => e.nodeId === nodeId)?.facts.testsPass
                  ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
                  : NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
              ]),
            ),
          ),
      });

      for (const expectation of expectations) {
        const recorded = JSON.parse(await env.readFile(expectation.statusPath));
        expect(recorded).toEqual(expectation.expectedStatusFile);
      }
    });
  });
});

describe("node-status CI drift check", () => {
  it("ALWAYS: CI refreshes committed status projections and rejects spx drift", async () => {
    for (const workflowPath of NODE_STATUS_PROJECTION_WORKFLOW_PATHS) {
      const workflowSteps = parseNodeStatusProjectionWorkflowSteps(
        await readFile(join(process.cwd(), workflowPath), STATE_STORE_TEXT_ENCODING),
      );
      const step = workflowSteps.find((candidate) => candidate.name === NODE_STATUS_PROJECTION_STEP_NAME);

      expect(step, `${workflowPath} has ${NODE_STATUS_PROJECTION_STEP_NAME}`).toBeDefined();
      expect(step?.run).toContain(NODE_STATUS_PROJECTION_UPDATE_COMMAND);
      expect(step?.run).toContain(NODE_STATUS_PROJECTION_DRIFT_CHECK_COMMAND);
      expect(step?.run).toContain(NODE_STATUS_PROJECTION_DIFF_COMMAND);
      expect(step?.run).toContain(NODE_STATUS_PROJECTION_FAILURE_COMMAND);
    }
  });
});

describe("node-status absence semantics", () => {
  it("NEVER: a missing spx.status.json is treated as an error — absence returns undefined", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations }) => {
      for (const expectation of expectations) {
        const statusFilenameSuffix = `/${NODE_STATUS_FILENAME}`;
        const nodeDir = `${env.productDir}/${expectation.statusPath.replace(statusFilenameSuffix, "")}`;
        expect(readNodeStatus(nodeDir)).toBeUndefined();
      }
    });
  });
});

describe("node-status EXCLUDE validation", () => {
  it("ALWAYS: malformed EXCLUDE entries fail before consumers can use them", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env }) => {
      await env.writeRaw("spx/EXCLUDE", "../docs\n./node\nparent//child\n/absolute\n");

      expect(() => createNodeStatusExcludeReader(env.productDir)).toThrow("Invalid spx/EXCLUDE entry");
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
        resolveOutcome: (nodeId: string, evidencePaths: readonly string[]) => {
          consulted.push(nodeId);
          return resolveOutcome(nodeId, evidencePaths);
        },
      });

      // Declared (no tests) and specified (excluded) nodes classify structurally,
      // so only the test-outcome-stage node reaches the resolver.
      const testOutcomeStage = expectations
        .filter((expectation) => expectation.facts.hasVerificationReferences && !expectation.facts.isExcluded)
        .map((expectation) => expectation.nodeId)
        .sort(compareAsciiStrings);
      expect([...consulted].sort(compareAsciiStrings)).toEqual(testOutcomeStage);

      for (const expectation of expectations) {
        const recorded = JSON.parse(await env.readFile(expectation.statusPath));
        expect(recorded).toEqual(expectation.expectedStatusFile);

        const testRecord = recorded.verification.test as Record<string, string> | undefined;
        if (expectation.evidencePaths.length === 0) {
          expect(testRecord).toBeUndefined();
          continue;
        }

        expect(testRecord).toBeDefined();
        expect(
          Object.keys(testRecord ?? {}).filter((key) => key !== NODE_STATUS_FIELD.OVERALL).sort(compareAsciiStrings),
        ).toEqual([...expectation.evidencePaths].sort(compareAsciiStrings));
        const expectedOutcome = expectedOutcomeFor(expectation.facts);
        for (const evidencePath of expectation.evidencePaths) {
          expect(testRecord?.[evidencePath]).toBe(expectedOutcome);
        }
      }
    });
  });
});

function expectedOutcomeFor(facts: { readonly isExcluded: boolean; readonly testsPass: boolean }) {
  if (facts.isExcluded) return NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  return facts.testsPass ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED : NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
}

describe("node-status tracked-tree write boundary", () => {
  it("NEVER: --update writes into an untracked node-shaped directory; a stale status file there is removed", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations, resolveOutcome }) => {
      // Track the materialized spec tree in a real repo before introducing the stale
      // directory, so the node-shaped stale directory is genuinely untracked.
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);

      // A node-shaped directory left behind by a removed node: never tracked, still
      // carrying a leftover status file from a prior --update run.
      const staleNodeId = distinctNodeDirectoryName(expectations.map((expectation) => expectation.nodeId));
      const staleStatusPath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${staleNodeId}/${NODE_STATUS_FILENAME}`;
      await env.writeRaw(staleStatusPath, serializeNodeStatus(createNodeStatusFile({})));

      await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

      // The untracked stale directory's leftover status file is swept; every tracked node keeps its own.
      await expect(env.readFile(staleStatusPath)).rejects.toThrow();
      for (const expectation of expectations) {
        const recorded = JSON.parse(await env.readFile(expectation.statusPath));
        expect(recorded).toEqual(expectation.expectedStatusFile);
      }
    });
  });

  it("ALWAYS: --update records a tracked node's not-yet-staged evidence in its projection", async () => {
    const fixture = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.classificationTree());

    await withClassificationTree(fixture, async ({ env, expectations, resolveOutcome }) => {
      // Track the materialized tree, then add a not-yet-staged evidence file inside an
      // already-tracked node directory.
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);

      const trackedNode = expectations[0];
      const untrackedEvidence = [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        trackedNode.nodeId,
        SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
        sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName()),
      ].join("/");
      await env.writeRaw(untrackedEvidence, "");

      await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

      // The tracked node directory is git-tracked, so its untracked evidence is recorded —
      // the projection matches what CI regenerates once the evidence is committed.
      const recorded = JSON.parse(await env.readFile(trackedNode.statusPath));
      expect(Object.keys(recorded.verification.test ?? {})).toContain(untrackedEvidence);
    });
  });
});

function distinctNodeDirectoryName(taken: readonly string[]): string {
  let candidate = orderedDirectoryName(KIND_REGISTRY.enabler.suffix);
  while (taken.includes(candidate)) {
    candidate = orderedDirectoryName(KIND_REGISTRY.enabler.suffix);
  }
  return candidate;
}
