/**
 * Harness that commits a node linking a test, an eval, a probe, and an audit rule beside a dependency lockfile,
 * projects its claim through the production `spx spec status --update` from runs that each read the lockfile,
 * and reads the claim's pins and their currency after a commit that changes only the lockfile.
 *
 * @module testing/harnesses/node-status/lockfile-pin
 */
import { posix } from "node:path";

import { statusCommand } from "@/commands/spec/status";
import {
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_EVIDENCE_OUTCOME,
  type NodeStatusClaimSection,
} from "@/lib/node-status";
import { LOCKFILE_NAMES } from "@/test/languages/journal-reporter";
import { arbitraryLockfileContents } from "@testing/generators/node-status/lockfile-pin";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  currentMethodologyConfig,
  PINNED_SPEC_FIXTURE,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import { readStatusJsonNode, type ReportedStatusResult } from "@testing/harnesses/spec-tree/spec-cli-commands";

const [LOCKFILE_PATH] = LOCKFILE_NAMES;

/** A committed node and the operations a test drives over its claim. */
export interface LockfilePinRepository {
  readonly lockfilePath: string;
  /** Project the claim from runs that each read the lockfile and a subject, and commit it. */
  projectAndCommit(): Promise<void>;
  /** Commit a change to the lockfile and to nothing else. */
  commitLockfileOnlyChange(): Promise<void>;
  /** The claim's result of `section` as `spx spec status --json` reports it, its pin and currency included. */
  reportedResult(section: NodeStatusClaimSection): Promise<ReportedStatusResult | undefined>;
}

/** Commit the node and hand it to `callback`. */
export function withLockfilePinRepository(
  callback: (repository: LockfilePinRepository) => Promise<void>,
): Promise<void> {
  const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
  const contents = sampleGeneratedValue(arbitraryLockfileContents());
  return withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
    await repository.env.writeRaw(LOCKFILE_PATH, contents.before);
    await repository.commitAll();
    const [subject = ""] = repository.subjectPaths;
    const [testPath = ""] = repository.testPaths;
    const [evalPath = ""] = repository.evalPaths;
    const [probePath = ""] = repository.probePaths;
    const [auditSlug = ""] = repository.auditRuleSlugs;
    const keyOf = (path: string): string => posix.relative(repository.nodePath, path);
    const keyOfSection: Readonly<Record<NodeStatusClaimSection, string>> = {
      [NODE_STATUS_CLAIM_SECTION.TEST]: keyOf(testPath),
      [NODE_STATUS_CLAIM_SECTION.EVAL]: keyOf(evalPath),
      [NODE_STATUS_CLAIM_SECTION.PROBE]: keyOf(probePath),
      [NODE_STATUS_CLAIM_SECTION.AUDIT]: auditSlug,
      [NODE_STATUS_CLAIM_SECTION.EVIDENCE]: NODE_STATUS_CLAIM_SECTION.TEST,
    };
    const read = [subject, LOCKFILE_PATH];
    const passed = { verdict: NODE_STATUS_EVIDENCE_OUTCOME.PASSED, read };
    const resolvers = repository.resolversOfRecordedRuns({
      tests: { [testPath]: passed, [evalPath]: passed, [probePath]: passed },
      audit: { [auditSlug]: passed },
      evidence: { [NODE_STATUS_CLAIM_SECTION.TEST]: passed },
    });

    await callback({
      lockfilePath: LOCKFILE_PATH,
      projectAndCommit: async () => {
        await statusCommand({
          cwd: repository.env.productDir,
          gitDependencies: repository.git,
          update: true,
          resolveOutcomeFor: () => resolvers.resolveOutcome,
          resolveReadPathsFor: () => resolvers.resolveReadPaths,
          resolveAttributedResultsFor: () => resolvers.resolveAttributedResults,
        });
        await repository.commitAll();
      },
      commitLockfileOnlyChange: async () => {
        await repository.env.writeRaw(LOCKFILE_PATH, contents.after);
        await repository.commitAll();
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
