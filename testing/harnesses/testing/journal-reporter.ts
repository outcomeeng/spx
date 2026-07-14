import { expect } from "vitest";

import type {
  TestFinding,
  TestRunEvidenceSink,
  TestScopeUnit,
  VitestRunStarter,
  VitestRunStartOptions,
} from "@/test/languages/journal-reporter";

/** One recorded append against a recording evidence sink, preserving invocation order. */
export type RecordedSinkCall =
  | { readonly kind: "scope"; readonly unit: TestScopeUnit }
  | { readonly kind: "finding"; readonly finding: TestFinding };

/** A recording evidence sink: implements the reporter's port and records every append (Stage 5 exception 6: observability). */
export interface RecordingEvidenceSink extends TestRunEvidenceSink {
  readonly calls: readonly RecordedSinkCall[];
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
}

/** Builds a fresh in-memory recording evidence sink that records calls and performs no I/O. */
export function createRecordingEvidenceSink(): RecordingEvidenceSink {
  const calls: RecordedSinkCall[] = [];
  const scopes: TestScopeUnit[] = [];
  const findings: TestFinding[] = [];
  return {
    appendScope(unit: TestScopeUnit): void {
      scopes.push(unit);
      calls.push({ kind: "scope", unit });
    },
    appendFinding(finding: TestFinding): void {
      findings.push(finding);
      calls.push({ kind: "finding", finding });
    },
    get calls(): readonly RecordedSinkCall[] {
      return calls;
    },
    get scopes(): readonly TestScopeUnit[] {
      return scopes;
    },
    get findings(): readonly TestFinding[] {
      return findings;
    },
  };
}

/** A spy Vitest run-starter: records the options a journal-streaming run supplies without spawning Vitest. */
export interface SpyVitestRunStarter extends VitestRunStarter {
  readonly startedRuns: readonly VitestRunStartOptions[];
}

/** Builds a spy run-starter that records each `start` invocation and never spawns Vitest. */
export function createSpyVitestRunStarter(): SpyVitestRunStarter {
  const startedRuns: VitestRunStartOptions[] = [];
  return {
    start(options: VitestRunStartOptions): Promise<void> {
      startedRuns.push(options);
      return Promise.resolve();
    },
    get startedRuns(): readonly VitestRunStartOptions[] {
      return startedRuns;
    },
  };
}

/**
 * Asserts a fresh recording sink records the given scope and finding appends in
 * invocation order across both channels.
 */
export function assertRecordingSinkRecordsInOrder(
  scopes: readonly TestScopeUnit[],
  findings: readonly TestFinding[],
): void {
  const sink = createRecordingEvidenceSink();
  for (const unit of scopes) sink.appendScope(unit);
  for (const finding of findings) sink.appendFinding(finding);
  expect(sink.scopes).toEqual(scopes);
  expect(sink.findings).toEqual(findings);
  expect(sink.calls).toEqual([
    ...scopes.map((unit): RecordedSinkCall => ({ kind: "scope", unit })),
    ...findings.map((finding): RecordedSinkCall => ({ kind: "finding", finding })),
  ]);
}
