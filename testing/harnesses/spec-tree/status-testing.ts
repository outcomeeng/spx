import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { defaultTestRunStateFileSystem, testingRunsDir, type TestRunStateFileSystem } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  addNodeTestFile,
  formatNodePath,
  readRecordedStatusFile,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

export function registerStatusTestingDelegationComplianceEvidence(): void {
  describe("status-to-testing delegation compliance", () => {
    it("NEVER: status update executes verification when recorded evidence is absent", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();
        const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
        const rootTestFile = await addNodeTestFile(env, rootPath);

        await statusCommand({
          cwd: env.productDir,
          update: true,
          resolveOutcomeFor: (productDir) => createNodeOutcomeResolver({ productDir, registry: testingRegistry }),
        });

        expect(existsSync(testingRunsDir(env.productDir))).toBe(false);
        await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
          verification: {
            test: {
              [rootTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
            },
          },
        });
      });
    });

    it("ALWAYS: identical covered path sets compute current staleness inputs once", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();
        const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
        const peerPath = formatNodePath(env.fixture.peer.order, env.fixture.peer.slug, env.fixture.peer.kind);
        const rootTestFile = await addNodeTestFile(env, rootPath);
        const peerTestFile = await addNodeTestFile(env, peerPath);
        const coveredTestFiles = new Set([join(env.productDir, rootTestFile), join(env.productDir, peerTestFile)]);
        const readCounts = new Map<string, number>();
        const countingFs: TestRunStateFileSystem = {
          ...defaultTestRunStateFileSystem,
          readFile: async (path, encoding) => {
            if (coveredTestFiles.has(path)) {
              readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
            }
            return defaultTestRunStateFileSystem.readFile(path, encoding);
          },
        };
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

        await runTestsCommand(
          { productDir: env.productDir, passing: false },
          { registry: testingRegistry, runnerDepsFor: () => runner },
        );
        await statusCommand({
          cwd: env.productDir,
          update: true,
          resolveOutcomeFor: (productDir) =>
            createNodeOutcomeResolver({
              productDir,
              registry: testingRegistry,
              fs: countingFs,
            }),
        });

        expect(readCounts.get(join(env.productDir, rootTestFile))).toBe(1);
        expect(readCounts.get(join(env.productDir, peerTestFile))).toBe(1);
      });
    });
  });
}
