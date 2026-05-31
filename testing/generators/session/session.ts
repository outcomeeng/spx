/**
 * Session test data generators.
 *
 * Provides fast-check arbitraries for property-based testing of the
 * `spx session handoff` input contract.
 *
 * @module testing/generators/session
 */

import * as fc from "fast-check";
import { stringify as stringifyYaml } from "yaml";

import { SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { generateSessionId } from "@/domains/session/timestamp";
import {
  CANONICAL_REQUIRED_KEYS,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
  type SessionPriority,
} from "@/domains/session/types";

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

/**
 * Body for generated non-canonical session fixtures. Archive classification
 * reads only the frontmatter, so the body content is irrelevant to the domain.
 */
const NON_CANONICAL_SESSION_BODY = "# Non-canonical session";

/** Fixed seed for single-value draws so scenario/compliance tests stay deterministic. */
const NON_CANONICAL_SAMPLE_SEED = 0x5e5510;

const SESSION_FRONT_MATTER_KEY_SET = new Set<string>(Object.values(SESSION_FRONT_MATTER));

/** Safe single-line text for frontmatter scalar values — never a newline. */
function arbitrarySafeScalar(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 1, maxLength: 40 })
    .map((value) => value.replace(/[\r\n]/g, " "))
    .filter((value) => value.trim().length > 0);
}

/** Wraps a YAML-serializable frontmatter object into full session file content. */
function buildSessionContent(frontMatter: Record<string, unknown>): string {
  const yaml = stringifyYaml(frontMatter).trimEnd();
  return `${SESSION_FRONT_MATTER_DELIMITER}\n${yaml}\n${SESSION_FRONT_MATTER_DELIMITER}\n${NON_CANONICAL_SESSION_BODY}\n`;
}

/** Frontmatter carrying every canonical required key with valid values. */
function canonicalFrontMatter(
  priority: SessionPriority,
  goal: string,
  nextStep: string,
): Record<string, unknown> {
  return {
    [SESSION_FRONT_MATTER.PRIORITY]: priority,
    [SESSION_FRONT_MATTER.BRANCH]: "main",
    [SESSION_FRONT_MATTER.WORKTREE]: "",
    [SESSION_FRONT_MATTER.GOAL]: goal,
    [SESSION_FRONT_MATTER.NEXT_STEP]: nextStep,
    [SESSION_FRONT_MATTER.SPECS]: [],
    [SESSION_FRONT_MATTER.FILES]: [],
  };
}

/** A frontmatter key outside the canonical shape (e.g. `tags`, `working_directory`). */
function arbitraryExcludedKey(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom("tags", "working_directory"),
    fc
      .string({ minLength: 1, maxLength: 12 })
      .map((value) => `extra_${value.replace(/[^a-zA-Z0-9]/g, "")}`)
      .filter((key) => !SESSION_FRONT_MATTER_KEY_SET.has(key)),
  );
}

/** Pre-structured frontmatter: only `priority` and a `tags` array. */
function arbitraryLegacyFrontmatter(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySessionPriority(), fc.array(arbitrarySafeScalar(), { minLength: 1, maxLength: 3 }))
    .map(([priority, tags]) =>
      buildSessionContent({
        [SESSION_FRONT_MATTER.PRIORITY]: priority,
        tags,
      })
    );
}

/** Canonical shape plus one key outside the declared shape. */
function arbitraryCanonicalWithExcludedKey(): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbitrarySessionPriority(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      arbitraryExcludedKey(),
      arbitrarySafeScalar(),
    )
    .map(([priority, goal, nextStep, excludedKey, excludedValue]) =>
      buildSessionContent({
        ...canonicalFrontMatter(priority, goal, nextStep),
        [excludedKey]: excludedValue,
      })
    );
}

/** Canonical shape with one required key removed. */
function arbitraryCanonicalMissingRequiredKey(): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbitrarySessionPriority(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      fc.constantFrom(...CANONICAL_REQUIRED_KEYS),
    )
    .map(([priority, goal, nextStep, omittedKey]) => {
      const frontMatter = canonicalFrontMatter(priority, goal, nextStep);
      delete frontMatter[omittedKey];
      return buildSessionContent(frontMatter);
    });
}

/** Frontmatter whose YAML cannot be parsed — an unterminated flow sequence. */
function arbitraryMalformedFrontmatter(): fc.Arbitrary<string> {
  return arbitrarySessionPriority().map((priority) =>
    `${SESSION_FRONT_MATTER_DELIMITER}\n`
    + `${SESSION_FRONT_MATTER.PRIORITY}: ${priority}\n`
    + `${SESSION_FRONT_MATTER.SPECS}: [\n`
    + `${SESSION_FRONT_MATTER_DELIMITER}\n${NON_CANONICAL_SESSION_BODY}\n`
  );
}

/** Session content with no YAML frontmatter at all. */
function arbitraryNoFrontmatter(): fc.Arbitrary<string> {
  return arbitrarySafeScalar().map((text) => `# ${text}\n`);
}

/** Canonical shape with one required string field carrying a non-string (array) value. */
function arbitraryCanonicalWithWrongTypedField(): fc.Arbitrary<string> {
  const wrongTypedKeys = [
    SESSION_FRONT_MATTER.BRANCH,
    SESSION_FRONT_MATTER.WORKTREE,
    SESSION_FRONT_MATTER.GOAL,
    SESSION_FRONT_MATTER.NEXT_STEP,
  ] as const;
  return fc
    .tuple(
      arbitrarySessionPriority(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      fc.constantFrom(...wrongTypedKeys),
      fc.array(arbitrarySafeScalar(), { minLength: 1, maxLength: 2 }),
    )
    .map(([priority, goal, nextStep, wrongKey, wrongValue]) => {
      const frontMatter = canonicalFrontMatter(priority, goal, nextStep);
      frontMatter[wrongKey] = wrongValue;
      return buildSessionContent(frontMatter);
    });
}

/**
 * Arbitrary full session file content whose frontmatter does not parse into the
 * canonical shape — the domain for which `spx session archive` admits a session
 * without a result requirement. Spans the reliably non-canonical shapes: a
 * pre-structured `priority`/`tags` frontmatter, a canonical shape carrying an
 * excluded key, a canonical shape missing one required key, a canonical shape
 * with a wrong-typed required field, frontmatter whose YAML cannot be parsed,
 * and content with no frontmatter at all.
 */
export function arbitraryNonCanonicalFrontmatter(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryLegacyFrontmatter(),
    arbitraryCanonicalWithExcludedKey(),
    arbitraryCanonicalMissingRequiredKey(),
    arbitraryCanonicalWithWrongTypedField(),
    arbitraryMalformedFrontmatter(),
    arbitraryNoFrontmatter(),
  );
}

/**
 * Draws one deterministic non-canonical session content string for
 * scenario/compliance tests that exercise a real filesystem harness, where a
 * full property loop over `archiveCommand` would make the local-infrastructure
 * evidence too expensive.
 */
export function sampleNonCanonicalSessionContent(seed: number = NON_CANONICAL_SAMPLE_SEED): string {
  return fc.sample(arbitraryNonCanonicalFrontmatter(), { numRuns: 1, seed })[0];
}

/** Date bounds keep generated session instants within four-digit years so the ID format holds. */
const SESSION_ID_MIN_DATE = new Date("2000-01-01T00:00:00.000Z");
const SESSION_ID_MAX_DATE = new Date("2099-12-31T23:59:59.000Z");

/** Fixed seed for single-value session-ID draws so harness tests stay deterministic. */
const SESSION_ID_SAMPLE_SEED = 0x5e5520;

/**
 * Arbitrary session ID in the `YYYY-MM-DD_HH-mm-ss` shape, formatted through the
 * production `generateSessionId` so the test domain tracks the source format
 * rather than re-deriving it.
 */
export function arbitrarySessionId(): fc.Arbitrary<string> {
  return fc
    .date({ min: SESSION_ID_MIN_DATE, max: SESSION_ID_MAX_DATE, noInvalidDate: true })
    .map((instant) => generateSessionId({ now: () => instant }));
}

/**
 * Draws one deterministic session ID for scenario/compliance tests that need a
 * single filename rather than a full property loop.
 */
export function sampleSessionId(seed: number = SESSION_ID_SAMPLE_SEED): string {
  return fc.sample(arbitrarySessionId(), { numRuns: 1, seed })[0];
}
