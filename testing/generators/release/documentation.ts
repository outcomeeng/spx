import * as fc from "fast-check";

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
import type { ReleaseData } from "@/domains/release/release-data";
import { PATH_CONTAINMENT_PARENT_DIRECTORY } from "@/lib/file-system/pathContainment";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

const DOCUMENT_COUNT_MIN = 1;
const MULTI_DOCUMENT_COUNT_MIN = 2;
const DOCUMENT_COUNT_MAX = 3;
const DOCUMENT_PREFIX = "# ";
const VERSION_SEPARATOR = "\n\n";
const SPEC_TREE_DIRECTORY = "spx";
const SOURCE_DOMAIN_DIRECTORY = "src/domains";
const SPEC_NODE_SUFFIX = ".enabler";
const TYPESCRIPT_FILE_EXTENSION = ".ts";

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
  readonly ambientState: readonly AmbientProductState[];
}

export interface DocumentationPathMappingCase {
  readonly label: string;
  readonly scenario: DocumentationSyncScenario;
  readonly expected: readonly string[];
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
  const defaults = sampleReleaseTestValue(arbitraryDefaultDocumentationSyncScenario());
  const configured = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
  return [
    { label: "omitted", scenario: defaults, expected: DEFAULT_RELEASE_DOCUMENTATION_PATHS },
    { label: "configured", scenario: configured, expected: configured.paths },
  ];
}

export function arbitraryDefaultDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryDocumentationSyncScenario(fc.constant(DEFAULT_RELEASE_DOCUMENTATION_PATHS), {});
}

export function arbitraryConfiguredDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryConfiguredDocumentationSyncScenarioWithMinimum(DOCUMENT_COUNT_MIN);
}

export function arbitraryMultiDocumentSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryConfiguredDocumentationSyncScenarioWithMinimum(MULTI_DOCUMENT_COUNT_MIN);
}

export function mixedSeparatorDocumentationPathAliases(): readonly string[] {
  const slashSeparatedPath = sampleReleaseTestValue(arbitraryNestedDocumentationSyncScenario()).paths[0];
  return [
    slashSeparatedPath,
    slashSeparatedPath.replaceAll(
      RELEASE_DOCUMENTATION_PATH_SEPARATOR,
      RELEASE_DOCUMENTATION_WINDOWS_PATH_SEPARATOR,
    ),
  ];
}

export function documentationPathFailureCases(): readonly DocumentationPathFailureCase[] {
  const [
    traversalFile,
    escapeDirectory,
    escapeFile,
    symlinkFile,
    symlinkTarget,
    missingFile,
    directoryTarget,
    backingContent,
  ] = sampleReleaseTestValue(fc.tuple(
    arbitraryDocumentationPath(),
    arbitraryPathSegment(),
    arbitraryDocumentationPath(),
    arbitraryDocumentationPath(),
    arbitraryDocumentationPath(),
    arbitraryDocumentationPath(),
    arbitraryDocumentationPath(),
    arbitraryPathSegment(),
  ));
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
    .map(([directory, filename]) => [`${directory}${RELEASE_DOCUMENTATION_PATH_SEPARATOR}${filename}`])
    .chain((paths) => arbitraryDocumentationSyncScenario(fc.constant(paths), { paths }));
}

export function arbitraryPromptBoundaryDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryConfiguredDocumentationSyncScenario().map((scenario) => ({
    ...scenario,
    releaseData: {
      ...scenario.releaseData,
      commits: scenario.releaseData.commits.map((commit, index) =>
        index === 0
          ? { ...commit, subject: `${commit.subject}${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}` }
          : commit
      ),
    },
  }));
}

function arbitraryDocumentationPath(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((segment) => `${segment}${DOCUMENTATION_FILE_EXTENSION}`);
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
  return { ...createDocumentationPathFailureCase(label, configuredPath, backingContent), kind };
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
    ...createDocumentationPathFailureCase(label, configuredPath, backingContent),
    kind,
    linkPath,
    backingPath,
  };
}

function arbitraryDocumentationSyncScenario(
  pathsArbitrary: fc.Arbitrary<readonly string[]>,
  config: DocumentationSyncConfig,
): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .tuple(
      RELEASE_TEST_GENERATOR.releaseData(),
      pathsArbitrary,
      arbitraryPathSegment(),
      arbitraryPathSegment(),
      arbitraryPathSegment(),
      arbitraryPathSegment(),
    )
    .map(([releaseData, paths, priorVersion, specState, domainState, ambientContent]) => ({
      releaseData,
      config,
      paths,
      original: Object.fromEntries(
        paths.map((path) => [path, `${DOCUMENT_PREFIX}${priorVersion}${VERSION_SEPARATOR}${priorVersion}\n`]),
      ),
      updated: Object.fromEntries(
        paths.map((path) => [
          path,
          `${DOCUMENT_PREFIX}${releaseData.version}${VERSION_SEPARATOR}${releaseData.version}\n`,
        ]),
      ),
      ambientState: [
        {
          path: `${SPEC_TREE_DIRECTORY}/${specState}${SPEC_NODE_SUFFIX}/${specState}${DOCUMENTATION_FILE_EXTENSION}`,
          content: `${ambientContent}-${specState}`,
        },
        {
          path: `${SOURCE_DOMAIN_DIRECTORY}/${domainState}${TYPESCRIPT_FILE_EXTENSION}`,
          content: `${ambientContent}-${domainState}`,
        },
      ],
    }));
}
