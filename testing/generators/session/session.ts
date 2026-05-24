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
 * Arbitrary string for `goal` and `next_step` fields.
 *
 * Uses `fc.string({ minLength: 1 })` so the handoff command's "non-empty"
 * validation does not fire — the round-trip invariant under test is value
 * preservation, not the empty-rejection behavior.
 */
function arbitraryNonEmptyString(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1 });
}

/**
 * Arbitrary `HandoffHeaderFixture` for property-based round-trip tests.
 *
 * Generates valid handoff input headers with arbitrary unicode-string values
 * for `goal`, `next_step`, and the entries of `specs`/`files`. The round-trip
 * invariant is that every caller-supplied string field survives unchanged
 * from input to parsed metadata regardless of which unicode codepoints the
 * string contains.
 */
export function arbitraryHandoffHeader(): fc.Arbitrary<HandoffHeaderFixture> {
  return fc.record({
    priority: arbitrarySessionPriority(),
    goal: arbitraryNonEmptyString(),
    next_step: arbitraryNonEmptyString(),
    specs: fc.array(fc.string()),
    files: fc.array(fc.string()),
  });
}

/**
 * Arbitrary string that opens with the YAML-frontmatter delimiter `---\n`.
 *
 * Generates input the handoff command must reject with
 * `SessionLegacyFrontmatterInputError`. The body after the opening delimiter
 * varies arbitrarily — any input matching the legacy YAML-frontmatter shape
 * is in the rejection domain, not just the well-formed cases.
 */
export function arbitraryLegacyYamlFrontmatterStdin(): fc.Arbitrary<string> {
  return fc.string().map((rest) => `---\n${rest}`);
}
