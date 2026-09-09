/**
 * Generators for worktree status reports whose external values carry bytes a
 * terminal reads as commands.
 *
 * A pool worktree's directory name and a claim file's contents are both written
 * by whoever holds the pool, so both are external to spx. These generators draw
 * a status request in which every such value carries at least one unsafe byte,
 * so an assertion that the report escapes them cannot pass vacuously.
 *
 * @module testing/generators/worktree/command-output
 */

import { join } from "node:path";

import * as fc from "fast-check";

import { AGENT_RUNTIME_NAMES, type AgentRuntimeName } from "@/domains/worktree/controlling-process";
import type { WorktreeClaimRecord } from "@/domains/worktree/occupancy-store";
import {
  arbitraryTerminalUnsafePathSegment,
  arbitraryTerminalUnsafeText,
} from "@testing/generators/terminal-text/terminal-text";
import { WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

const POSIX_ROOT = "/";

/** A status request whose worktree path and claim readings all carry terminal-unsafe bytes. */
export interface UnsafeWorktreeStatusCase {
  /** The worktree root git reports — its parent directory and its basename both unsafe. */
  readonly worktreeRoot: string;
  /** The claim the occupancy store holds for that worktree. */
  readonly claim: WorktreeClaimRecord;
  /** The holder's process command, naming an agent runtime so the report renders that runtime's name. */
  readonly holderCommand: AgentRuntimeName;
}

/**
 * A worktree root whose parent directory and basename both carry terminal-unsafe
 * bytes. The basename ends in a pool worktree name so it still reduces to a
 * non-empty claim scope token: a basename of control bytes alone keys no claim at
 * all, which is a separate refusal rather than a report to inspect for escaping.
 */
const arbitraryUnsafeWorktreeRoot = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      arbitraryTerminalUnsafePathSegment(),
      arbitraryTerminalUnsafePathSegment(),
      WORKTREE_TEST_GENERATOR.poolWorktreeName(),
    )
    .map(([parent, unsafeName, token]) => join(POSIX_ROOT, parent, `${unsafeName}${token}`));

/** A claim whose session id and host — both written into the claim file by its holder — carry unsafe bytes. */
const arbitraryUnsafeClaimRecord = (): fc.Arbitrary<WorktreeClaimRecord> =>
  fc.record({
    sessionId: arbitraryTerminalUnsafeText(),
    host: arbitraryTerminalUnsafeText(),
    pid: WORKTREE_TEST_GENERATOR.pid(),
    startedAt: WORKTREE_TEST_GENERATOR.startTime(),
  });

/** A running-worktree status request in which every externally-originated value carries unsafe bytes. */
export const arbitraryUnsafeWorktreeStatusCase = (): fc.Arbitrary<UnsafeWorktreeStatusCase> =>
  fc.record({
    worktreeRoot: arbitraryUnsafeWorktreeRoot(),
    claim: arbitraryUnsafeClaimRecord(),
    holderCommand: fc.constantFrom(...AGENT_RUNTIME_NAMES),
  });

/** A status request whose operand denotes no worktree the git runner reports. */
export interface UnsafeWorktreeRefusalCase {
  /** The worktree root git reports for the running directory. */
  readonly worktreeRoot: string;
  /** The operand the refusal names — outside every reported worktree, and carrying unsafe bytes. */
  readonly target: string;
}

/**
 * A refusal case. Only the operand needs unsafe bytes: the diagnostic names the
 * target and nothing else. Because the operand always carries a control byte and
 * a pool worktree name never does, the two paths can never denote one directory.
 */
export const arbitraryUnsafeWorktreeRefusalCase = (): fc.Arbitrary<UnsafeWorktreeRefusalCase> =>
  fc.record({
    worktreeRoot: WORKTREE_TEST_GENERATOR.poolWorktreeName().map((name) => join(POSIX_ROOT, name)),
    target: arbitraryTerminalUnsafePathSegment().map((segment) => join(POSIX_ROOT, segment)),
  });
