import { join, sep, win32 } from "node:path";

import * as fc from "fast-check";

import { RELEASE_SOURCE_DATA_BLOCK_CLOSE } from "@/domains/release/product-context";
import type { ReleaseData } from "@/domains/release/release-data";
import {
  CHANGELOG_CHANGE_GROUPS,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  CHANGELOG_TITLE,
  changelogEntry,
  changelogGroupHeading,
  changelogVersionHeading,
  DEFAULT_CHANGELOG_PATH,
  MARKDOWN_FENCE_BACKTICK_MARKER,
  RELEASE_NOTES_FAITHFULNESS_APPROVED,
  RELEASE_VERSION_DATA_BLOCK_CLOSE,
} from "@/domains/release/release-notes";
import { RELEASE_NOTES_STANDARDS } from "@/domains/release/release-notes-standards";
import { PATH_CONTAINMENT_PARENT_DIRECTORY, PATH_CONTAINMENT_ROOT_CANDIDATE } from "@/lib/file-system/pathContainment";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import {
  arbitraryBlankConfiguredChangelogPath,
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  arbitraryEscapingChangelogPath,
  arbitraryNestedConfiguredChangelogPath,
  arbitraryRootResolvingChangelogPath,
  changelogWithFencedReferenceDefinition,
  changelogWithFooterReferences,
  changelogWithInSectionReferenceDefinition,
  changelogWithPrependedReleaseAndFooterReferences,
  changelogWithPrependedReleaseAndInSectionReference,
  changelogWithPrependedReleaseAndTruncatedInSectionReference,
  changelogWithTruncatedFencedReferenceDefinitionSection,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";

/**
 * Regression inputs from the commit-label exclusion that discarded product
 * declarations. These labels select cases; expected payloads derive from the
 * complete supplied commits, independently of production filtering.
 */
const DECLARATION_AND_MAINTENANCE_COMMIT_TYPES = ["spec", "test", "refactor", "style", "docs", "ci", "build"] as const;
const BEHAVIOR_COMMIT_TYPES = ["feat", "fix", "perf", "revert"] as const;
const CONVENTIONAL_SCOPE_OPEN = "(";
const CONVENTIONAL_SCOPE_CLOSE = ")";
const CONVENTIONAL_BREAKING_MARKER = "!";
const CONVENTIONAL_TYPE_SEPARATOR = ": ";
const UNTYPED_SUBJECT_SUFFIX = " update";

/** A release with varied commit-label forms, all of which remain source inputs. */
export interface ReleaseNotesSubjectScopeScenario {
  readonly releaseData: ReleaseData;
}

interface ScopedSubject {
  readonly subject: string;
  readonly otherLabel: boolean;
}

function arbitraryConventionalSubject(type: string, otherLabel: boolean): fc.Arbitrary<ScopedSubject> {
  return fc
    .tuple(fc.option(arbitraryPathSegment(), { nil: undefined }), fc.boolean(), arbitraryPathSegment())
    .map(([scope, breaking, description]) => ({
      subject: `${type}${scope === undefined ? "" : `${CONVENTIONAL_SCOPE_OPEN}${scope}${CONVENTIONAL_SCOPE_CLOSE}`}${
        breaking ? CONVENTIONAL_BREAKING_MARKER : ""
      }${CONVENTIONAL_TYPE_SEPARATOR}${description}`,
      otherLabel,
    }));
}

function arbitraryScopedSubject(): fc.Arbitrary<ScopedSubject> {
  return fc.oneof(
    fc.constantFrom(...DECLARATION_AND_MAINTENANCE_COMMIT_TYPES).chain((type) =>
      arbitraryConventionalSubject(type, false)
    ),
    fc.constantFrom(...BEHAVIOR_COMMIT_TYPES).chain((type) => arbitraryConventionalSubject(type, true)),
    arbitraryPathSegment().map((segment) => ({ subject: `${segment}${UNTYPED_SUBJECT_SUFFIX}`, otherLabel: true })),
  );
}

/** A release whose labels all come from the declaration-and-maintenance regression domain. */
export function arbitraryReleaseNotesMaintenanceScenario(): fc.Arbitrary<ReleaseNotesSubjectScopeScenario> {
  return RELEASE_TEST_GENERATOR.releaseData().chain((releaseData) =>
    fc
      .array(
        fc.constantFrom(...DECLARATION_AND_MAINTENANCE_COMMIT_TYPES).chain((type) =>
          arbitraryConventionalSubject(type, false)
        ),
        { minLength: releaseData.commits.length, maxLength: releaseData.commits.length },
      )
      .map((subjects) => ({
        releaseData: {
          ...releaseData,
          commits: releaseData.commits.map((commit, index) => ({
            ...commit,
            subject: subjects[index]?.subject ?? commit.subject,
          })),
        },
      }))
  );
}

export function arbitraryReleaseNotesSubjectScopeScenario(): fc.Arbitrary<ReleaseNotesSubjectScopeScenario> {
  return RELEASE_TEST_GENERATOR.releaseData().chain((releaseData) =>
    fc
      .array(arbitraryScopedSubject(), {
        minLength: releaseData.commits.length,
        maxLength: releaseData.commits.length,
      })
      .filter((subjects) => subjects.some((entry) => entry.otherLabel) && subjects.some((entry) => !entry.otherLabel))
      .map((subjects) => ({
        releaseData: {
          ...releaseData,
          commits: releaseData.commits.map((commit, index) => ({
            ...commit,
            subject: subjects[index]?.subject ?? commit.subject,
          })),
        },
      }))
  );
}

/** The production-auditor input for a subject-scope scenario, naming its first commit. */
export function releaseNotesSubjectScopeAuditInput(
  scenario: ReleaseNotesSubjectScopeScenario,
): ReleaseNotesFaithfulnessInput {
  const fixture = sampleReleaseNotesCompositionFixture(scenario.releaseData);
  const currentSection = [
    changelogVersionHeading(scenario.releaseData.version),
    changelogGroupHeading(CHANGELOG_CHANGE_GROUPS[0]),
    changelogEntry(scenario.releaseData.commits.at(0)?.subject ?? scenario.releaseData.version),
  ].join("\n");
  return {
    kind: RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR,
    fixture,
    existingNotes: CHANGELOG_TITLE,
    generatedNotes: [CHANGELOG_TITLE, currentSection].join("\n\n"),
    productionAuditSection: currentSection,
  };
}

export const RELEASE_NOTES_EXISTING_SECTION_CASE = {
  PROMPT_PRESERVATION: "prompt-preservation",
  DELETED_SECTION: "deleted-section",
  FENCED_SECTION: "fenced-section",
  UPDATED_FOOTER_REFERENCES: "updated-footer-references",
  TRUNCATED_FENCED_REFERENCES: "truncated-fenced-references",
  TRUNCATED_IN_SECTION_REFERENCE: "truncated-in-section-reference",
  PRESERVED_IN_SECTION_REFERENCE: "preserved-in-section-reference",
} as const;

export type ReleaseNotesExistingSectionCase =
  (typeof RELEASE_NOTES_EXISTING_SECTION_CASE)[keyof typeof RELEASE_NOTES_EXISTING_SECTION_CASE];

export const RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE = {
  BLANK: "blank",
  ROOT: "root",
} as const;

export type ReleaseNotesConfiguredPathRejectionCase =
  (typeof RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE)[keyof typeof RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE];

export const RELEASE_NOTES_FAITHFULNESS_CASE = {
  REJECTION: "rejection",
  CURRENT_SECTION: "current-section",
  PRODUCTION_AUDITOR: "production-auditor",
} as const;

export type ReleaseNotesFaithfulnessCase =
  (typeof RELEASE_NOTES_FAITHFULNESS_CASE)[keyof typeof RELEASE_NOTES_FAITHFULNESS_CASE];

export const RELEASE_NOTES_MUTATION_CASE = {
  FINAL_SYMLINK: "final-symlink",
  ANCESTOR_READ: "ancestor-read",
  PROMOTION_OPEN: "promotion-open",
  FINAL_WRITE: "final-write",
  DIRECTORY_CREATE: "directory-create",
  IN_PLACE_REWRITE: "in-place-rewrite",
  STAGED_ARTIFACT_SYMLINK: "staged-artifact-symlink",
} as const;

export type ReleaseNotesMutationCase = (typeof RELEASE_NOTES_MUTATION_CASE)[keyof typeof RELEASE_NOTES_MUTATION_CASE];

export const RELEASE_NOTES_PROMPT_CASE = {
  STANDARD_DATA: "standard-data",
  CANONICAL_PARENT_TRAVERSAL: "canonical-parent-traversal",
  DELIMITER_VERSION: "delimiter-version",
  DELIMITER_SUBJECT: "delimiter-subject",
  INSTRUCTION_PATH: "instruction-path",
} as const;

export type ReleaseNotesPromptCase = (typeof RELEASE_NOTES_PROMPT_CASE)[keyof typeof RELEASE_NOTES_PROMPT_CASE];

export const RELEASE_NOTES_PATH_CASE = {
  CONFIGURED_INSIDE: "configured-inside",
  NESTED_MISSING_PARENT: "nested-missing-parent",
  EXISTING_DIRECTORY: "existing-directory",
  BELOW_FILE: "below-file",
  BELOW_FILE_SYMLINK: "below-file-symlink",
  SYMLINK_READBACK: "symlink-readback",
  TRAILING_SEPARATOR: "trailing-separator",
  RETARGET_AFTER_STAGE: "retarget-after-stage",
  PRE_AGENT_ANCESTOR_SWAP: "pre-agent-ancestor-swap",
  ESCAPING: "escaping",
  ESCAPING_SYMLINK: "escaping-symlink",
  DANGLING_FINAL_SYMLINK: "dangling-final-symlink",
  ABOVE_SYMLINK_TARGET: "above-symlink-target",
} as const;

export type ReleaseNotesPathCase = (typeof RELEASE_NOTES_PATH_CASE)[keyof typeof RELEASE_NOTES_PATH_CASE];

export interface ReleaseNotesCompositionFixture {
  readonly releaseData: ReleaseData;
  readonly subjects: readonly string[];
  readonly conformant: string;
}

export interface ReleaseNotesPromptInput {
  readonly kind: ReleaseNotesPromptCase;
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly changelogPath: string | undefined;
  readonly pathSegments: readonly [string, string, string];
}

export interface ReleaseNotesExistingSectionInput {
  readonly kind: ReleaseNotesExistingSectionCase;
  readonly releaseData: ReleaseData;
  readonly existingNotes: string;
  readonly generatedNotes: string;
}

export interface ReleaseNotesExistingSectionScenario {
  readonly input: ReleaseNotesExistingSectionInput;
  readonly finalContent: string;
}

export interface ReleaseNotesConfiguredPathRejectionInput {
  readonly kind: ReleaseNotesConfiguredPathRejectionCase;
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly changelogPath: string;
}

export interface ReleaseNotesPathInput {
  readonly kind: ReleaseNotesPathCase;
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly changelogPath: string | undefined;
  readonly pathSegments: readonly [string, string, string];
  readonly replacementContent: string;
}

export interface ReleaseNotesFaithfulnessInput {
  readonly kind: ReleaseNotesFaithfulnessCase;
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly existingNotes: string;
  readonly generatedNotes: string;
  readonly productionAuditSection: string | undefined;
}

export interface ReleaseNotesFaithfulnessScenario {
  readonly input: ReleaseNotesFaithfulnessInput;
  readonly currentSection: string;
  readonly priorVersion: string;
  readonly preservedInstructionLikeText: string;
}

export interface ReleaseNotesMutationInput {
  readonly kind: ReleaseNotesMutationCase;
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly pathSegments: readonly [string, string, string];
  readonly replacementContent: string;
}

export interface ReleaseNotesPathContainmentInput {
  readonly root: string;
  readonly candidate: string;
  readonly expected: boolean;
}

export interface AbsoluteReleaseNotesPathInput {
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly relativeChangelogPath: string;
}

export interface PartialWriteReleaseNotesInput {
  readonly existingContent: string;
  readonly replacementContent: string;
}

export interface PartialWriteReleaseNotesScenario {
  readonly input: PartialWriteReleaseNotesInput;
  readonly expectedDirectoryEntries: readonly string[];
}

export interface SymlinkRootReleaseNotesInput {
  readonly fixture: ReleaseNotesCompositionFixture;
  readonly symlinkSegment: string;
}

export function sampleReleaseNotesCompositionFixture(
  releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
): ReleaseNotesCompositionFixture {
  const subjects = releaseData.commits.map((commit) => commit.subject);
  return {
    releaseData,
    subjects,
    conformant: sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    ),
  };
}

export function sampleReleaseNotesPromptInput(
  kind: ReleaseNotesPromptCase,
): ReleaseNotesPromptInput {
  const fixture = kind === RELEASE_NOTES_PROMPT_CASE.DELIMITER_VERSION
    ? sampleReleaseNotesCompositionFixture({
      ...sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
      version: RELEASE_VERSION_DATA_BLOCK_CLOSE,
    })
    : kind === RELEASE_NOTES_PROMPT_CASE.DELIMITER_SUBJECT
    ? sampleReleaseNotesCompositionFixture(
      sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.releaseDataWithSubjects([
          RELEASE_SOURCE_DATA_BLOCK_CLOSE,
        ]),
      ),
    )
    : sampleReleaseNotesCompositionFixture();
  return {
    kind,
    fixture,
    changelogPath: kind === RELEASE_NOTES_PROMPT_CASE.INSTRUCTION_PATH
      ? `${CHANGELOG_PATH_DATA_BLOCK_OPEN}${DEFAULT_CHANGELOG_PATH}`
      : undefined,
    pathSegments: sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    ),
  };
}

export function releaseNotesPromptVersionProse(version: string): string {
  return `version ${version}`;
}

export function releaseNotesPromptPathProse(path: string): string {
  return `at ${path}`;
}

export function sampleReleaseNotesExistingSectionScenario(
  kind: ReleaseNotesExistingSectionCase,
): ReleaseNotesExistingSectionScenario {
  const fixture = sampleReleaseNotesCompositionFixture();
  const priorVersion = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctSemverFrom(fixture.releaseData.version),
  );
  const existingNotes = existingReleaseNotes(
    kind,
    priorVersion,
    fixture.subjects,
  );
  const generatedNotes = generatedReleaseNotes(
    kind,
    fixture.releaseData.version,
    priorVersion,
    fixture.subjects,
    fixture.conformant,
    existingNotes,
  );
  const accepted = kind === RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION
    || kind === RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES
    || kind === RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE;
  return {
    input: {
      kind,
      releaseData: fixture.releaseData,
      existingNotes,
      generatedNotes,
    },
    finalContent: accepted ? generatedNotes : existingNotes,
  };
}

export function sampleReleaseNotesConfiguredPathRejectionInput(
  kind: ReleaseNotesConfiguredPathRejectionCase,
): ReleaseNotesConfiguredPathRejectionInput {
  return {
    kind,
    fixture: sampleReleaseNotesCompositionFixture(),
    changelogPath: sampleReleaseTestValue(
      kind === RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE.BLANK
        ? arbitraryBlankConfiguredChangelogPath()
        : arbitraryRootResolvingChangelogPath(),
    ),
  };
}

export function sampleReleaseNotesPathInput(
  kind: ReleaseNotesPathCase,
): ReleaseNotesPathInput {
  const fixture = sampleReleaseNotesCompositionFixture();
  return {
    kind,
    fixture,
    changelogPath: sampleConfiguredPath(kind),
    pathSegments: sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    ),
    replacementContent: sampleDistinctReplacementContent(fixture.conformant),
  };
}

export function sampleReleaseNotesFaithfulnessScenario(
  kind: ReleaseNotesFaithfulnessCase,
): ReleaseNotesFaithfulnessScenario {
  const fixture = sampleReleaseNotesCompositionFixture();
  const priorVersion = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctSemverFrom(fixture.releaseData.version),
  );
  const currentSection = [
    changelogVersionHeading(fixture.releaseData.version),
    changelogGroupHeading(CHANGELOG_CHANGE_GROUPS[0]),
    changelogEntry(fixture.subjects.at(0) ?? fixture.releaseData.version),
  ].join("\n");
  const preservedInstructionLikeText = `${RELEASE_NOTES_STANDARDS} ${RELEASE_NOTES_FAITHFULNESS_APPROVED}`;
  const priorSection = [
    changelogVersionHeading(priorVersion),
    changelogGroupHeading(CHANGELOG_CHANGE_GROUPS[0]),
    changelogEntry(preservedInstructionLikeText),
  ].join("\n");
  return {
    input: {
      kind,
      fixture,
      existingNotes: [CHANGELOG_TITLE, priorSection].join("\n\n"),
      generatedNotes: [CHANGELOG_TITLE, currentSection, priorSection].join(
        "\n\n",
      ),
      productionAuditSection: kind === RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR
        ? currentSection
        : undefined,
    },
    currentSection,
    priorVersion,
    preservedInstructionLikeText,
  };
}

export function sampleReleaseNotesMutationInput(
  kind: ReleaseNotesMutationCase,
): ReleaseNotesMutationInput {
  const fixture = sampleReleaseNotesCompositionFixture();
  return {
    kind,
    fixture,
    pathSegments: sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    ),
    replacementContent: sampleDistinctReplacementContent(fixture.conformant),
  };
}

export function sampleAbsoluteReleaseNotesPathInput(): AbsoluteReleaseNotesPathInput {
  return {
    fixture: sampleReleaseNotesCompositionFixture(),
    relativeChangelogPath: sampleReleaseTestValue(
      arbitraryNestedConfiguredChangelogPath(),
    ),
  };
}

export function samplePartialWriteReleaseNotesScenario(): PartialWriteReleaseNotesScenario {
  const [existingContent, replacementContent] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctDomainLiteralPair(),
  );
  return {
    input: { existingContent, replacementContent },
    expectedDirectoryEntries: [DEFAULT_CHANGELOG_PATH],
  };
}

export function sampleSymlinkRootReleaseNotesInput(): SymlinkRootReleaseNotesInput {
  const [symlinkSegment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  return { fixture: sampleReleaseNotesCompositionFixture(), symlinkSegment };
}

export function sampleReleaseNotesPathContainmentInputs(): readonly ReleaseNotesPathContainmentInput[] {
  const [rootSegment, segment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  const workingDirectory = join(sep, rootSegment);
  const [driveRoot] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots(),
  );
  return [
    {
      root: workingDirectory,
      candidate: PATH_CONTAINMENT_PARENT_DIRECTORY,
      expected: false,
    },
    {
      root: workingDirectory,
      candidate: `${PATH_CONTAINMENT_PARENT_DIRECTORY}${segment}`,
      expected: true,
    },
    {
      root: workingDirectory,
      candidate: PATH_CONTAINMENT_ROOT_CANDIDATE,
      expected: true,
    },
    {
      root: workingDirectory,
      candidate: join(
        workingDirectory,
        PATH_CONTAINMENT_PARENT_DIRECTORY,
        DEFAULT_CHANGELOG_PATH,
      ),
      expected: false,
    },
    {
      root: workingDirectory,
      candidate: join(workingDirectory, driveRoot, DEFAULT_CHANGELOG_PATH),
      expected: true,
    },
    windowsContainmentInput(
      RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots(),
      segment,
    ),
    windowsContainmentInput(
      RELEASE_TEST_GENERATOR.distinctWindowsUncRoots(),
      segment,
    ),
    windowsContainmentInput(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthDriveRoots(),
      segment,
    ),
    windowsContainmentInput(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthUncRoots(),
      segment,
    ),
  ];
}

function sampleConfiguredPath(kind: ReleaseNotesPathCase): string | undefined {
  if (kind === RELEASE_NOTES_PATH_CASE.CONFIGURED_INSIDE) {
    return sampleReleaseTestValue(arbitraryConfiguredChangelogPath());
  }
  if (kind === RELEASE_NOTES_PATH_CASE.NESTED_MISSING_PARENT) {
    return sampleReleaseTestValue(arbitraryNestedConfiguredChangelogPath());
  }
  if (kind === RELEASE_NOTES_PATH_CASE.ESCAPING) {
    return sampleReleaseTestValue(arbitraryEscapingChangelogPath());
  }
  return undefined;
}

function sampleDistinctReplacementContent(originalContent: string): string {
  const [first, second] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctDomainLiteralPair(),
  );
  return first === originalContent ? second : first;
}

function windowsContainmentInput(
  roots: ReturnType<typeof RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots>,
  rootSegment: string,
): ReleaseNotesPathContainmentInput {
  const [rootBase, candidateBase] = sampleReleaseTestValue(roots);
  return {
    root: win32.join(rootBase, rootSegment),
    candidate: win32.join(candidateBase, DEFAULT_CHANGELOG_PATH),
    expected: false,
  };
}

function existingReleaseNotes(
  kind: ReleaseNotesExistingSectionCase,
  priorVersion: string,
  subjects: readonly string[],
): string {
  switch (kind) {
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION:
      return "";
    case RELEASE_NOTES_EXISTING_SECTION_CASE.FENCED_SECTION:
    case RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION:
      return sampleReleaseTestValue(
        arbitraryConformantChangelog(priorVersion, subjects),
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES:
      return changelogWithFooterReferences(priorVersion, subjects);
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_FENCED_REFERENCES:
      return changelogWithFencedReferenceDefinition(priorVersion, subjects);
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_IN_SECTION_REFERENCE:
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE:
      return changelogWithInSectionReferenceDefinition(priorVersion, subjects);
  }
}

function generatedReleaseNotes(
  kind: ReleaseNotesExistingSectionCase,
  version: string,
  priorVersion: string,
  subjects: readonly string[],
  conformant: string,
  existingNotes: string,
): string {
  switch (kind) {
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION:
    case RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION:
      return conformant;
    case RELEASE_NOTES_EXISTING_SECTION_CASE.FENCED_SECTION:
      return [
        conformant,
        MARKDOWN_FENCE_BACKTICK_MARKER,
        existingNotes,
        MARKDOWN_FENCE_BACKTICK_MARKER,
      ].join("\n");
    case RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES:
      return changelogWithPrependedReleaseAndFooterReferences(
        version,
        priorVersion,
        subjects,
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_FENCED_REFERENCES:
      return changelogWithTruncatedFencedReferenceDefinitionSection(
        version,
        priorVersion,
        subjects,
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_IN_SECTION_REFERENCE:
      return changelogWithPrependedReleaseAndTruncatedInSectionReference(
        version,
        priorVersion,
        subjects,
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE:
      return changelogWithPrependedReleaseAndInSectionReference(
        version,
        priorVersion,
        subjects,
      );
  }
}

export { DEFAULT_CHANGELOG_PATH };
