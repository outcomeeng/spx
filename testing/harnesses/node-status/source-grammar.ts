/**
 * Harness that materializes source-grammar nodes: a spec in the 3.x grammar with one test-linked Assertion and one
 * Assertion closed by the audit-tag form its facts name, under the Malleability they name, and a committed
 * repository holding that spec, its test and its subject with resolvers that answer every required result as passed.
 *
 * @module testing/harnesses/node-status/source-grammar
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { statusCommand } from "@/commands/spec/status";
import { DEFAULT_METHODOLOGY_SOURCE, METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import {
  createNodeStatusProvider,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_DEFAULT_MALLEABILITY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FILENAME,
  type NodeAttributedResultResolver,
  type NodeOutcomeResolver,
  type NodeReadPathResolver,
  type NodeStatusClaim,
  type NodeStatusClaimVerification,
  readNodeStatus,
  serializeNodeStatusClaim,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  KIND_REGISTRY,
  readSpecTree,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_LINK_TEXT,
  SPEC_TREE_GRAMMAR,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  SOURCE_GRAMMAR_DECLARATION,
  SOURCE_GRAMMAR_TEST_GENERATOR,
  sourceGrammarAuditTagText,
  type SourceGrammarDeclaration,
  type SourceGrammarNodeFixture,
  type SourceGrammarNodeRepositoryFixture,
  taggedAssertionLines,
} from "@testing/generators/node-status/source-grammar";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { evidenceFileNameFor } from "@testing/generators/spec-tree/evidence-file-name";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import {
  CLASSIFICATION_FIXTURE_PATHS,
  commitPaths,
  isolatedFixtureGitDependencies,
  nodeStatusAttribution,
  runFixtureGit,
} from "@testing/harnesses/node-status/node-status";
import { type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const SUBJECT_DIRECTORY = "src";
const SUBJECT_EXTENSION = ".ts";
const TEST_MODE = "scenario";
const TEST_LEVEL = "l1";
const REPOSITORY_ROOT_PATHS = ["."] as const;
const FRONT_MATTER_FENCE = "---";
const LINE_BREAK = "\n";

/** The 3.x spec opening and the test-linked Assertion every source-grammar spec holds. */
const SPEC_TEXT = {
  TITLE: "# Fixture",
  OPENING: ["PROVIDES fixture infrastructure", "SO THAT node-status tests", "CAN classify a source-grammar node"],
  ASSERTIONS_HEADING: "## Assertions",
  TEST_GROUP_HEADING: "### Scenarios",
  TEST_ASSERTION: "- Given an input, when it is processed, then the output is produced",
} as const;

/** The node-local path of the test a source-grammar node links. */
export function sourceGrammarTestReference(node: SourceGrammarNodeFixture): string {
  return [
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    evidenceFileNameFor([node.subjectName, TEST_MODE, TEST_LEVEL], SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT),
  ].join(PATH_SEPARATOR);
}

/** The text of a source-grammar node's spec: its declared Malleability, its test-linked Assertion, and its audit tag. */
export function sourceGrammarSpecText(node: SourceGrammarNodeFixture): string {
  const tag = sourceGrammarAuditTagText(node.facts.auditTagForm, node.auditSlug);
  return specTextWithAssertionLines(node, tag === undefined ? [] : taggedAssertionLines(tag));
}

/**
 * The text of a node's spec in the 3.x grammar: the Malleability its facts declare, its test-linked Assertion, then
 * `assertionLines` in its Assertions section, then `trailingLines` after that section.
 */
export function specTextWithAssertionLines(
  node: SourceGrammarNodeFixture,
  assertionLines: readonly string[],
  trailingLines: readonly string[] = [],
): string {
  const frontMatter = node.facts.malleability === undefined
    ? []
    : [FRONT_MATTER_FENCE, `${SPEC_CONTEXT_SELECTED_METADATA_KEY}: ${node.facts.malleability}`, FRONT_MATTER_FENCE];
  return [
    ...frontMatter,
    SPEC_TEXT.TITLE,
    "",
    ...SPEC_TEXT.OPENING,
    "",
    SPEC_TEXT.ASSERTIONS_HEADING,
    "",
    SPEC_TEXT.TEST_GROUP_HEADING,
    "",
    `${SPEC_TEXT.TEST_ASSERTION} ([${SPEC_TREE_EVIDENCE_LINK_TEXT.TEST}](${sourceGrammarTestReference(node)}))`,
    ...(assertionLines.length === 0 ? [] : ["", ...assertionLines]),
    ...(trailingLines.length === 0 ? [] : ["", ...trailingLines]),
    "",
  ].join(LINE_BREAK);
}

/**
 * The node's directory and spec file names under a declaration: the 3.x enabler and prior spec name while the
 * product migrates from 3.2, and the 4.0 capability and canonical spec name under 4.0 alone, which reads no 3.x kind.
 */
function nodeNamesUnder(
  node: SourceGrammarNodeFixture,
  declaration: SourceGrammarDeclaration,
): { readonly directory: string; readonly specFile: string } {
  const migrating = declaration === SOURCE_GRAMMAR_DECLARATION.MIGRATING_FROM_THREE_TWO;
  const kindSuffix = migrating ? KIND_REGISTRY.enabler.suffix : KIND_REGISTRY.capability.suffix;
  const specSuffix = migrating
    ? SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX
    : SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX;
  return {
    directory: `${node.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${node.slug}${kindSuffix}`,
    specFile: `${node.slug}${specSuffix}`,
  };
}

/** A configuration declaring a methodology version of `declaration`, beside the minimal spec-tree kinds. */
export function sourceGrammarConfig(declaration: SourceGrammarDeclaration): Config {
  const drawn = sampleGeneratedValue(SOURCE_GRAMMAR_TEST_GENERATOR.methodologyDeclaration(declaration));
  return {
    ...MINIMAL_SPEC_TREE_CONFIG,
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: DEFAULT_METHODOLOGY_SOURCE,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: drawn.version,
      ...(drawn.migratingFrom === undefined ? {} : { [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: drawn.migratingFrom }),
    },
  };
}

/** A materialized source-grammar node: its spec in a product migrating from 3.2. */
export type SourceGrammarNodeEnv = {
  readonly env: SpecTreeEnv;
  readonly nodeId: string;
  readonly specPath: string;
};

/** Materialize the spec of `node` in a temporary product declaring 4.0 migrating from 3.2. */
export async function withSourceGrammarNode(
  node: SourceGrammarNodeFixture,
  callback: (materialized: SourceGrammarNodeEnv) => Promise<void>,
): Promise<void> {
  const declaration = SOURCE_GRAMMAR_DECLARATION.MIGRATING_FROM_THREE_TWO;
  await withTestEnv(sourceGrammarConfig(declaration), async (env) => {
    const { directory, specFile } = nodeNamesUnder(node, declaration);
    const specPath = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, directory, specFile].join(PATH_SEPARATOR);
    await env.writeNode(specPath, sourceGrammarSpecText(node));
    await callback({ env, nodeId: directory, specPath });
  });
}

/** A committed source-grammar node repository and the operations a test drives over its claim. */
export type SourceGrammarNodeRepository = {
  readonly env: SpecTreeEnv;
  readonly nodeId: string;
  readonly nodePath: string;
  readonly specPath: string;
  readonly testPath: string;
  readonly subjectPath: string;
  /** The test payload the repository commits, which passes. */
  readonly testContent: string;
  readonly git: GitDependencies;
  /** Answers every consulted test as passed. */
  readonly resolveOutcome: NodeOutcomeResolver;
  /** Answers every passed test as having read the subject. */
  readonly resolveReadPaths: NodeReadPathResolver;
  /** Answers every requested audit slug and evidence kind as passed, each reading the subject. */
  readonly resolveAttributedResults: NodeAttributedResultResolver;
  /** Fold the node's claim through `spx spec status --update` with the repository's resolvers, and commit it. */
  updateAndCommit(): Promise<void>;
  /** The 4.0 claim the node commits, or nothing when it holds none. */
  readClaim(): NodeStatusClaim | undefined;
  /** Write `verification` as the node's 4.0 claim, recording `state`, and commit it. */
  commitClaim(verification: NodeStatusClaimVerification, state: SpecTreeNodeState): Promise<void>;
  /** The node's lifecycle state as `spx spec status` reads it from the committed claim. */
  readState(): Promise<SpecTreeNodeState | undefined>;
  /** The head commit of the repository. */
  headCommit(): Promise<string>;
};

/**
 * Commit the spec, test, and subject of `fixture` in a temporary product under its declaration; the spec is the
 * source-grammar spec of its node unless `specText` gives another.
 */
export async function withSourceGrammarNodeRepository(
  fixture: SourceGrammarNodeRepositoryFixture,
  callback: (repository: SourceGrammarNodeRepository) => Promise<void>,
  specText: string = sourceGrammarSpecText(fixture.node),
): Promise<void> {
  const { node, declaration } = fixture;
  await withTestEnv(sourceGrammarConfig(declaration), async (env) => {
    const testContent = await readFile(CLASSIFICATION_FIXTURE_PATHS.test, "utf8");
    const { directory, specFile } = nodeNamesUnder(node, declaration);
    const nodePath = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, directory].join(PATH_SEPARATOR);
    const specPath = [nodePath, specFile].join(PATH_SEPARATOR);
    const testPath = [nodePath, sourceGrammarTestReference(node)].join(PATH_SEPARATOR);
    const subjectPath = `${SUBJECT_DIRECTORY}${PATH_SEPARATOR}${node.subjectName}${SUBJECT_EXTENSION}`;
    await env.writeNode(specPath, specText);
    await env.writeNode(testPath, testContent);
    await env.writeRaw(subjectPath, testContent);
    const git = isolatedFixtureGitDependencies;
    await runFixtureGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);

    const attribution = nodeStatusAttribution(node.slug, directory);
    const passed = (keys: readonly string[], read: readonly string[]) =>
      Object.fromEntries(
        keys.map((key) => [key, { verdict: NODE_STATUS_EVIDENCE_OUTCOME.PASSED, read, ...attribution }] as const),
      );
    const resolveOutcome: NodeOutcomeResolver = (_nodeId, evidencePaths) =>
      Promise.resolve(
        Object.fromEntries(evidencePaths.map((path) => [path, NODE_STATUS_EVIDENCE_OUTCOME.PASSED] as const)),
      );
    const resolveReadPaths: NodeReadPathResolver = () => Promise.resolve([subjectPath]);
    const resolveAttributedResults: NodeAttributedResultResolver = (_nodeId, request) =>
      Promise.resolve({
        audit: passed(request.auditRuleSlugs, [specPath, subjectPath]),
        evidence: passed(request.evidenceKinds, [specPath, testPath, subjectPath]),
      });
    const nodeDirectory = join(env.productDir, nodePath);
    const commitAll = () => commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);

    await callback({
      env,
      nodeId: directory,
      nodePath,
      specPath,
      testPath,
      subjectPath,
      testContent,
      git,
      resolveOutcome,
      resolveReadPaths,
      resolveAttributedResults,
      updateAndCommit: async () => {
        await statusCommand({
          cwd: env.productDir,
          gitDependencies: git,
          update: true,
          resolveOutcomeFor: () => resolveOutcome,
          resolveReadPathsFor: () => resolveReadPaths,
          resolveAttributedResultsFor: () => resolveAttributedResults,
        });
        await commitAll();
      },
      readClaim: () => {
        const read = readNodeStatus(nodeDirectory);
        return read?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT ? read.claim : undefined;
      },
      commitClaim: async (verification, state) => {
        const current = readNodeStatus(nodeDirectory);
        const malleability = current?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
          ? current.claim[NODE_STATUS_CLAIM_FIELD.MALLEABILITY]
          : node.facts.malleability ?? NODE_STATUS_DEFAULT_MALLEABILITY;
        await env.writeRaw(
          [nodePath, NODE_STATUS_FILENAME].join(PATH_SEPARATOR),
          serializeNodeStatusClaim({
            [NODE_STATUS_CLAIM_FIELD.STATE]: state,
            [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: malleability,
            [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: verification,
          }),
        );
        await commitAll();
      },
      readState: async () => {
        const snapshot = await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          evidence: await createNodeStatusProvider(env.productDir, { gitDependencies: git }),
        });
        return snapshot.allNodes.find((candidate) => candidate.id === directory)?.state;
      },
      headCommit: () => runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]),
    });
  });
}
