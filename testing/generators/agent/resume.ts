import * as fc from "fast-check";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_RESUME_LIMITS, AGENT_RESUME_RECENT_WINDOW_MS } from "@/domains/agent/protocol";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

const SAMPLE_SEED = 46_210;
const SAMPLE_RUN_COUNT = 1;
const MIN_AGENT_RESUME_NOW_MS = 1_767_225_600_000;
const MAX_AGENT_RESUME_NOW_MS = 1_798_761_599_999;
const MIN_EXTRA_CANDIDATE_COUNT = 1;
const MAX_EXTRA_CANDIDATE_COUNT = 5;
const MIN_RECENT_OFFSET_MS = 1;
const RECENT_OFFSET_WINDOW_DIVISOR = 2;
const MAX_RECENT_OFFSET_MS = Math.floor(AGENT_RESUME_RECENT_WINDOW_MS / RECENT_OFFSET_WINDOW_DIVISOR);
const MIN_AGENT_LAUNCH_EXIT_CODE = 0;
const MAX_AGENT_LAUNCH_EXIT_CODE = 255;
const OVER_CAP_EXTRA_MIN = 1;
const OVER_CAP_EXTRA_MAX = 3;
const BRANCH_SEGMENT_JOINER = "/";

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

export function arbitraryAgentResumeExtraCandidateCount(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_EXTRA_CANDIDATE_COUNT, max: MAX_EXTRA_CANDIDATE_COUNT });
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

export function arbitraryAgentLaunchExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_AGENT_LAUNCH_EXIT_CODE, max: MAX_AGENT_LAUNCH_EXIT_CODE });
}
