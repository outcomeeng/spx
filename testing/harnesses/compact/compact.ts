import { compactStashPath, extractCompactRecord } from "@/domains/compact";
import { resolveWorktreeScopeDir } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import { createSessionGitDeps, WORKTREE_KIND } from "@testing/harnesses/session/harness";

export type CompactRecordObservation = {
  readonly actual: ReturnType<typeof extractCompactRecord>;
  readonly expected: ReturnType<typeof extractCompactRecord>;
};

export type CompactPathObservation = {
  readonly actual: ReturnType<typeof compactStashPath>;
  readonly expected: string;
};

type SyncObservationConsumer<T> = (observation: T) => void;
type AsyncObservationConsumer<T> = (observation: T) => void | Promise<void>;

export function withEscapedTranscriptObservation(consume: SyncObservationConsumer<CompactRecordObservation>): void {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.escapedTranscriptScenario());
  consume({ actual: extractCompactRecord(scenario.transcript), expected: scenario.expectedRecord });
}

export function withUnescapedTranscriptObservation(
  consume: SyncObservationConsumer<CompactRecordObservation>,
): void {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.unescapedTranscriptScenario());
  consume({ actual: extractCompactRecord(scenario.transcript), expected: scenario.expectedRecord });
}

export function withNestedTranscriptObservation(consume: SyncObservationConsumer<CompactRecordObservation>): void {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nestedTranscriptScenario());
  consume({ actual: extractCompactRecord(scenario.transcript), expected: scenario.expectedRecord });
}

export function withNonStringMarkerObservation(consume: SyncObservationConsumer<CompactRecordObservation>): void {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nonStringMarkerScenario());
  consume({ actual: extractCompactRecord(scenario.transcript), expected: scenario.expectedRecord });
}

export function withMissingFoundationObservation(consume: SyncObservationConsumer<CompactRecordObservation>): void {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.missingFoundationScenario());
  consume({ actual: extractCompactRecord(scenario.transcript), expected: scenario.expectedRecord });
}

export async function forEachCompactPathObservation(
  consume: AsyncObservationConsumer<CompactPathObservation>,
): Promise<void> {
  const mainCheckoutScope = await resolveWorktreeScopeDir({
    deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
  });
  const nonMainScope = await resolveWorktreeScopeDir({
    deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
  });
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.pathScenario([mainCheckoutScope, nonMainScope]));
  for (const path of scenario.paths) {
    await consume({
      actual: compactStashPath(path.scopeDir, scenario.sessionToken),
      expected: path.expectedPath,
    });
  }
}
