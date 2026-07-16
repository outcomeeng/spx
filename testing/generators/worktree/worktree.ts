/**
 * Worktree-occupancy test generators — claim-record domain inputs for the
 * `spx/38-worktree.enabler` occupancy tests. Every domain value a worktree test
 * asserts on comes from here, never a hand-written literal.
 *
 * @module testing/generators/worktree/worktree
 */

import * as fc from "fast-check";

import { AGENT_COMMAND_PATTERN, AGENT_RUNTIME, AGENT_RUNTIME_NAMES } from "@/domains/worktree/controlling-process";
import type { WorktreeClaimRecord } from "@/domains/worktree/occupancy-store";
import type { RandomBytes } from "@/lib/atomic-file-write";

const SAMPLE_SEED = 0x574f524b;
const TOKEN_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"] as const;
// A character set that mixes safe token characters with characters the claim-name
// derivation must lowercase or collapse: uppercase letters, dots, spaces, and slashes.
const RAW_BASENAME_CHARACTERS = [..."abcXYZ012_-. /"] as const;
// Interpreters that run a shebang-installed agent script, so `ps -o args=` reports
// the interpreter followed by the agent script path. None names an agent runtime.
const AGENT_INTERPRETERS = ["node", "python3"] as const;
const TIMEZONE_NAMES = ["America/New_York", "Asia/Tokyo", "Europe/Zurich", "UTC"] as const;
const RANDOM_BYTE_LENGTH = 8;
const MIN_PID = 1;
const MAX_PID = 4_194_304;
// Spans from the Unix epoch so the "occupancy never ages out" property is
// exercised with arbitrarily old start times, not only recent ones.
const START_TIME_MIN = new Date("1970-01-01T00:00:00.000Z");
const START_TIME_MAX = new Date("2026-12-31T23:59:59.999Z");
const ROUND_TRIP_RUN_COUNT = 25;

function stringFromCharacters(
  characters: readonly string[],
  options: { readonly minLength: number; readonly maxLength: number },
): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...characters), options).map((chars) => chars.join(""));
}

export const WORKTREE_TEST_GENERATOR = {
  counts: {
    roundTripRunCount: ROUND_TRIP_RUN_COUNT,
  },
  tempPrefix: (): fc.Arbitrary<string> =>
    stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }).map((token) => `${token}-`),
  worktreeName: (): fc.Arbitrary<string> => stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 48 }),
  emptyWorktreeName: (): fc.Arbitrary<string> => fc.constant(""),
  /** A lowercase, filesystem-safe pool worktree directory name (no case-folding surprises on disk). */
  poolWorktreeName: (): fc.Arbitrary<string> =>
    stringFromCharacters([..."abcdefghijklmnopqrstuvwxyz0123456789"], { minLength: 4, maxLength: 16 }),
  /** Two distinct pool worktree names — the second models a sibling that is not the provisioned worktree. */
  distinctPoolWorktreeNames: (): fc.Arbitrary<readonly [string, string]> =>
    fc
      .tuple(
        stringFromCharacters([..."abcdefghijklmnopqrstuvwxyz0123456789"], { minLength: 4, maxLength: 16 }),
        stringFromCharacters([..."abcdefghijklmnopqrstuvwxyz0123456789"], { minLength: 4, maxLength: 16 }),
      )
      .filter(([first, second]) => first !== second),
  /** A raw worktree basename mixing safe and unsafe characters — stresses lowercasing and collapsing. */
  rawBasename: (): fc.Arbitrary<string> =>
    stringFromCharacters(RAW_BASENAME_CHARACTERS, { minLength: 1, maxLength: 48 }),
  host: (): fc.Arbitrary<string> => stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 32 }),
  envFileName: (): fc.Arbitrary<string> =>
    stringFromCharacters([..."abcdefghijklmnopqrstuvwxyz0123456789"], { minLength: 4, maxLength: 16 }).map((token) =>
      `${token}.env`
    ),
  sessionId: (): fc.Arbitrary<string> => stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 36 }),
  distinctSessionIds: (): fc.Arbitrary<readonly [string, string]> =>
    fc
      .tuple(
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 36 }),
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 36 }),
      )
      .filter(([first, second]) => first !== second),
  writeToken: (): fc.Arbitrary<string> => stringFromCharacters(TOKEN_CHARACTERS, { minLength: 8, maxLength: 24 }),
  distinctWriteTokens: (): fc.Arbitrary<readonly [string, string]> =>
    fc
      .tuple(
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 8, maxLength: 24 }),
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 8, maxLength: 24 }),
      )
      .filter(([first, second]) => first !== second),
  randomBytes: (): fc.Arbitrary<RandomBytes> =>
    fc.uint8Array({ minLength: RANDOM_BYTE_LENGTH, maxLength: RANDOM_BYTE_LENGTH }).map((bytes) => () =>
      Buffer.from(bytes)
    ),
  distinctRandomBytes: (): fc.Arbitrary<readonly [RandomBytes, RandomBytes]> =>
    fc
      .tuple(
        fc.uint8Array({ minLength: RANDOM_BYTE_LENGTH, maxLength: RANDOM_BYTE_LENGTH }),
        fc.uint8Array({ minLength: RANDOM_BYTE_LENGTH, maxLength: RANDOM_BYTE_LENGTH }),
      )
      .filter(([first, second]) => first.some((byte, index) => byte !== second[index]))
      .map(([first, second]) => [() => Buffer.from(first), () => Buffer.from(second)] as const),
  distinctTimeZones: (): fc.Arbitrary<readonly [string, string]> =>
    fc
      .tuple(fc.constantFrom(...TIMEZONE_NAMES), fc.constantFrom(...TIMEZONE_NAMES))
      .filter(([first, second]) => first !== second),
  pid: (): fc.Arbitrary<number> => fc.integer({ min: MIN_PID, max: MAX_PID }),
  startTime: (): fc.Arbitrary<string> =>
    fc.date({ min: START_TIME_MIN, max: START_TIME_MAX, noInvalidDate: true }).map((date) => date.toISOString()),
  /** A holder process for {@link withWorktreePool}: pid, host, and start time of a live claim holder. */
  poolHolder: (): fc.Arbitrary<{ readonly pid: number; readonly host: string; readonly startedAt: string }> =>
    fc.record({
      pid: fc.integer({ min: MIN_PID, max: MAX_PID }),
      host: stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 32 }),
      startedAt: fc.date({ min: START_TIME_MIN, max: START_TIME_MAX, noInvalidDate: true }).map((date) =>
        date.toISOString()
      ),
    }),
  claimRecord: (): fc.Arbitrary<WorktreeClaimRecord> =>
    fc.record({
      sessionId: stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 36 }),
      host: stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 32 }),
      pid: fc.integer({ min: MIN_PID, max: MAX_PID }),
      startTime: fc.date({ min: START_TIME_MIN, max: START_TIME_MAX, noInvalidDate: true }).map((date) =>
        date.toISOString()
      ),
    }).map(({ sessionId, host, pid, startTime }) => ({ sessionId, host, pid, startedAt: startTime })),
  /** Two distinct start-time strings — the second models a recycled pid whose live start time differs. */
  distinctStartTimes: (): fc.Arbitrary<readonly [string, string]> =>
    fc
      .tuple(
        fc.date({ min: START_TIME_MIN, max: START_TIME_MAX, noInvalidDate: true }),
        fc.date({ min: START_TIME_MIN, max: START_TIME_MAX, noInvalidDate: true }),
      )
      .filter(([first, second]) => first.getTime() !== second.getTime())
      .map(([first, second]) => [first.toISOString(), second.toISOString()] as const),
  /** Two distinct hosts — the second models a claim recorded on a different machine. */
  distinctHosts: (): fc.Arbitrary<readonly [string, string]> =>
    fc
      .tuple(
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 32 }),
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 32 }),
      )
      .filter(([first, second]) => first !== second),
  /** Four pairwise-distinct pids — for an ancestry chain of spx, hook, agent, and a sibling. */
  distinctPids: (): fc.Arbitrary<readonly [number, number, number, number]> =>
    fc
      .uniqueArray(fc.integer({ min: MIN_PID, max: MAX_PID }), { minLength: 4, maxLength: 4 })
      .map(([a, b, c, d]) => [a, b, c, d] as [number, number, number, number]),
  /**
   * A full command line naming a known agent runtime, in either form `ps -o
   * args=` reports: a native executable path, or an interpreter invoking the
   * agent script (the shebang case where `comm` would read only the
   * interpreter).
   */
  agentCommand: (): fc.Arbitrary<string> =>
    fc
      .tuple(
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
        fc.constantFrom(...AGENT_RUNTIME_NAMES),
        fc.constantFrom(...AGENT_INTERPRETERS),
        fc.boolean(),
      )
      .map(([dir, name, interpreter, interpreted]) =>
        interpreted ? `/usr/bin/${interpreter} /${dir}/${name}` : `/${dir}/${name}`
      ),
  /** A full command line where an interpreter invokes the agent script — the shebang case. */
  interpretedAgentCommand: (): fc.Arbitrary<string> =>
    fc
      .tuple(
        fc.constantFrom(...AGENT_INTERPRETERS),
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
        fc.constantFrom(...AGENT_RUNTIME_NAMES),
      )
      .map(([interpreter, dir, name]) => `/usr/bin/${interpreter} /${dir}/${name}`),
  /** A full command line where an interpreter invokes the Pi agent script. */
  interpretedPiAgentCommand: (): fc.Arbitrary<string> =>
    fc
      .tuple(
        fc.constantFrom(...AGENT_INTERPRETERS),
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
      )
      .map(([interpreter, dir]) => `/usr/bin/${interpreter} /${dir}/${AGENT_RUNTIME.PI}`),
  /** A process command that does not name any agent runtime. */
  nonAgentCommand: (): fc.Arbitrary<string> =>
    stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 24 })
      .map((token) => `/usr/bin/${token}`)
      .filter((command) => !AGENT_COMMAND_PATTERN.test(command)),
} as const;

export function sampleWorktreeTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Worktree test generator returned no sample");
  return value;
}
