/**
 * Harness that commits a three-level node chain, records sealed audit runs over subjects inside it, and
 * projects the chain's claims through the production `spx spec status --update`, so a test reads which Node
 * took an `evidence` entry from which run.
 *
 * @module testing/harnesses/node-status/evidence-attribution
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createNodeStatusResolvers } from "@/commands/spec/node-status-resolvers";
import { statusCommand } from "@/commands/spec/status";
import { CLAIM_EVIDENCE_KIND } from "@/domains/verify/audit-claim-entry";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  type NodeStatusClaimEntry,
  readNodeStatus,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import {
  ATTRIBUTION_ROLES_OUTSIDE_IN,
  ATTRIBUTION_SUBJECT_KIND,
  type AttributionRole,
  type AttributionSubjectKind,
  type AttributionTreeFixture,
} from "@testing/generators/node-status/evidence-attribution";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import {
  CLASSIFICATION_FIXTURE_PATHS,
  commitPaths,
  currentMethodologyConfig,
  isolatedFixtureGitDependencies,
  PINNED_SPEC_FIXTURE,
  runFixtureGit,
} from "@testing/harnesses/node-status/node-status";
import { type RecordedAuditRun, recordSealedAuditJournal } from "@testing/harnesses/node-status/sealed-audit-journal";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const SPEC_FILE_SUFFIX = SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
const EVIDENCE_LINK_TARGET = /\]\((tests\/[^)\s]+)\)/g;
const EVIDENCE_LINK_TARGET_GROUP = 1;
const REPOSITORY_ROOT_PATHS = ["."] as const;
const RUN_INSTANT = new Date(Date.UTC(2026, 0, 1));

/** A committed node chain with the operations a test drives over it. */
export interface AttributionTree {
  readonly nodePaths: Readonly<Record<AttributionRole, string>>;
  /** The product-relative path of a subject of `kind` that the Node at `holder` holds as its own. */
  subjectOf(kind: AttributionSubjectKind, holder: AttributionRole): string;
  /** Record one sealed audit run holding one tests-audit unit over `subject`, judging the chain's source file. */
  recordAuditRun(subject: string): Promise<RecordedAuditRun>;
  /** Project every Node's claim from the recorded runs through the production `--update`. */
  update(): Promise<void>;
  /** The `evidence` entry of linked tests that the Node at `role` records, or nothing when it records none. */
  writtenEvidenceEntry(role: AttributionRole): NodeStatusClaimEntry | undefined;
}

/** Commit the chain `fixture` describes, each Node's spec linking tests, and hand it to `callback`. */
export function withAttributionTree(
  fixture: AttributionTreeFixture,
  callback: (tree: AttributionTree) => Promise<void>,
): Promise<void> {
  return withTestEnv(currentMethodologyConfig(), async (env) => {
    const [specContent, testContent] = await Promise.all([
      readFile(PINNED_SPEC_FIXTURE.DEFAULT, "utf8"),
      readFile(CLASSIFICATION_FIXTURE_PATHS.test, "utf8"),
    ]);
    const linkedTargets = [...specContent.matchAll(EVIDENCE_LINK_TARGET)].map((match) =>
      match.at(EVIDENCE_LINK_TARGET_GROUP) ?? ""
    );
    const directories: string[] = [];
    const nodePaths = Object.fromEntries(
      ATTRIBUTION_ROLES_OUTSIDE_IN.map((role) => {
        directories.push(fixture.nodes[role].dirName);
        return [role, [SPEC_TREE_CONFIG.ROOT_DIRECTORY, ...directories].join(PATH_SEPARATOR)] as const;
      }),
    ) as Record<AttributionRole, string>;
    const specPathOf = (role: AttributionRole): string =>
      `${nodePaths[role]}${PATH_SEPARATOR}${fixture.nodes[role].slug}${SPEC_FILE_SUFFIX}`;
    for (const role of ATTRIBUTION_ROLES_OUTSIDE_IN) {
      await env.writeNode(specPathOf(role), specContent);
      for (const target of linkedTargets) {
        await env.writeNode(`${nodePaths[role]}${PATH_SEPARATOR}${target}`, testContent);
      }
    }
    await env.writeRaw(fixture.sourcePath, testContent);
    await runFixtureGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
    const head = (): Promise<string> =>
      runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    const [firstLinkedTarget = ""] = linkedTargets;
    const resolvers = createNodeStatusResolvers({
      productDir: env.productDir,
      worktreeRoot: env.productDir,
      registry: testingRegistry,
      git: isolatedFixtureGitDependencies,
    });

    await callback({
      nodePaths,
      subjectOf: (kind, holder) => {
        if (kind === ATTRIBUTION_SUBJECT_KIND.TESTS_FILE) {
          return `${nodePaths[holder]}${PATH_SEPARATOR}${firstLinkedTarget}`;
        }
        return kind === ATTRIBUTION_SUBJECT_KIND.SPEC ? specPathOf(holder) : nodePaths[holder];
      },
      recordAuditRun: async (subject) =>
        recordSealedAuditJournal(env.productDir, {
          headCommit: await head(),
          subject,
          judgedPaths: [fixture.sourcePath],
          at: RUN_INSTANT,
        }),
      update: async () => {
        await statusCommand({
          cwd: env.productDir,
          gitDependencies: isolatedFixtureGitDependencies,
          update: true,
          resolveOutcomeFor: () => (_nodeId, evidencePaths) =>
            Promise.resolve(
              Object.fromEntries(evidencePaths.map((path) => [path, NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN])),
            ),
          resolveAttributedResultsFor: () => resolvers.resolveAttributedResults,
        });
      },
      writtenEvidenceEntry: (role) => {
        const read = readNodeStatus(join(env.productDir, nodePaths[role]));
        if (read?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) {
          throw new Error(`The update wrote no current claim for ${nodePaths[role]}`);
        }
        return read.claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.EVIDENCE]?.[
          CLAIM_EVIDENCE_KIND.TEST
        ];
      },
    });
  });
}
