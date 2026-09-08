import fc from "fast-check";

import { CHANGE_COMMAND } from "@/commands/change/contract";

export function arbitraryDraftText(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.string({ unit: "grapheme", maxLength: 512 }),
    fc.tuple(fc.string(), fc.string()).map(([title, body]) => `---\ntitle: ${title}\n---\n${body}\r\n\0`),
    fc.constant(""),
  );
}

export function arbitraryDraftPair(): fc.Arbitrary<{ first: string; second: string }> {
  return fc.record({ first: arbitraryDraftText(), second: arbitraryDraftText() });
}

export function arbitraryDraftId(): fc.Arbitrary<string> {
  return fc.uuid();
}

export function arbitraryInvalidDraftId(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.string({ maxLength: 35 }),
    fc.uuid().map((id) => `../${id}`),
    fc.uuid().map((id) => `/${id}`),
    fc.uuid().map((id) => `${id}/child`),
  );
}

export function arbitraryCliInvalidDraftId(): fc.Arbitrary<string> {
  return fc.tuple(fc.uuid(), fc.integer({ min: 1, max: 31 }))
    .map(([id, control]) => `!${id}${String.fromCodePoint(control)}`);
}

export function arbitraryDraftBatch(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryDraftText(), { minLength: 2, maxLength: 5 });
}

export function arbitraryInvalidDraftCommands(): fc.Arbitrary<string[][]> {
  return fc.string({ maxLength: 32 }).map((suffix) => [
    [CHANGE_COMMAND.name, CHANGE_COMMAND.draft, CHANGE_COMMAND.operations.create],
    [CHANGE_COMMAND.name, CHANGE_COMMAND.draft, CHANGE_COMMAND.operations.delete],
    [
      CHANGE_COMMAND.name,
      CHANGE_COMMAND.draft,
      CHANGE_COMMAND.operations.create,
      CHANGE_COMMAND.inputOption,
      `${CHANGE_COMMAND.stdin}!${suffix}`,
    ],
    [CHANGE_COMMAND.name, `unknown-${suffix}`],
    [CHANGE_COMMAND.name, CHANGE_COMMAND.draft, `unknown-${suffix}`],
  ]);
}
