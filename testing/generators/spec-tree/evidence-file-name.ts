/**
 * Test-evidence file names built in the forms the Spec-Tree test-file grammar accepts.
 *
 * A name is a `{core}` of `{subject}.{evidence}.{level}` joined by the segment separator, placed in
 * the form a language tail selects: a tail of several words carries its own `test` marker and
 * extension after the core, and a tail of one extension word takes the suffix form
 * `{core}_test.{ext}`. Every word begins with a lowercase letter, so a subject drawn from an
 * identifier carries a letter prefix on each word.
 *
 * @module generators/spec-tree/evidence-file-name
 */

import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";

const SUBJECT_WORD_PREFIX = "s";

/** The evidence subject slug whose every word is the identifier's word behind a letter prefix. */
export function evidenceSubject(token: string): string {
  return token
    .split(SPEC_TREE_EVIDENCE_FILE.WORD_SEPARATOR)
    .map((word) => `${SUBJECT_WORD_PREFIX}${word}`)
    .join(SPEC_TREE_EVIDENCE_FILE.WORD_SEPARATOR);
}

/** The evidence file name for the core segments in the form the language tail selects. */
export function evidenceFileNameFor(coreSegments: readonly string[], tail: readonly string[]): string {
  const core = coreSegments.join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
  if (tail.length > 1) return [core, ...tail].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
  return [`${core}${SPEC_TREE_EVIDENCE_FILE.AFFIX_SEPARATOR}${SPEC_TREE_EVIDENCE_FILE.TEST_MARKER}`, ...tail].join(
    SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR,
  );
}
