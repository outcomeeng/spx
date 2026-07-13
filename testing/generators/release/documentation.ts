import * as fc from "fast-check";

import { DEFAULT_RELEASE_DOCUMENTATION_PATHS } from "@/domains/release/config";
import type { DocumentationSyncConfig } from "@/domains/release/config";
import {
  DOCUMENTATION_FILE_EXTENSION,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
} from "@/domains/release/documentation-sync";
import type { ReleaseData } from "@/domains/release/release-data";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

const DOCUMENT_COUNT_MIN = 1;
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
  return fc
    .uniqueArray(arbitraryDocumentationPath(), {
      minLength: DOCUMENT_COUNT_MIN,
      maxLength: DOCUMENT_COUNT_MAX,
    })
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
