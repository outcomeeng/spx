import * as fc from "fast-check";
import { join } from "node:path";

import { COMPACT_MARKER, COMPACT_RECORD_FIELDS, COMPACT_STORE_PATH } from "@/domains/compact";
import { STATE_STORE_DOMAIN, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";

import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const SAMPLE_SEED = 0xC0A7;
const NODE_SEGMENT_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"] as const;
const scopeToken = STATE_STORE_TEST_GENERATOR.scopeToken;

function stringFromCharacters(
  characters: readonly string[],
  options: { readonly minLength: number; readonly maxLength: number },
): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...characters), options).map((chars) => chars.join(""));
}

function nodeSegment(): fc.Arbitrary<string> {
  return stringFromCharacters(NODE_SEGMENT_CHARACTERS, { minLength: 1, maxLength: 20 });
}

function nodePath(): fc.Arbitrary<string> {
  return fc.array(nodeSegment(), { minLength: 1, maxLength: 4 }).map((segments) => `spx/${segments.join("/")}`);
}

type CompactExpectedRecord = Readonly<Record<string, unknown>>;

export type GeneratedCompactTranscriptScenario = {
  readonly transcript: string;
  readonly expectedRecord: CompactExpectedRecord | undefined;
};

export type GeneratedCompactRecordScenario = {
  readonly sessionToken: string;
  readonly transcriptFileName: string;
  readonly transcript: string;
  readonly expectedRecord: CompactExpectedRecord;
};

export type GeneratedCompactMissingFoundationStoreScenario = {
  readonly sessionToken: string;
  readonly transcriptFileName: string;
  readonly transcript: string;
};

export type GeneratedCompactLatestRecordScenario = GeneratedCompactRecordScenario & {
  readonly commitMessage: string;
  readonly firstTranscript: string;
  readonly latestTranscript: string;
};

export type GeneratedCompactOverrideScenario = GeneratedCompactRecordScenario & {
  readonly environmentSessionToken: string;
};

export type GeneratedCompactPathScenario = {
  readonly sessionToken: string;
  readonly paths: readonly {
    readonly scopeDir: string;
    readonly expectedPath: string;
  }[];
};

function escapedMarker(node: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}${node}${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}`;
}

function unescapedMarker(node: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}${node}${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}`;
}

function jsonlStringRecord(content: string): string {
  return JSON.stringify({ content });
}

function jsonlNestedStringRecord(content: string): string {
  return jsonlStringRecord(JSON.stringify({ content }));
}

function transcriptJsonl(lines: readonly string[]): string {
  return lines.map(jsonlStringRecord).join("\n");
}

function expectedRecord(node: string): CompactExpectedRecord {
  return {
    [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
    [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
  };
}

function transcriptScenario(
  marker: (node: string) => string,
  nested: boolean,
): fc.Arbitrary<GeneratedCompactTranscriptScenario> {
  return distinctNodePaths().map(([firstNode, latestNode]) => {
    const record = nested ? jsonlNestedStringRecord : jsonlStringRecord;
    return {
      transcript: [
        jsonlStringRecord(COMPACT_MARKER.FOUNDATION),
        record(marker(firstNode)),
        record(marker(latestNode)),
      ].join("\n"),
      expectedRecord: expectedRecord(latestNode),
    };
  });
}

function nonStringMarkerScenario(): fc.Arbitrary<GeneratedCompactTranscriptScenario> {
  return nodePath().map((node) => ({
    transcript: JSON.stringify({
      [COMPACT_MARKER.FOUNDATION]: true,
      [unescapedMarker(node)]: true,
    }),
    expectedRecord: undefined,
  }));
}

function missingFoundationScenario(): fc.Arbitrary<GeneratedCompactTranscriptScenario> {
  return nodePath().map((node) => ({
    transcript: jsonlStringRecord(escapedMarker(node)),
    expectedRecord: undefined,
  }));
}

function missingFoundationStoreScenario(): fc.Arbitrary<GeneratedCompactMissingFoundationStoreScenario> {
  return fc
    .record({
      sessionToken: scopeToken(),
      transcriptFileName: transcriptFileName(),
      node: nodePath(),
    })
    .map(({ sessionToken, transcriptFileName, node }) => ({
      sessionToken,
      transcriptFileName,
      transcript: transcriptJsonl([unescapedMarker(node)]),
    }));
}

function recordScenario(token: fc.Arbitrary<string> = scopeToken()): fc.Arbitrary<GeneratedCompactRecordScenario> {
  return fc
    .record({
      sessionToken: token,
      transcriptFileName: transcriptFileName(),
      node: nodePath(),
    })
    .map(({ sessionToken, transcriptFileName, node }) => ({
      sessionToken,
      transcriptFileName,
      transcript: transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]),
      expectedRecord: expectedRecord(node),
    }));
}

function latestRecordScenario(): fc.Arbitrary<GeneratedCompactLatestRecordScenario> {
  return fc
    .record({
      sessionToken: scopeToken(),
      transcriptFileName: transcriptFileName(),
      commitMessage: STATE_STORE_TEST_GENERATOR.branchIdentity(),
      nodes: distinctNodePaths(),
    })
    .map(({ sessionToken, transcriptFileName, commitMessage, nodes: [firstNode, latestNode] }) => ({
      sessionToken,
      transcriptFileName,
      commitMessage,
      transcript: transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(latestNode)]),
      firstTranscript: transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(firstNode)]),
      latestTranscript: transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(latestNode)]),
      expectedRecord: expectedRecord(latestNode),
    }));
}

function overrideScenario(): fc.Arbitrary<GeneratedCompactOverrideScenario> {
  return fc
    .tuple(recordScenario(), distinctSessionTokens())
    .map(([scenario, [explicitSessionToken, environmentSessionToken]]) => ({
      ...scenario,
      sessionToken: explicitSessionToken,
      environmentSessionToken,
    }));
}

function pathScenario(scopeDirs: readonly string[]): fc.Arbitrary<GeneratedCompactPathScenario> {
  return scopeToken().map((sessionToken) => ({
    sessionToken,
    paths: scopeDirs.map((scopeDir) => ({
      scopeDir,
      expectedPath: join(scopeDir, sessionToken, STATE_STORE_DOMAIN.COMPACT, COMPACT_STORE_PATH.STASH_FILE),
    })),
  }));
}

function compactStashFilePath(productDir: string, sessionToken: string): string {
  return join(
    productDir,
    STATE_STORE_SCOPE_PATH.SPX_DIR,
    STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
    sessionToken,
    STATE_STORE_DOMAIN.COMPACT,
    COMPACT_STORE_PATH.STASH_FILE,
  );
}

function distinctNodePaths(): fc.Arbitrary<readonly [string, string]> {
  return fc.tuple(nodePath(), nodePath()).filter(([first, second]) => first !== second);
}

function distinctSessionTokens(): fc.Arbitrary<readonly [string, string]> {
  return fc.tuple(scopeToken(), scopeToken()).filter(([first, second]) => first !== second);
}

function transcriptFileName(): fc.Arbitrary<string> {
  return scopeToken().map((token) => `${token}.jsonl`);
}

export const COMPACT_TEST_GENERATOR = {
  sessionToken: scopeToken,
  unsafeSessionToken: STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker,
  commitMessage: STATE_STORE_TEST_GENERATOR.branchIdentity,
  nodePath,
  distinctNodePaths,
  distinctSessionTokens,
  transcriptFileName,
  escapedTranscriptScenario: (): fc.Arbitrary<GeneratedCompactTranscriptScenario> =>
    transcriptScenario(escapedMarker, false),
  unescapedTranscriptScenario: (): fc.Arbitrary<GeneratedCompactTranscriptScenario> =>
    transcriptScenario(unescapedMarker, false),
  nestedTranscriptScenario: (): fc.Arbitrary<GeneratedCompactTranscriptScenario> =>
    transcriptScenario(unescapedMarker, true),
  nonStringMarkerScenario,
  missingFoundationScenario,
  missingFoundationStoreScenario,
  recordScenario,
  unsafeRecordScenario: (): fc.Arbitrary<GeneratedCompactRecordScenario> =>
    recordScenario(STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker()),
  latestRecordScenario,
  overrideScenario,
  pathScenario,
  compactStashFilePath,
} as const;

export function sampleCompactTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Compact test generator returned no sample");
  return value;
}
