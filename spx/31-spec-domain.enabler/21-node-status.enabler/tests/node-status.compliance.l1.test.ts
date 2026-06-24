import { describe, expect, it } from "vitest";

import {
  createNodeStatusProvider,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  readNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import { createFilesystemSpecTreeSource, readSpecTree } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
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
        const expectedOutcome = expectation.facts.isExcluded
          ? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
          : expectation.facts.testsPass
          ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
          : NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
        for (const evidencePath of expectation.evidencePaths) {
          expect(testRecord?.[evidencePath]).toBe(expectedOutcome);
        }
      }
    });
  });
});
