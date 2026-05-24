/**
 * Session test data generators.
 *
 * Provides fast-check arbitraries for property-based testing of the
 * `spx session handoff` input contract.
 *
 * @module testing/generators/session
 */

import * as fc from "fast-check";

import { SESSION_PRIORITY, type SessionPriority } from "@/domains/session/types";

const SESSION_PRIORITY_VALUES = Object.values(SESSION_PRIORITY) as readonly SessionPriority[];

/**
 * Shape callers supply to `spx session handoff` as the JSON header at the
 * start of stdin: the caller-supplied fields (`priority`, `goal`, `next_step`,
 * `specs`, `files`). CLI-prefilled fields (`branch`, `worktree`, `created_at`,
 * `agent_session_id`) are not part of this shape — the handoff command sources
 * them from the git context and process environment.
 */
export interface HandoffHeaderFixture {
  readonly priority: SessionPriority;
  readonly goal: string;
  readonly next_step: string;
  readonly specs: readonly string[];
  readonly files: readonly string[];
}

/**
 * Arbitrary drawing from the `SESSION_PRIORITY` registry.
 *
 * Source-owned: pulls values from the production registry rather than
 * hardcoding a literal set.
 */
export function arbitrarySessionPriority(): fc.Arbitrary<SessionPriority> {
  return fc.constantFrom(...SESSION_PRIORITY_VALUES);
}

/**
 * Arbitrary non-empty unicode string for `goal` and `next_step` fields.
 *
 * `unit: "binary"` produces a single code point in the full Unicode range
 * (0000-10FFFF, excluding half-surrogate pairs) per fast-check 4.x's string
 * API, so the round-trip invariant is exercised across every unicode-string
 * value the spec's caller-supplied fields admit, including supplementary-
 * plane characters like emoji and mathematical symbols. `minLength: 1` keeps
 * the handoff command's non-empty validation from firing — value preservation,
 * not empty-rejection, is the property under test.
 */
function arbitraryNonEmptyString(): fc.Arbitrary<string> {
  return fc.string({ unit: "binary", minLength: 1 });
}

/**
 * Arbitrary unicode string for `specs` / `files` array entries.
 *
 * Empty strings are allowed — array entries do not carry the same non-empty
 * validation that `goal` / `next_step` do, and an empty-string entry is a
 * boundary the round-trip invariant must still hold for.
 */
function arbitraryUnicodeString(): fc.Arbitrary<string> {
  return fc.string({ unit: "binary" });
}

/**
 * Arbitrary `HandoffHeaderFixture` for property-based round-trip tests.
 *
 * Generates valid handoff input headers with arbitrary unicode-string values
 * for `goal`, `next_step`, and the entries of `specs`/`files`, including
 * supplementary-plane code points. The round-trip invariant is that every
 * caller-supplied string field survives unchanged from input to parsed
 * metadata regardless of which unicode codepoints the string contains.
 */
export function arbitraryHandoffHeader(): fc.Arbitrary<HandoffHeaderFixture> {
  return fc.record({
    priority: arbitrarySessionPriority(),
    goal: arbitraryNonEmptyString(),
    next_step: arbitraryNonEmptyString(),
    specs: fc.array(arbitraryUnicodeString()),
    files: fc.array(arbitraryUnicodeString()),
  });
}

/**
 * Arbitrary string that opens with the YAML-frontmatter delimiter `---\n` or
 * `---\r\n`.
 *
 * Generates input the handoff command must reject with
 * `SessionLegacyFrontmatterInputError`. The parser's legacy-prefix regex
 * matches both LF and CRLF line terminators (`/^---\r?\n/`), so the generator
 * emits both prefix variants — a regression that drops the `\r?` branch is
 * then caught by the property. The body after the opening delimiter varies
 * arbitrarily.
 */
export function arbitraryLegacyYamlFrontmatterStdin(): fc.Arbitrary<string> {
  return fc.tuple(
    fc.constantFrom("---\n", "---\r\n"),
    fc.string(),
  ).map(([prefix, rest]) => `${prefix}${rest}`);
}
