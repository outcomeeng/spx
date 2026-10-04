import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  addNodeTestFile,
  createReadCountingTestRunStateFileSystem,
  fixtureNodePath,
  readRecordedStatusFile,
  recordedEvidenceResolverFor,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("status-to-testing delegation compliance", () => {
  it("NEVER: plain status executes verification over a node whose tests have no recorded evidence", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      await addNodeTestFile(env, rootPath);

      const output = await statusCommand({ cwd: env.productDir });

      // A run records its evidence under the testing runs directory and the
      // update path writes the claim; the read produces neither.
      expect(output).toContain(rootPath);
      expect(existsSync(testingRunsDir(env.productDir))).toBe(false);
      expect(await readRecordedStatusFile(env, rootPath)).toBeUndefined();
    });
  });

  it("NEVER: status update executes verification when recorded evidence is absent", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const rootTestFile = await addNodeTestFile(env, rootPath);

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      expect(existsSync(testingRunsDir(env.productDir))).toBe(false);
      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      );
    });
  });

  it("ALWAYS: identical covered path sets compute current staleness inputs once", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const peerPath = fixtureNodePath(env.fixture.peer);
      const rootTestFile = await addNodeTestFile(env, rootPath);
      const peerTestFile = await addNodeTestFile(env, peerPath);
      const counting = createReadCountingTestRunStateFileSystem(
        new Set([join(env.productDir, rootTestFile), join(env.productDir, peerTestFile)]),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: (productDir) =>
          createNodeOutcomeResolver({ productDir, registry: testingRegistry, fs: counting.fs }),
      });

      expect(counting.readCount(join(env.productDir, rootTestFile))).toBe(1);
      expect(counting.readCount(join(env.productDir, peerTestFile))).toBe(1);
    });
  });
});
