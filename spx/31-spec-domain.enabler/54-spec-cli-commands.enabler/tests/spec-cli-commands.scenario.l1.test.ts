import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { nextCommand, SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { SPEC_PRODUCT_DIR_WARNING } from "@/commands/spec/root";
import {
  OUTPUT_FORMAT,
  SPEC_STATUS_MESSAGE,
  SpecStatusUpdateRequiresProductDirError,
  statusCommand,
} from "@/commands/spec/status";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { GIT_ROOT_COMMAND, GIT_SHOW_TOPLEVEL_ARGS } from "@/lib/git/root";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
  type SpecTreeNodeSourceEntry,
} from "@/lib/spec-tree";
import { testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  buildEvidenceEntry,
  createSource,
  distinctOrderedDirectoryName,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import {
  addNodeTestFile,
  commitPathsInGit,
  createRecordingGitRoot,
  fixtureNodePath,
  nodeEvidencePath,
  readRecordedStatusState,
  trackPathsInGit,
  uniformOutcomeResolverFor,
  writePassingStatusClaim,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("spx spec status", () => {
  it("reports current spec-tree nodes from the tracked spx directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(KIND_REGISTRY[env.fixture.root.kind].label);
      expect(output).toContain(rootPath);
      expect(output).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    });
  });

  it("surfaces an untracked node-shaped directory alongside a tracked node without --update", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      // Track the materialized tree, then add a node-shaped directory left
      // untracked, so the read path's visibility meets a genuine tracked boundary.
      await trackPathsInGit(env.productDir, [SPEC_TREE_CONFIG.ROOT_DIRECTORY]);
      const untrackedNodeDirectory = distinctOrderedDirectoryName(KIND_REGISTRY.enabler.suffix, new Set([rootPath]));
      await addNodeTestFile(env, untrackedNodeDirectory);

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(rootPath);
      expect(output).toContain(untrackedNodeDirectory);
    });
  });

  it("reports a node's committed spx.status.json state instead of re-deriving it, executing no verification", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      // Co-located evidence makes live derivation `specified`; a committed
      // claim recording a pass must override it.
      const evidencePath = await addNodeTestFile(env, rootPath);
      await writePassingStatusClaim(env, rootPath, evidencePath);

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(output).not.toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.SPECIFIED}]`);
      // A run records evidence under the testing runs directory, so its
      // absence proves the read ran none.
      expect(existsSync(testingRunsDir(env.productDir))).toBe(false);
    });
  });

  it("reports a committed spx.status.json state when live evidence files are absent", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      await writePassingStatusClaim(env, rootPath, nodeEvidencePath(rootPath));

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(output).not.toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.DECLARED}]`);
    });
  });

  it("reports co-located test evidence from the tracked spx directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      await addNodeTestFile(env, rootPath);

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(rootPath);
      expect(output).toContain(SPEC_TREE_NODE_STATE.SPECIFIED);
    });
  });

  it("reports current spec-tree nodes from a nested git repository directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.directoryScope());
      await commitPathsInGit(
        env.productDir,
        [SPEC_TREE_CONFIG.ROOT_DIRECTORY, DEFAULT_CONFIG_FILENAME],
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      );
      await env.writeRaw(
        join(scope.nestedDirectory, scope.productDirectory, sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())),
        "",
      );
      const nestedCwd = join(env.productDir, scope.nestedDirectory, scope.productDirectory);
      const rootPath = fixtureNodePath(env.fixture.root);
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

  it("reports current spec-tree nodes through injected git root dependencies asked from the nested directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.directoryScope());
      await env.writeRaw(
        join(scope.nestedDirectory, scope.productDirectory, sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())),
        "",
      );
      const nestedCwd = join(env.productDir, scope.nestedDirectory, scope.productDirectory);
      const rootPath = fixtureNodePath(env.fixture.root);
      const gitRoot = createRecordingGitRoot(env.productDir);

      const statusOutput = await statusCommand({ cwd: nestedCwd, gitDependencies: gitRoot.dependencies });
      const nextOutput = await nextCommand({ cwd: nestedCwd, gitDependencies: gitRoot.dependencies });

      expect(statusOutput).toContain(rootPath);
      expect(nextOutput).toContain(rootPath);
      expect(gitRoot.calls()).toEqual([
        { command: GIT_ROOT_COMMAND.EXECUTABLE, args: [...GIT_SHOW_TOPLEVEL_ARGS], cwd: nestedCwd },
        { command: GIT_ROOT_COMMAND.EXECUTABLE, args: [...GIT_SHOW_TOPLEVEL_ARGS], cwd: nestedCwd },
      ]);
    });
  });

  it("reports an empty current spec-tree from a git repository without warnings", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const statusWarnings: string[] = [];
      const nextWarnings: string[] = [];
      await commitPathsInGit(productDir, [DEFAULT_CONFIG_FILENAME], sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()));

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
    const nodeOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const node: SpecTreeNodeSourceEntry = {
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      id: `${nodeOrder}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${nodeSlug}${KIND_REGISTRY[nodeKind].suffix}`,
      kind: nodeKind,
      order: nodeOrder,
      slug: nodeSlug,
    };

    const output = await statusCommand({ format: OUTPUT_FORMAT.JSON, source: createSource([node]) });

    const parsed = JSON.parse(output) as { nodes: Array<{ id: string; state: string }> };
    expect(parsed.nodes[0]).toMatchObject({ id: node.id, state: SPEC_TREE_NODE_STATE.DECLARED });
  });

  it("rejects status update requests for injected in-memory sources", async () => {
    await expect(statusCommand({ source: createSource([]), update: true })).rejects.toThrow(
      SpecStatusUpdateRequiresProductDirError,
    );
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
      const rootPath = fixtureNodePath(env.fixture.root);
      const childPath = [rootPath, fixtureNodePath(env.fixture.child)].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);

      const output = await nextCommand({ cwd: env.productDir });

      expect(output).toContain(SPEC_NEXT_MESSAGE.HEADING);
      expect(output).toContain(rootPath);
      expect(output).not.toContain(childPath);
      expect(output).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    });
  });

  it("reports when every current spec-tree node is passing", async () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const nodeOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const node: SpecTreeNodeSourceEntry = {
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      id: `${nodeOrder}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${nodeSlug}${KIND_REGISTRY[nodeKind].suffix}`,
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
      const rootPath = fixtureNodePath(env.fixture.root);
      await addNodeTestFile(env, rootPath);

      // A stub resolver supplies the per-node outcome, so the write-and-rollup
      // behavior is exercised apart from the production resolver's evidence
      // logic, which the fold mapping covers.
      const updateOutput = await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: uniformOutcomeResolverFor(NODE_STATUS_EVIDENCE_OUTCOME.PASSED),
      });
      const plainOutput = await statusCommand({ cwd: env.productDir });

      expect(updateOutput).toBe(plainOutput);
      expect(updateOutput).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(await readRecordedStatusState(env, rootPath)).toBe(SPEC_TREE_NODE_STATE.PASSING);
    });
  });
});
