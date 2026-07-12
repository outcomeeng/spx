import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/spec/status";
import { defaultTestRunStateFileSystem, type TestRunStateFileSystem } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { addNodeTestFile, foldResolverFor, formatNodePath, recordTestRun } from "@testing/harnesses/node-status/fold";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

const PASSING_RUNNER = { present: true, exitCode: 0 } as const;

describe("status-to-testing delegation compliance", () => {
  it("reads shared full-product staleness inputs once across covered nodes", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const peerPath = formatNodePath(env.fixture.peer.order, env.fixture.peer.slug, env.fixture.peer.kind);
      const rootTestFile = await addNodeTestFile(env, rootPath);
      const peerTestFile = await addNodeTestFile(env, peerPath);
      const { countingFs, readCounts } = countingRunStateFileSystem(env, [rootTestFile, peerTestFile]);

      await recordTestRun(env, PASSING_RUNNER);

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor(countingFs) });

      // Both nodes fold from the same full-product run, whose covered-path set is
      // identical for each, so the run's covered files are read once for the fold —
      // not once per node.
      expect(readCounts.get(join(env.productDir, rootTestFile))).toBe(1);
      expect(readCounts.get(join(env.productDir, peerTestFile))).toBe(1);
    });
  });

  it("reads a stale run's covered files once across the nodes that share it", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const childPath = `${rootPath}/${
        formatNodePath(
          env.fixture.child.order,
          env.fixture.child.slug,
          env.fixture.child.kind,
        )
      }`;
      const rootTestFile = await addNodeTestFile(env, rootPath);
      const childTestFile = await addNodeTestFile(env, childPath);
      const { countingFs, readCounts } = countingRunStateFileSystem(env, [rootTestFile, childTestFile]);

      await recordTestRun(env, PASSING_RUNNER);
      // Rewriting a covered file makes the recorded run stale for every node it
      // covers, so no reference resolves — the staleness inputs are still computed
      // once for the run's covered-path set, which root and child share.
      await env.writeRaw(rootTestFile, sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceTitle()));

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor(countingFs) });

      expect(readCounts.get(join(env.productDir, rootTestFile))).toBe(1);
      expect(readCounts.get(join(env.productDir, childTestFile))).toBe(1);
    });
  });
});

function countingRunStateFileSystem(
  env: CurrentSpecTreeEnv,
  testFiles: readonly string[],
): { readonly countingFs: TestRunStateFileSystem; readonly readCounts: Map<string, number> } {
  const coveredTestFiles = new Set(testFiles.map((file) => join(env.productDir, file)));
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
  return { countingFs, readCounts };
}
