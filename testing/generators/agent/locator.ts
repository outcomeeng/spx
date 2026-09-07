import * as fc from "fast-check";

import { AGENT_SEARCH_MATCH_REASON, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  AGENT_SEARCH_NEEDLE_SELECTORS,
  type AgentSearchNeedleSelector,
  type AgentSearchQueryOptions,
  RIPGREP_EXIT_CODE,
  RIPGREP_PATH_TERMINATOR,
  type TranscriptLocatorRunResult,
} from "@/domains/agent/search";

import { arbitraryTranscriptNeedleCase, type GeneratedMovingSessionScenario } from "./search";

const MAX_NEEDLE_GRAPHEMES = 8;
const MAX_INVALID_NEEDLE_SURROUNDING_GRAPHEMES = 8;
const MAX_LOCATOR_PATH_LIST_LENGTH = 6;
const MAX_LOCATOR_PATH_GRAPHEMES = 24;
const MAX_LOCATOR_STDERR_GRAPHEMES = 32;
const LINE_TERMINATORS = ["\n", "\r", "\r\n"] as const;
const STORE_FILE_NAME_PREFIX = "transcript-";

/**
 * A selector value the locator can never search for: empty, or carrying a line terminator at any
 * position of an otherwise ordinary literal. The empty branch is the boundary of the open domain.
 */
export function arbitraryInvalidAgentSearchNeedle(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    fc
      .tuple(
        fc.string({ unit: "grapheme", maxLength: MAX_INVALID_NEEDLE_SURROUNDING_GRAPHEMES }),
        fc.constantFrom(...LINE_TERMINATORS),
        fc.string({ unit: "grapheme", maxLength: MAX_INVALID_NEEDLE_SURROUNDING_GRAPHEMES }),
      )
      .map(([head, terminator, tail]) => `${head}${terminator}${tail}`),
  );
}

/** One needle selector paired with an invalid value, so every selector meets the boundary. */
export interface GeneratedInvalidNeedleCase {
  readonly selector: AgentSearchNeedleSelector;
  readonly value: string;
  readonly query: AgentSearchQueryOptions;
}

export function arbitraryInvalidNeedleCase(): fc.Arbitrary<GeneratedInvalidNeedleCase> {
  return fc
    .tuple(fc.constantFrom(...AGENT_SEARCH_NEEDLE_SELECTORS), arbitraryInvalidAgentSearchNeedle())
    .map(([selector, value]) => ({ selector, value, query: queryForNeedleSelector(selector, value) }));
}

function queryForNeedleSelector(selector: AgentSearchNeedleSelector, value: string): AgentSearchQueryOptions {
  switch (selector) {
    case AGENT_SEARCH_MATCH_REASON.PICKUP_ID:
      return { pickupId: value };
    case AGENT_SEARCH_MATCH_REASON.CONTAINS:
      return { contains: value };
    case AGENT_SEARCH_MATCH_REASON.SESSION_ID:
      return { sessionId: value };
    case AGENT_SEARCH_MATCH_REASON.BRANCH:
      return { branch: value };
  }
}

/** The selector-bearing queries a moving-session store answers, one per needle selector. */
export function needleSelectorQueries(
  scenario: GeneratedMovingSessionScenario,
): ReadonlyMap<AgentSearchNeedleSelector, AgentSearchQueryOptions> {
  return new Map<AgentSearchNeedleSelector, AgentSearchQueryOptions>([
    [AGENT_SEARCH_MATCH_REASON.PICKUP_ID, { pickupId: scenario.contentNeedle }],
    [AGENT_SEARCH_MATCH_REASON.CONTAINS, { contains: scenario.contentNeedle }],
    [AGENT_SEARCH_MATCH_REASON.SESSION_ID, { sessionId: scenario.sessionId }],
    [AGENT_SEARCH_MATCH_REASON.BRANCH, { branch: scenario.targetBranch }],
  ]);
}

/** A line-free, non-empty needle the locator can search for. */
export function arbitraryAgentSearchNeedle(): fc.Arbitrary<string> {
  return fc
    .string({ unit: "grapheme", minLength: 1, maxLength: MAX_NEEDLE_GRAPHEMES })
    .filter((needle) => !/[\r\n]/u.test(needle));
}

/**
 * A path list as ripgrep prints it under `-0`: every path followed by one terminator byte. Paths
 * may carry line terminators and never carry the terminator byte, per ripgrep's `--null` contract.
 */
export interface GeneratedRipgrepPathList {
  readonly paths: readonly string[];
  readonly stdout: Uint8Array;
}

export function arbitraryRipgrepPathList(): fc.Arbitrary<GeneratedRipgrepPathList> {
  return fc
    .array(
      fc
        .string({ unit: "grapheme", minLength: 1, maxLength: MAX_LOCATOR_PATH_GRAPHEMES })
        .filter((path) => !path.includes(String.fromCodePoint(RIPGREP_PATH_TERMINATOR))),
      { maxLength: MAX_LOCATOR_PATH_LIST_LENGTH },
    )
    .map((paths) => ({ paths, stdout: ripgrepNullSeparatedStdout(paths) }));
}

function ripgrepNullSeparatedStdout(paths: readonly string[]): Uint8Array {
  const terminator = Buffer.from([RIPGREP_PATH_TERMINATOR]);
  return Buffer.concat(paths.flatMap((path) => [Buffer.from(path, AGENT_SESSION_STORE.TEXT_ENCODING), terminator]));
}

/** The complete exit-status domain a ripgrep run can end in, the unstartable executable included. */
export const RIPGREP_RUN_EXIT_STATUSES: readonly (number | null)[] = [
  RIPGREP_EXIT_CODE.MATCH,
  RIPGREP_EXIT_CODE.NO_MATCH,
  RIPGREP_EXIT_CODE.ERROR,
  null,
];

/** One ripgrep run per exit status, over the same generated output. */
export interface GeneratedRipgrepRunCase {
  readonly exitCode: number | null;
  readonly result: TranscriptLocatorRunResult;
  readonly printedPaths: readonly string[];
}

export function arbitraryRipgrepRunCases(): fc.Arbitrary<readonly GeneratedRipgrepRunCase[]> {
  return fc
    .tuple(
      arbitraryRipgrepPathList(),
      fc.string({ unit: "grapheme", maxLength: MAX_LOCATOR_STDERR_GRAPHEMES }),
    )
    .map(([pathList, stderr]) =>
      RIPGREP_RUN_EXIT_STATUSES.map((exitCode) => ({
        exitCode,
        result: { exitCode, stdout: pathList.stdout, stderr },
        printedPaths: pathList.paths,
      }))
    );
}

/** A two-file store: one transcript's text carries the needle, the other's does not. */
export interface GeneratedLocatorStoreCase {
  readonly needle: string;
  readonly hitContent: string;
  readonly missContent: string;
  readonly hitFileName: string;
  readonly missFileName: string;
}

export function arbitraryLocatorStoreCase(): fc.Arbitrary<GeneratedLocatorStoreCase> {
  return fc
    .tuple(
      arbitraryAgentSearchNeedle(),
      arbitraryTranscriptNeedleCase(),
      arbitraryTranscriptNeedleCase(),
      fc.uuid(),
      fc.uuid(),
    )
    .map(([needle, hit, miss, hitId, missId]) => ({
      needle,
      hitContent: `${hit.content}${needle}${miss.content}`,
      missContent: [hit.content, miss.content].join("").split(needle).join(""),
      hitFileName: `${STORE_FILE_NAME_PREFIX}${hitId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
      missFileName: `${STORE_FILE_NAME_PREFIX}${missId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
    }))
    .filter((storeCase) => !storeCase.missContent.includes(storeCase.needle));
}
