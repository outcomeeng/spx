import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { getKindDefinition, SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { defaultTestRunStateFileSystem, type TestRunStateFileSystem } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("status-to-testing delegation compliance", () => {
  it("reads shared full-product staleness inputs once across covered nodes", async () => {
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

      const fullRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => fullRunner },
      );

      const updateRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: (productDir) =>
          createNodeOutcomeResolver({
            productDir,
            registry: testingRegistry,
            runnerDepsFor: () => updateRunner,
            fs: countingFs,
          }),
      });

      expect(updateRunner.calls).toEqual([]);
      expect(readCounts.get(join(env.productDir, rootTestFile))).toBe(1);
      expect(readCounts.get(join(env.productDir, peerTestFile))).toBe(1);
    });
  });

  it("keeps cached staleness inputs when refreshed evidence covers a later child node", async () => {
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
      const coveredTestFiles = new Set([join(env.productDir, rootTestFile), join(env.productDir, childTestFile)]);
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

      const seedRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => seedRunner },
      );
      await env.writeRaw(rootTestFile, sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceTitle()));

      const updateRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: (productDir) =>
          createNodeOutcomeResolver({
            productDir,
            registry: testingRegistry,
            runnerDepsFor: () => updateRunner,
            fs: countingFs,
          }),
      });

      expect(updateRunner.calls).toHaveLength(1);
      expect(invokedArgs(updateRunner)).toContain(rootTestFile);
      expect(invokedArgs(updateRunner)).toContain(childTestFile);
      expect(readCounts.get(join(env.productDir, rootTestFile))).toBe(2);
      expect(readCounts.get(join(env.productDir, childTestFile))).toBe(2);
    });
  });
});

function invokedArgs(
  runner: { readonly calls: ReadonlyArray<{ readonly args: readonly string[] }> },
): readonly string[] {
  return runner.calls.flatMap((call) => call.args);
}

async function addNodeTestFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<string> {
  const [mode] = SPEC_TREE_EVIDENCE_FILE.MODES;
  const [level] = SPEC_TREE_EVIDENCE_FILE.LEVELS;
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const tail = SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT.join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
  const evidenceFile = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    `${slug}.${mode}.${level}.${tail}`,
  ].join("/");
  await writeTestFileFixture(env.productDir, evidenceFile);
  return evidenceFile;
}

function formatNodePath(order: number, slug: string, kind: NodeKind): string {
  return `${order}-${slug}${getKindDefinition(kind).suffix}`;
}
