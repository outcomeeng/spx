import fc from "fast-check";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { CHANGE_DRAFT } from "@/lib/change-drafts/contract";

export function arbitraryDraftText(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.string({ unit: "grapheme", maxLength: 512 }),
    fc.tuple(fc.string(), fc.string()).map(([title, body]) => `---\ntitle: ${title}\n---\n${body}\r\n\0`),
    fc.constant(""),
  );
}

export function arbitraryUnsafeDraftDirectory(): fc.Arbitrary<{ text: string; mode: number }> {
  return fc.record({
    text: arbitraryDraftText(),
    mode: fc.integer({ min: 1, max: CHANGE_DRAFT.permissionMask ^ CHANGE_DRAFT.directoryMode })
      .map((permissions) => CHANGE_DRAFT.directoryMode | permissions),
  });
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

export interface InvalidDraftCommand {
  readonly args: string[];
  readonly diagnosticTokens: string[];
}

function arbitraryInvalidDraftCommands() {
  return fc.string({ maxLength: 32 }).map((suffix) => ({
    missingInput: {
      args: [CHANGE_COMMAND.name, CHANGE_COMMAND.draft, CHANGE_COMMAND.operations.create],
      diagnosticTokens: ["required option", CHANGE_COMMAND.inputOption],
    },
    missingId: {
      args: [CHANGE_COMMAND.name, CHANGE_COMMAND.draft, CHANGE_COMMAND.operations.delete],
      diagnosticTokens: ["missing required argument", CHANGE_COMMAND.idOperand.slice(1, -1)],
    },
    unsupportedInput: {
      args: [
        CHANGE_COMMAND.name,
        CHANGE_COMMAND.draft,
        CHANGE_COMMAND.operations.create,
        CHANGE_COMMAND.inputOption,
        `${CHANGE_COMMAND.stdin}!${suffix}`,
      ],
      diagnosticTokens: [CHANGE_COMMAND.inputOption, "Allowed choices", CHANGE_COMMAND.stdin],
    },
    unknownChangeCommand: {
      args: [CHANGE_COMMAND.name, `unknown-${suffix}`],
      diagnosticTokens: ["unknown command", `unknown-${suffix}`],
    },
    unknownDraftCommand: {
      args: [CHANGE_COMMAND.name, CHANGE_COMMAND.draft, `unknown-${suffix}`],
      diagnosticTokens: ["unknown command", `unknown-${suffix}`],
    },
  } satisfies Record<string, InvalidDraftCommand>));
}

export const INVALID_DRAFT_COMMAND_GENERATORS = {
  missingInput: () => arbitraryInvalidDraftCommands().map((commands) => commands.missingInput),
  missingId: () => arbitraryInvalidDraftCommands().map((commands) => commands.missingId),
  unsupportedInput: () => arbitraryInvalidDraftCommands().map((commands) => commands.unsupportedInput),
  unknownChangeCommand: () => arbitraryInvalidDraftCommands().map((commands) => commands.unknownChangeCommand),
  unknownDraftCommand: () => arbitraryInvalidDraftCommands().map((commands) => commands.unknownDraftCommand),
} as const;
