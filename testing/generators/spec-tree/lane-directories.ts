/**
 * Cases and candidates for the knowledge root and the probe lane a node directory may hold, with
 * the verdict the filename-grammar spec states for each naming-schema version.
 *
 * Each expectation is the spec's statement read directly — the 4.0 version accepts one `knowledge/`
 * directory holding `index.md` and `log.md`, and per-probe directories holding `probe.md`, artifact
 * files `{slug}.{ext}`, and a `runs/` directory; the 3.x version accepts neither a `knowledge/` nor a
 * `probes/` directory — held apart from the registry the version composes from, so a name missing
 * from the registry surface leaves the expectation standing.
 *
 * @module generators/spec-tree/lane-directories
 */

import * as fc from "fast-check";

import type { SpecTreeEvalEntryKind, SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { SPEC_TREE_EVAL_ENTRY_KIND, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

/** One entry path under a node and whether a methodology line's version accepts it as lane content. */
export type LaneDirectoryCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly pathFromNode: string;
  readonly entryKind: SpecTreeEvalEntryKind;
  readonly accepted: boolean;
};

/** A candidate entry path in the probe lane with the verdict the spec's statement of the lane gives it. */
export type ProbeEntryCandidate = {
  readonly pathFromNode: string;
  readonly entryKind: SpecTreeEvalEntryKind;
  readonly accepted: boolean;
};

const PATH_SEPARATOR = "/";
const KNOWLEDGE_DIRECTORY = "knowledge";
const KNOWLEDGE_FILES = ["index.md", "log.md"] as const;
const PROBES_DIRECTORY = "probes";
const PROBE_PROTOCOL_FILE = "probe.md";
const PROBE_RUNS_DIRECTORY = "runs";
const NAME_SEPARATOR = ".";
const WORD_SEPARATOR = "-";
const WORD_PATTERN = /^[a-z][a-z0-9]*$/;
const WORD_SHAPE = /^[a-z][a-z0-9]{0,5}$/;
const SLUG_WORD_MAX_COUNT = 3;
const NON_SLUG_SEGMENT = fc.constantFrom("Upper", "under_score", "9digit", "", "has space");
const NON_WORD_EXTENSION = fc.constantFrom("Ts", "9ts", "t_s", "", "t-s");
const FOREIGN_LANE_ENTRY_NAME = fc.constantFrom("eval.toml", "notes", "runs");
const THREE_X_LINE = SPEC_TREE_METHODOLOGY_LINE.THREE_TWO;
const FOUR_ZERO_LINE = SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO;
const LANE_DRAW_BASE = 1;

function joined(...segments: readonly string[]): string {
  return segments.join(PATH_SEPARATOR);
}

function laneCase(
  line: SpecTreeMethodologyLine,
  pathFromNode: string,
  entryKind: SpecTreeEvalEntryKind,
  accepted: boolean,
): LaneDirectoryCase {
  return {
    title: `${line} ${accepted ? "accepts" : "does not accept"} the ${entryKind} ${pathFromNode}`,
    line,
    pathFromNode,
    entryKind,
    accepted,
  };
}

/**
 * The knowledge-root entries the 4.0 clause names: the `knowledge` directory and its `index.md` and
 * `log.md` files are accepted; `knowledge` as a file, and a `knowledge` directory below another
 * directory rather than directly within the node, are not.
 */
export function knowledgeRootCases(): readonly LaneDirectoryCase[] {
  const enclosing = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), LANE_DRAW_BASE);
  return [
    laneCase(FOUR_ZERO_LINE, KNOWLEDGE_DIRECTORY, SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY, true),
    ...KNOWLEDGE_FILES.map((file) =>
      laneCase(FOUR_ZERO_LINE, joined(KNOWLEDGE_DIRECTORY, file), SPEC_TREE_EVAL_ENTRY_KIND.FILE, true)
    ),
    laneCase(FOUR_ZERO_LINE, KNOWLEDGE_DIRECTORY, SPEC_TREE_EVAL_ENTRY_KIND.FILE, false),
    laneCase(FOUR_ZERO_LINE, joined(enclosing, KNOWLEDGE_DIRECTORY), SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY, false),
  ];
}

/**
 * The knowledge-root and probe-lane entries the 3.x clause rejects: a `knowledge` directory with
 * its files, and a `probes` directory with a probe directory and the entries a 4.0 probe directory holds.
 */
export function threeXLaneDirectoryCases(): readonly LaneDirectoryCase[] {
  const probe = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), LANE_DRAW_BASE);
  return [
    laneCase(THREE_X_LINE, KNOWLEDGE_DIRECTORY, SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY, false),
    ...KNOWLEDGE_FILES.map((file) =>
      laneCase(THREE_X_LINE, joined(KNOWLEDGE_DIRECTORY, file), SPEC_TREE_EVAL_ENTRY_KIND.FILE, false)
    ),
    laneCase(THREE_X_LINE, PROBES_DIRECTORY, SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY, false),
    laneCase(THREE_X_LINE, joined(PROBES_DIRECTORY, probe), SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY, false),
    laneCase(
      THREE_X_LINE,
      joined(PROBES_DIRECTORY, probe, PROBE_PROTOCOL_FILE),
      SPEC_TREE_EVAL_ENTRY_KIND.FILE,
      false,
    ),
    laneCase(
      THREE_X_LINE,
      joined(PROBES_DIRECTORY, probe, PROBE_RUNS_DIRECTORY),
      SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY,
      false,
    ),
  ];
}

function isWord(text: string): boolean {
  return WORD_PATTERN.test(text);
}

function isSlug(text: string): boolean {
  return text.split(WORD_SEPARATOR).every(isWord);
}

/** The spec's statement of the probe lane read directly, over a path relative to the node. */
function probeLaneVerdict(segments: readonly string[], entryKind: SpecTreeEvalEntryKind): boolean {
  const [directory, probe = "", name = ""] = segments;
  const isDirectory = entryKind === SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY;
  if (directory !== PROBES_DIRECTORY) return false;
  if (segments.length === 1) return isDirectory;
  if (!isSlug(probe)) return false;
  if (segments.length === 2) return isDirectory;
  if (segments.length !== 3) return false;
  if (isDirectory) return name === PROBE_RUNS_DIRECTORY;
  const artifact = name.split(NAME_SEPARATOR);
  return artifact.length === 2 && isSlug(artifact[0] ?? "") && isWord(artifact[1] ?? "");
}

function arbitraryWord(): fc.Arbitrary<string> {
  return fc.stringMatching(WORD_SHAPE);
}

function arbitrarySlug(): fc.Arbitrary<string> {
  return fc.array(arbitraryWord(), { minLength: 1, maxLength: SLUG_WORD_MAX_COUNT }).map((words) =>
    words.join(WORD_SEPARATOR)
  );
}

function candidate(segments: readonly string[], entryKind: SpecTreeEvalEntryKind): ProbeEntryCandidate {
  return { pathFromNode: segments.join(PATH_SEPARATOR), entryKind, accepted: probeLaneVerdict(segments, entryKind) };
}

function arbitraryAcceptedEntry(): fc.Arbitrary<ProbeEntryCandidate> {
  const directory = arbitrarySlug().map((probe) =>
    candidate([PROBES_DIRECTORY, probe], SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY)
  );
  const protocol = arbitrarySlug().map((probe) =>
    candidate([PROBES_DIRECTORY, probe, PROBE_PROTOCOL_FILE], SPEC_TREE_EVAL_ENTRY_KIND.FILE)
  );
  const runs = arbitrarySlug().map((probe) =>
    candidate([PROBES_DIRECTORY, probe, PROBE_RUNS_DIRECTORY], SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY)
  );
  const artifact = fc
    .tuple(arbitrarySlug(), arbitrarySlug(), arbitraryWord())
    .map(([probe, slug, extension]) =>
      candidate([PROBES_DIRECTORY, probe, [slug, extension].join(NAME_SEPARATOR)], SPEC_TREE_EVAL_ENTRY_KIND.FILE)
    );
  return fc.oneof(directory, protocol, runs, artifact);
}

function arbitraryNearMissEntry(): fc.Arbitrary<ProbeEntryCandidate> {
  const nonSlugProbe = fc
    .tuple(NON_SLUG_SEGMENT)
    .map(([probe]) => candidate([PROBES_DIRECTORY, probe, PROBE_PROTOCOL_FILE], SPEC_TREE_EVAL_ENTRY_KIND.FILE));
  const nonSlugArtifact = fc
    .tuple(arbitrarySlug(), NON_SLUG_SEGMENT, arbitraryWord())
    .map(([probe, slug, extension]) =>
      candidate([PROBES_DIRECTORY, probe, [slug, extension].join(NAME_SEPARATOR)], SPEC_TREE_EVAL_ENTRY_KIND.FILE)
    );
  const nonWordExtension = fc
    .tuple(arbitrarySlug(), arbitrarySlug(), NON_WORD_EXTENSION)
    .map(([probe, slug, extension]) =>
      candidate([PROBES_DIRECTORY, probe, [slug, extension].join(NAME_SEPARATOR)], SPEC_TREE_EVAL_ENTRY_KIND.FILE)
    );
  const runsAsFile = arbitrarySlug().map((probe) =>
    candidate([PROBES_DIRECTORY, probe, PROBE_RUNS_DIRECTORY], SPEC_TREE_EVAL_ENTRY_KIND.FILE)
  );
  const artifactAsDirectory = fc
    .tuple(arbitrarySlug(), arbitrarySlug(), arbitraryWord())
    .map(([probe, slug, extension]) =>
      candidate(
        [PROBES_DIRECTORY, probe, [slug, extension].join(NAME_SEPARATOR)],
        SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY,
      )
    );
  const nestedTooDeep = fc
    .tuple(arbitrarySlug(), FOREIGN_LANE_ENTRY_NAME, arbitrarySlug())
    .map(([probe, name, deeper]) =>
      candidate([PROBES_DIRECTORY, probe, PROBE_RUNS_DIRECTORY, deeper, name], SPEC_TREE_EVAL_ENTRY_KIND.FILE)
    );
  const probeLaneAsFile = fc.constant(candidate([PROBES_DIRECTORY], SPEC_TREE_EVAL_ENTRY_KIND.FILE));
  const wrongLane = fc
    .tuple(arbitrarySlug(), arbitrarySlug())
    .map(([lane, probe]) => candidate([lane, probe, PROBE_PROTOCOL_FILE], SPEC_TREE_EVAL_ENTRY_KIND.FILE));
  return fc.oneof(
    nonSlugProbe,
    nonSlugArtifact,
    nonWordExtension,
    runsAsFile,
    artifactAsDirectory,
    nestedTooDeep,
    probeLaneAsFile,
    wrongLane,
  );
}

/** Generators over the open probe-lane path domain: entries the spec accepts by construction, and candidates with the spec's verdict. */
export const PROBE_DIRECTORY_GENERATOR = {
  accepted: arbitraryAcceptedEntry,
  candidate: () => fc.oneof(arbitraryAcceptedEntry(), arbitraryNearMissEntry()),
} as const;
