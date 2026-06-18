/**
 * Session test data generators.
 *
 * Provides fast-check arbitraries for property-based testing of the
 * `spx session handoff` input contract and the `spx session archive`
 * any-frontmatter-shape contract.
 *
 * @module testing/generators/session
 */

import * as fc from "fast-check";
import { stringify as stringifyYaml } from "yaml";

import { SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { generateSessionId } from "@/domains/session/timestamp";
import {
  CLAIMABLE_STATUS,
  DEFAULT_PRIORITY,
  type Session,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
  SESSION_STATUSES,
  type SessionPriority,
  type SessionStatus,
} from "@/domains/session/types";

const SESSION_PRIORITY_VALUES = Object.values(SESSION_PRIORITY) as readonly SessionPriority[];

/**
 * Shape callers supply to `spx session handoff` as the JSON header at the
 * start of stdin: the caller-supplied fields (`priority`, `goal`, `next_step`,
 * `specs`, `files`, and the optional `git_ref` work-branch ref). When `git_ref`
 * is present, the handoff command records it after confirming the branch exists
 * on `origin`; when it is absent, the command derives `git_ref` from the git
 * context. `created_at` and `agent_session_id` are never caller-supplied — the
 * command sources them from the system clock and process environment.
 */
export interface HandoffHeaderFixture {
  readonly priority: SessionPriority;
  readonly goal: string;
  readonly next_step: string;
  readonly specs: readonly string[];
  readonly files: readonly string[];
  /** Optional explicit work-branch ref the command verifies on `origin` and records as `git_ref`. */
  readonly git_ref?: string;
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
 * Body for generated session fixtures. Archive moves a session by its frontmatter
 * shape regardless of body, so the body content is irrelevant to the domain.
 */
const SESSION_FIXTURE_BODY = "# Session body";

/** Fixed seed for single-value draws so scenario/compliance tests stay deterministic. */
const SESSION_CONTENT_SAMPLE_SEED = 0x5e5510;

const SESSION_FRONT_MATTER_KEY_SET = new Set<string>(Object.values(SESSION_FRONT_MATTER));

/** The declared content keys a `spx session handoff` session file carries. */
const DECLARED_CONTENT_KEYS = [
  SESSION_FRONT_MATTER.PRIORITY,
  SESSION_FRONT_MATTER.GIT_REF,
  SESSION_FRONT_MATTER.GOAL,
  SESSION_FRONT_MATTER.NEXT_STEP,
  SESSION_FRONT_MATTER.SPECS,
  SESSION_FRONT_MATTER.FILES,
] as const;

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
  return `${SESSION_FRONT_MATTER_DELIMITER}\n${yaml}\n${SESSION_FRONT_MATTER_DELIMITER}\n${SESSION_FIXTURE_BODY}\n`;
}

/** Frontmatter carrying every declared content key with valid values. */
function declaredFrontMatter(
  priority: SessionPriority,
  gitRef: string,
  goal: string,
  nextStep: string,
): Record<string, unknown> {
  return {
    [SESSION_FRONT_MATTER.PRIORITY]: priority,
    [SESSION_FRONT_MATTER.GIT_REF]: gitRef,
    [SESSION_FRONT_MATTER.GOAL]: goal,
    [SESSION_FRONT_MATTER.NEXT_STEP]: nextStep,
    [SESSION_FRONT_MATTER.SPECS]: [],
    [SESSION_FRONT_MATTER.FILES]: [],
  };
}

/**
 * A frontmatter key absent from the current declared shape — keys a session
 * written under a previous frontmatter shape carries (`result`, `worktree`,
 * `branch`, `tags`, `working_directory`) plus arbitrary unknown keys. None of
 * these belong to `SESSION_FRONT_MATTER`.
 */
function arbitraryAbsentKey(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom("result", "worktree", "branch", "tags", "working_directory"),
    fc
      .string({ minLength: 1, maxLength: 12 })
      .map((value) => `extra_${value.replace(/[^a-zA-Z0-9]/g, "")}`)
      .filter((key) => key.length > "extra_".length && !SESSION_FRONT_MATTER_KEY_SET.has(key)),
  );
}

/** Valid canonical frontmatter — the declared shape, no absent keys. */
function arbitraryCanonicalContent(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySessionPriority(), arbitrarySafeScalar(), arbitrarySafeScalar(), arbitrarySafeScalar())
    .map(([priority, gitRef, goal, nextStep]) =>
      buildSessionContent(declaredFrontMatter(priority, gitRef, goal, nextStep))
    );
}

/** Declared shape plus one or more keys absent from the current shape. */
function arbitraryContentWithAbsentKey(): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbitrarySessionPriority(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      arbitraryAbsentKey(),
      arbitrarySafeScalar(),
    )
    .map(([priority, gitRef, goal, nextStep, absentKey, absentValue]) =>
      buildSessionContent({
        ...declaredFrontMatter(priority, gitRef, goal, nextStep),
        [absentKey]: absentValue,
      })
    );
}

/** Declared shape with one declared key removed. */
function arbitraryContentMissingDeclaredKey(): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbitrarySessionPriority(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      arbitrarySafeScalar(),
      fc.constantFrom(...DECLARED_CONTENT_KEYS),
    )
    .map(([priority, gitRef, goal, nextStep, omittedKey]) => {
      const frontMatter = declaredFrontMatter(priority, gitRef, goal, nextStep);
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
    + `${SESSION_FRONT_MATTER_DELIMITER}\n${SESSION_FIXTURE_BODY}\n`
  );
}

/** Session content with no YAML frontmatter at all. */
function arbitraryNoFrontmatter(): fc.Arbitrary<string> {
  return arbitrarySafeScalar().map((text) => `# ${text}\n`);
}

/**
 * Arbitrary full session file content of any frontmatter shape — the domain
 * over which `spx session archive` moves a session unconditionally. Spans
 * valid canonical frontmatter, declared frontmatter carrying keys absent from
 * the current shape (e.g. a `result`/`worktree`/`branch` key written under a
 * previous shape), frontmatter missing a declared key, frontmatter whose YAML
 * cannot be parsed, and content with no frontmatter at all.
 */
export function arbitrarySessionContent(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryCanonicalContent(),
    arbitraryContentWithAbsentKey(),
    arbitraryContentMissingDeclaredKey(),
    arbitraryMalformedFrontmatter(),
    arbitraryNoFrontmatter(),
  );
}

/**
 * Draws one deterministic session content string for scenario/compliance tests
 * that exercise a real filesystem harness, where a full property loop over
 * `archiveCommand` would make the local-infrastructure evidence too expensive.
 */
export function sampleSessionContent(seed: number = SESSION_CONTENT_SAMPLE_SEED): string {
  return fc.sample(arbitrarySessionContent(), { numRuns: 1, seed })[0];
}

/** Fields a test may override when constructing an in-memory `Session`. */
export interface MakeSessionOptions {
  id?: string;
  status?: SessionStatus;
  priority?: SessionPriority;
  goal?: string;
  next_step?: string;
  git_ref?: string;
  specs?: readonly string[];
  files?: readonly string[];
}

/**
 * Constructs an in-memory `Session` for tests that exercise session logic over
 * objects rather than files (the picker model, sort and filter logic). The
 * `path` is a synthetic value the in-memory consumers never read from disk.
 */
export function makeSession(opts: MakeSessionOptions = {}): Session {
  const id = opts.id ?? sampleSessionId();
  const status = opts.status ?? CLAIMABLE_STATUS;
  return {
    id,
    status,
    path: `/tmp/${status}/${id}.md`,
    metadata: {
      priority: opts.priority ?? DEFAULT_PRIORITY,
      git_ref: opts.git_ref ?? "",
      goal: opts.goal ?? "",
      next_step: opts.next_step ?? "",
      specs: [...(opts.specs ?? [])],
      files: [...(opts.files ?? [])],
    },
  };
}

/**
 * Arbitrary in-memory `Session` drawing a valid timestamp ID, a status from
 * `SESSION_STATUSES`, a priority from the registry, and unicode goal/next-step
 * text — for property tests over the picker model.
 */
export function arbitrarySession(): fc.Arbitrary<Session> {
  return fc
    .record({
      id: arbitrarySessionId(),
      status: fc.constantFrom(...SESSION_STATUSES),
      priority: arbitrarySessionPriority(),
      goal: fc.string(),
      next_step: fc.string(),
    })
    .map((fields) => makeSession(fields));
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
