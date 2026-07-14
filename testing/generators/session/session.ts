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
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";

const SESSION_PRIORITY_VALUES = Object.values(SESSION_PRIORITY) as readonly SessionPriority[];
export const SESSION_UNICODE_STRING_UNIT = "binary";

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

export interface HandoffHeaderOptions {
  readonly includeGitRef?: boolean;
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
  return fc.string({ unit: SESSION_UNICODE_STRING_UNIT, minLength: 1 });
}

/**
 * Arbitrary unicode string for `specs` / `files` array entries.
 *
 * Empty strings are allowed — array entries do not carry the same non-empty
 * validation that `goal` / `next_step` do, and an empty-string entry is a
 * boundary the round-trip invariant must still hold for.
 */
function arbitraryUnicodeString(): fc.Arbitrary<string> {
  return fc.string({ unit: SESSION_UNICODE_STRING_UNIT });
}

function arbitraryOptionalWorkBranchRef(): fc.Arbitrary<string | undefined> {
  return fc.oneof(fc.constant(undefined), fc.constant(""), arbitraryBranchName());
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
export function arbitraryHandoffHeader(options: HandoffHeaderOptions = {}): fc.Arbitrary<HandoffHeaderFixture> {
  const baseHeader = fc.record({
    priority: arbitrarySessionPriority(),
    goal: arbitraryNonEmptyString(),
    next_step: arbitraryNonEmptyString(),
    specs: fc.array(arbitraryUnicodeString()),
    files: fc.array(arbitraryUnicodeString()),
  });
  if (options.includeGitRef !== true) {
    return baseHeader;
  }
  return baseHeader.chain((header) =>
    arbitraryOptionalWorkBranchRef().map((gitRef) => ({
      ...header,
      ...(gitRef === undefined ? {} : { git_ref: gitRef }),
    }))
  );
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
    .map((value) => value.replaceAll(/[\r\n]/g, " "))
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
      .map((value) => `extra_${value.replaceAll(/[^a-zA-Z0-9]/g, "")}`)
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
 * A claimable session — one in the queue status the picker lists. Intent-named
 * over `makeSession` so picker tests state "a claimable session" rather than
 * re-specifying the status and field shape inline.
 */
export function claimableSession(overrides: Omit<MakeSessionOptions, "status"> = {}): Session {
  return makeSession({ ...overrides, status: CLAIMABLE_STATUS });
}

/**
 * Characters for text a render test reads back from the frame: letters and digits only, no
 * whitespace. A render harness queries `frame.split("\n")` lines that Ink right-trims and the
 * picker collapses via `toSingleLine`, so trailing/leading whitespace in generated text would not
 * survive verbatim — whitespace-free tokens render exactly as generated, keeping `toContain` sound.
 */
const RENDERABLE_UNIT = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789");
/** Filter-haystack characters: digits and space only, disjoint from the needle's letters. */
const HAYSTACK_UNIT = fc.constantFrom(..."0123456789 ");
/**
 * Needle characters: uppercase letters. Their lowercased form is still letters, so a needle —
 * and its lowercased form — can never occur in digit/space haystack text or in a timestamp id.
 * That disjointness is what makes a filter match deterministic rather than accidental.
 */
const NEEDLE_UNIT = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ");

/** Renderable free text of 1..`maxLength` characters (letters, digits, spaces). */
export function arbitraryRenderableText(maxLength = 24): fc.Arbitrary<string> {
  return fc.string({ unit: RENDERABLE_UNIT, minLength: 1, maxLength });
}

/** Free text of digits and spaces — a filter haystack that cannot contain a needle. */
function arbitraryHaystackText(): fc.Arbitrary<string> {
  return fc.string({ unit: HAYSTACK_UNIT, maxLength: 24 });
}

/** A search needle of letters, drawn from an alphabet disjoint from haystack text. */
export function arbitraryNeedle(): fc.Arbitrary<string> {
  return fc.string({ unit: NEEDLE_UNIT, minLength: 1, maxLength: 8 });
}

/** A claimable session with every field generated. */
export function arbitraryClaimableSession(): fc.Arbitrary<Session> {
  return fc
    .record({
      id: arbitrarySessionId(),
      priority: arbitrarySessionPriority(),
      goal: arbitraryRenderableText(),
      next_step: arbitraryRenderableText(),
    })
    .map((fields) => claimableSession(fields));
}

/**
 * 1..6 claimable sessions with distinct ids and one shared priority, so recency alone decides
 * their order — a test derives "newest" as the lexically-greatest id (timestamps sort
 * chronologically) without consulting the picker model it is checking.
 */
export function arbitraryClaimableSessionsSamePriority(): fc.Arbitrary<Session[]> {
  return fc.uniqueArray(arbitrarySessionId(), { minLength: 1, maxLength: 6 }).chain((ids) =>
    fc
      .tuple(
        arbitrarySessionPriority(),
        fc.array(arbitraryRenderableText(), { minLength: ids.length, maxLength: ids.length }),
        fc.array(arbitraryRenderableText(), { minLength: ids.length, maxLength: ids.length }),
      )
      .map(([priority, goals, nextSteps]) =>
        ids.map((id, index) => claimableSession({ id, priority, goal: goals[index], next_step: nextSteps[index] }))
      )
  );
}

/** The searchable fields a filter scenario can inject its needle into. */
export const FILTER_FIELD = { GOAL: "goal", NEXT_STEP: "next_step" } as const;

/** Which searchable field a filter scenario injects its needle into. */
export type FilterField = (typeof FILTER_FIELD)[keyof typeof FILTER_FIELD];

/**
 * A generated filter case: candidates whose text is drawn from the haystack alphabet, with the
 * needle injected into `field` of a generated subset. `matchingIds` is that subset's ids in
 * candidate order — the derived expectation the test compares against, never a hand-picked literal.
 */
export interface FilterScenario {
  readonly candidates: Session[];
  readonly needle: string;
  readonly matchingIds: string[];
}

/** Builds a `FilterScenario` over distinct-id claimable sessions for the given searchable field. */
export function arbitraryFilterScenario(field: FilterField): fc.Arbitrary<FilterScenario> {
  return fc.uniqueArray(arbitrarySessionId(), { minLength: 1, maxLength: 8 }).chain((ids) =>
    fc
      .tuple(
        fc.array(
          fc.record({ goal: arbitraryHaystackText(), nextStep: arbitraryHaystackText(), matches: fc.boolean() }),
          { minLength: ids.length, maxLength: ids.length },
        ),
        arbitraryNeedle(),
      )
      .map(([rows, needle]) => {
        const candidates = ids.map((id, index) => {
          const row = rows[index];
          return claimableSession({
            id,
            goal: field === FILTER_FIELD.GOAL && row.matches ? row.goal + needle : row.goal,
            next_step: field === FILTER_FIELD.NEXT_STEP && row.matches ? row.nextStep + needle : row.nextStep,
          });
        });
        const matchingIds = ids.filter((_id, index) => rows[index].matches);
        return { candidates, needle, matchingIds };
      })
  );
}

/**
 * A goal carrying a newline, with its two non-empty segments exposed so a test can assert the
 * post-break text folds onto the single row rather than asserting against a hand-typed string.
 */
export interface NewlineGoal {
  readonly goal: string;
  readonly head: string;
  readonly tail: string;
}

/** Generates a `NewlineGoal` from two short renderable segments joined by a line break. */
export function arbitraryGoalWithNewline(): fc.Arbitrary<NewlineGoal> {
  return fc
    .tuple(arbitraryRenderableText(12), arbitraryRenderableText(12))
    .map(([head, tail]) => ({ head, tail, goal: `${head}\n${tail}` }));
}

/** A renderable goal strictly wider than `width`, so a row of that width must truncate it. */
export function arbitraryGoalWiderThan(width: number): fc.Arbitrary<string> {
  return fc.string({ unit: RENDERABLE_UNIT, minLength: width + 1, maxLength: width + 40 });
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

/**
 * Arbitrary value that is never a `string[]` — integers, booleans, null, plain
 * objects, and arrays of non-strings. Drives tests that a session metadata
 * parser coerces a non-string-array `specs`/`files` field to an empty array
 * rather than trusting the raw YAML value.
 */
export function arbitraryNonStringArrayValue(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 8 })),
    fc.array(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)), { minLength: 1, maxLength: 4 }),
  );
}

/** Date bounds keep generated session instants within four-digit years so the ID format holds. */
const SESSION_ID_MIN_DATE = new Date("2000-01-01T00:00:00.000Z");
const SESSION_ID_MAX_DATE = new Date("2099-12-31T23:59:59.000Z");

/** Fixed seed for single-value session-ID draws so harness tests stay deterministic. */
const SESSION_ID_SAMPLE_SEED = 0x5e5520;

/**
 * Arbitrary valid session instant — a `Date` within the four-digit-year bounds
 * the `YYYY-MM-DD_HH-mm-ss` ID format admits. Session-identity property tests
 * draw instants from this domain instead of re-declaring date bounds inline.
 */
export function arbitraryValidSessionInstant(): fc.Arbitrary<Date> {
  return fc.date({ min: SESSION_ID_MIN_DATE, max: SESSION_ID_MAX_DATE, noInvalidDate: true }).map((instant) => {
    const wholeSecondInstant = new Date(instant);
    wholeSecondInstant.setUTCMilliseconds(0);
    return wholeSecondInstant;
  });
}

/** Two distinct valid session instants for chronological-order properties. */
export function arbitraryDistinctSessionInstantPair(): fc.Arbitrary<readonly [Date, Date]> {
  return fc
    .tuple(arbitraryValidSessionInstant(), arbitraryValidSessionInstant())
    .filter(([left, right]) => left.getTime() !== right.getTime());
}

/** Content that cannot open a YAML frontmatter document. */
export function arbitraryNonFrontMatterContent(): fc.Arbitrary<string> {
  return fc.string().filter((content) => !content.startsWith(SESSION_FRONT_MATTER_DELIMITER));
}

/**
 * Arbitrary session ID in the `YYYY-MM-DD_HH-mm-ss` shape, formatted through the
 * production `generateSessionId` so the test domain tracks the source format
 * rather than re-deriving it.
 */
export function arbitrarySessionId(): fc.Arbitrary<string> {
  return arbitraryValidSessionInstant().map((instant) => generateSessionId({ now: () => instant }));
}

/** Characters an agent-session identity may carry that are unsafe in a path segment. */
const PATH_UNSAFE_MARKERS = String.raw`:/+.\@ `;

/** Fixed seed for single-value path-unsafe-identity draws so scenario tests stay deterministic. */
const PATH_UNSAFE_IDENTITY_SAMPLE_SEED = 0x5e5530;

/** Whitespace-only agent-session env values are absent for resolution. */
const WHITESPACE_IDENTITY_VALUES = [" ", "\t", "\n", "\r\n", " \t\n "] as const;

/** Fixed seed for single-value whitespace-identity draws so scenario tests stay deterministic. */
const WHITESPACE_IDENTITY_SAMPLE_SEED = 0x5e5532;

export const SESSION_GENERATOR_ERROR = {
  EMPTY_IDENTITY_SAMPLE: "session identity generator returned an empty value",
} as const;

/**
 * Arbitrary non-empty agent-session identity ($CLAUDE_SESSION_ID / $CODEX_THREAD_ID)
 * carrying at least one path-unsafe marker, so `resolveAgentSessionId` must
 * sanitize it into a path-safe token. Interleaves alphanumeric runs with unsafe
 * markers and guarantees at least one marker is present.
 */
export function arbitraryPathUnsafeAgentSessionIdentity(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 8 }),
      fc.constantFrom(...PATH_UNSAFE_MARKERS),
      fc.string({ minLength: 1, maxLength: 8 }),
    )
    .map(([head, marker, tail]) => `${head}${marker}${tail}`);
}

/** Arbitrary whitespace-only agent-session identity for env fallback tests. */
export function arbitraryWhitespaceAgentSessionIdentity(): fc.Arbitrary<string> {
  return fc.constantFrom(...WHITESPACE_IDENTITY_VALUES);
}

/**
 * Draws one deterministic path-unsafe agent-session identity for scenario tests
 * that need a single example rather than a full property loop.
 */
export function samplePathUnsafeAgentSessionIdentity(
  seed: number = PATH_UNSAFE_IDENTITY_SAMPLE_SEED,
): string {
  return fc.sample(arbitraryPathUnsafeAgentSessionIdentity(), { numRuns: 1, seed })[0];
}

/** Draws one deterministic whitespace-only agent-session identity. */
export function sampleWhitespaceAgentSessionIdentity(
  seed: number = WHITESPACE_IDENTITY_SAMPLE_SEED,
): string {
  return fc.sample(arbitraryWhitespaceAgentSessionIdentity(), { numRuns: 1, seed })[0];
}

export function sampleDistinctPathUnsafeAgentSessionIdentities(
  count: number,
  seed: number = PATH_UNSAFE_IDENTITY_SAMPLE_SEED,
): readonly string[] {
  return fc.sample(
    fc.uniqueArray(arbitraryPathUnsafeAgentSessionIdentity(), { minLength: count, maxLength: count }),
    { numRuns: 1, seed },
  )[0];
}

/**
 * Draws one deterministic session ID for scenario/compliance tests that need a
 * single filename rather than a full property loop.
 */
export function sampleSessionId(seed: number = SESSION_ID_SAMPLE_SEED): string {
  return fc.sample(arbitrarySessionId(), { numRuns: 1, seed })[0];
}

/**
 * Draws `count` distinct deterministic session IDs for scenario tests that batch
 * over several sessions, so the identifiers are generated rather than hand-picked.
 */
export function sampleDistinctSessionIds(count: number, seed: number = SESSION_ID_SAMPLE_SEED): readonly string[] {
  return fc.sample(fc.uniqueArray(arbitrarySessionId(), { minLength: count, maxLength: count }), {
    numRuns: 1,
    seed,
  })[0];
}
