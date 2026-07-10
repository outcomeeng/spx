import * as fc from "fast-check";

import { GIT_COPY_STATUS_EXAMPLE, GIT_MODIFY_STATUS_EXAMPLE, GIT_RENAME_STATUS_EXAMPLE } from "@/lib/git/name-status";
import { arbitraryPathSegment, arbitraryWhitespacePathSegment } from "@testing/generators/git-name/git-name";

const GIT_SIMILARITY_SCORE_WIDTH = 3;
const GIT_SIMILARITY_SCORE_PAD = "0";
const GIT_STATUS_PREFIX_LENGTH = 1;
const GIT_SIMILARITY_SCORE_MIN = 0;

export interface GitNameStatusRecordInput {
  readonly status: string;
  readonly pathSegments: readonly string[];
}

export interface GitRenameCopyRecordInput {
  readonly renameStatus: string;
  readonly copyStatus: string;
  readonly sourceSegment: string;
  readonly renamedSegment: string;
  readonly copiedSegment: string;
}

function similarityStatus(prefix: string, score: number): string {
  return `${prefix}${score.toString().padStart(GIT_SIMILARITY_SCORE_WIDTH, GIT_SIMILARITY_SCORE_PAD)}`;
}

function arbitrarySimilarityStatus(example: string): fc.Arbitrary<string> {
  const prefix = example.slice(0, GIT_STATUS_PREFIX_LENGTH);
  const maximumScore = Number(example.slice(GIT_STATUS_PREFIX_LENGTH));
  return fc.integer({ min: GIT_SIMILARITY_SCORE_MIN, max: maximumScore })
    .map((score) => similarityStatus(prefix, score));
}

export function arbitraryWhitespaceNameStatusRecord(): fc.Arbitrary<GitNameStatusRecordInput> {
  return fc.oneof(
    arbitraryWhitespacePathSegment().map((segment) => ({
      status: GIT_MODIFY_STATUS_EXAMPLE,
      pathSegments: [segment],
    })),
    fc.tuple(
      arbitrarySimilarityStatus(GIT_RENAME_STATUS_EXAMPLE),
      arbitraryWhitespacePathSegment(),
      arbitraryWhitespacePathSegment(),
    ).map(([status, sourceSegment, destinationSegment]) => ({
      status,
      pathSegments: [sourceSegment, destinationSegment],
    })),
    fc.tuple(
      arbitrarySimilarityStatus(GIT_COPY_STATUS_EXAMPLE),
      arbitraryWhitespacePathSegment(),
      arbitraryWhitespacePathSegment(),
    ).map(([status, sourceSegment, destinationSegment]) => ({
      status,
      pathSegments: [sourceSegment, destinationSegment],
    })),
  );
}

export function arbitraryRenameCopyRecords(): fc.Arbitrary<GitRenameCopyRecordInput> {
  return fc.tuple(
    arbitrarySimilarityStatus(GIT_RENAME_STATUS_EXAMPLE),
    arbitrarySimilarityStatus(GIT_COPY_STATUS_EXAMPLE),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
  ).map(([renameStatus, copyStatus, sourceSegment, renamedSegment, copiedSegment]) => ({
    renameStatus,
    copyStatus,
    sourceSegment,
    renamedSegment,
    copiedSegment,
  }));
}
