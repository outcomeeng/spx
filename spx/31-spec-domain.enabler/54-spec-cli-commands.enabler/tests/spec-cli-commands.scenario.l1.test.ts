import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { nextCommand, SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { SPEC_PRODUCT_DIR_WARNING } from "@/commands/spec/root";
import {
  OUTPUT_FORMAT,
  SPEC_STATUS_MESSAGE,
  SpecStatusUpdateRequiresProductDirError,
  statusCommand,
} from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { GIT_ROOT_COMMAND, GIT_SHOW_TOPLEVEL_ARGS, type GitDependencies } from "@/lib/git/root";
import {
  classifyNodeStatus,
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  hasNodeStatusVerificationReferences,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusFile,
  serializeNodeStatus,
} from "@/lib/node-status";
import {
  getKindDefinition,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_NODE_STATE,
  type SpecTreeNodeSourceEntry,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { PYTHON_TEST_FILE_PREFIX } from "@/test/languages/python";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  buildEvidenceEntry,
  createSource,
  orderedDirectoryName,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import {
  addNodePythonTestFile,
  addNodeTestFile,
  foldResolverFor,
  formatNodePath,
  recordedRunFiles,
  recordTestRun,
} from "@testing/harnesses/node-status/fold";
import { type CurrentSpecTreeEnv, withSpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("spx spec status", () => {
  it("reports current spec-tree nodes from the tracked spx directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(KIND_REGISTRY[env.fixture.root.kind].label);
      expect(output).toContain(rootPath);
      expect(output).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    });
  });

  it("surfaces an untracked node-shaped directory alongside a tracked node without --update", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      // Track the materialized tree, then add a node-shaped directory left untracked,
      // so the read path's visibility is tested against a genuine git-tracked boundary.
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);
      let untrackedNodeDirectory = orderedDirectoryName(KIND_REGISTRY.enabler.suffix);
      while (untrackedNodeDirectory === rootPath) {
        untrackedNodeDirectory = orderedDirectoryName(KIND_REGISTRY.enabler.suffix);
      }
      await env.writeRaw(
        [
          SPEC_TREE_CONFIG.ROOT_DIRECTORY,
          untrackedNodeDirectory,
          SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
          sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName()),
        ].join("/"),
        "",
      );

      // No --update: the read path applies no git-tracked filter, so the untracked,
      // node-shaped directory is reported alongside the tracked node.
      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(rootPath);
      expect(output).toContain(untrackedNodeDirectory);
    });
  });

  it("reports a node's committed spx.status.json state instead of re-deriving it", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      // The root carries a co-located evidence file, so live derivation yields a
      // non-trivial `specified`. A committed status file recording a different
      // state proves `spx spec status` reports the recorded state rather than
      // re-deriving it — overriding even a structurally-derived state.
      const evidenceFile = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName());
      const statusEvidencePath = [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        rootPath,
        SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
        evidenceFile,
      ].join("/");
      await env.writeRaw(statusEvidencePath, "");
      await env.writeRaw(
        [SPEC_TREE_CONFIG.ROOT_DIRECTORY, rootPath, NODE_STATUS_FILENAME].join("/"),
        serializeNodeStatus(createNodeStatusFile({
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord({
            [statusEvidencePath]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          }),
        })),
      );

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(output).not.toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.SPECIFIED}]`);
      // Read-back executes no node tests: a per-node run records evidence under the
      // testing runs directory, so its absence proves status ran none.
      expect(existsSync(testingRunsDir(env.productDir))).toBe(false);
    });
  });

  it("reports a committed spx.status.json state when live evidence files are absent", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const statusEvidencePath = [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        rootPath,
        SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
        sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName()),
      ].join("/");
      await env.writeRaw(
        [SPEC_TREE_CONFIG.ROOT_DIRECTORY, rootPath, NODE_STATUS_FILENAME].join("/"),
        serializeNodeStatus(createNodeStatusFile({
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord({
            [statusEvidencePath]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          }),
        })),
      );

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(output).not.toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.DECLARED}]`);
    });
  });

  it("reports co-located test evidence from the tracked spx directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const evidenceFile = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName());
      await env.writeRaw(
        [
          SPEC_TREE_CONFIG.ROOT_DIRECTORY,
          rootPath,
          SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
          evidenceFile,
        ].join("/"),
        "",
      );

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(rootPath);
      expect(output).toContain(SPEC_TREE_NODE_STATE.SPECIFIED);
    });
  });

  it("reports current spec-tree nodes from a nested git repository directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
      const nestedMarker = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
      await runGit(env.productDir, [
        GIT_TEST_SUBCOMMANDS.CONFIG,
        GIT_TEST_CONFIG.USER_NAME_KEY,
        GIT_TEST_CONFIG.USER_NAME,
      ]);
      await runGit(env.productDir, [
        GIT_TEST_SUBCOMMANDS.ADD,
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        DEFAULT_CONFIG_FILENAME,
      ]);
      await runGit(env.productDir, [
        GIT_TEST_SUBCOMMANDS.COMMIT,
        "-m",
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      ]);
      await env.writeRaw(join(scope.nestedDirectory, scope.productDirectory, nestedMarker), "");
      const nestedCwd = join(env.productDir, scope.nestedDirectory, scope.productDirectory);
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const statusWarnings: string[] = [];
      const nextWarnings: string[] = [];

      const statusOutput = await statusCommand({
        cwd: nestedCwd,
        onWarning: (warning) => statusWarnings.push(warning),
      });
      const nextOutput = await nextCommand({ cwd: nestedCwd, onWarning: (warning) => nextWarnings.push(warning) });

      expect(statusOutput).toContain(rootPath);
      expect(nextOutput).toContain(rootPath);
      expect(statusWarnings).toEqual([]);
      expect(nextWarnings).toEqual([]);
    });
  });

  it("reports current spec-tree nodes through injected git root dependencies", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
      const nestedMarker = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      await env.writeRaw(join(scope.nestedDirectory, scope.productDirectory, nestedMarker), "");
      const nestedCwd = join(env.productDir, scope.nestedDirectory, scope.productDirectory);
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const gitRoot = createGitRootDependencies(env.productDir, nestedCwd);

      const statusOutput = await statusCommand({ cwd: nestedCwd, gitDependencies: gitRoot.dependencies });
      const nextOutput = await nextCommand({ cwd: nestedCwd, gitDependencies: gitRoot.dependencies });

      expect(statusOutput).toContain(rootPath);
      expect(nextOutput).toContain(rootPath);
      expect(gitRoot.calls()).toBe(2);
    });
  });

  it("reports an empty current spec-tree from a git repository without warnings", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const statusWarnings: string[] = [];
      const nextWarnings: string[] = [];
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
      await runGit(productDir, [
        GIT_TEST_SUBCOMMANDS.CONFIG,
        GIT_TEST_CONFIG.USER_NAME_KEY,
        GIT_TEST_CONFIG.USER_NAME,
      ]);
      await runGit(productDir, [
        GIT_TEST_SUBCOMMANDS.ADD,
        DEFAULT_CONFIG_FILENAME,
      ]);
      await runGit(productDir, [
        GIT_TEST_SUBCOMMANDS.COMMIT,
        "-m",
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      ]);

      await expect(
        statusCommand({ cwd: productDir, onWarning: (warning) => statusWarnings.push(warning) }),
      ).resolves.toBe(SPEC_STATUS_MESSAGE.EMPTY);
      await expect(
        nextCommand({ cwd: productDir, onWarning: (warning) => nextWarnings.push(warning) }),
      ).resolves.toBe(SPEC_NEXT_MESSAGE.EMPTY);
      expect(statusWarnings).toEqual([]);
      expect(nextWarnings).toEqual([]);
    });
  });

  it("serializes the current projection for JSON output", async () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const nodeOrder = sampleSpecOrder();
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const nodeId = formatNodePath(nodeOrder, nodeSlug, nodeKind);

    const output = await statusCommand({
      format: OUTPUT_FORMAT.JSON,
      source: createSource([
        {
          type: SPEC_TREE_ENTRY_TYPE.NODE,
          id: nodeId,
          kind: nodeKind,
          order: nodeOrder,
          slug: nodeSlug,
        },
      ]),
    });

    const parsed = JSON.parse(output) as { nodes: Array<{ id: string; state: string }> };
    expect(parsed.nodes[0]).toMatchObject({
      id: nodeId,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    });
  });

  it("rejects status update requests for injected in-memory sources", async () => {
    await expect(
      statusCommand({
        source: createSource([]),
        update: true,
      }),
    ).rejects.toThrow(SpecStatusUpdateRequiresProductDirError);
  });

  it("warns and reports an empty current spec-tree outside a git repository", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const statusWarnings: string[] = [];
      const nextWarnings: string[] = [];

      await expect(
        statusCommand({ cwd: productDir, onWarning: (warning) => statusWarnings.push(warning) }),
      ).resolves.toBe(SPEC_STATUS_MESSAGE.EMPTY);
      await expect(
        nextCommand({ cwd: productDir, onWarning: (warning) => nextWarnings.push(warning) }),
      ).resolves.toBe(SPEC_NEXT_MESSAGE.EMPTY);

      expect(statusWarnings).toEqual([SPEC_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY]);
      expect(nextWarnings).toEqual([SPEC_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY]);
    });
  });
});

describe("spx spec next", () => {
  it("reports the first non-passing current spec-tree node", async () => {
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

      const output = await nextCommand({ cwd: env.productDir });

      expect(output).toContain(SPEC_NEXT_MESSAGE.HEADING);
      expect(output).toContain(rootPath);
      expect(output).not.toContain(childPath);
      expect(output).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    });
  });

  it("reports when every current spec-tree node is passing", async () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const nodeOrder = sampleSpecOrder();
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const node: SpecTreeNodeSourceEntry = {
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      id: formatNodePath(nodeOrder, nodeSlug, nodeKind),
      kind: nodeKind,
      order: nodeOrder,
      slug: nodeSlug,
    };

    await expect(
      nextCommand({
        source: createSource([
          node,
          buildEvidenceEntry({
            id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
            parentId: node.id,
            status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
          }),
        ]),
      }),
    ).resolves.toBe(SPEC_NEXT_MESSAGE.COMPLETE);
  });
});

describe("spx spec status --update command", () => {
  it("writes each node's classified state and reports the rollup spx spec status renders", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      await addNodeTestFile(env, rootPath);

      // A stub resolver supplies the per-node outcome, so the write-and-rollup
      // behavior is exercised independently of the production resolver's fold.
      const updateOutput = await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: () => (_nodeId, evidencePaths) =>
          Promise.resolve(
            Object.fromEntries(evidencePaths.map((path) => [path, NODE_STATUS_EVIDENCE_OUTCOME.PASSED])),
          ),
      });
      const plainOutput = await statusCommand({ cwd: env.productDir });

      expect(updateOutput).toBe(plainOutput);
      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });
  });

  it("folds a recorded passing run's evidence and executes no verification", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      await addNodeTestFile(env, rootPath);
      await recordTestRun(env, { present: true, exitCode: 0 });

      // An executed run records a run file, so an unchanged run-file set is the
      // falsifiable evidence that the fold ran no verification of its own.
      const before = await recordedRunFiles(env);
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(recordedRunFiles(env)).resolves.toEqual(before);
      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });
  });

  it("folds one recorded run's evidence for every node that run covers", async () => {
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
      await addNodeTestFile(env, rootPath);
      await addNodeTestFile(env, childPath);
      await recordTestRun(env, { present: true, exitCode: 0 });

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
      await expect(readRecordedStatus(env, childPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });
  });

  it("folds a fresh failing run as failed rather than re-running the node", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const testFile = await addNodeTestFile(env, rootPath);
      const failingExit = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
      await recordTestRun(env, { present: true, exitCode: failingExit });

      const before = await recordedRunFiles(env);
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(recordedRunFiles(env)).resolves.toEqual(before);
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: { test: { [testFile]: NODE_STATUS_EVIDENCE_OUTCOME.FAILED } },
      });
    });
  });

  it("keeps a node's committed outcome when its recorded evidence is stale", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const testFile = await addNodeTestFile(env, rootPath);
      await recordTestRun(env, { present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      // Rewriting a covered test file's content invalidates the recorded content
      // digest, so no recorded evidence resolves the reference any more.
      await env.writeRaw(testFile, sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()));

      const before = await recordedRunFiles(env);
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      // The committed claim stands: neither forged to not-run nor refreshed by a run.
      await expect(recordedRunFiles(env)).resolves.toEqual(before);
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: { test: { [testFile]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED } },
      });
    });
  });

  it("keeps the committed outcome when a covered test file was deleted after the run", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const peerPath = formatNodePath(env.fixture.peer.order, env.fixture.peer.slug, env.fixture.peer.kind);
      const rootTestFile = await addNodeTestFile(env, rootPath);
      const peerTestFile = await addNodeTestFile(env, peerPath);
      await recordTestRun(env, { present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      // The recorded evidence now references a covered path that no longer exists.
      await rm(join(env.productDir, peerTestFile));

      const before = await recordedRunFiles(env);
      await expect(
        statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() }),
      ).resolves.toBeDefined();

      await expect(recordedRunFiles(env)).resolves.toEqual(before);
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: { test: { [rootTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED } },
      });
    });
  });

  it("records not-run for a node no recorded evidence covers, executing no verification", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const testFile = await addNodeTestFile(env, rootPath);

      // No run has recorded evidence and no committed outcome exists, so the fold
      // has nothing to carry forward and nothing to execute.
      const before = await recordedRunFiles(env);
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(recordedRunFiles(env)).resolves.toEqual(before);
      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.FAILING,
      );
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: { test: { [testFile]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN } },
      });
    });
  });

  it("classifies a node failing when its test runner is absent rather than vacuously passing", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const rootTestFile = await addNodeTestFile(env, rootPath);

      // The language runner reports absent, so the recorded run executes nothing.
      // A zero-outcome run must not fold the node passing.
      await recordTestRun(env, { present: false, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.FAILING,
      );
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: {
          test: {
            [rootTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
          },
        },
      });
    });
  });

  it("classifies a node failing when one of its languages' runners is absent", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const typescriptTestFile = await addNodeTestFile(env, rootPath);
      const pythonTestFile = await addNodePythonTestFile(env, rootPath);

      // The TypeScript runner is present and passes; the Python runner is absent, so
      // the node's Python test path never executes. A partial run must not fold the
      // node passing even though the executed outcome passed.
      const presentRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const absentRunner = createRecordingCommandRunner({ present: false, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        {
          registry: testingRegistry,
          runnerDepsFor: (language) => language.name === typescriptTestingLanguage.name ? presentRunner : absentRunner,
        },
      );

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.FAILING,
      );
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: {
          test: {
            [typescriptTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
            [pythonTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
          },
        },
      });
    });
  });

  it("folds per-reference outcomes when one runner passes and another runner fails", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const typescriptTestFile = await addNodeTestFile(env, rootPath);
      const pythonTestFile = await addNodePythonTestFile(env, rootPath);

      const passingRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const failingRunner = createRecordingCommandRunner({
        present: true,
        exitCode: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode()),
      });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        {
          registry: testingRegistry,
          runnerDepsFor: (language) => language.name === typescriptTestingLanguage.name ? passingRunner : failingRunner,
        },
      );

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: foldResolverFor() });

      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.FAILING,
      );
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: {
          test: {
            [typescriptTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
            [pythonTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
          },
        },
      });
    });
  });
});

type RecordedStatusClassificationOptions = {
  readonly isExcluded: boolean;
};

async function readRecordedStatus(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  options: RecordedStatusClassificationOptions,
): Promise<string> {
  const status = await readRecordedStatusFile(env, nodePath);
  return classifyNodeStatus({
    hasVerificationReferences: hasNodeStatusVerificationReferences(status.verification),
    isExcluded: options.isExcluded,
    verification: status.verification,
  });
}

async function readRecordedStatusFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<NodeStatusFile> {
  const statusPath = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodePath, NODE_STATUS_FILENAME].join("/");
  // Fail with a clear diagnostic if --update skipped the write, not a JSON parse error.
  expect(existsSync(join(env.productDir, statusPath))).toBe(true);
  const raw = await env.readFile(statusPath);
  return JSON.parse(raw) as NodeStatusFile;
}

function sampleSpecOrder(): number {
  return sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceOrder());
}

function createGitRootDependencies(
  productDir: string,
  expectedCwd: string,
): { dependencies: GitDependencies; calls: () => number } {
  let callCount = 0;
  return {
    dependencies: {
      execa: async (command, args, options) => {
        callCount += 1;
        expect(command).toBe(GIT_ROOT_COMMAND.EXECUTABLE);
        expect(args).toEqual(GIT_SHOW_TOPLEVEL_ARGS);
        expect(options?.cwd).toBe(expectedCwd);
        return {
          exitCode: 0,
          stderr: "",
          stdout: productDir,
        };
      },
    },
    calls: () => callCount,
  };
}
