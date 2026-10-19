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
import {
  NODE_STATUS_CLAIM_DIFFERENCE,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_CURRENCY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  nodeStatusClaimResults,
} from "@/lib/node-status";
import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { renderTerminalText } from "@/lib/terminal-text/terminal-text";
import { testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  buildEvidenceEntry,
  createSource,
  distinctOrderedDirectoryName,
  sampleSingleNodeSourceEntry,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { STATUS_REPORT_TEST_GENERATOR } from "@testing/generators/spec-tree/status-report";
import {
  currentMethodologyConfig,
  readNodeStatusFileBytes,
  withClaimEntry,
  withClaimState,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import {
  addNodeTestFile,
  commitNodeClaim,
  commitPathsInGit,
  commitRegeneratedProjection,
  createRecordingGitRoot,
  fixtureNodePath,
  nodeEvidencePath,
  readRecordedStatusState,
  readStatusJsonNode,
  runStatusCheck,
  trackPathsInGit,
  uniformOutcomeResolverFor,
  writePassingStatusClaim,
  writeVersionOneClaim,
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
    const node = sampleSingleNodeSourceEntry(KIND_REGISTRY);

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
    const node = sampleSingleNodeSourceEntry(KIND_REGISTRY);

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

describe("spx spec status --json", () => {
  it("reports a committed 4.0 claim's shape and state, and per result its verdict, pin, actor, run, and pin currency", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const recorded = sampleGeneratedValue(STATUS_REPORT_TEST_GENERATOR.recordedClaimFacts());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const edited = repository.subjectPaths[fixture.editedSubject] ?? "";
      const untouched = repository.subjectPaths.find((_, index) => index !== fixture.editedSubject) ?? "";
      const auditKey = repository.auditRuleSlugs[0] ?? "";
      const testEntry = {
        ...repository.passedEntry([repository.specPath, repository.testPaths[0] ?? "", untouched]),
        [NODE_STATUS_CLAIM_FIELD.VERDICT]: recorded.testVerdict,
      };
      const auditEntry = {
        ...repository.passedEntry([repository.specPath, edited]),
        [NODE_STATUS_CLAIM_FIELD.VERDICT]: recorded.auditVerdict,
        [NODE_STATUS_CLAIM_FIELD.ACTOR]: recorded.actor,
        [NODE_STATUS_CLAIM_FIELD.RUN]: recorded.run,
      };
      await repository.writeClaim(
        {
          [NODE_STATUS_CLAIM_SECTION.TEST]: { [repository.testKeys[0] ?? ""]: testEntry },
          [NODE_STATUS_CLAIM_SECTION.AUDIT]: { [auditKey]: auditEntry },
        },
        recorded.state,
      );
      await repository.commitAll();
      // A change to one path in the audit result's read set leaves the test result's pin current.
      await repository.editSubject(fixture.editedSubject);

      const node = await readStatusJsonNode(repository.env.productDir, repository.nodeId, repository.git);

      expect(node?.claim?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
      expect(node?.claim?.state).toBe(recorded.state);
      expect(node?.claim?.results).toHaveLength(2);
      expect(node?.claim?.results).toContainEqual({
        section: NODE_STATUS_CLAIM_SECTION.TEST,
        key: repository.testKeys[0],
        ...testEntry,
        currency: NODE_STATUS_CURRENCY.CURRENT,
      });
      expect(node?.claim?.results).toContainEqual({
        section: NODE_STATUS_CLAIM_SECTION.AUDIT,
        key: auditKey,
        ...auditEntry,
        currency: NODE_STATUS_CURRENCY.NOT_CURRENT,
      });
    });
  });

  it("reports a committed version-1 claim's shape and state, and each result's verdict as unpinned", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const verdict = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.recordedVerdict());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const reference = repository.testPaths[0] ?? "";
      await writeVersionOneClaim(repository.env, repository.nodePath, reference, verdict);
      await repository.commitAll();

      const node = await readStatusJsonNode(repository.env.productDir, repository.nodeId, repository.git);

      expect(node?.claim?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.VERSION_1);
      expect(node?.claim?.state).toBe(node?.state);
      expect(node?.claim?.results).toEqual([
        {
          section: NODE_STATUS_VERIFICATION_MECHANISM.TEST,
          key: reference,
          [NODE_STATUS_CLAIM_FIELD.VERDICT]: verdict,
          currency: NODE_STATUS_CURRENCY.UNPINNED,
        },
      ]);
    });
  });
});

describe("spx spec status --update --check command", () => {
  it("writes nothing, reports each node and entry that differs, and signals failure when committed claims differ from the projection", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const drift = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.committedClaimDrift());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const projection = await commitRegeneratedProjection(repository);
      const [verdictKey = "", readKey = ""] = repository.testKeys;
      const states = Object.values(SPEC_TREE_NODE_STATE);
      const driftedState = states[
        (states.indexOf(projection.claim[NODE_STATUS_CLAIM_FIELD.STATE]) + drift.stateShift) % states.length
      ] ?? SPEC_TREE_NODE_STATE.DECLARED;
      const committed = withClaimEntry(
        withClaimEntry(
          withClaimState(new Map([[repository.nodeId, projection.claim]]), repository.nodeId, driftedState),
          { nodeId: repository.nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: verdictKey },
          (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.FAILED }),
        ),
        { nodeId: repository.nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: readKey },
        (entry) => ({
          ...entry,
          [NODE_STATUS_CLAIM_FIELD.READ]: [...(entry[NODE_STATUS_CLAIM_FIELD.READ] ?? []), drift.unreadPath],
        }),
      ).get(repository.nodeId);
      if (committed === undefined) throw new Error("The drifted claim is missing");
      await commitNodeClaim(repository, committed);
      const before = await readNodeStatusFileBytes(repository.env.productDir);

      const outcome = await runStatusCheck(repository, projection.resolvers);

      expect(await readNodeStatusFileBytes(repository.env.productDir)).toEqual(before);
      const { failure } = outcome;
      if (failure === undefined) throw new Error("The check reported no differences");
      const { differences } = failure;
      expect(differences).toHaveLength(3);
      expect(differences).toContainEqual({ nodeId: repository.nodeId, kind: NODE_STATUS_CLAIM_DIFFERENCE.STATE });
      for (const key of [verdictKey, readKey]) {
        expect(differences).toContainEqual({
          nodeId: repository.nodeId,
          kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY,
          section: NODE_STATUS_CLAIM_SECTION.TEST,
          key,
        });
      }
      const report = renderTerminalText(failure.report);
      for (const reported of [repository.nodeId, verdictKey, readKey, ...Object.values(NODE_STATUS_CLAIM_DIFFERENCE)]) {
        expect(report).toContain(reported);
      }
    });
  });

  it("writes nothing, reports nothing, and signals success when committed claims differ from the projection only in pin commits", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const projection = await commitRegeneratedProjection(repository);
      const projected = await readNodeStatusFileBytes(repository.env.productDir);
      const committed = nodeStatusClaimResults(projection.claim).reduce(
        (claims, { section, key }) =>
          withClaimEntry(claims, { nodeId: repository.nodeId, section, key }, (entry) => ({
            ...entry,
            [NODE_STATUS_CLAIM_FIELD.COMMIT]: repository.commit,
          })),
        new Map([[repository.nodeId, projection.claim]]) as ReadonlyMap<string, typeof projection.claim>,
      ).get(repository.nodeId);
      if (committed === undefined) throw new Error("The re-pinned claim is missing");
      await commitNodeClaim(repository, committed);
      const before = await readNodeStatusFileBytes(repository.env.productDir);
      // Re-pinning must change the committed bytes, or the case would compare identical claims.
      expect(before).not.toEqual(projected);

      const outcome = await runStatusCheck(repository, projection.resolvers);

      expect(await readNodeStatusFileBytes(repository.env.productDir)).toEqual(before);
      const { output } = outcome;
      if (output === undefined) throw new Error("The check reported differences");
      expect(renderTerminalText(output)).toBe("");
    });
  });

  it("rejects --check without --update at the type level", () => {
    // @ts-expect-error --check is valid only beside --update
    const checkWithoutUpdate = () => statusCommand({ check: true });

    expect(checkWithoutUpdate).toBeTypeOf("function");
  });
});
