/**
 * Built-executable harness for `spx spec status --update --check`: it runs `node bin/spx.js` against a real
 * Git repository whose committed claims it prepares, so level-2 evidence exercises the Commander descriptor's
 * option pass-through and the process exit status rather than the in-process handler.
 *
 * @module testing/harnesses/spec-tree/status-check-process
 */

import { execa } from "execa";
import { access, realpath } from "node:fs/promises";
import { join } from "node:path";

import { JOURNAL_CLI_ENV } from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  type NodeStatusClaim,
  nodeStatusClaimResults,
  readNodeStatus,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import type { CommittedClaimDriftFixture } from "@testing/generators/node-status/node-status";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT } from "@testing/harnesses/constants";
import { buildGitTestEnvironment } from "@testing/harnesses/git-test-constants";
import { type PinnedNodeRepository, withClaimEntry, withClaimState } from "@testing/harnesses/node-status/node-status";
import { commitNodeClaim } from "@testing/harnesses/spec-tree/spec-cli-commands";
import { recordSealedTestJournal } from "@testing/harnesses/testing/status-journal";

/** The bundle `bin/spx.js` loads; absent until `pnpm run build` produces it. */
const BUILT_CLI_BUNDLE = join(PRODUCT_ROOT, "dist", "cli.js");
const BUILT_CLI_MISSING_EXIT_CODE = 1;

/** Captured streams and exit status of one built-executable run. */
export interface BuiltSpecStatusRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Run `node bin/spx.js spec status <options>` from `productDir`, failing loudly when the executable is not built. */
export async function runBuiltSpecStatus(
  productDir: string,
  options: readonly string[],
): Promise<BuiltSpecStatusRun> {
  await access(BUILT_CLI_BUNDLE).catch(() => {
    throw new Error(`built spx executable not found at ${BUILT_CLI_BUNDLE}; run \`pnpm run build\` first`);
  });
  const env = buildGitTestEnvironment();
  delete env[JOURNAL_CLI_ENV.BRANCH];
  const result = await execa(
    NODE_EXECUTABLE,
    [CLI_PATH, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND, ...options],
    {
      cwd: productDir,
      env: { ...env, [JOURNAL_CLI_ENV.BACKEND]: JOURNAL_BACKEND.LOCAL },
      extendEnv: false,
      reject: false,
    },
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? BUILT_CLI_MISSING_EXIT_CODE,
  };
}

/**
 * Commit the claim the built executable's `--update` writes for the repository's node, after a sealed passing
 * `test` run covering every linked test and a later commit, so the claim's entries carry a verdict, a pin commit,
 * and a read set. Returns the claim the update wrote.
 */
export async function commitBuiltProjection(repository: PinnedNodeRepository): Promise<NodeStatusClaim> {
  const { productDir } = repository.env;
  // The executable resolves the product directory through symbolic links, so a module identity names that path.
  const resolvedProductDir = await realpath(productDir);
  const headCommit = await repository.commitUnrelatedFile();
  await recordSealedTestJournal(productDir, {
    headCommit,
    scopes: repository.testPaths.map((testPath) => ({
      moduleId: join(resolvedProductDir, testPath),
      readPaths: [repository.specPath, testPath, repository.subjectPaths[0] ?? ""],
    })),
    findings: [],
    terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
    at: new Date(),
  });
  const update = await runBuiltSpecStatus(productDir, [SPEC_DOMAIN_CLI.UPDATE_OPTION]);
  if (update.exitCode !== 0) throw new Error(`The built update failed: ${update.stderr}`);
  await repository.commitAll();
  const written = readNodeStatus(join(productDir, repository.nodePath));
  if (written?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) {
    throw new Error(`The built update wrote no current claim for ${repository.nodeId}`);
  }
  return written.claim;
}

/** The two test entries a drifted claim changes, by claim key. */
export interface DriftedEntries {
  readonly verdictKey: string;
  readonly readKey: string;
}

/**
 * Commit `projected` with its state shifted by `drift`, the verdict of its first test entry replaced by another
 * verdict, and a path outside every read set added to the read set of its second test entry.
 */
export async function commitDriftedClaim(
  repository: PinnedNodeRepository,
  projected: NodeStatusClaim,
  drift: CommittedClaimDriftFixture,
): Promise<DriftedEntries> {
  const [verdictKey = "", readKey = ""] = repository.testKeys;
  const states = Object.values(SPEC_TREE_NODE_STATE);
  const driftedState = states[
    (states.indexOf(projected[NODE_STATUS_CLAIM_FIELD.STATE]) + drift.stateShift) % states.length
  ] ?? SPEC_TREE_NODE_STATE.DECLARED;
  const projectedVerdict = projected[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.TEST]?.[verdictKey]
    ?.[NODE_STATUS_CLAIM_FIELD.VERDICT];
  const driftedVerdict = Object.values(NODE_STATUS_EVIDENCE_OUTCOME).find((verdict) => verdict !== projectedVerdict)
    ?? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  const committed = withClaimEntry(
    withClaimEntry(
      withClaimState(new Map([[repository.nodeId, projected]]), repository.nodeId, driftedState),
      { nodeId: repository.nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: verdictKey },
      (entry) => ({ ...entry, [NODE_STATUS_CLAIM_FIELD.VERDICT]: driftedVerdict }),
    ),
    { nodeId: repository.nodeId, section: NODE_STATUS_CLAIM_SECTION.TEST, key: readKey },
    (entry) => ({
      ...entry,
      [NODE_STATUS_CLAIM_FIELD.READ]: [...(entry[NODE_STATUS_CLAIM_FIELD.READ] ?? []), drift.unreadPath],
    }),
  ).get(repository.nodeId);
  if (committed === undefined) throw new Error("The built projection has no drifted claim");
  await commitNodeClaim(repository, committed);
  return { verdictKey, readKey };
}

/** Commit `projected` with the pin commit of every result that carries one replaced by the repository's first commit. */
export async function commitRepinnedClaim(
  repository: PinnedNodeRepository,
  projected: NodeStatusClaim,
): Promise<void> {
  const committed = nodeStatusClaimResults(projected).reduce(
    (claims, { section, key }) =>
      withClaimEntry(
        claims,
        { nodeId: repository.nodeId, section, key },
        (entry) =>
          entry[NODE_STATUS_CLAIM_FIELD.COMMIT] === undefined
            ? entry
            : { ...entry, [NODE_STATUS_CLAIM_FIELD.COMMIT]: repository.commit },
      ),
    new Map([[repository.nodeId, projected]]) as ReadonlyMap<string, NodeStatusClaim>,
  ).get(repository.nodeId);
  if (committed === undefined) throw new Error("The built projection has no re-pinned claim");
  await commitNodeClaim(repository, committed);
}
