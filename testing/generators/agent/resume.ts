import * as fc from "fast-check";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_RESUME_LIMITS, AGENT_RESUME_RECENT_WINDOW_MS } from "@/domains/agent/protocol";
import { CONTROL_CHAR_UPPER_BOUND } from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

const SAMPLE_SEED = 46_210;
const SAMPLE_RUN_COUNT = 1;
const MIN_AGENT_RESUME_NOW_MS = 1_767_225_600_000;
const MAX_AGENT_RESUME_NOW_MS = 1_798_761_599_999;
const MIN_RECENT_OFFSET_MS = 1;
const RECENT_OFFSET_WINDOW_DIVISOR = 2;
const MAX_RECENT_OFFSET_MS = Math.floor(AGENT_RESUME_RECENT_WINDOW_MS / RECENT_OFFSET_WINDOW_DIVISOR);
const MIN_AGENT_LAUNCH_EXIT_CODE = 0;
const MAX_AGENT_LAUNCH_EXIT_CODE = 255;
const OVER_CAP_EXTRA_MIN = 1;
const OVER_CAP_EXTRA_MAX = 3;
const BRANCH_SEGMENT_JOINER = "/";
const AGENT_SEARCH_UNSAFE_LIMIT_PREFIX = "limit";
const AGENT_SEARCH_PARTIAL_NUMERIC_LIMIT_PREFIX = "1";
const DECIMAL_DIGIT_PATTERN = /^[0-9]+$/;
const DURATION_HOUR_SUFFIX = "h";
const INVALID_DURATION_PREFIX = "invalid";
const MIN_SINCE_HOURS = 1;
const MAX_SINCE_HOURS = AGENT_RESUME_LIMITS.HOURS_PER_DAY;
const ZERO_DURATION_HOURS = 0;
const FRACTIONAL_MILLISECOND_DURATION = "0.5ms";
const NON_FINITE_DURATION_ZERO_DIGITS = 300;

export interface GeneratedAgentResumeSinceDuration {
  readonly text: string;
  readonly durationMs: number;
}

export function sampleAgentResumeValue<T>(arbitrary: fc.Arbitrary<T>, seedOffset = 0): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED + seedOffset, numRuns: SAMPLE_RUN_COUNT });
  if (value === undefined) {
    throw new Error("agent resume generator produced no sample");
  }
  return value;
}

export function arbitraryAgentSessionId(): fc.Arbitrary<string> {
  return fc.uuid();
}

export function arbitraryAgentWorktreeRoot(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((slug) => join(tmpdir(), slug));
}

export function arbitraryAgentSessionCwd(worktreeRoot: string): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((slug) => join(worktreeRoot, slug));
}

export function arbitraryAgentResumeNowMs(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_AGENT_RESUME_NOW_MS, max: MAX_AGENT_RESUME_NOW_MS });
}

export function arbitraryAgentBranch(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryDomainLiteral(), arbitraryDomainLiteral())
    .map(([prefix, name]) => `${prefix}${BRANCH_SEGMENT_JOINER}${name}`);
}

export function arbitraryAgentResumeOverCapCount(): fc.Arbitrary<number> {
  return fc.integer({
    min: AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES + OVER_CAP_EXTRA_MIN,
    max: AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES + OVER_CAP_EXTRA_MAX,
  });
}

export function arbitraryAgentResumeRecentOffsetMs(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_RECENT_OFFSET_MS, max: MAX_RECENT_OFFSET_MS });
}

export function arbitraryAgentResumeSinceDuration(): fc.Arbitrary<GeneratedAgentResumeSinceDuration> {
  return fc.integer({ min: MIN_SINCE_HOURS, max: MAX_SINCE_HOURS }).map((hours) => ({
    text: `${hours}${DURATION_HOUR_SUFFIX}`,
    durationMs: hours
      * AGENT_RESUME_LIMITS.MINUTES_PER_HOUR
      * AGENT_RESUME_LIMITS.SECONDS_PER_MINUTE
      * AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND,
  }));
}

export function arbitraryRejectedAgentResumeSinceDurations(): fc.Arbitrary<readonly string[]> {
  return fc
    .tuple(
      fc.integer({ min: MIN_SINCE_HOURS, max: MAX_SINCE_HOURS }),
      arbitraryDomainLiteral(),
      fc.bigInt({ min: BigInt(Number.MAX_SAFE_INTEGER) + 1n }),
    )
    .map(([hours, literal, unsafeMilliseconds]) => [
      `${ZERO_DURATION_HOURS}${DURATION_HOUR_SUFFIX}`,
      `-${hours}${DURATION_HOUR_SUFFIX}`,
      `${INVALID_DURATION_PREFIX}-${literal}`,
      `1${"0".repeat(NON_FINITE_DURATION_ZERO_DIGITS)}w`,
      FRACTIONAL_MILLISECOND_DURATION,
      `${unsafeMilliseconds}ms`,
    ]);
}

export function arbitraryAgentLaunchExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_AGENT_LAUNCH_EXIT_CODE, max: MAX_AGENT_LAUNCH_EXIT_CODE });
}

export function arbitraryUnsafeAgentSearchLimit(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral()
    .map((literal) => `${AGENT_SEARCH_UNSAFE_LIMIT_PREFIX}${String.fromCodePoint(CONTROL_CHAR_UPPER_BOUND)}${literal}`);
}

export function arbitraryPartialNumericAgentSearchLimit(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral()
    .filter((literal) => !DECIMAL_DIGIT_PATTERN.test(literal))
    .map((literal) => `${AGENT_SEARCH_PARTIAL_NUMERIC_LIMIT_PREFIX}${literal}`);
}
