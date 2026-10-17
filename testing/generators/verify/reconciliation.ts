import * as fc from "fast-check";

import type { VerifyDriftedEntry, VerifyScopeReconciliationInput } from "@/domains/verify/reconciliation";
import { VERIFY_RECONCILIATION_INVENTORY } from "@/domains/verify/reconciliation";
import {
  buildAppendEvent,
  buildRunContextEvent,
  REVIEW_SCOPE_COVERAGE_STATE,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_CHANGE_KIND,
  VERIFY_DRIVE_MODE,
  VERIFY_EXPECTATIONS_FIELD,
  VERIFY_EXPECTATIONS_SCHEMA_VERSION,
  VERIFY_SCOPE_PAYLOAD_FIELD,
  type VerifyChangeInventoryEntry,
  type VerifyChangeKind,
  type VerifyExpectations,
} from "@/domains/verify/verify";
import { CLOUDEVENTS_SPECVERSION, type JournalEvent, type JournalEventInput } from "@/lib/agent-run-journal";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";

const MAX_CHANGE_ENTRIES = 6;
const MAX_ADDITIONAL_PATHS = 3;
const MAX_UNEXPECTED_PATHS = 3;
const MAX_RESOLVED_ONLY_ENTRIES = 3;
const MAX_SCOPE_EVENTS = 4;
const MAX_FINDING_EVENTS = 3;

const CHANGE_KINDS: readonly VerifyChangeKind[] = Object.values(VERIFY_CHANGE_KIND);
const OTHER_KIND: Readonly<Record<VerifyChangeKind, VerifyChangeKind>> = {
  [VERIFY_CHANGE_KIND.ADDED]: VERIFY_CHANGE_KIND.MODIFIED,
  [VERIFY_CHANGE_KIND.MODIFIED]: VERIFY_CHANGE_KIND.DELETED,
  [VERIFY_CHANGE_KIND.DELETED]: VERIFY_CHANGE_KIND.ADDED,
  [VERIFY_CHANGE_KIND.COPY_SOURCE]: VERIFY_CHANGE_KIND.MODIFIED,
};

/** How a run's judged scope treats one expected path: judged as the kind of evidence that accounts for it, not judged, or judged as the other kind of evidence. */
const JUDGMENT = {
  ACCOUNTED: "accounted",
  UNJUDGED: "unjudged",
  MISJUDGED: "misjudged",
} as const;
type Judgment = (typeof JUDGMENT)[keyof typeof JUDGMENT];
const JUDGMENTS: readonly Judgment[] = Object.values(JUDGMENT);

/** How the inventory the selector resolves to treats one recorded entry. */
const RESOLUTION = {
  KEPT: "kept",
  DROPPED: "dropped",
  RECLASSIFIED: "reclassified",
} as const;
type Resolution = (typeof RESOLUTION)[keyof typeof RESOLUTION];
const RESOLUTIONS: readonly Resolution[] = Object.values(RESOLUTION);

/** The reconciliation result a scenario's construction fixes. */
export interface ReconciliationExpectedResult {
  readonly unaccounted: readonly string[];
  readonly unexpected: readonly string[];
  readonly drifted: readonly VerifyDriftedEntry[];
  readonly reconciled: boolean;
}

/** One reconciliation input and the result its construction fixes. */
export interface ReconciliationScenario {
  readonly input: VerifyScopeReconciliationInput;
  readonly expected: ReconciliationExpectedResult;
}

/** One reconciliation scenario beside the same four inputs reordered, with judged paths repeated. */
export interface ReconciliationDeterminismScenario extends ReconciliationScenario {
  readonly variant: VerifyScopeReconciliationInput;
}

/** One reconciliation scenario beside two journal histories that record the same run evidence differently. */
export interface ReconciliationHistoriesScenario extends ReconciliationScenario {
  readonly single: readonly JournalEvent[];
  readonly split: readonly JournalEvent[];
}

/** A reconciliation input whose bound expectations draw additional paths over a recorded inventory. */
export interface ReconciliationExpectationsScenario {
  readonly recordedInventory: readonly VerifyChangeInventoryEntry[];
  readonly expectations: VerifyExpectations;
  readonly judgedPaths: readonly string[];
  readonly judgedDeletions: readonly string[];
}

interface ScenarioShape {
  readonly entries: readonly {
    readonly kind: VerifyChangeKind;
    readonly judgment: Judgment;
    readonly resolution: Resolution;
  }[];
  readonly additional: readonly Judgment[];
  readonly unexpectedCount: number;
  readonly resolvedOnly: readonly VerifyChangeKind[];
}

const ORDINAL = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function arbitraryShape(): fc.Arbitrary<ScenarioShape> {
  return fc.record({
    entries: fc.array(
      fc.record({
        kind: fc.constantFrom(...CHANGE_KINDS),
        judgment: fc.constantFrom(...JUDGMENTS),
        resolution: fc.constantFrom(...RESOLUTIONS),
      }),
      { maxLength: MAX_CHANGE_ENTRIES },
    ),
    additional: fc.array(fc.constantFrom(...JUDGMENTS), { maxLength: MAX_ADDITIONAL_PATHS }),
    unexpectedCount: fc.integer({ min: 0, max: MAX_UNEXPECTED_PATHS }),
    resolvedOnly: fc.array(fc.constantFrom(...CHANGE_KINDS), { maxLength: MAX_RESOLVED_ONLY_ENTRIES }),
  });
}

function shuffled<T>(items: readonly T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray([...items], { minLength: items.length, maxLength: items.length });
}

function shapePathCount(shape: ScenarioShape): number {
  return shape.entries.length + shape.additional.length + shape.unexpectedCount + shape.resolvedOnly.length;
}

interface BuiltScenario {
  readonly recordedInventory: readonly VerifyChangeInventoryEntry[];
  readonly additionalPaths: readonly string[];
  readonly judgedPaths: readonly string[];
  readonly judgedDeletions: readonly string[];
  readonly resolvedInventory: readonly VerifyChangeInventoryEntry[];
  readonly expected: ReconciliationExpectedResult;
}

function buildScenario(shape: ScenarioShape, paths: readonly string[]): BuiltScenario {
  let cursor = 0;
  const take = (): string => paths[cursor++];
  const recordedInventory: VerifyChangeInventoryEntry[] = [];
  const resolvedInventory: VerifyChangeInventoryEntry[] = [];
  const judgedPaths: string[] = [];
  const judgedDeletions: string[] = [];
  const unaccounted: string[] = [];
  const drifted: VerifyDriftedEntry[] = [];

  const judge = (path: string, judgment: Judgment, accountingDeletion: boolean): void => {
    if (judgment === JUDGMENT.UNJUDGED) {
      unaccounted.push(path);
      return;
    }
    const accounting = judgment === JUDGMENT.ACCOUNTED;
    if (accounting !== accountingDeletion) judgedPaths.push(path);
    else judgedDeletions.push(path);
    if (!accounting) unaccounted.push(path);
  };

  for (const entry of shape.entries) {
    const path = take();
    const recorded = { path, changeKind: entry.kind };
    recordedInventory.push(recorded);
    judge(path, entry.judgment, entry.kind === VERIFY_CHANGE_KIND.DELETED);
    if (entry.resolution === RESOLUTION.KEPT) {
      resolvedInventory.push(recorded);
    } else {
      drifted.push({ ...recorded, inventory: VERIFY_RECONCILIATION_INVENTORY.RECORDED });
      if (entry.resolution === RESOLUTION.RECLASSIFIED) {
        const reclassified = { path, changeKind: OTHER_KIND[entry.kind] };
        resolvedInventory.push(reclassified);
        drifted.push({ ...reclassified, inventory: VERIFY_RECONCILIATION_INVENTORY.RESOLVED });
      }
    }
  }
  const additionalPaths = shape.additional.map((judgment) => {
    const path = take();
    judge(path, judgment, false);
    return path;
  });
  const unexpected = Array.from({ length: shape.unexpectedCount }, (_, index) => {
    const path = take();
    (index % 2 === 0 ? judgedPaths : judgedDeletions).push(path);
    return path;
  });
  for (const kind of shape.resolvedOnly) {
    const entry = { path: take(), changeKind: kind };
    resolvedInventory.push(entry);
    drifted.push({ ...entry, inventory: VERIFY_RECONCILIATION_INVENTORY.RESOLVED });
  }

  const sortedDrift = [...drifted].sort((left, right) =>
    ORDINAL(left.path, right.path) || ORDINAL(left.changeKind, right.changeKind)
    || ORDINAL(left.inventory, right.inventory)
  );
  const sortedUnaccounted = [...unaccounted].sort(ORDINAL);
  const sortedUnexpected = [...unexpected].sort(ORDINAL);
  return {
    recordedInventory,
    additionalPaths,
    judgedPaths,
    judgedDeletions,
    resolvedInventory,
    expected: {
      unaccounted: sortedUnaccounted,
      unexpected: sortedUnexpected,
      drifted: sortedDrift,
      reconciled: sortedUnaccounted.length === 0 && sortedUnexpected.length === 0 && sortedDrift.length === 0,
    },
  };
}

function expectationsOf(additionalPaths: readonly string[]): VerifyExpectations {
  return {
    [VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION]: VERIFY_EXPECTATIONS_SCHEMA_VERSION,
    [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: [...additionalPaths],
  };
}

function arbitraryBuiltScenario(): fc.Arbitrary<BuiltScenario> {
  return arbitraryShape().chain((shape) =>
    fc
      .uniqueArray(arbitrarySourceFilePath(), { minLength: shapePathCount(shape), maxLength: shapePathCount(shape) })
      .map((paths) => buildScenario(shape, paths))
  );
}

function inputOf(
  built: BuiltScenario,
  lists: {
    readonly recordedInventory: readonly VerifyChangeInventoryEntry[];
    readonly judgedPaths: readonly string[];
    readonly judgedDeletions: readonly string[];
    readonly resolvedInventory: readonly VerifyChangeInventoryEntry[];
  },
): VerifyScopeReconciliationInput {
  return { ...lists, expectations: expectationsOf(built.additionalPaths) };
}

function arbitraryRepeated<T>(items: readonly T[]): fc.Arbitrary<T[]> {
  return fc.subarray([...items]).chain((repeats) => shuffled([...items, ...repeats]));
}

function arbitraryScenario(): fc.Arbitrary<ReconciliationScenario> {
  return arbitraryBuiltScenario().chain((built) =>
    fc
      .tuple(
        shuffled(built.recordedInventory),
        shuffled(built.judgedPaths),
        shuffled(built.judgedDeletions),
        shuffled(built.resolvedInventory),
      )
      .map(([recordedInventory, judgedPaths, judgedDeletions, resolvedInventory]) => ({
        input: inputOf(built, { recordedInventory, judgedPaths, judgedDeletions, resolvedInventory }),
        expected: built.expected,
      }))
  );
}

function arbitraryDeterminismScenario(): fc.Arbitrary<ReconciliationDeterminismScenario> {
  return arbitraryBuiltScenario().chain((built) =>
    fc
      .tuple(
        shuffled(built.recordedInventory),
        shuffled(built.judgedPaths),
        shuffled(built.judgedDeletions),
        shuffled(built.resolvedInventory),
        shuffled(built.recordedInventory),
        arbitraryRepeated(built.judgedPaths),
        arbitraryRepeated(built.judgedDeletions),
        shuffled(built.resolvedInventory),
      )
      .map((
        [recorded, files, deletions, resolved, recordedVariant, filesVariant, deletionsVariant, resolvedVariant],
      ) => ({
        input: inputOf(built, {
          recordedInventory: recorded,
          judgedPaths: files,
          judgedDeletions: deletions,
          resolvedInventory: resolved,
        }),
        variant: inputOf(built, {
          recordedInventory: recordedVariant,
          judgedPaths: filesVariant,
          judgedDeletions: deletionsVariant,
          resolvedInventory: resolvedVariant,
        }),
        expected: built.expected,
      }))
  );
}

const HISTORY_RUN_TOKEN = "reconciliation-run";
const HISTORY_EVENT_SOURCE = "reconciliation-history";
const HISTORY_STREAM_ID = "reconciliation-stream";
const HISTORY_EPOCH_MS = 0;
const HISTORY_EVENT_INTERVAL_MS = 1_000;
const HISTORY_FIRST_SEQUENCE = 1;

function recordedAt(index: number): Date {
  return new Date(HISTORY_EPOCH_MS + index * HISTORY_EVENT_INTERVAL_MS);
}

function journalEventsOf(inputs: readonly JournalEventInput[]): readonly JournalEvent[] {
  return inputs.map((input, index) => ({
    ...input,
    specversion: CLOUDEVENTS_SPECVERSION,
    streamid: HISTORY_STREAM_ID,
    runid: HISTORY_RUN_TOKEN,
    seq: HISTORY_FIRST_SEQUENCE + index,
  }));
}

function scopeEventInput(
  index: number,
  judgedPaths: readonly string[],
  judgedDeletions: readonly string[],
  coverageState: string,
): JournalEventInput {
  return {
    ...buildAppendEvent({
      eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
      idempotencyKey: `${HISTORY_EVENT_SOURCE}-scope-${index}`,
      payload: {
        coverageState,
        ...(judgedPaths.length === 0 ? {} : { [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [...judgedPaths] }),
        ...(judgedDeletions.length === 0
          ? {}
          : { [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_DELETIONS]: [...judgedDeletions] }),
      },
      at: recordedAt(index),
    }),
  };
}

function findingEventInput(index: number): JournalEventInput {
  return buildAppendEvent({
    eventType: VERIFY_APPEND_EVENT_TYPE.FINDING,
    idempotencyKey: `${HISTORY_EVENT_SOURCE}-finding-${index}`,
    payload: { index },
    at: recordedAt(index),
  });
}

function runContextEventInput(built: BuiltScenario): JournalEventInput {
  return buildRunContextEvent({
    runToken: HISTORY_RUN_TOKEN,
    driveMode: VERIFY_DRIVE_MODE.CALLER,
    changeInventory: built.recordedInventory,
    expectations: expectationsOf(built.additionalPaths),
    at: recordedAt(0),
  });
}

function arbitrarySplitScopeEvents(built: BuiltScenario): fc.Arbitrary<JournalEventInput[]> {
  const coverageStates = Object.values(REVIEW_SCOPE_COVERAGE_STATE);
  return fc
    .tuple(
      fc.array(fc.constantFrom(...coverageStates), { minLength: 1, maxLength: MAX_SCOPE_EVENTS }),
      arbitraryRepeated(built.judgedPaths),
      arbitraryRepeated(built.judgedDeletions),
      fc.array(fc.nat({ max: MAX_SCOPE_EVENTS - 1 }), { maxLength: built.judgedPaths.length * 2 + 2 }),
    )
    .map(([states, files, deletions, assignments]) => {
      const chunks = states.map(() => ({ files: [] as string[], deletions: [] as string[] }));
      const slotOf = (position: number): number =>
        (assignments[position % Math.max(assignments.length, 1)] ?? position) % chunks.length;
      files.forEach((path, position) => chunks[slotOf(position)].files.push(path));
      deletions.forEach((path, position) => chunks[slotOf(position + files.length)].deletions.push(path));
      return chunks.map((chunk, index) => scopeEventInput(index + 1, chunk.files, chunk.deletions, states[index]));
    });
}

function arbitraryHistoriesScenario(): fc.Arbitrary<ReconciliationHistoriesScenario> {
  return arbitraryBuiltScenario().chain((built) =>
    fc
      .tuple(
        arbitrarySplitScopeEvents(built),
        fc.constantFrom(...Object.values(REVIEW_SCOPE_COVERAGE_STATE)),
        fc.integer({ min: 0, max: MAX_FINDING_EVENTS }),
        shuffled(built.resolvedInventory),
      )
      .chain(([splitScopes, singleState, findingCount, resolvedInventory]) =>
        shuffled([
          ...splitScopes,
          ...Array.from({ length: findingCount }, (_, index) => findingEventInput(MAX_SCOPE_EVENTS + 1 + index)),
        ]).map((splitBody) => ({
          input: inputOf(built, {
            recordedInventory: built.recordedInventory,
            judgedPaths: built.judgedPaths,
            judgedDeletions: built.judgedDeletions,
            resolvedInventory,
          }),
          expected: built.expected,
          single: journalEventsOf([
            runContextEventInput(built),
            scopeEventInput(1, built.judgedPaths, built.judgedDeletions, singleState),
          ]),
          split: journalEventsOf([runContextEventInput(built), ...splitBody]),
        }))
      )
  );
}

function arbitraryExpectationsScenario(): fc.Arbitrary<ReconciliationExpectationsScenario> {
  return arbitraryBuiltScenario().chain((built) =>
    fc.tuple(fc.subarray([...built.recordedInventory.map((entry) => entry.path)]), shuffled(built.judgedPaths)).map((
      [overlapping, judgedPaths],
    ) => ({
      recordedInventory: built.recordedInventory,
      expectations: expectationsOf([...built.additionalPaths, ...overlapping]),
      judgedPaths,
      judgedDeletions: built.judgedDeletions,
    }))
  );
}

/** Generators of the reconciliation domain: inputs with the result their construction fixes. */
export const RECONCILIATION_TEST_GENERATOR = {
  scenario: arbitraryScenario,
  determinismScenario: arbitraryDeterminismScenario,
  historiesScenario: arbitraryHistoriesScenario,
  expectationsScenario: arbitraryExpectationsScenario,
} as const;
