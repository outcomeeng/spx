/**
 * Generators for the compact domain — runtime ids, spec-tree node paths, and
 * conversation transcripts carrying the spec-tree markers `compact stash` reads.
 *
 * Per `spx/local/typescript-tests.md`, every domain input string in a compact
 * test comes from here. Marker tokens are imported from the source so the test
 * domain tracks the production contract rather than re-spelling it.
 *
 * @module generators/compact/compact
 */

import * as fc from "fast-check";

import { COMPACT_TRANSCRIPT_MARKER } from "@/domains/compact";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

const NODE_PATH_ROOT = "spx";
const NODE_PATH_SEPARATOR = "/";
const NODE_SEGMENT_SUFFIX = ".enabler";
const NODE_SEGMENT_INDEX_SEPARATOR = "-";
const CURRENT_DIR_SEGMENT = ".";
const PARENT_DIR_SEGMENT = "..";
const MIN_NODE_SEGMENTS = 1;
const MAX_NODE_SEGMENTS = 3;
const QUOTE = "\"";
const ESCAPED_QUOTE = "\\\"";
const TRANSCRIPT_LINE_SEPARATOR = "\n";
const NON_MARKER_LINE = "assistant turn with no markers";

/** A spec-tree node path of the `spx/NN-slug.enabler[/NN-slug.enabler...]` shape. */
export function arbitraryNodePath(): fc.Arbitrary<string> {
  return fc
    .array(
      fc.record({ order: SPEC_TREE_TEST_GENERATOR.filesystemOrder(), slug: SPEC_TREE_TEST_GENERATOR.sourceSlug() }),
      { minLength: MIN_NODE_SEGMENTS, maxLength: MAX_NODE_SEGMENTS },
    )
    .map((segments) =>
      [
        NODE_PATH_ROOT,
        ...segments.map(({ order, slug }) => `${order}${NODE_SEGMENT_INDEX_SEPARATOR}${slug}${NODE_SEGMENT_SUFFIX}`),
      ].join(NODE_PATH_SEPARATOR)
    );
}

/** An opaque per-conversation runtime id — the directory name under `.spx/sessions/`. */
export function arbitraryRuntimeId(): fc.Arbitrary<string> {
  return fc.uuid();
}

/** A runtime id that would escape `.spx/sessions/` — a path separator, or a `.` / `..` segment. */
export function arbitraryUnsafeSessionId(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(CURRENT_DIR_SEGMENT),
    fc.constant(PARENT_DIR_SEGMENT),
    arbitraryNodePath(),
    arbitraryRuntimeId().map((id) => `${PARENT_DIR_SEGMENT}${NODE_PATH_SEPARATOR}${id}`),
    arbitraryRuntimeId().map((id) => `${id}${NODE_PATH_SEPARATOR}${id}`),
  );
}

/** Renders one `SPEC_TREE_CONTEXT target="spx/..."` marker, with the quote optionally backslash-escaped. */
export function buildContextMarker(nodePath: string, escaped: boolean): string {
  const quote = escaped ? ESCAPED_QUOTE : QUOTE;
  return `${COMPACT_TRANSCRIPT_MARKER.CONTEXT_PREFIX}${quote}${nodePath}${quote}`;
}

/** Renders one occurrence of the foundation marker. */
export function buildFoundationMarker(): string {
  return COMPACT_TRANSCRIPT_MARKER.FOUNDATION;
}

export interface TranscriptShape {
  /** Whether the transcript carries at least one `SPEC_TREE_FOUNDATION` marker. */
  readonly hasFoundation: boolean;
  /** Node paths whose `SPEC_TREE_CONTEXT` markers appear, in transcript order. */
  readonly contextNodes: readonly string[];
  /** Whether the context-marker quotes are backslash-escaped (JSON-string form). */
  readonly escaped: boolean;
}

/** Renders a transcript body from a shape: interleaves marker lines with non-marker noise. */
export function renderTranscript(shape: TranscriptShape): string {
  const lines: string[] = [NON_MARKER_LINE];
  if (shape.hasFoundation) {
    lines.push(buildFoundationMarker());
  }
  for (const nodePath of shape.contextNodes) {
    lines.push(buildContextMarker(nodePath, shape.escaped));
    lines.push(NON_MARKER_LINE);
  }
  return lines.join(TRANSCRIPT_LINE_SEPARATOR);
}

/** An arbitrary transcript shape paired with its rendered body. */
export function arbitraryTranscript(): fc.Arbitrary<{ shape: TranscriptShape; body: string }> {
  return fc
    .record({
      hasFoundation: fc.boolean(),
      contextNodes: fc.array(arbitraryNodePath(), { maxLength: 5 }),
      escaped: fc.boolean(),
    })
    .map((shape) => ({ shape, body: renderTranscript(shape) }));
}

/** A foundation-bearing transcript whose context markers name `contextNodes` in order. */
export function arbitraryFoundationTranscript(): fc.Arbitrary<{ contextNodes: readonly string[]; body: string }> {
  return fc
    .record({
      contextNodes: fc.array(arbitraryNodePath(), { minLength: 1, maxLength: 6 }),
      escaped: fc.boolean(),
    })
    .map(({ contextNodes, escaped }) => ({
      contextNodes,
      body: renderTranscript({ hasFoundation: true, contextNodes, escaped }),
    }));
}

/** Fixed seed so single-value draws stay deterministic without a per-test seed constant. */
const COMPACT_SAMPLE_SEED = 0xc0_4ac7;

/** Draws one deterministic value for scenario/compliance tests that need a single fixture. */
export function sampleCompactTestValue<T>(arbitrary: fc.Arbitrary<T>, seed: number = COMPACT_SAMPLE_SEED): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1, seed });
  if (value === undefined) {
    throw new Error("Compact test generator returned no sample");
  }
  return value;
}
