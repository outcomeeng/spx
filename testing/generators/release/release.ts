import * as fc from "fast-check";

import { type ReleaseData, VERSION_DELTA, type VersionDelta } from "@/domains/release/release-data";
import { type GitCommit, RELEASE_TAG_PREFIX } from "@/lib/git/release";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

const VERSION_COMPONENT_MIN = 0;
const VERSION_COMPONENT_MAX = 40;
const VERSION_COMPONENT_RESET = 0;
const BUMP_INCREMENT_MIN = 1;
const BUMP_INCREMENT_MAX = 9;
const COMMIT_SUBJECT_SUFFIX = " update";
const SOURCE_FILE_SUFFIX = ".ts";
const FILE_CONTENT_PREFIX = "// ";
const FILE_CONTENT_NEWLINE = "\n";

const COMMITS_AFTER_TAG = 2;
const FULL_HISTORY_COMMITS = 2;
const DETERMINISM_REPO_COMMITS = 3;
const DETERMINISM_RUNS = 5;
const COMPLIANCE_COMMITS = 2;
const RELEASE_NOTES_COMMITS = 3;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export type ReleaseCommitFixture = {
  readonly path: string;
  readonly content: string;
  readonly subject: string;
};

export type ReleaseTagPair = {
  readonly earlier: string;
  readonly later: string;
};

export type VersionBump = {
  readonly previousTag: string;
  readonly packageVersion: string;
};

type ReleaseVersionProgression = {
  readonly version: string;
  readonly previousTag: string;
  readonly versionDelta: VersionDelta;
};

type SemverParts = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

export const RELEASE_TEST_GENERATOR = {
  counts: {
    commitsAfterTag: COMMITS_AFTER_TAG,
    fullHistoryCommits: FULL_HISTORY_COMMITS,
    determinismRepoCommits: DETERMINISM_REPO_COMMITS,
    determinismRuns: DETERMINISM_RUNS,
    complianceCommits: COMPLIANCE_COMMITS,
    releaseNotesCommits: RELEASE_NOTES_COMMITS,
  },
  semver: arbitrarySemver,
  releaseTag: arbitraryReleaseTag,
  releaseTagPair: arbitraryReleaseTagPair,
  distinctReleaseTags: arbitraryDistinctReleaseTags,
  commitSequence: arbitraryCommitSequence,
  versionBumpFor: arbitraryVersionBumpFor,
  releaseData: arbitraryReleaseData,
  releaseDataWithoutPreviousTag: arbitraryReleaseDataWithoutPreviousTag,
  releaseDataWithSubjects: arbitraryReleaseDataWithSubjects,
} as const;

// Fixed arbitrary seed so a single-sample draw is reproducible: a failing
// scenario, mapping, or compliance test replays the same generated value on
// re-run. The value is opaque on purpose — it carries no meaning beyond
// stability.
const RELEASE_SAMPLE_SEED = 0x5e5530;

export function sampleReleaseTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1, seed: RELEASE_SAMPLE_SEED });
  if (value === undefined) {
    throw new Error("Release test generator returned no sample");
  }
  return value;
}

function arbitraryVersionComponent(): fc.Arbitrary<number> {
  return fc.integer({ min: VERSION_COMPONENT_MIN, max: VERSION_COMPONENT_MAX });
}

function arbitrarySemverParts(): fc.Arbitrary<SemverParts> {
  return fc.record({
    major: arbitraryVersionComponent(),
    minor: arbitraryVersionComponent(),
    patch: arbitraryVersionComponent(),
  });
}

function formatSemver(parts: SemverParts): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

function formatReleaseTag(parts: SemverParts): string {
  return `${RELEASE_TAG_PREFIX}${formatSemver(parts)}`;
}

function arbitrarySemver(): fc.Arbitrary<string> {
  return arbitrarySemverParts().map(formatSemver);
}

function arbitraryReleaseTag(): fc.Arbitrary<string> {
  return arbitrarySemverParts().map(formatReleaseTag);
}

function arbitraryReleaseTagPair(): fc.Arbitrary<ReleaseTagPair> {
  return fc
    .tuple(arbitrarySemverParts(), fc.integer({ min: BUMP_INCREMENT_MIN, max: BUMP_INCREMENT_MAX }))
    .map(([earlier, increment]) => ({
      earlier: formatReleaseTag(earlier),
      later: formatReleaseTag({ ...earlier, patch: earlier.patch + increment }),
    }));
}

function arbitraryDistinctReleaseTags(count: number): fc.Arbitrary<readonly string[]> {
  return fc
    .uniqueArray(arbitrarySemver(), { minLength: count, maxLength: count })
    .map((versions) => versions.map((version) => `${RELEASE_TAG_PREFIX}${version}`));
}

function arbitraryCommitSequence(count: number): fc.Arbitrary<readonly ReleaseCommitFixture[]> {
  return fc
    .uniqueArray(arbitraryPathSegment(), { minLength: count, maxLength: count })
    .map((segments) =>
      segments.map((segment) => ({
        path: `${segment}${SOURCE_FILE_SUFFIX}`,
        content: `${FILE_CONTENT_PREFIX}${segment}${FILE_CONTENT_NEWLINE}`,
        subject: `${segment}${COMMIT_SUBJECT_SUFFIX}`,
      }))
    );
}

function arbitraryCommitSha(): fc.Arbitrary<string> {
  return fc.stringMatching(COMMIT_SHA_PATTERN);
}

function toGitCommit(fixture: ReleaseCommitFixture, sha: string | undefined): GitCommit {
  if (sha === undefined) {
    throw new Error("Release data generator drew fewer commit shas than commit fixtures");
  }
  return { sha, subject: fixture.subject };
}

/**
 * A full ReleaseData drawn from the same commit-sequence fixtures the git-backed
 * release-data tests use: the version and previous tag are semver-shaped, the
 * commits carry the fixtures' subjects under generated shas, and the changed paths
 * are the fixtures' paths. Release-notes generation reads only the version and the
 * commit subjects, but the whole contract is populated so the value is a valid
 * ReleaseData.
 */
function arbitraryReleaseData(): fc.Arbitrary<ReleaseData> {
  return arbitraryCommitSequence(RELEASE_NOTES_COMMITS).chain((fixtures) =>
    fc
      .record({
        progression: arbitraryReleaseVersionProgression(),
        shas: fc.uniqueArray(arbitraryCommitSha(), {
          minLength: fixtures.length,
          maxLength: fixtures.length,
        }),
      })
      .map(({ progression, shas }): ReleaseData => ({
        ...progression,
        commits: fixtures.map((fixture, index) => toGitCommit(fixture, shas[index])),
        changedPaths: fixtures.map((fixture) => fixture.path),
      }))
  );
}

function arbitraryReleaseDataWithoutPreviousTag(): fc.Arbitrary<ReleaseData> {
  return arbitraryCommitSequence(FULL_HISTORY_COMMITS).chain((fixtures) =>
    fc
      .record({
        version: arbitrarySemver(),
        shas: fc.uniqueArray(arbitraryCommitSha(), {
          minLength: fixtures.length,
          maxLength: fixtures.length,
        }),
      })
      .map(({ version, shas }): ReleaseData => ({
        version,
        previousTag: null,
        versionDelta: null,
        commits: fixtures.map((fixture, index) => toGitCommit(fixture, shas[index])),
        changedPaths: fixtures.map((fixture) => fixture.path),
      }))
  );
}

function arbitraryReleaseDataWithSubjects(subjects: readonly string[]): fc.Arbitrary<ReleaseData> {
  return fc
    .record({
      progression: arbitraryReleaseVersionProgression(),
      shas: fc.uniqueArray(arbitraryCommitSha(), {
        minLength: subjects.length,
        maxLength: subjects.length,
      }),
      changedPaths: arbitraryCommitSequence(subjects.length),
    })
    .map(({ progression, shas, changedPaths }): ReleaseData => ({
      ...progression,
      commits: subjects.map((subject, index) => ({ sha: shas[index], subject })),
      changedPaths: changedPaths.map((fixture) => fixture.path),
    }));
}

function arbitraryReleaseVersionProgression(): fc.Arbitrary<ReleaseVersionProgression> {
  return fc
    .constantFrom(VERSION_DELTA.MAJOR, VERSION_DELTA.MINOR, VERSION_DELTA.PATCH)
    .chain((versionDelta) =>
      arbitraryVersionBumpFor(versionDelta).map(({ previousTag, packageVersion }) => ({
        version: packageVersion,
        previousTag,
        versionDelta,
      }))
    );
}

function arbitraryVersionBumpFor(delta: VersionDelta): fc.Arbitrary<VersionBump> {
  return fc
    .tuple(arbitrarySemverParts(), fc.integer({ min: BUMP_INCREMENT_MIN, max: BUMP_INCREMENT_MAX }))
    .map(([previous, increment]) => ({
      previousTag: formatReleaseTag(previous),
      packageVersion: formatSemver(bumpedParts(previous, delta, increment)),
    }));
}

function bumpedParts(previous: SemverParts, delta: VersionDelta, increment: number): SemverParts {
  switch (delta) {
    case VERSION_DELTA.MAJOR:
      return { major: previous.major + increment, minor: VERSION_COMPONENT_RESET, patch: VERSION_COMPONENT_RESET };
    case VERSION_DELTA.MINOR:
      return { major: previous.major, minor: previous.minor + increment, patch: VERSION_COMPONENT_RESET };
    case VERSION_DELTA.PATCH:
      return { major: previous.major, minor: previous.minor, patch: previous.patch + increment };
    default:
      throw new Error(`Unrecognized version delta: ${String(delta)}`);
  }
}
