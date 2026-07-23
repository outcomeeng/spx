import { compactStashPath, extractCompactRecord } from "@/domains/compact";
import { GIT_SHOW_TOPLEVEL_ARGS } from "@/lib/git/root";
import { resolveWorktreeScopeDir } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

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

export async function withCompactPathObservation(
  consume: AsyncObservationConsumer<CompactPathObservation>,
): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  await withGitWorktreeEnv(async ({ productDir, runGit }) => {
    const scopeDir = await resolveWorktreeScopeDir({ cwd: productDir });
    const worktreeRoot = await runGit(GIT_SHOW_TOPLEVEL_ARGS);
    await consume({
      actual: compactStashPath(scopeDir, sessionToken),
      expected: COMPACT_TEST_GENERATOR.compactStashFilePath(worktreeRoot, sessionToken),
    });
  });
}
