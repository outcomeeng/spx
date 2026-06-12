/**
 * Pure compaction-stash logic: extract the active spec-tree node and foundation
 * state from a conversation transcript, serialize the stash record, and number
 * the append-only stash files. No filesystem or process access.
 *
 * @module domains/compact/stash
 */

/** Tokens the spec-tree markers carry in a conversation transcript. */
export const COMPACT_TRANSCRIPT_MARKER = {
  /** Appears once the spec-tree methodology foundation is loaded. */
  FOUNDATION: "SPEC_TREE_FOUNDATION",
  /** Precedes the quoted active-node path on a context marker. */
  CONTEXT_PREFIX: "SPEC_TREE_CONTEXT target=",
} as const;

/** A numbered compaction-stash record. */
export interface CompactStashRecord {
  /** The last active spec-tree node path, or empty when none was marked. */
  readonly active_node: string;
  /** Always true — a record is written only when the foundation marker is present. */
  readonly has_foundation: true;
}

/** Naming of the append-only stash files under `.spx/sessions/<id>/`. */
export const COMPACT_STASH_FILE = {
  PREFIX: "compact-stash-",
  SUFFIX: ".json",
} as const;

const FIRST_STASH_INDEX = 1;
const EMPTY_ACTIVE_NODE = "";
const DECIMAL_RADIX = 10;

/** Spec-tree node path captured from a context marker, tolerating a backslash-escaped quote. */
const NODE_PATH_PATTERN = "spx/[A-Za-z0-9._/-]+";
const OPTIONAL_ESCAPE_THEN_QUOTE = "\\\\?\"";
const DIGITS_ONLY_PATTERN = /^\d+$/;

function contextMarkerPattern(): RegExp {
  return new RegExp(
    `${COMPACT_TRANSCRIPT_MARKER.CONTEXT_PREFIX}${OPTIONAL_ESCAPE_THEN_QUOTE}(${NODE_PATH_PATTERN})`,
    "g",
  );
}

/**
 * Extracts the stash record from a transcript. Returns null when the transcript
 * carries no foundation marker (nothing to re-anchor). Otherwise the record's
 * `active_node` is the path of the last context marker, or empty when none.
 */
export function extractStashRecord(transcript: string): CompactStashRecord | null {
  if (!transcript.includes(COMPACT_TRANSCRIPT_MARKER.FOUNDATION)) {
    return null;
  }
  const matches = [...transcript.matchAll(contextMarkerPattern())];
  const lastMatch = matches.at(-1);
  return { active_node: lastMatch?.[1] ?? EMPTY_ACTIVE_NODE, has_foundation: true };
}

/** Serializes a stash record to the JSON the resume command prints. */
export function serializeStashRecord(record: CompactStashRecord): string {
  return JSON.stringify(record);
}

/** Parses a serialized stash record. */
export function parseStashRecord(json: string): CompactStashRecord {
  const parsed = JSON.parse(json) as CompactStashRecord;
  return { active_node: parsed.active_node, has_foundation: true };
}

/** The filename for the stash record at `index`. */
export function stashRecordFilename(index: number): string {
  return `${COMPACT_STASH_FILE.PREFIX}${index}${COMPACT_STASH_FILE.SUFFIX}`;
}

/** The 1-based index encoded in a stash filename, or null when the name is not a stash record. */
export function parseStashFilenameIndex(filename: string): number | null {
  if (!filename.startsWith(COMPACT_STASH_FILE.PREFIX) || !filename.endsWith(COMPACT_STASH_FILE.SUFFIX)) {
    return null;
  }
  const body = filename.slice(COMPACT_STASH_FILE.PREFIX.length, filename.length - COMPACT_STASH_FILE.SUFFIX.length);
  if (!DIGITS_ONLY_PATTERN.test(body)) {
    return null;
  }
  const index = Number.parseInt(body, DECIMAL_RADIX);
  return index >= FIRST_STASH_INDEX ? index : null;
}

/** The next index to write given the existing directory entries — one past the highest, or the first. */
export function nextStashIndex(filenames: readonly string[]): number {
  const indices = filenames
    .map(parseStashFilenameIndex)
    .filter((index): index is number => index !== null);
  return indices.length === 0 ? FIRST_STASH_INDEX : Math.max(...indices) + FIRST_STASH_INDEX;
}
