import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { nextCommand, SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { SPEC_PRODUCT_DIR_WARNING } from "@/commands/spec/root";
import { OUTPUT_FORMAT, SPEC_STATUS_MESSAGE, statusCommand } from "@/commands/spec/status";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { GIT_ROOT_COMMAND, GIT_SHOW_TOPLEVEL_ARGS, type GitDependencies } from "@/git/root";
import { NODE_STATUS_FILENAME, serializeNodeStatus } from "@/lib/node-status";
import {
  getKindDefinition,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_NODE_STATE,
  type SpecTreeNodeSourceEntry,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  buildEvidenceEntry,
  createSource,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withSpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

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

  it("reports a node's committed spx.status.json state instead of re-deriving it", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      // The root carries a co-located evidence file, so live derivation yields a
      // non-trivial `specified`. A committed status file recording a different
      // state proves `spx spec status` reports the recorded state rather than
      // re-deriving it — overriding even a structurally-derived state.
      const evidenceFile = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName());
      await env.writeRaw(
        [SPEC_TREE_CONFIG.ROOT_DIRECTORY, rootPath, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFile].join("/"),
        "",
      );
      await env.writeRaw(
        [SPEC_TREE_CONFIG.ROOT_DIRECTORY, rootPath, NODE_STATUS_FILENAME].join("/"),
        serializeNodeStatus(SPEC_TREE_NODE_STATE.PASSING),
      );

      const output = await statusCommand({ cwd: env.productDir });

      expect(output).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(output).not.toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.SPECIFIED}]`);
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
