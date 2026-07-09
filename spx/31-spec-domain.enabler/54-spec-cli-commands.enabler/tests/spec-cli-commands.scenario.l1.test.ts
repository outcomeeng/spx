import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
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
import { createRunnerDepsFor } from "@/interfaces/cli/test-runner-deps";
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
      // behavior is exercised independently of the production resolver's evidence
      // logic (which scenario 7 covers).
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

  it("invokes the per-node run when recorded evidence is absent, then skips it when usable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      await addNodeTestFile(env, rootPath);

      // Absent evidence: --update runs the node's tests through the registry.
      const firstRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(firstRunner) });
      expect(firstRunner.calls.length).toBeGreaterThan(0);
      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );

      // The run just recorded is fresh and passed: a second --update runs nothing
      // and reports the cached passing outcome through the production resolver.
      const secondRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(secondRunner) });
      expect(secondRunner.calls).toEqual([]);
      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });
  });

  it("uses a parent run's newly recorded evidence for later child nodes in the same update", async () => {
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

      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(runner) });

      expect(runner.calls).toHaveLength(1);
      expect(invokedArgs(runner)).toContain(rootTestFile);
      expect(invokedArgs(runner)).toContain(childTestFile);
      await expect(readRecordedStatus(env, rootPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
      await expect(readRecordedStatus(env, childPath, { isExcluded: false })).resolves.toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });
  });

  it("invokes the per-node run when recorded evidence is stale", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const testFile = await addNodeTestFile(env, rootPath);

      const seedRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(seedRunner) });

      // Rewriting a covered test file's content invalidates the recorded content digest.
      await env.writeRaw(testFile, sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()));

      const staleRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(staleRunner) });
      expect(staleRunner.calls.length).toBeGreaterThan(0);
    });
  });

  it("invokes the per-node run when recorded evidence is fresh but failing", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      await addNodeTestFile(env, rootPath);

      // Seed a fresh run that failed (non-zero runner exit).
      const failingExit = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
      const seedRunner = createRecordingCommandRunner({ present: true, exitCode: failingExit });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(seedRunner) });

      // Fresh-but-failing evidence is not usable, so a second --update re-runs the node.
      const rerunRunner = createRecordingCommandRunner({ present: true, exitCode: failingExit });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(rerunRunner) });
      expect(rerunRunner.calls.length).toBeGreaterThan(0);
    });
  });

  it("treats a fresh passing full-product run as usable evidence for each node", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const peerPath = formatNodePath(env.fixture.peer.order, env.fixture.peer.slug, env.fixture.peer.kind);
      await addNodeTestFile(env, rootPath);
      await addNodeTestFile(env, peerPath);

      // A full run records evidence over a superset of any single node's tests.
      const fullRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => fullRunner },
      );

      // The fresh passing full run is usable for each covered node — freshness is
      // judged over the run's covered paths — so --update re-runs none of them.
      const updateRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(updateRunner) });
      expect(updateRunner.calls).toEqual([]);
    });
  });

  it("re-runs rather than failing when a covered test file was deleted after the run", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const peerPath = formatNodePath(env.fixture.peer.order, env.fixture.peer.slug, env.fixture.peer.kind);
      await addNodeTestFile(env, rootPath);
      const peerTestFile = await addNodeTestFile(env, peerPath);

      const fullRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => fullRunner },
      );

      // A covered test file is deleted after the run, so the recorded evidence
      // references a path that no longer exists. --update must read that as stale
      // and re-run, not surface ENOENT for the missing covered path.
      await rm(join(env.productDir, peerTestFile));

      const updateRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await expect(
        statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(updateRunner) }),
      ).resolves.toBeDefined();
      expect(updateRunner.calls.length).toBeGreaterThan(0);
    });
  });

  it("routes a per-node run's stdout to the injected stream so --update stdout stays parseable", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      // The status path injects process.stderr as the runner's stdout stream so the
      // --json rollup is the only thing on stdout. Prove the runner forwards a child's
      // stdout to the injected stream rather than to process.stdout.
      const captured: Buffer[] = [];
      const sink = new Writable({
        write(chunk: Buffer, _encoding, done) {
          captured.push(Buffer.from(chunk));
          done();
        },
      });
      const marker = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const runnerDeps = createRunnerDepsFor(productDir, sink)(typescriptTestingLanguage);

      const result = await runnerDeps.runCommand(process.execPath, [
        "-e",
        `process.stdout.write(${JSON.stringify(marker)})`,
      ]);

      expect(result.exitCode).toBe(0);
      expect(Buffer.concat(captured).toString()).toContain(marker);
    });
  });

  it("classifies a node failing when its test runner is absent rather than vacuously passing", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const rootTestFile = await addNodeTestFile(env, rootPath);

      // The language runner reports absent, so the per-node run executes nothing.
      // A zero-outcome run must not classify the node passing.
      const absentRunner = createRecordingCommandRunner({ present: false, exitCode: 0 });
      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordingResolverFor(absentRunner) });

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
      // the node's Python test path never executes. A partial run must not classify
      // the node passing even though the executed outcome passed.
      const presentRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const absentRunner = createRecordingCommandRunner({ present: false, exitCode: 0 });
      const resolveOutcomeFor = (productDir: string) =>
        createNodeOutcomeResolver({
          productDir,
          registry: testingRegistry,
          runnerDepsFor: (language) => language.name === typescriptTestingLanguage.name ? presentRunner : absentRunner,
        });

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor });

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

  it("records per-reference outcomes when one runner passes and another runner fails", async () => {
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
      const resolveOutcomeFor = (productDir: string) =>
        createNodeOutcomeResolver({
          productDir,
          registry: testingRegistry,
          runnerDepsFor: (language) => language.name === typescriptTestingLanguage.name ? passingRunner : failingRunner,
        });

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor });

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

function recordingResolverFor(runner: ReturnType<typeof createRecordingCommandRunner>) {
  return (productDir: string) =>
    createNodeOutcomeResolver({ productDir, registry: testingRegistry, runnerDepsFor: () => runner });
}

function invokedArgs(
  runner: { readonly calls: ReadonlyArray<{ readonly args: readonly string[] }> },
): readonly string[] {
  return runner.calls.flatMap((call) => call.args);
}

async function addNodeTestFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<string> {
  // A spec-tree TypeScript evidence file (`<slug>.<mode>.<level>.test.ts`), so the
  // node both reaches the test-outcome stage that readSpecTree recognizes and is
  // dispatched by the TypeScript runner.
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

async function addNodePythonTestFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<string> {
  // A spec-tree Python evidence file (`test_<slug>.<mode>.<level>.py`), so the node
  // carries a second-language test path the Python runner — gated out in this env —
  // leaves unexecuted.
  const [mode] = SPEC_TREE_EVIDENCE_FILE.MODES;
  const [level] = SPEC_TREE_EVIDENCE_FILE.LEVELS;
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const tail = SPEC_TREE_EVIDENCE_FILE.TAILS.PYTHON.join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
  const evidenceFile = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    `${PYTHON_TEST_FILE_PREFIX}${slug}.${mode}.${level}.${tail}`,
  ].join("/");
  await writeTestFileFixture(env.productDir, evidenceFile);
  return evidenceFile;
}

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

function formatNodePath(order: number, slug: string, kind: NodeKind): string {
  return `${order}-${slug}${getKindDefinition(kind).suffix}`;
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
