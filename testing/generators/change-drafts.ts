import fc from "fast-check";
import { constants as fsConstants } from "node:fs";

import { DRAFT_COMMAND } from "@/commands/draft/contract";

const KIND_MAX_TAIL = 15;
const KIND_HEAD = "abcdefghijklmnopqrstuvwxyz".split("");
const KIND_TAIL = [...KIND_HEAD, ..."0123456789-".split("")];
const DRAFT_BATCH = { minLength: 2, maxLength: 5 } as const;
const MILLISECOND_RANGE = { min: 1, max: 2 ** 40 } as const;

/** A kind in the kind grammar: a lowercase letter, then lowercase letters, digits, and hyphens. */
export function arbitraryDraftKind(): fc.Arbitrary<string> {
  return fc.tuple(
    fc.constantFrom(...KIND_HEAD),
    fc.array(fc.constantFrom(...KIND_TAIL), { maxLength: KIND_MAX_TAIL }),
  ).map(([head, tail]) => `${head}${tail.join("")}`);
}

/** A value outside the kind grammar, each built to break one clause of it. */
export function arbitraryInvalidDraftKind(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    arbitraryDraftKind().map((kind) => kind.toUpperCase()).filter((kind) => kind !== kind.toLowerCase()),
    fc.tuple(fc.integer({ min: 0, max: 9 }), arbitraryDraftKind()).map(([digit, kind]) => `${digit}${kind}`),
    arbitraryDraftKind().map((kind) => `-${kind}`),
    arbitraryDraftKind().map((kind) => `../${kind}`),
    fc.tuple(arbitraryDraftKind(), arbitraryDraftKind()).map(([parent, child]) => `${parent}/${child}`),
    fc.tuple(arbitraryDraftKind(), fc.constantFrom("_", ".", " ", "\t", "\u0007")).map(([kind, bad]) =>
      `${kind}${bad}`
    ),
  );
}

/** Text a caller writes into the one file of a draft. */
export function arbitraryDraftContent(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.string({ unit: "grapheme", maxLength: 512 }),
    fc.tuple(fc.string(), fc.string()).map(([title, body]) => `---\ntitle: ${title}\n---\n${body}\r\n\0`),
  );
}

export function arbitraryDraftId(): fc.Arbitrary<string> {
  return fc.uuid({ version: 7 });
}

/** Lowercase UUIDs of every version but 7. */
export function arbitraryNonV7Uuid(): fc.Arbitrary<string> {
  return fc.uuid({ version: [1, 2, 3, 4, 5, 6, 8] });
}

function arbitraryPathLikeDraftId(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryDraftId().map((id) => `../${id}`),
    arbitraryDraftId().map((id) => `/${id}`),
    arbitraryDraftId().map((id) => `${id}/child`),
  );
}

export function arbitraryInvalidDraftId(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.string({ maxLength: 35 }),
    arbitraryPathLikeDraftId(),
    arbitraryNonV7Uuid(),
    arbitraryDraftId().map((id) => id.toUpperCase()),
  );
}

export function arbitraryCliInvalidDraftId(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryPathLikeDraftId(),
    arbitraryNonV7Uuid(),
    fc.tuple(arbitraryDraftId(), fc.integer({ min: 1, max: 31 }))
      .map(([id, control]) => `!${id}${String.fromCodePoint(control)}`),
  );
}

export function arbitraryUnsafeDraftDirectory(): fc.Arbitrary<{ kind: string; mode: number }> {
  return fc.record({
    kind: arbitraryDraftKind(),
    mode: fc.integer({ min: 1, max: fsConstants.S_IRWXG | fsConstants.S_IRWXO })
      .map((groupOrOtherPermissions) => fsConstants.S_IRWXU | groupOrOtherPermissions),
  });
}

/** Two to five kinds, drawn with repeats so several drafts share a kind. */
export function arbitraryKindBatch(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryDraftKind(), { minLength: 1, maxLength: 3 }).chain((pool) =>
    fc.array(fc.constantFrom(...pool), DRAFT_BATCH)
  );
}

/** A strictly increasing sequence of distinct milliseconds. */
export function arbitraryDistinctMilliseconds(): fc.Arbitrary<number[]> {
  return fc.uniqueArray(fc.integer(MILLISECOND_RANGE), DRAFT_BATCH).map((values) =>
    [...values].sort((left, right) => left - right)
  );
}

export function arbitraryListLimit(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 4 });
}

export interface InvalidDraftCommand {
  readonly args: string[];
}

export function arbitraryInvalidDraftCommand(): fc.Arbitrary<InvalidDraftCommand> {
  const { name, operations } = DRAFT_COMMAND;
  return fc.tuple(arbitraryDraftKind(), arbitraryDraftId(), fc.string({ maxLength: 16 }), fc.integer({ max: 0 }))
    .chain(([kind, id, suffix, nonPositive]) =>
      fc.constantFrom<InvalidDraftCommand>(
        { args: [name, operations.create] },
        { args: [name, operations.delete, id] },
        { args: [name, operations.create, DRAFT_COMMAND.kindOption, kind, "--input", `stdin${suffix}`] },
        { args: [name, operations.list, DRAFT_COMMAND.limitOption, String(nonPositive)] },
        { args: [name, operations.list, DRAFT_COMMAND.limitOption, `x${suffix}`] },
        { args: [name, operations.list, DRAFT_COMMAND.limitOption, "1", DRAFT_COMMAND.allOption] },
        { args: [name, operations.delete, DRAFT_COMMAND.kindOption, kind] },
        { args: [name, `unknown-${suffix}`] },
      )
    );
}

/** The invocations of the retired `spx change` command group. */
export function retiredChangeInvocations(): string[][] {
  return [["change"], ["change", "draft"]];
}

export interface ListSelectionStore {
  readonly kinds: readonly [string, string];
  readonly limit: number;
  readonly perKind: number;
  readonly firstMillisecond: number;
}

/** Two distinct kinds, each holding more drafts than the default list bound, and a smaller limit. */
export function arbitraryListSelectionStore(defaultBound: number): fc.Arbitrary<ListSelectionStore> {
  return fc.record({
    kinds: fc.uniqueArray(arbitraryDraftKind(), { minLength: 2, maxLength: 2 })
      .map(([first, second]) => [first, second] as const),
    limit: fc.integer({ min: 1, max: defaultBound - 1 }),
    perKind: fc.integer({ min: defaultBound + 1, max: defaultBound + 3 }),
    firstMillisecond: fc.integer(MILLISECOND_RANGE),
  });
}
