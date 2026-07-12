import * as fc from "fast-check";

import {
  DEFAULT_DOCUMENTATION_PATH,
  DOCUMENTATION_FILE_EXTENSION,
  type DocumentationSyncConfig,
} from "@/domains/release/documentation-sync";
import type { ReleaseData } from "@/domains/release/release-data";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";

const DOCUMENT_COUNT_MIN = 1;
const DOCUMENT_COUNT_MAX = 3;
const DOCUMENT_PREFIX = "# ";
const VERSION_SEPARATOR = "\n\n";

export interface DocumentationSyncScenario {
  readonly releaseData: ReleaseData;
  readonly config: DocumentationSyncConfig;
  readonly paths: readonly string[];
  readonly original: Readonly<Partial<Record<string, string>>>;
  readonly updated: Readonly<Partial<Record<string, string>>>;
}

export function arbitraryDefaultDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return arbitraryDocumentationSyncScenario(fc.constant([DEFAULT_DOCUMENTATION_PATH]), {});
}

export function arbitraryConfiguredDocumentationSyncScenario(): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .uniqueArray(arbitraryDocumentationPath(), {
      minLength: DOCUMENT_COUNT_MIN,
      maxLength: DOCUMENT_COUNT_MAX,
    })
    .chain((paths) => arbitraryDocumentationSyncScenario(fc.constant(paths), { paths }));
}

function arbitraryDocumentationPath(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((segment) => `${segment}${DOCUMENTATION_FILE_EXTENSION}`);
}

function arbitraryDocumentationSyncScenario(
  pathsArbitrary: fc.Arbitrary<readonly string[]>,
  config: DocumentationSyncConfig,
): fc.Arbitrary<DocumentationSyncScenario> {
  return fc
    .tuple(RELEASE_TEST_GENERATOR.releaseData(), pathsArbitrary, arbitraryPathSegment())
    .map(([releaseData, paths, priorVersion]) => ({
      releaseData,
      config,
      paths,
      original: Object.fromEntries(
        paths.map((path) => [path, `${DOCUMENT_PREFIX}${priorVersion}${VERSION_SEPARATOR}${priorVersion}\n`]),
      ),
      updated: Object.fromEntries(
        paths.map((path) => [path, `${DOCUMENT_PREFIX}${priorVersion}${VERSION_SEPARATOR}${releaseData.version}\n`]),
      ),
    }));
}
