/**
 * Harness that commits a node linking a test, an eval, a probe, and an audit rule beside a dependency lockfile,
 * projects its claim through the production `spx spec status --update` from runs that each read the lockfile,
 * and reads the claim's pins and their currency after a commit that changes only the lockfile.
 *
 * @module testing/harnesses/node-status/lockfile-pin
 */
import { posix } from "node:path";

import { createNodeStatusResolvers } from "@/commands/spec/node-status-resolvers";
import { statusCommand } from "@/commands/spec/status";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import {
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_EVIDENCE_OUTCOME,
  type NodeStatusClaimSection,
} from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { arbitraryLockfileContents } from "@testing/generators/node-status/lockfile-pin";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  currentMethodologyConfig,
  PINNED_SPEC_FIXTURE,
  runFixtureGit,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import { recordSealedAuditJournal } from "@testing/harnesses/node-status/sealed-audit-journal";
import { readStatusJsonNode, type ReportedStatusResult } from "@testing/harnesses/spec-tree/spec-cli-commands";

const RUN_INSTANT = new Date(Date.UTC(2026, 0, 1));

/** A committed node and the operations a test drives over its claim. */
export interface LockfilePinRepository {
  readonly lockfilePath: string;
  /**
   * Project the claim and commit it. The `test`, `eval`, `probe` and `audit` results come from recorded runs
   * that each read the lockfile and a subject; the `evidence` result comes from a sealed audit run, journaled
   * with the lockfile among its judged paths, that the production status resolvers read.
   */
  projectAndCommit(): Promise<void>;
  /** Commit a change to the lockfile and to nothing else. */
  commitLockfileOnlyChange(): Promise<void>;
  /**
   * Record the sealed audit run that judged the lockfile, commit a change to the lockfile and to nothing else,
   * and only then project the claim and commit it, so the production resolvers meet a run whose judged paths
   * changed after its head commit.
   */
  projectAfterLockfileOnlyChange(): Promise<void>;
  /** The claim's result of `section` as `spx spec status --json` reports it, its pin and currency included. */
  reportedResult(section: NodeStatusClaimSection): Promise<ReportedStatusResult | undefined>;
}

/** Commit the node beside the dependency lockfile `lockfilePath` and hand it to `callback`. */
export function withLockfilePinRepository(
  lockfilePath: string,
  callback: (repository: LockfilePinRepository) => Promise<void>,
): Promise<void> {
  const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
  const contents = sampleGeneratedValue(arbitraryLockfileContents());
  return withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
    await repository.env.writeRaw(lockfilePath, contents.before);
    await repository.commitAll();
    const [subject = ""] = repository.subjectPaths;
    const [testPath = ""] = repository.testPaths;
    const [evalPath = ""] = repository.evalPaths;
    const [probePath = ""] = repository.probePaths;
    const [auditSlug = ""] = repository.auditRuleSlugs;
    const keyOf = (path: string): string => posix.relative(repository.nodePath, path);
    const subjectUnderAudit = testPath;
    const keyOfSection: Readonly<Record<NodeStatusClaimSection, string>> = {
      [NODE_STATUS_CLAIM_SECTION.TEST]: keyOf(testPath),
      [NODE_STATUS_CLAIM_SECTION.EVAL]: keyOf(evalPath),
      [NODE_STATUS_CLAIM_SECTION.PROBE]: keyOf(probePath),
      [NODE_STATUS_CLAIM_SECTION.AUDIT]: auditSlug,
      [NODE_STATUS_CLAIM_SECTION.EVIDENCE]: NODE_STATUS_CLAIM_SECTION.TEST,
    };
    const read = [subject, lockfilePath];
    const passed = { verdict: NODE_STATUS_EVIDENCE_OUTCOME.PASSED, read };
    const resolvers = repository.resolversOfRecordedRuns({
      tests: { [testPath]: passed, [evalPath]: passed, [probePath]: passed },
      audit: { [auditSlug]: passed },
      evidence: {},
    });
    const productionResolvers = createNodeStatusResolvers({
      productDir: repository.env.productDir,
      registry: testingRegistry,
      git: repository.git,
    });

    const recordAuditRun = async (): Promise<void> => {
      await recordSealedAuditJournal(repository.env.productDir, {
        headCommit: await runFixtureGit(repository.env.productDir, [
          GIT_ROOT_COMMAND.REV_PARSE,
          GIT_ROOT_COMMAND.HEAD,
        ]),
        subject: subjectUnderAudit,
        judgedPaths: [subject, lockfilePath],
        at: RUN_INSTANT,
      });
    };
    const projectAndCommit = async (): Promise<void> => {
      await statusCommand({
        cwd: repository.env.productDir,
        gitDependencies: repository.git,
        update: true,
        resolveOutcomeFor: () => resolvers.resolveOutcome,
        resolveReadPathsFor: () => resolvers.resolveReadPaths,
        resolveAttributedResultsFor: () => async (nodeId, request) => ({
          audit: (await resolvers.resolveAttributedResults(nodeId, request)).audit,
          evidence: (await productionResolvers.resolveAttributedResults(nodeId, request)).evidence,
        }),
      });
      await repository.commitAll();
    };
    const commitLockfileOnlyChange = async (): Promise<void> => {
      await repository.env.writeRaw(lockfilePath, contents.after);
      await repository.commitAll();
    };

    await callback({
      lockfilePath,
      projectAndCommit: async () => {
        await recordAuditRun();
        await projectAndCommit();
      },
      commitLockfileOnlyChange,
      projectAfterLockfileOnlyChange: async () => {
        await recordAuditRun();
        await commitLockfileOnlyChange();
        await projectAndCommit();
      },
      reportedResult: async (section) => {
        const node = await readStatusJsonNode(repository.env.productDir, repository.nodeId, repository.git);
        return node?.claim?.results.find((result) =>
          result.section === section && result.key === keyOfSection[section]
        );
      },
    });
  }, PINNED_SPEC_FIXTURE.ALL_EVIDENCE);
}
