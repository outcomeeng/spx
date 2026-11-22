import { InvalidArgumentError, Option } from "commander";

import { DRAFT_COMMAND, type DraftListBound } from "@/commands/draft/contract";
import { createDraftCommand, deleteDraftCommand, listDraftsCommand } from "@/commands/draft/draft";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { ChangeDraftError } from "@/lib/change-drafts/contract";
import { externalValue, jsonDocument, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

const POSITIVE_INTEGER = /^[1-9]\d*$/u;

function parseLimit(value: string): number {
  if (!POSITIVE_INTEGER.test(value)) throw new InvalidArgumentError("expected a positive integer");
  return Number(value);
}

function failWith(invocation: CliInvocation, message: unknown): void {
  invocation.io.writeStderr(renderTerminalText(terminal`${externalValue(message)}\n`));
  invocation.io.setExitCode(1);
}

/** A draft error names its operation, its code, and the value or path it failed at as an external value. */
function failWithError(invocation: CliInvocation, error: unknown): void {
  if (error instanceof ChangeDraftError) {
    invocation.io.writeStderr(
      renderTerminalText(
        terminal`Draft ${externalValue(error.operation)} failed (${externalValue(error.code)}) at ${
          externalValue(error.path)
        }\n`,
      ),
    );
    invocation.io.setExitCode(1);
    return;
  }
  failWith(invocation, error instanceof Error ? error.message : error);
}

async function writeDraftResult(invocation: CliInvocation, action: () => Promise<object>): Promise<void> {
  try {
    invocation.io.writeStdout(renderTerminalText(terminal`${jsonDocument(await action())}\n`));
  } catch (error) {
    failWithError(invocation, error);
  }
}

function kindOption(): Option {
  return new Option(`${DRAFT_COMMAND.kindOption} ${DRAFT_COMMAND.kindValue}`, "Draft kind");
}

interface ListOptions {
  readonly kind?: string;
  readonly limit?: number;
  readonly all?: boolean;
}

/** `--all`, or `--kind` without `--limit`, emits every match; otherwise the limit or the default bound applies. */
function listBound(options: ListOptions): DraftListBound {
  if (options.limit !== undefined) return { all: false, limit: options.limit };
  if (options.all === true || options.kind !== undefined) return { all: true };
  return { all: false, limit: DRAFT_COMMAND.defaultListLimit };
}

export function createDraftDomain(): Domain {
  return {
    name: DRAFT_COMMAND.name,
    description: "Manage local drafts of caller-named kinds",
    register(program, invocation) {
      const draft = program.command(DRAFT_COMMAND.name)
        .description("Create, list, and delete local drafts shared by every worktree");
      draft.command(DRAFT_COMMAND.operations.create)
        .description("Create one empty draft file of a kind and return its coordinates")
        .addOption(kindOption().makeOptionMandatory())
        .allowExcessArguments(false)
        .action(async (options: { kind: string }) =>
          writeDraftResult(
            invocation,
            () => createDraftCommand({ cwd: invocation.resolveEffectiveInvocationDir() }, options.kind),
          )
        );
      draft.command(DRAFT_COMMAND.operations.list)
        .description(`List retained drafts newest first, the ${DRAFT_COMMAND.defaultListLimit} newest by default`)
        .addOption(kindOption())
        .addOption(
          new Option(`${DRAFT_COMMAND.limitOption} ${DRAFT_COMMAND.limitValue}`, "Emit at most this many drafts")
            .argParser(parseLimit)
            .conflicts("all"),
        )
        .addOption(new Option(DRAFT_COMMAND.allOption, "Emit every retained draft"))
        .allowExcessArguments(false)
        .action(async (options: ListOptions) =>
          writeDraftResult(invocation, () =>
            listDraftsCommand(
              { cwd: invocation.resolveEffectiveInvocationDir() },
              { kind: options.kind, bound: listBound(options) },
            ))
        );
      draft.command(DRAFT_COMMAND.operations.delete)
        .description("Remove exactly one draft of a kind by its local ID")
        .addOption(kindOption().makeOptionMandatory())
        .argument(DRAFT_COMMAND.idOperand)
        .allowExcessArguments(false)
        .action(async (draftId: string, options: { kind: string }) => {
          try {
            const deletion = await deleteDraftCommand(
              { cwd: invocation.resolveEffectiveInvocationDir() },
              options.kind,
              draftId,
            );
            if (!deletion.removed) {
              failWith(invocation, `No draft ${deletion.kind}${DRAFT_COMMAND.identitySeparator}${deletion.draftId}`);
              return;
            }
            invocation.io.writeStdout(renderTerminalText(terminal`${jsonDocument(deletion)}\n`));
          } catch (error) {
            failWithError(invocation, error);
          }
        });
    },
  };
}

export const draftDomain: Domain = createDraftDomain();
