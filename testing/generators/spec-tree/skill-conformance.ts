/**
 * Cases and candidate domains for the skill-conformance oracle: a filesystem record, the ancestry
 * context it sits in, the naming-schema version set the oracle reads, and the verdict the oracle's
 * spec states for it.
 *
 * Each verdict is the skill-conformance-oracle spec's statement read directly — every recognized form
 * is valid and every path matching no recognized form is foreign — and is held apart from the
 * classifier it is judged against. The forms are drawn from the filename-grammar generators, which
 * state them independently of the grammar registry the classifier reads.
 *
 * For a record directly in a node directory, at the product root, or in an evidence directory,
 * `relativePath` is the record's path as the entry recognizer receives it. For a record beneath a
 * knowledge root, a probe directory, or an eval lane, it is the path from the directory that holds
 * the lane (a node directory, or `spx/` for the root product's knowledge root).
 *
 * @module generators/spec-tree/skill-conformance
 */

import * as fc from "fast-check";

import type {
  Kind,
  SpecTreeConformanceContext,
  SpecTreeConformanceVerdict,
  SpecTreeEvalEntryKind,
  SpecTreeFilesystemRecord,
  SpecTreeMethodologyLine,
  SpecTreeRecognitionOptions,
} from "@/lib/spec-tree";
import {
  KIND_REGISTRY,
  NODE_KINDS,
  OUTPUT_KINDS,
  selectSpecTreeGrammar,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFORMANCE_LOCATION,
  SPEC_TREE_CONFORMANCE_VERDICT,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVAL_ENTRY_KIND,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KNOWLEDGE_ROOT_HOLDER,
  SPEC_TREE_METHODOLOGY_LINE,
} from "@/lib/spec-tree";
import {
  arbitraryEvidenceRecognitionCase,
  arbitraryValidRecognitionScenario,
  decisionFileRecognitionCases,
  nodeDirectoryRecognitionCases,
  productRootRecognitionCases,
} from "@testing/generators/spec-tree/filename-grammar";
import { evalLaneCases } from "@testing/generators/spec-tree/grammar-tokens";
import { KNOWLEDGE_BUNDLE_GENERATOR, PROBE_DIRECTORY_GENERATOR } from "@testing/generators/spec-tree/lane-directories";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_SOURCE_LINES,
  SPEC_TREE_TEST_GENERATOR,
  specTreeGrammarSelectionForLine,
} from "@testing/generators/spec-tree/spec-tree";

/** One record in its ancestry context under a version set, with the verdict the spec states for it. */
export type ConformanceCase = {
  readonly title: string;
  readonly options: SpecTreeRecognitionOptions;
  readonly record: SpecTreeFilesystemRecord;
  readonly context: SpecTreeConformanceContext;
  readonly verdict: SpecTreeConformanceVerdict;
};

/** A record in its ancestry context under a version set, before any verdict is stated for it. */
export type ConformanceInput = {
  readonly options: SpecTreeRecognitionOptions;
  readonly record: SpecTreeFilesystemRecord;
  readonly context: SpecTreeConformanceContext;
};

const VALID = SPEC_TREE_CONFORMANCE_VERDICT.VALID;
const FOREIGN = SPEC_TREE_CONFORMANCE_VERDICT.FOREIGN;
const LOCATION = SPEC_TREE_CONFORMANCE_LOCATION;
const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const FOUR_ZERO = SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO;
const THREE_X = SPEC_TREE_METHODOLOGY_LINE.THREE_TWO;

const STRAY_EXTENSION_PATTERN = /^[a-z][a-z0-9]{0,5}$/;
const PRIOR_SPEC_EXTENSION = "md";
const PRIOR_SPEC_SUFFIX = SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
const SPEC_FILE_DRAW_COUNT = 3;
const LANE_SEGMENT_MAX_COUNT = 3;
const NOTE_PARENT_DRAW = 7;

/** The options a methodology line selects: its selected versions beside every version the recognizer knows. */
export function conformanceOptionsForLine(line: SpecTreeMethodologyLine): SpecTreeRecognitionOptions {
  const selection = specTreeGrammarSelectionForLine(line);
  return { schemaVersions: selection.known, selectedVersions: selection.selected };
}

/** The options of a 4.0 declaration that names a 3.2 migration source, so both naming-schema versions are read. */
export function conformanceMigratingOptions(): SpecTreeRecognitionOptions {
  const selection = selectSpecTreeGrammar({ version: FOUR_ZERO, migratingFrom: THREE_X });
  return { schemaVersions: selection.known, selectedVersions: selection.selected };
}

function recordType(entryKind: SpecTreeEvalEntryKind): SpecTreeFilesystemRecord["type"] {
  return entryKind === SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY
    ? SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY
    : SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE;
}

function conformanceCase(
  title: string,
  options: SpecTreeRecognitionOptions,
  record: SpecTreeFilesystemRecord,
  context: SpecTreeConformanceContext,
  verdict: SpecTreeConformanceVerdict,
): ConformanceCase {
  return { title: `${verdict}: ${title}`, options, record, context, verdict };
}

function joined(...segments: readonly string[]): string {
  return segments.join(PATH_SEPARATOR);
}

function arbitraryExtension(): fc.Arbitrary<string> {
  return fc.stringMatching(STRAY_EXTENSION_PATTERN).filter((extension) => extension !== PRIOR_SPEC_EXTENSION);
}

/** A file name `{slug}.{ext}` whose extension is never the markdown one, so it matches no recognized form. */
function arbitraryStrayFileName(): fc.Arbitrary<string> {
  return fc
    .tuple(SPEC_TREE_TEST_GENERATOR.sourceSlug(), arbitraryExtension())
    .map(([slug, extension]) => [slug, extension].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR));
}

function nodeKindsOfLine(
  line: SpecTreeMethodologyLine,
): ReadonlyArray<NonNullable<SpecTreeConformanceContext["parentKind"]>> {
  return line === FOUR_ZERO ? [...OUTPUT_KINDS, SPEC_TREE_CONFIG.PRODUCT.KIND] : NODE_KINDS;
}

function lineRecognizedCases(line: SpecTreeMethodologyLine): readonly ConformanceCase[] {
  const options = conformanceOptionsForLine(line);
  const draw = (offset: number): number => SPEC_TREE_SOURCE_LINES.indexOf(line) * 100 + offset;
  const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), draw(1));
  const rule = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), draw(2));
  const specSuffix = line === FOUR_ZERO
    ? SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX
    : SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
  const evidence = sampleSpecTreeTestValue(
    arbitraryEvidenceRecognitionCase().filter((candidate) => candidate.line === line),
    draw(3),
  );

  const nodes = nodeDirectoryRecognitionCases()
    .filter((candidate) => candidate.line === line)
    .map((candidate) =>
      conformanceCase(
        `${line} node directory ${candidate.relativePath}`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: candidate.relativePath },
        { location: LOCATION.PRODUCT_ROOT },
        VALID,
      )
    );
  const decisions = decisionFileRecognitionCases()
    .filter((candidate) => candidate.line === line)
    .map((candidate) =>
      conformanceCase(
        `${line} decision record ${candidate.relativePath}`,
        options,
        {
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: candidate.relativePath,
          parentId: candidate.parentId,
        },
        { location: LOCATION.NODE_DIRECTORY },
        VALID,
      )
    );
  const products = productRootRecognitionCases()
    .filter((candidate) => candidate.line === line)
    .map((candidate) =>
      conformanceCase(
        `${line} product file ${candidate.relativePath}`,
        options,
        {
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: candidate.relativePath,
          declaredKind: candidate.declaredKind,
        },
        { location: LOCATION.PRODUCT_ROOT },
        VALID,
      )
    );
  const evidenceFile = conformanceCase(
    `${line} evidence file ${evidence.relativePath}`,
    options,
    { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: evidence.relativePath, parentId: evidence.parentId },
    { location: LOCATION.EVIDENCE_DIRECTORY },
    VALID,
  );
  const specFile = conformanceCase(
    `${line} spec file ${parentSlug}${specSuffix} within ${parentSlug}`,
    options,
    { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: `${parentSlug}${specSuffix}` },
    { location: LOCATION.NODE_DIRECTORY, parentSlug },
    VALID,
  );
  const evalLane = evalLaneCases()
    .filter((candidate) => candidate.line === line)
    .map((candidate) =>
      conformanceCase(
        `${line} eval-lane entry ${candidate.pathFromNode}`,
        options,
        { type: recordType(candidate.entryKind), relativePath: candidate.pathFromNode },
        { location: LOCATION.EVAL_LANE, parentSlug },
        candidate.accepted ? VALID : FOREIGN,
      )
    );
  const evalDirectories = [
    conformanceCase(
      `${line} eval container directory`,
      options,
      { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME },
      { location: LOCATION.NODE_DIRECTORY, parentSlug },
      VALID,
    ),
    conformanceCase(
      `${line} eval-lane rule directory ${rule}`,
      options,
      {
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
        relativePath: joined(SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, rule),
      },
      { location: LOCATION.EVAL_LANE, parentSlug },
      VALID,
    ),
  ];
  const exclusion = conformanceCase(
    `${line} exclusion registry`,
    options,
    { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: SPEC_TREE_GRAMMAR.EXCLUSION_REGISTRY_FILENAME },
    { location: LOCATION.PRODUCT_ROOT },
    VALID,
  );
  return [
    ...nodes,
    ...decisions,
    ...products,
    evidenceFile,
    specFile,
    ...evalLane,
    ...evalDirectories,
    exclusion,
  ];
}

/** Cases the 4.0 version admits: a knowledge root and a probe directory directly within the holders and kinds the spec names. */
function fourZeroKnowledgeProbeCases(options: SpecTreeRecognitionOptions, label: string): readonly ConformanceCase[] {
  const knowledge = SPEC_TREE_GRAMMAR.KNOWLEDGE.DIRECTORY_NAME;
  const probes = SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME;
  return [
    ...nodeKindsOfLine(FOUR_ZERO).map((parentKind) =>
      conformanceCase(
        `${label} ${knowledge} directory within a ${parentKind} node directory`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: knowledge },
        { location: LOCATION.NODE_DIRECTORY, parentKind },
        VALID,
      )
    ),
    conformanceCase(
      `${label} ${knowledge} directory directly under spx/`,
      options,
      { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: knowledge },
      { location: LOCATION.PRODUCT_ROOT },
      VALID,
    ),
    ...OUTPUT_KINDS.map((parentKind) =>
      conformanceCase(
        `${label} ${probes} directory within a ${parentKind} node directory`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: probes },
        { location: LOCATION.NODE_DIRECTORY, parentKind },
        VALID,
      )
    ),
  ];
}

/**
 * The knowledge-root and probe-directory directories a version set maps to a verdict: valid for the
 * 4.0 version set and the migrating set that includes it, foreign for the 3.x version set.
 */
export function knowledgeProbeMappingCases(): readonly ConformanceCase[] {
  const knowledge = SPEC_TREE_GRAMMAR.KNOWLEDGE.DIRECTORY_NAME;
  const probes = SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME;
  const threeXOptions = conformanceOptionsForLine(THREE_X);
  const threeX = NODE_KINDS.flatMap((parentKind) =>
    [knowledge, probes].map((name) =>
      conformanceCase(
        `${THREE_X} ${name} directory within a ${parentKind} node directory`,
        threeXOptions,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: name },
        { location: LOCATION.NODE_DIRECTORY, parentKind },
        FOREIGN,
      )
    )
  );
  return [
    ...fourZeroKnowledgeProbeCases(conformanceOptionsForLine(FOUR_ZERO), FOUR_ZERO),
    ...fourZeroKnowledgeProbeCases(conformanceMigratingOptions(), "migrating"),
    ...threeX,
  ];
}

/** The notes each methodology line's naming-schema version accepts: 3.x both, 4.0 only the issues note. */
function notesAcceptedByLine(line: SpecTreeMethodologyLine): readonly string[] {
  const { PLAN, ISSUES } = SPEC_TREE_GRAMMAR.COORDINATION_NOTE;
  return line === FOUR_ZERO ? [ISSUES] : [PLAN, ISSUES];
}

/**
 * Every coordination note under every version set the oracle can read — each methodology line alone,
 * and the 4.0 line migrating from 3.x, which reads both versions — with the verdict the grammar's
 * accepted-notes statement fixes: valid when a read version accepts the note, foreign otherwise.
 */
export function coordinationNoteCases(): readonly ConformanceCase[] {
  const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), NOTE_PARENT_DRAW);
  const optionSets: ReadonlyArray<readonly [string, SpecTreeRecognitionOptions, readonly string[]]> = [
    ...SPEC_TREE_SOURCE_LINES.map((line) =>
      [line, conformanceOptionsForLine(line), notesAcceptedByLine(line)] as const
    ),
    [
      "migrating",
      conformanceMigratingOptions(),
      [...new Set([...notesAcceptedByLine(FOUR_ZERO), ...notesAcceptedByLine(THREE_X)])],
    ],
  ];
  return optionSets.flatMap(([label, options, accepted]) =>
    [...SPEC_TREE_GRAMMAR.COORDINATION_NOTES].map((name) =>
      conformanceCase(
        `${label} coordination note ${name}`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: name },
        { location: LOCATION.NODE_DIRECTORY, parentSlug },
        accepted.includes(name) ? VALID : FOREIGN,
      )
    )
  );
}

/**
 * Every recognized-form case across the methodology lines with the verdict the spec and grammar state
 * for it, valid and foreign alike: node directories, decision records, product files, evidence files,
 * spec files, eval-lane entries, the exclusion registry, and coordination notes.
 */
export function formPathCases(): readonly ConformanceCase[] {
  return [
    ...SPEC_TREE_SOURCE_LINES.flatMap(lineRecognizedCases),
    ...coordinationNoteCases(),
  ];
}

/** Every recognized form across the methodology lines, each with the valid verdict the spec states for it. */
export function recognizedPathCases(): readonly ConformanceCase[] {
  return [
    ...formPathCases(),
    ...knowledgeProbeMappingCases(),
  ].filter((candidate) => candidate.verdict === VALID);
}

/** Paths that match no recognized form, each with the foreign verdict the spec states for it. */
export function unrecognizedPathCases(): readonly ConformanceCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line, lineIndex) => {
    const options = conformanceOptionsForLine(line);
    const draw = (offset: number): number => lineIndex * 100 + offset;
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), draw(11));
    const strayInNode = sampleSpecTreeTestValue(arbitraryStrayFileName(), draw(12));
    const strayAtRoot = sampleSpecTreeTestValue(arbitraryStrayFileName(), draw(13));
    const unregistered = sampleSpecTreeTestValue(
      SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectoryScenario(KIND_REGISTRY).filter((scenario) =>
        scenario.line === line
      ),
      draw(14),
    );
    return [
      conformanceCase(
        `${line} stray file ${strayInNode} within a node directory`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: strayInNode },
        { location: LOCATION.NODE_DIRECTORY, parentSlug },
        FOREIGN,
      ),
      conformanceCase(
        `${line} stray file ${strayAtRoot} at the product root`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: strayAtRoot },
        { location: LOCATION.PRODUCT_ROOT },
        FOREIGN,
      ),
      conformanceCase(
        `${line} ordered directory ${unregistered.directory} with an unregistered suffix`,
        options,
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: unregistered.directory },
        { location: LOCATION.PRODUCT_ROOT },
        FOREIGN,
      ),
    ];
  });
}

/**
 * The spec-file cases: the canonical suffix is valid by the suffix whatever the parent slug, and a
 * bare `{slug}.md` file is valid when its stem equals the parent node directory slug and foreign
 * when it differs.
 */
export function specFileCases(): readonly ConformanceCase[] {
  const canonical = SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX;
  const prior = SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
  const slugPair = fc
    .tuple(SPEC_TREE_TEST_GENERATOR.sourceSlug(), SPEC_TREE_TEST_GENERATOR.sourceSlug())
    .filter(([parentSlug, stem]) => parentSlug !== stem);
  const optionSets: ReadonlyArray<readonly [string, SpecTreeRecognitionOptions]> = [
    [FOUR_ZERO, conformanceOptionsForLine(FOUR_ZERO)],
    ["migrating", conformanceMigratingOptions()],
  ];
  const priorOptionSets: ReadonlyArray<readonly [string, SpecTreeRecognitionOptions]> = [
    [THREE_X, conformanceOptionsForLine(THREE_X)],
    ...optionSets,
  ];
  const fileRecord = (relativePath: string): SpecTreeFilesystemRecord => ({
    type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
    relativePath,
  });
  const draws = Array.from(
    { length: SPEC_FILE_DRAW_COUNT },
    (_, drawIndex) => sampleSpecTreeTestValue(slugPair, drawIndex),
  );
  return draws.flatMap(([parentSlug, stem]) => [
    ...optionSets.flatMap(([label, options]) => [
      conformanceCase(
        `${label} ${stem}${canonical} within ${parentSlug}`,
        options,
        fileRecord(`${stem}${canonical}`),
        { location: LOCATION.NODE_DIRECTORY, parentSlug },
        VALID,
      ),
      conformanceCase(
        `${label} ${parentSlug}${canonical} within ${parentSlug}`,
        options,
        fileRecord(`${parentSlug}${canonical}`),
        { location: LOCATION.NODE_DIRECTORY, parentSlug },
        VALID,
      ),
    ]),
    ...priorOptionSets.flatMap(([label, options]) => [
      conformanceCase(
        `${label} ${parentSlug}${prior} within ${parentSlug}`,
        options,
        fileRecord(`${parentSlug}${prior}`),
        { location: LOCATION.NODE_DIRECTORY, parentSlug },
        VALID,
      ),
      conformanceCase(
        `${label} ${stem}${prior} within ${parentSlug}`,
        options,
        fileRecord(`${stem}${prior}`),
        { location: LOCATION.NODE_DIRECTORY, parentSlug },
        FOREIGN,
      ),
    ]),
  ]);
}

function laneRecord(pathFromHolder: string, entryKind: SpecTreeEvalEntryKind): SpecTreeFilesystemRecord {
  return { type: recordType(entryKind), relativePath: pathFromHolder };
}

function isGrammarSlug(text: string): boolean {
  return text.split(SPEC_TREE_GRAMMAR.EVIDENCE.WORD_SEPARATOR).every((word) =>
    SPEC_TREE_GRAMMAR.EVIDENCE.WORD_PATTERN.test(word)
  );
}

/** A path beneath `probes/{slug}/runs/`, the spec's one probe-directory subtree admitted whatever its structure. */
function isBeneathProbeRuns(pathFromNode: string): boolean {
  const [lane, probe = "", runs, ...beneath] = pathFromNode.split(PATH_SEPARATOR);
  return lane === SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME
    && isGrammarSlug(probe)
    && runs === SPEC_TREE_GRAMMAR.PROBE.RUNS_DIRECTORY_NAME
    && beneath.length > 0;
}

function arbitraryProbeParentKind(): fc.Arbitrary<Kind> {
  return fc.constantFrom(...OUTPUT_KINDS);
}

function arbitraryRunsDescendant(): fc.Arbitrary<{ pathFromNode: string; entryKind: SpecTreeEvalEntryKind }> {
  const segment = fc.string({ minLength: 1 }).filter((text) => !text.includes(PATH_SEPARATOR));
  return fc
    .tuple(
      fc.stringMatching(STRAY_EXTENSION_PATTERN),
      fc.array(segment, { minLength: 1, maxLength: LANE_SEGMENT_MAX_COUNT }),
      fc.constantFrom(SPEC_TREE_EVAL_ENTRY_KIND.FILE, SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY),
    )
    .map(([probe, beneath, entryKind]) => ({
      pathFromNode: joined(
        SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME,
        probe,
        SPEC_TREE_GRAMMAR.PROBE.RUNS_DIRECTORY_NAME,
        ...beneath,
      ),
      entryKind,
    }));
}

function knowledgeBeneathCase(
  options: SpecTreeRecognitionOptions,
  verdict: SpecTreeConformanceVerdict,
): fc.Arbitrary<ConformanceCase> {
  return KNOWLEDGE_BUNDLE_GENERATOR.entry().map(({ holder, pathFromNode, entryKind }) =>
    conformanceCase(
      `${holder} knowledge entry ${pathFromNode}`,
      options,
      laneRecord(pathFromNode, entryKind),
      {
        location: LOCATION.KNOWLEDGE_ROOT,
        holder: holder === SPEC_TREE_KNOWLEDGE_ROOT_HOLDER.ROOT_PRODUCT
          ? SPEC_TREE_KNOWLEDGE_ROOT_HOLDER.ROOT_PRODUCT
          : SPEC_TREE_KNOWLEDGE_ROOT_HOLDER.NODE_DIRECTORY,
      },
      verdict,
    )
  );
}

/** Generators over the open knowledge-root and probe-directory path domains, with the verdict the spec states. */
export const SKILL_CONFORMANCE_LANE_GENERATOR = {
  /** Under a version set that reads the 4.0 version: every path beneath a knowledge root is valid. */
  knowledgeBeneathFourZero: () => knowledgeBeneathCase(conformanceOptionsForLine(FOUR_ZERO), VALID),
  /** Under a version set that excludes the 4.0 version: every path beneath a knowledge root is foreign. */
  knowledgeBeneathThreeX: () => knowledgeBeneathCase(conformanceOptionsForLine(THREE_X), FOREIGN),
  /**
   * Under a version set that reads the 4.0 version: a probe directory, its protocol, its artifacts,
   * and its runs directory with every path beneath are valid; every other entry is foreign.
   */
  probeLaneFourZero: (): fc.Arbitrary<ConformanceCase> =>
    fc
      .tuple(
        fc.oneof(
          PROBE_DIRECTORY_GENERATOR.candidate().map(({ pathFromNode, entryKind, accepted }) => ({
            pathFromNode,
            entryKind,
            valid: accepted || isBeneathProbeRuns(pathFromNode),
          })),
          arbitraryRunsDescendant().map((entry) => ({ ...entry, valid: true })),
        ),
        arbitraryProbeParentKind(),
      )
      .map(([{ pathFromNode, entryKind, valid }, parentKind]) =>
        conformanceCase(
          `probe-lane entry ${pathFromNode}`,
          conformanceOptionsForLine(FOUR_ZERO),
          laneRecord(pathFromNode, entryKind),
          { location: LOCATION.PROBE_DIRECTORY, parentKind },
          valid ? VALID : FOREIGN,
        )
      ),
  /** Under a version set that excludes the 4.0 version: every path beneath a probes directory is foreign. */
  probeLaneThreeX: (): fc.Arbitrary<ConformanceCase> =>
    fc
      .tuple(
        fc.oneof(
          PROBE_DIRECTORY_GENERATOR.accepted().map(({ pathFromNode, entryKind }) => ({ pathFromNode, entryKind })),
          arbitraryRunsDescendant(),
        ),
        fc.constantFrom(...NODE_KINDS),
      )
      .map(([{ pathFromNode, entryKind }, parentKind]) =>
        conformanceCase(
          `probe-lane entry ${pathFromNode}`,
          conformanceOptionsForLine(THREE_X),
          laneRecord(pathFromNode, entryKind),
          { location: LOCATION.PROBE_DIRECTORY, parentKind },
          FOREIGN,
        )
      ),
} as const;

function everyOptionSet(): readonly SpecTreeRecognitionOptions[] {
  return [...SPEC_TREE_SOURCE_LINES.map(conformanceOptionsForLine), conformanceMigratingOptions()];
}

/**
 * Open domain of paths that match no recognized form, each foreign by construction: a `{slug}.{ext}`
 * file whose extension is not the markdown one, in any location a file can sit, a markdown file in a
 * node directory whose stem differs from the parent slug, a plain slug directory in a node directory,
 * and a directory whose ordered name carries an unregistered suffix.
 */
export const SKILL_CONFORMANCE_FOREIGN_GENERATOR = {
  strayPath: (): fc.Arbitrary<ConformanceCase> => {
    const slug = SPEC_TREE_TEST_GENERATOR.sourceSlug();
    const options = fc.constantFrom(...everyOptionSet());
    const file = (relativePath: string): SpecTreeFilesystemRecord => ({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath,
    });
    const strayFile = fc
      .tuple(
        options,
        arbitraryStrayFileName(),
        slug,
        slug,
        fc.constantFrom(LOCATION.PRODUCT_ROOT, LOCATION.NODE_DIRECTORY, LOCATION.EVIDENCE_DIRECTORY),
      )
      .map(([option, name, parentSlug, , location]) =>
        conformanceCase(`stray file ${name} in ${location}`, option, file(name), { location, parentSlug }, FOREIGN)
      );
    const strayEvalLaneFile = fc
      .tuple(options, slug, slug, arbitraryStrayFileName())
      .map(([option, parentSlug, rule, name]) =>
        conformanceCase(
          `stray eval-lane file ${name}`,
          option,
          file(joined(SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, rule, name)),
          { location: LOCATION.EVAL_LANE, parentSlug },
          FOREIGN,
        )
      );
    const mismatchedSpecStem = fc
      .tuple(options, slug, slug)
      .filter(([, parentSlug, stem]) => parentSlug !== stem)
      .map(([option, parentSlug, stem]) =>
        conformanceCase(
          `markdown file ${stem}${PRIOR_SPEC_SUFFIX} within ${parentSlug}`,
          option,
          file(`${stem}${PRIOR_SPEC_SUFFIX}`),
          { location: LOCATION.NODE_DIRECTORY, parentSlug },
          FOREIGN,
        )
      );
    const plainDirectory = fc
      .tuple(options, slug, slug)
      .map(([option, parentSlug, name]) =>
        conformanceCase(
          `plain directory ${name} within ${parentSlug}`,
          option,
          { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: name },
          { location: LOCATION.NODE_DIRECTORY, parentSlug },
          FOREIGN,
        )
      );
    const unregisteredSuffix = SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectoryScenario(KIND_REGISTRY).map((
      scenario,
    ) =>
      conformanceCase(
        `ordered directory ${scenario.directory} with an unregistered suffix`,
        conformanceOptionsForLine(scenario.line),
        { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: scenario.directory },
        { location: LOCATION.PRODUCT_ROOT },
        FOREIGN,
      )
    );
    return fc.oneof(strayFile, strayEvalLaneFile, mismatchedSpecStem, plainDirectory, unregisteredSuffix);
  },
} as const;

const ENTRY_LOCATION: Readonly<Record<string, SpecTreeConformanceContext["location"]>> = {
  [SPEC_TREE_ENTRY_TYPE.PRODUCT]: LOCATION.PRODUCT_ROOT,
  [SPEC_TREE_ENTRY_TYPE.NODE]: LOCATION.PRODUCT_ROOT,
  [SPEC_TREE_ENTRY_TYPE.DECISION]: LOCATION.NODE_DIRECTORY,
  [SPEC_TREE_ENTRY_TYPE.EVIDENCE]: LOCATION.EVIDENCE_DIRECTORY,
};

function arbitraryRecognizedInput(): fc.Arbitrary<ConformanceInput> {
  return arbitraryValidRecognitionScenario().map(({ line, record, expected }) => ({
    options: conformanceOptionsForLine(line),
    record,
    context: { location: ENTRY_LOCATION[expected.type] ?? LOCATION.NODE_DIRECTORY },
  }));
}

function arbitraryStrayInput(): fc.Arbitrary<ConformanceInput> {
  return fc
    .tuple(
      fc.constantFrom(...SPEC_TREE_SOURCE_LINES),
      arbitraryStrayFileName(),
      fc.constantFrom(LOCATION.PRODUCT_ROOT, LOCATION.NODE_DIRECTORY, LOCATION.EVIDENCE_DIRECTORY, LOCATION.EVAL_LANE),
    )
    .map(([line, name, location]) => ({
      options: conformanceOptionsForLine(line),
      record: { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: name },
      context: { location },
    }));
}

function arbitraryArbitraryInput(): fc.Arbitrary<ConformanceInput> {
  return fc
    .tuple(
      fc.constantFrom(...SPEC_TREE_SOURCE_LINES),
      fc.constantFrom(SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY),
      fc.string(),
      fc.constantFrom(...Object.values(LOCATION)),
      fc.option(SPEC_TREE_TEST_GENERATOR.sourceSlug(), { nil: undefined }),
    )
    .map(([line, type, relativePath, location, parentSlug]) => ({
      options: conformanceOptionsForLine(line),
      record: { type, relativePath },
      context: { location, parentSlug },
    }));
}

/**
 * Any record in any ancestry context under any methodology line's version set: recognized forms by
 * construction, stray files, lane entries, and unconstrained paths. No verdict is stated for them.
 */
export function arbitraryConformanceInput(): fc.Arbitrary<ConformanceInput> {
  return fc.oneof(
    arbitraryRecognizedInput(),
    arbitraryStrayInput(),
    arbitraryArbitraryInput(),
    SKILL_CONFORMANCE_LANE_GENERATOR.probeLaneFourZero(),
    SKILL_CONFORMANCE_LANE_GENERATOR.knowledgeBeneathFourZero(),
  );
}
