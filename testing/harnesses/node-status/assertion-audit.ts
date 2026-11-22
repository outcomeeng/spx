/**
 * Harness that commits a node with Audit Assertions, records sealed Assertion audit runs over its rows, and
 * projects its claim through the production status resolvers, so a test reads the `audit` entries the fold writes.
 *
 * @module testing/harnesses/node-status/assertion-audit
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

import { createNodeStatusResolvers } from "@/commands/spec/node-status-resolvers";
import { statusCommand } from "@/commands/spec/status";
import type { JournalRunStateStatus } from "@/domains/journal/run-state";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { NODE_STATUS_CLAIM_SECTION } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import type { PinnedNodeFixture } from "@testing/generators/node-status/node-status";
import {
  currentMethodologyConfig,
  type PinnedNodeRepository,
  runFixtureGit,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import {
  type AssertionAuditUnitRecord,
  type RecordedAuditRun,
  recordSealedAssertionAuditJournal,
} from "@testing/harnesses/node-status/sealed-audit-journal";
import { readStatusJsonNode, type ReportedStatusResult } from "@testing/harnesses/spec-tree/spec-cli-commands";

const FIRST_RUN_INSTANT = Date.UTC(2026, 0, 1);
const RUN_SPACING_MS = 60_000;
const EDIT_APPENDIX = "\n// edited after the run\n";

/** One unit a test asks a recorded run to judge, by row slug; the spec is the node's own. */
export type AssertionAuditUnitRequest = Omit<AssertionAuditUnitRecord, "specPath">;

/** A committed node with Audit Assertions and the operations a test drives over its claim. */
export interface AssertionAuditRepository {
  readonly repository: PinnedNodeRepository;
  /** Record one sealed run at the current head, after every run recorded before it, over `units`. */
  recordRun(
    terminalStatus: JournalRunStateStatus,
    units: readonly AssertionAuditUnitRequest[],
  ): Promise<RecordedAuditRun>;
  /** Change the subject at `path` and commit the change. */
  commitSubjectChange(path: string): Promise<void>;
  /** Project the claim through the production resolvers and commit it. */
  projectAndCommit(): Promise<void>;
  /** The claim's `audit` entry under `slug`, as `spx spec status --json` reports it. */
  auditEntry(slug: string): Promise<ReportedStatusResult | undefined>;
  /** Every `audit` entry the claim holds. */
  auditEntries(): Promise<readonly ReportedStatusResult[]>;
  /** The head commit of the repository. */
  headCommit(): Promise<string>;
}

/** Commit the node `fixture` with the spec `specFixturePath` and hand it to `callback`. */
export function withAssertionAuditRepository(
  fixture: PinnedNodeFixture,
  specFixturePath: string,
  callback: (repository: AssertionAuditRepository) => Promise<void>,
): Promise<void> {
  return withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
    let runs = 0;
    const productDir = repository.env.productDir;
    const headCommit = (): Promise<string> =>
      runFixtureGit(productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    const resolvers = createNodeStatusResolvers({ productDir, registry: testingRegistry, git: repository.git });
    const reported = async (): Promise<readonly ReportedStatusResult[]> => {
      const node = await readStatusJsonNode(productDir, repository.nodeId, repository.git);
      return node?.claim?.results.filter((result) => result.section === NODE_STATUS_CLAIM_SECTION.AUDIT) ?? [];
    };
    await callback({
      repository,
      headCommit,
      recordRun: async (terminalStatus, units) => {
        const at = new Date(FIRST_RUN_INSTANT + runs * RUN_SPACING_MS);
        runs += 1;
        return recordSealedAssertionAuditJournal(productDir, {
          headCommit: await headCommit(),
          terminalStatus,
          units: units.map((unit) => ({ ...unit, specPath: repository.specPath })),
          at,
        });
      },
      commitSubjectChange: async (path) => {
        await appendFile(join(productDir, path), EDIT_APPENDIX);
        await repository.commitAll();
      },
      projectAndCommit: async () => {
        await statusCommand({
          cwd: productDir,
          gitDependencies: repository.git,
          update: true,
          resolveOutcomeFor: () => repository.passingOutcomes,
          resolveReadPathsFor: () => resolvers.resolveReadPaths,
          resolveAttributedResultsFor: () => resolvers.resolveAttributedResults,
        });
        await repository.commitAll();
      },
      auditEntry: async (slug) => (await reported()).find((result) => result.key === slug),
      auditEntries: reported,
    });
  }, specFixturePath);
}
