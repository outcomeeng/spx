import * as fc from "fast-check";
import { posix, win32 } from "node:path";

import { AGENT_FILE_TOOLS, type AgentRunTool } from "@/agent/agent-runner";
import { SOURCE_DOMAIN_ROOT_PREFIX } from "@/config/source-roots";
import {
  DEFAULT_RELEASE_DOCUMENTATION_PATHS,
  RELEASE_DOCUMENTATION_PATH_SEPARATOR,
  RELEASE_DOCUMENTATION_WINDOWS_PATH_SEPARATOR,
} from "@/domains/release/config";
import type { DocumentationSyncConfig } from "@/domains/release/config";
import {
  DOCUMENTATION_FILE_EXTENSION,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
} from "@/domains/release/documentation-sync";
import { type ReleaseData, releaseVersionFromTag } from "@/domains/release/release-data";
import { PATH_CONTAINMENT_PARENT_DIRECTORY } from "@/lib/file-system/pathContainment";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree/config";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

const DOCUMENT_COUNT_MIN = 1;
const MULTI_DOCUMENT_COUNT_MIN = 2;
const DOCUMENT_COUNT_MAX = 3;
const CURRENT_DIRECTORY_SEGMENT = ".";
const DOCUMENT_PREFIX = "# ";
const VERSION_SEPARATOR = "\n\n";
const SEMANTIC_VERSION_PRERELEASE_SEPARATOR = "-";
const SEMANTIC_VERSION_BUILD_SEPARATOR = "+";
const SEMANTIC_VERSION_COMPARISON_PREFIX = ">=";
const SEMANTIC_VERSION_GROUP_OPEN = "(";
const SEMANTIC_VERSION_GROUP_CLOSE = ")";

export interface AmbientProductState {
  readonly path: string;
  readonly content: string;
}

export interface DocumentationSyncScenario {
  readonly releaseData: ReleaseData;
  readonly config: DocumentationSyncConfig;
  readonly paths: readonly string[];
  readonly original: Readonly<Partial<Record<string, string>>>;
  readonly updated: Readonly<Partial<Record<string, string>>>;
  readonly intervening: Readonly<Partial<Record<string, string>>>;
  readonly ambientState: readonly AmbientProductState[];
}

export type DocumentationUpdatedContent = DocumentationSyncScenario["updated"];

export interface DocumentationContentEntry {
  readonly path: string;
  readonly content: string | undefined;
}

export interface DocumentationTransformationEntry {
  readonly path: string;
  readonly originalContent: string | undefined;
  readonly updatedContent: string | undefined;
}

export function documentationContentEntries(
  scenario: DocumentationSyncScenario,
  contentByPath: Readonly<Partial<Record<string, string>>>,
): readonly DocumentationContentEntry[] {
  return scenario.paths.map((path) => ({ path, content: contentByPath[path] }));
}

export function documentationTransformationEntries(
  scenario: DocumentationSyncScenario,
  updatedByPath: Readonly<Partial<Record<string, string>>> = scenario.updated,
): readonly DocumentationTransformationEntry[] {
  return scenario.paths.map((path) => ({
    path,
    originalContent: scenario.original[path],
    updatedContent: updatedByPath[path],
  }));
}

export interface DocumentationVersionPreservationScenarios {
  readonly withPreviousTag: DocumentationSyncScenario;
  readonly withoutPreviousTag: DocumentationSyncScenario;
}

export interface DocumentationUnrelatedVersionRewriteScenario {
  readonly scenario: DocumentationSyncScenario;
  readonly rewritten: Readonly<Partial<Record<string, string>>>;
}

export interface DocumentationAgentFileToolBoundaryScenario {
  readonly documentationScenario: DocumentationSyncScenario;
  readonly tool: AgentRunTool;
  readonly containedPath: string;
  readonly escapedPaths: readonly string[];
}

export interface DocumentationConfigIndependenceScenario {
  readonly scenario: DocumentationSyncScenario;
  readonly unrelatedSection: string;
}

interface DocumentationSyncScenarioWithUnrelatedVersion {
  readonly scenario: DocumentationSyncScenario;
  readonly unrelatedVersion: string;
}

interface DocumentationVersionReferences {
  readonly original: readonly string[];
  readonly updated: readonly string[];
}

export const DOCUMENTATION_PATH_MAPPING_CASE = {
  OMITTED: "omitted",
  CONFIGURED: "configured",
} as const;

export type DocumentationPathMappingCaseKind =
  (typeof DOCUMENTATION_PATH_MAPPING_CASE)[keyof typeof DOCUMENTATION_PATH_MAPPING_CASE];

export interface DocumentationPathMappingCase {
  readonly kind: DocumentationPathMappingCaseKind;
  readonly scenario: DocumentationSyncScenario;
}

export interface DocumentationPathAliasCase {
  readonly canonicalPath: string;
  readonly configuredPath: string;
  readonly content: string;
}

/** Node's complete pair of platform-specific path implementations. */
export const DOCUMENTATION_PATH_SEMANTICS = [
  {
    label: "POSIX",
    join: posix.join,
    operations: {
      isAbsolute: posix.isAbsolute,
      relative: posix.relative,
      resolve: posix.resolve,
      sep: posix.sep,
    },
  },
  {
    label: "Windows",
    join: win32.join,
    operations: {
      isAbsolute: win32.isAbsolute,
      relative: win32.relative,
      resolve: win32.resolve,
      sep: win32.sep,
    },
  },
] as const;

export const DOCUMENTATION_FAILURE_CASE = {
  GENERATION: "generation",
  READ_BACK: "read-back",
  INCOMPLETE_SET: "incomplete-set",
} as const;

export type DocumentationFailureCase = (typeof DOCUMENTATION_FAILURE_CASE)[keyof typeof DOCUMENTATION_FAILURE_CASE];

export interface DocumentationFailureInput {
  readonly kind: DocumentationFailureCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_VERSION_VALIDATION_CASE = {
  COMPLETE_HISTORY: "complete-history",
  VERSION_VARIANT: "version-variant",
  PARTIAL_REWRITE: "partial-rewrite",
} as const;

export type DocumentationVersionValidationCase =
  (typeof DOCUMENTATION_VERSION_VALIDATION_CASE)[keyof typeof DOCUMENTATION_VERSION_VALIDATION_CASE];

export interface DocumentationVersionValidationInput {
  readonly kind: DocumentationVersionValidationCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_IDENTITY_CASE = {
  STAGED_SYMLINK: "staged-symlink",
  PRODUCT_READ: "product-read",
  CANONICAL_RESOLUTION: "canonical-resolution",
  STAGED_READ: "staged-read",
  DUPLICATE_FILE: "duplicate-file",
  STAGED_REPLACEMENT: "staged-replacement",
  PROMOTION_REPLACEMENT: "promotion-replacement",
} as const;

export type DocumentationIdentityCase = (typeof DOCUMENTATION_IDENTITY_CASE)[keyof typeof DOCUMENTATION_IDENTITY_CASE];

export interface DocumentationIdentityInput {
  readonly kind: DocumentationIdentityCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_ROLLBACK_CASE = {
  POST_PROMOTION_EDIT: "post-promotion-edit",
  IDENTITY_REPLACEMENT: "identity-replacement",
} as const;

export type DocumentationRollbackCase = (typeof DOCUMENTATION_ROLLBACK_CASE)[keyof typeof DOCUMENTATION_ROLLBACK_CASE];

export interface DocumentationRollbackInput {
  readonly kind: DocumentationRollbackCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_PROMOTION_FAILURE_CASE = {
  SECOND_WRITE: "second-write",
  POST_STAGING_EDIT: "post-staging-edit",
  DURING_PROMOTION_EDIT: "during-promotion-edit",
} as const;

export type DocumentationPromotionFailureCase =
  (typeof DOCUMENTATION_PROMOTION_FAILURE_CASE)[keyof typeof DOCUMENTATION_PROMOTION_FAILURE_CASE];

export interface DocumentationPromotionFailureInput {
  readonly kind: DocumentationPromotionFailureCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_AUDIT_CASE = {
  REJECT_BEFORE_PROMOTION: "reject-before-promotion",
  TRANSFORMATION: "transformation",
} as const;

export type DocumentationAuditCase = (typeof DOCUMENTATION_AUDIT_CASE)[keyof typeof DOCUMENTATION_AUDIT_CASE];

export interface DocumentationAuditInput {
  readonly kind: DocumentationAuditCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_PROMPT_CASE = {
  PRODUCER_INPUT: "producer-input",
  DATA_BOUNDARY: "data-boundary",
  AMBIENT_EXCLUSION: "ambient-exclusion",
} as const;

export type DocumentationPromptCase = (typeof DOCUMENTATION_PROMPT_CASE)[keyof typeof DOCUMENTATION_PROMPT_CASE];

export interface DocumentationPromptInput {
  readonly kind: DocumentationPromptCase;
  readonly scenario: DocumentationSyncScenario;
}

export const DOCUMENTATION_PATH_FAILURE_KIND = {
  TRAVERSAL: "traversal",
  CANONICAL_ESCAPE: "canonical-escape",
  FINAL_SYMLINK: "final-symlink",
  MISSING_FILE: "missing-file",
  DIRECTORY_TARGET: "directory-target",
} as const;

type UnlinkedDocumentationPathFailureKind =
  | typeof DOCUMENTATION_PATH_FAILURE_KIND.TRAVERSAL
  | typeof DOCUMENTATION_PATH_FAILURE_KIND.MISSING_FILE
  | typeof DOCUMENTATION_PATH_FAILURE_KIND.DIRECTORY_TARGET;

type LinkedDocumentationPathFailureKind =
  | typeof DOCUMENTATION_PATH_FAILURE_KIND.CANONICAL_ESCAPE
  | typeof DOCUMENTATION_PATH_FAILURE_KIND.FINAL_SYMLINK;

interface DocumentationPathFailureCaseBase {
  readonly label: string;
  readonly releaseData: ReleaseData;
  readonly config: DocumentationSyncConfig;
  readonly configuredPath: string;
  readonly backingContent: string;
}

export type DocumentationPathFailureCase =
  & DocumentationPathFailureCaseBase
  & (
    | {
      readonly kind: UnlinkedDocumentationPathFailureKind;
    }
    | {
      readonly kind: LinkedDocumentationPathFailureKind;
      readonly linkPath: string;
      readonly backingPath: string;
    }
  );

export function documentationPathMappingCases(): readonly DocumentationPathMappingCase[] {
  const defaults = sampleReleaseTestValue(
    arbitraryDefaultDocumentationSyncScenario(),
  );
  const configured = sampleReleaseTestValue(
    arbitraryConfiguredDocumentationSyncScenario(),
  );
  return [
    { kind: DOCUMENTATION_PATH_MAPPING_CASE.OMITTED, scenario: defaults },
    { kind: DOCUMENTATION_PATH_MAPPING_CASE.CONFIGURED, scenario: configured },
  ];
}

export function sampleDocumentationFailureInput(
  kind: DocumentationFailureCase,
): DocumentationFailureInput {
  return {
    kind,
    scenario: sampleReleaseTestValue(
      kind === DOCUMENTATION_FAILURE_CASE.INCOMPLETE_SET
        ? arbitraryMultiDocumentSyncScenario()
        : arbitraryConfiguredDocumentationSyncScenario(),
    ),
  };
}

export function sampleDocumentationVersionValidationInput(
  kind: DocumentationVersionValidationCase,
): DocumentationVersionValidationInput {
  return {
    kind,
    scenario: sampleReleaseTestValue(
      kind === DOCUMENTATION_VERSION_VALIDATION_CASE.VERSION_VARIANT
        ? arbitraryReleaseVersionVariantOnlyScenario()
        : arbitraryConfiguredDocumentationSyncScenario(),
    ),
  };
}

export function sampleDocumentationIdentityInput(
  kind: DocumentationIdentityCase,
): DocumentationIdentityInput {
  const multipleDocuments = kind === DOCUMENTATION_IDENTITY_CASE.DUPLICATE_FILE
    || kind === DOCUMENTATION_IDENTITY_CASE.STAGED_REPLACEMENT;
  return {
    kind,
    scenario: sampleReleaseTestValue(
      multipleDocuments
        ? arbitraryMultiDocumentSyncScenario()
        : arbitrarySingleDocumentSyncScenario(),
    ),
  };
}

export function sampleDocumentationRollbackInput(
  kind: DocumentationRollbackCase,
): DocumentationRollbackInput {
  return {
    kind,
    scenario: sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
  };
}

export function sampleDocumentationPromotionFailureInput(
  kind: DocumentationPromotionFailureCase,
): DocumentationPromotionFailureInput {
  return {
    kind,
    scenario: sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
  };
}

export function sampleDocumentationAuditInput(
  kind: DocumentationAuditCase,
): DocumentationAuditInput {
  return {
    kind,
    scenario: sampleReleaseTestValue(
      arbitraryConfiguredDocumentationSyncScenario(),
    ),
  };
}

export function sampleDocumentationPromptInput(
  kind: DocumentationPromptCase,
): DocumentationPromptInput {
  return {
    kind,
    scenario: sampleReleaseTestValue(
      kind === DOCUMENTATION_PROMPT_CASE.DATA_BOUNDARY
        ? arbitraryPromptBoundaryDocumentationSyncScenario()
        : arbitraryConfiguredDocumentationSyncScenario(),
    ),
  };
}

export function arbitraryDefaultDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryDocumentationSyncScenario(
    fc.constant(DEFAULT_RELEASE_DOCUMENTATION_PATHS),
    {},
  );
}

export function arbitraryConfiguredDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryConfiguredDocumentationSyncScenarioWithMinimum(
    DOCUMENT_COUNT_MIN,
  );
}

export function arbitraryMultiDocumentSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryConfiguredDocumentationSyncScenarioWithMinimum(
    MULTI_DOCUMENT_COUNT_MIN,
  );
}

export function arbitrarySingleDocumentSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .tuple(arbitraryDocumentationPath())
    .chain((paths) => arbitraryDocumentationSyncScenario(fc.constant(paths), { paths }));
}

export function arbitraryFirstReleaseDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .uniqueArray(arbitraryDocumentationPath(), {
      minLength: DOCUMENT_COUNT_MIN,
      maxLength: DOCUMENT_COUNT_MAX,
    })
    .chain((paths) =>
      arbitraryDocumentationSyncScenario(
        fc.constant(paths),
        { paths },
        RELEASE_TEST_GENERATOR.releaseDataWithoutPreviousTag(),
      )
    );
}

export function arbitraryVersionlessSubsequentReleaseDocumentationSyncScenario(): fc.Arbitrary<
  DocumentationSyncScenario
> {
  return arbitraryConfiguredDocumentationSyncScenario().chain((scenario) =>
    arbitraryPathSegment().map((content) => ({
      ...scenario,
      original: documentationForPaths(scenario.paths, [content]),
      updated: documentationForPaths(scenario.paths, [
        scenario.releaseData.version,
        content,
      ]),
    }))
  );
}

export function arbitraryDocumentationVersionPreservationScenarios(): fc.Arbitrary<
  DocumentationVersionPreservationScenarios
> {
  return fc.record({
    withPreviousTag: arbitraryConfiguredDocumentationSyncScenario().chain(
      (scenario) => {
        if (scenario.releaseData.previousTag === null) {
          throw new Error(
            "Generated subsequent-release scenario has no previous release tag",
          );
        }
        return arbitraryScenarioWithPreservedVersionVariant(
          scenario,
          releaseVersionFromTag(scenario.releaseData.previousTag),
        );
      },
    ),
    withoutPreviousTag: arbitraryFirstReleaseDocumentationSyncScenario().chain(
      (scenario) =>
        arbitraryScenarioWithPreservedVersionVariant(
          scenario,
          scenario.releaseData.version,
        ),
    ),
  });
}

export function arbitraryUnrelatedVersionRewriteScenario(): fc.Arbitrary<DocumentationUnrelatedVersionRewriteScenario> {
  return fc
    .uniqueArray(arbitraryDocumentationPath(), {
      minLength: DOCUMENT_COUNT_MIN,
      maxLength: DOCUMENT_COUNT_MAX,
    })
    .chain((paths) =>
      arbitraryDocumentationSyncScenarioWithUnrelatedVersion(
        fc.constant(paths),
        { paths },
      )
    )
    .chain(({ scenario, unrelatedVersion }) => {
      const previousVersion = scenario.releaseData.previousTag === null
        ? null
        : releaseVersionFromTag(scenario.releaseData.previousTag);
      return RELEASE_TEST_GENERATOR.semver()
        .filter(
          (version) =>
            version !== scenario.releaseData.version
            && version !== previousVersion
            && version !== unrelatedVersion,
        )
        .map((rewrittenVersion) => ({
          scenario,
          rewritten: rewriteDocumentationVersion(
            scenario.updated,
            unrelatedVersion,
            rewrittenVersion,
          ),
        }));
    });
}

export function arbitraryDocumentationAgentFileToolBoundaryScenario(): fc.Arbitrary<
  DocumentationAgentFileToolBoundaryScenario
> {
  return fc
    .tuple(
      arbitraryConfiguredDocumentationSyncScenario(),
      arbitraryPathSegment(),
      arbitraryPathSegment(),
      arbitraryPathSegment(),
      fc.constantFrom(...AGENT_FILE_TOOLS),
    )
    .map(
      ([
        documentationScenario,
        rootSegment,
        containedSegment,
        escapedSegment,
        tool,
      ]) => {
        const rootPath = posix.resolve(posix.sep, rootSegment);
        return {
          documentationScenario,
          tool,
          containedPath: posix.join(rootPath, containedSegment),
          escapedPaths: [
            posix.join(PATH_CONTAINMENT_PARENT_DIRECTORY, escapedSegment),
            posix.resolve(posix.dirname(rootPath), escapedSegment),
          ],
        };
      },
    );
}

export function arbitraryDocumentationConfigIndependenceScenario(): fc.Arbitrary<
  DocumentationConfigIndependenceScenario
> {
  return fc
    .tuple(
      arbitraryConfiguredDocumentationSyncScenario(),
      arbitraryPathSegment(),
    )
    .map(([scenario, unrelatedSection]) => ({ scenario, unrelatedSection }));
}

export function arbitraryReleaseVersionVariantOnlyScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryFirstReleaseDocumentationSyncScenario().chain((scenario) =>
    fc
      .tuple(
        arbitrarySemanticVersionVariant(scenario.releaseData.version),
        arbitraryEmbeddedSemanticVersion(scenario.releaseData.version),
      )
      .map(([variant, embedded]) => ({
        ...scenario,
        updated: documentationForPaths(scenario.paths, [variant, embedded]),
      }))
  );
}

export function arbitraryDuplicateDocumentationPathSet(): fc.Arbitrary<
  readonly string[]
> {
  return fc
    .tuple(
      arbitraryPathSegment(),
      arbitraryDocumentationPath(),
      arbitraryPathSegment(),
    )
    .chain(([directory, filename, aliasDirectory]) => {
      const path = `${directory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${filename}`;
      return fc.oneof(
        fc.constant([path, path]),
        fc.constant([
          path,
          path.replaceAll(
            RELEASE_DOCUMENTATION_PATH_SEPARATOR,
            RELEASE_DOCUMENTATION_WINDOWS_PATH_SEPARATOR,
          ),
        ]),
        fc.constant([
          path,
          `${directory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${aliasDirectory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${PATH_CONTAINMENT_PARENT_DIRECTORY}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${filename}`,
        ]),
      );
    });
}

export function arbitrarySparseDocumentationPathSet(): fc.Arbitrary<
  readonly string[]
> {
  return arbitraryDocumentationPath().map((path) => {
    const paths = [path];
    paths.length = MULTI_DOCUMENT_COUNT_MIN;
    return paths;
  });
}

export function documentationPathFailureCases(): readonly DocumentationPathFailureCase[] {
  const [
    traversalFile,
    escapeDirectory,
    escapeFile,
    [symlinkFile, symlinkTarget],
    missingFile,
    directoryTarget,
    backingContent,
  ] = sampleReleaseTestValue(
    fc.tuple(
      arbitraryDocumentationPath(),
      arbitraryPathSegment(),
      arbitraryDocumentationPath(),
      arbitraryDistinctDocumentationPaths(),
      arbitraryDocumentationPath(),
      arbitraryDocumentationPath(),
      arbitraryPathSegment(),
    ),
  );
  return [
    createUnlinkedDocumentationPathFailureCase(
      "parent traversal",
      DOCUMENTATION_PATH_FAILURE_KIND.TRAVERSAL,
      `${PATH_CONTAINMENT_PARENT_DIRECTORY}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${traversalFile}`,
      backingContent,
    ),
    createLinkedDocumentationPathFailureCase(
      "canonical escape",
      DOCUMENTATION_PATH_FAILURE_KIND.CANONICAL_ESCAPE,
      `${escapeDirectory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${escapeFile}`,
      backingContent,
      escapeDirectory,
      escapeFile,
    ),
    createLinkedDocumentationPathFailureCase(
      "final symlink",
      DOCUMENTATION_PATH_FAILURE_KIND.FINAL_SYMLINK,
      symlinkFile,
      backingContent,
      symlinkFile,
      symlinkTarget,
    ),
    createUnlinkedDocumentationPathFailureCase(
      "missing file",
      DOCUMENTATION_PATH_FAILURE_KIND.MISSING_FILE,
      missingFile,
      backingContent,
    ),
    createUnlinkedDocumentationPathFailureCase(
      "directory target",
      DOCUMENTATION_PATH_FAILURE_KIND.DIRECTORY_TARGET,
      directoryTarget,
      backingContent,
    ),
  ];
}

function arbitraryConfiguredDocumentationSyncScenarioWithMinimum(
  minLength: number,
): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .uniqueArray(arbitraryDocumentationPath(), {
      minLength,
      maxLength: DOCUMENT_COUNT_MAX,
    })
    .chain((paths) => arbitraryDocumentationSyncScenario(fc.constant(paths), { paths }));
}

export function arbitraryNestedDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .tuple(arbitraryPathSegment(), arbitraryDocumentationPath())
    .map(([directory, filename]) => [
      `${directory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${filename}`,
    ])
    .chain((paths) => arbitraryDocumentationSyncScenario(fc.constant(paths), { paths }));
}

export function arbitraryDocumentationPathAliasCases(): fc.Arbitrary<
  readonly DocumentationPathAliasCase[]
> {
  return fc
    .tuple(
      arbitraryPathSegment(),
      arbitraryDocumentationPath(),
      arbitraryPathSegment(),
      arbitraryPathSegment(),
    )
    .map(([directory, filename, aliasDirectory, content]) => {
      const canonicalPath = `${directory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${filename}`;
      return [
        {
          canonicalPath,
          configuredPath: canonicalPath.replaceAll(
            RELEASE_DOCUMENTATION_PATH_SEPARATOR,
            RELEASE_DOCUMENTATION_WINDOWS_PATH_SEPARATOR,
          ),
          content,
        },
        {
          canonicalPath,
          configuredPath: `${CURRENT_DIRECTORY_SEGMENT}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${canonicalPath}`,
          content,
        },
        {
          canonicalPath,
          configuredPath:
            `${directory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${aliasDirectory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${PATH_CONTAINMENT_PARENT_DIRECTORY}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${filename}`,
          content,
        },
      ];
    });
}

export function arbitraryPromptBoundaryDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryConfiguredDocumentationSyncScenario().chain((scenario) =>
    arbitraryPathSegment().map((segment) => {
      const boundaryVersion =
        `${scenario.releaseData.version}\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}${segment}`;
      return {
        ...scenario,
        releaseData: {
          ...scenario.releaseData,
          version: boundaryVersion,
          commits: scenario.releaseData.commits.map((commit, index) =>
            index === 0
              ? {
                ...commit,
                subject: `${commit.subject}${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}`,
              }
              : commit
          ),
        },
        updated: Object.fromEntries(
          Object.entries(scenario.updated).map(([path, content]) => {
            if (content === undefined) {
              throw new Error(`No generated documentation for ${path}`);
            }
            return [
              path,
              content.replaceAll(scenario.releaseData.version, boundaryVersion),
            ];
          }),
        ),
      };
    })
  );
}

function arbitraryDocumentationPath(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map(
    (segment) => `${segment}${DOCUMENTATION_FILE_EXTENSION}`,
  );
}

function arbitraryDistinctDocumentationPaths(): fc.Arbitrary<
  readonly [string, string]
> {
  return fc
    .uniqueArray(arbitraryDocumentationPath(), { minLength: 2, maxLength: 2 })
    .map(([linkPath, backingPath]) => [linkPath, backingPath]);
}

function createDocumentationPathFailureCase(
  label: string,
  configuredPath: string,
  backingContent: string,
): DocumentationPathFailureCaseBase {
  return {
    label,
    releaseData: sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
    config: { paths: [configuredPath] },
    configuredPath,
    backingContent,
  };
}

function createUnlinkedDocumentationPathFailureCase(
  label: string,
  kind: UnlinkedDocumentationPathFailureKind,
  configuredPath: string,
  backingContent: string,
): DocumentationPathFailureCase {
  return {
    ...createDocumentationPathFailureCase(
      label,
      configuredPath,
      backingContent,
    ),
    kind,
  };
}

function createLinkedDocumentationPathFailureCase(
  label: string,
  kind: LinkedDocumentationPathFailureKind,
  configuredPath: string,
  backingContent: string,
  linkPath: string,
  backingPath: string,
): DocumentationPathFailureCase {
  return {
    ...createDocumentationPathFailureCase(
      label,
      configuredPath,
      backingContent,
    ),
    kind,
    linkPath,
    backingPath,
  };
}

function arbitraryDocumentationSyncScenario(
  pathsArbitrary: fc.Arbitrary<readonly string[]>,
  config: DocumentationSyncConfig,
  releaseDataArbitrary: fc.Arbitrary<ReleaseData> = RELEASE_TEST_GENERATOR.releaseData(),
): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryDocumentationSyncScenarioWithUnrelatedVersion(
    pathsArbitrary,
    config,
    releaseDataArbitrary,
  ).map(({ scenario }) => scenario);
}

function arbitraryDocumentationSyncScenarioWithUnrelatedVersion(
  pathsArbitrary: fc.Arbitrary<readonly string[]>,
  config: DocumentationSyncConfig,
  releaseDataArbitrary: fc.Arbitrary<ReleaseData> = RELEASE_TEST_GENERATOR.releaseData(),
): fc.Arbitrary<DocumentationSyncScenarioWithUnrelatedVersion> {
  return releaseDataArbitrary.chain((releaseData) => {
    const previousVersion = releaseData.previousTag === null
      ? null
      : releaseVersionFromTag(releaseData.previousTag);
    const unrelatedVersionArbitrary = RELEASE_TEST_GENERATOR.semver().filter(
      (version) => version !== releaseData.version && version !== previousVersion,
    );
    return fc
      .tuple(
        fc.constant(releaseData),
        pathsArbitrary,
        unrelatedVersionArbitrary,
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
      )
      .map(
        ([
          scenarioReleaseData,
          paths,
          unrelatedVersion,
          specState,
          domainState,
          ambientContent,
          interveningContent,
        ]) => {
          const versionReferences = createDocumentationVersionReferences(
            scenarioReleaseData,
            unrelatedVersion,
          );
          return {
            unrelatedVersion,
            scenario: {
              releaseData: scenarioReleaseData,
              config,
              paths,
              original: documentationForPaths(
                paths,
                versionReferences.original,
              ),
              updated: documentationForPaths(paths, versionReferences.updated),
              intervening: documentationForPaths(paths, [interveningContent]),
              ambientState: [
                {
                  path: posix.join(
                    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
                    `${specState}${KIND_REGISTRY.enabler.suffix}`,
                    `${specState}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
                  ),
                  content: `${ambientContent}-${specState}`,
                },
                {
                  path: `${SOURCE_DOMAIN_ROOT_PREFIX}${domainState}`,
                  content: `${ambientContent}-${domainState}`,
                },
              ],
            },
          };
        },
      );
  });
}

function arbitraryScenarioWithPreservedVersionVariant(
  scenario: DocumentationSyncScenario,
  version: string,
): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .tuple(
      arbitrarySemanticVersionVariant(version),
      arbitraryEmbeddedSemanticVersion(version),
    )
    .map(([variant, embedded]) => ({
      ...scenario,
      original: appendDocumentationVersions(scenario.original, [
        variant,
        embedded,
      ]),
      updated: appendDocumentationVersions(scenario.updated, [
        variant,
        embedded,
      ]),
    }));
}

function arbitrarySemanticVersionVariant(
  version: string,
): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(
        SEMANTIC_VERSION_PRERELEASE_SEPARATOR,
        SEMANTIC_VERSION_BUILD_SEPARATOR,
      ),
      arbitraryPathSegment(),
    )
    .map(([separator, identifier]) => `${version}${separator}${identifier}`);
}

function arbitraryEmbeddedSemanticVersion(
  version: string,
): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryPathSegment().map(
      (packageName) => `${packageName}${SEMANTIC_VERSION_PRERELEASE_SEPARATOR}${version}`,
    ),
    fc.constant(`${SEMANTIC_VERSION_COMPARISON_PREFIX}${version}`),
    fc.constant(
      `${SEMANTIC_VERSION_GROUP_OPEN}${version}${SEMANTIC_VERSION_GROUP_CLOSE}`,
    ),
  );
}

function documentationForPaths(
  paths: readonly string[],
  versions: readonly string[],
): Readonly<Partial<Record<string, string>>> {
  return Object.fromEntries(
    paths.map((path) => [
      path,
      `${DOCUMENT_PREFIX}${versions.join(VERSION_SEPARATOR)}\n`,
    ]),
  );
}

function appendDocumentationVersions(
  documents: Readonly<Partial<Record<string, string>>>,
  versions: readonly string[],
): Readonly<Partial<Record<string, string>>> {
  return Object.fromEntries(
    Object.entries(documents).map(([path, content]) => {
      if (content === undefined) {
        throw new Error(`Generated documentation has no content for ${path}`);
      }
      return [
        path,
        `${content.trimEnd()}${VERSION_SEPARATOR}${versions.join(VERSION_SEPARATOR)}\n`,
      ];
    }),
  );
}

function rewriteDocumentationVersion(
  documents: Readonly<Partial<Record<string, string>>>,
  originalVersion: string,
  rewrittenVersion: string,
): Readonly<Partial<Record<string, string>>> {
  return Object.fromEntries(
    Object.entries(documents).map(([path, content]) => {
      if (content === undefined) {
        throw new Error(`Generated documentation has no content for ${path}`);
      }
      return [path, content.replaceAll(originalVersion, rewrittenVersion)];
    }),
  );
}

function createDocumentationVersionReferences(
  releaseData: ReleaseData,
  unrelatedVersion: string,
): DocumentationVersionReferences {
  if (releaseData.previousTag === null) {
    return {
      original: [unrelatedVersion],
      updated: [releaseData.version, unrelatedVersion],
    };
  }
  const previousVersion = releaseVersionFromTag(releaseData.previousTag);
  return {
    original: [previousVersion, unrelatedVersion, previousVersion],
    updated: [releaseData.version, unrelatedVersion, releaseData.version],
  };
}
