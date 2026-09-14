import { Option } from "commander";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { createDraftCommand, deleteDraftCommand, listDraftsCommand } from "@/commands/change/draft";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { externalValue, jsonDocument, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

async function readDraftInput(input: AsyncIterable<string | Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeDraftResult(invocation: CliInvocation, action: () => Promise<object>): Promise<void> {
  try {
    invocation.io.writeStdout(renderTerminalText(terminal`${jsonDocument(await action())}\n`));
  } catch (error) {
    invocation.io.writeStderr(
      renderTerminalText(terminal`${externalValue(error instanceof Error ? error.message : error)}\n`),
    );
    invocation.io.setExitCode(1);
  }
}

export function createChangeDomain(input: AsyncIterable<string | Uint8Array> = process.stdin): Domain {
  return {
    name: CHANGE_COMMAND.name,
    description: "Manage local Change drafts",
    register(program, invocation) {
      const draft = program.command(CHANGE_COMMAND.name)
        .description("Manage local Change drafts")
        .command(CHANGE_COMMAND.draft)
        .description("Create, list, and delete worktree-local Markdown drafts");
      draft.command(CHANGE_COMMAND.operations.create)
        .description("Retain draft text from stdin and return its file coordinates")
        .addOption(
          new Option(`${CHANGE_COMMAND.inputOption} <source>`, "Draft input source")
            .choices([CHANGE_COMMAND.stdin]).makeOptionMandatory(),
        )
        .allowExcessArguments(false)
        .action(async () =>
          writeDraftResult(invocation, async () =>
            createDraftCommand(
              { cwd: invocation.resolveEffectiveInvocationDir() },
              await readDraftInput(input),
            ))
        );
      draft.command(CHANGE_COMMAND.operations.list)
        .description("List retained draft coordinates without reading their contents")
        .allowExcessArguments(false)
        .action(async () =>
          writeDraftResult(invocation, () => listDraftsCommand({ cwd: invocation.resolveEffectiveInvocationDir() }))
        );
      draft.command(CHANGE_COMMAND.operations.delete)
        .description("Remove exactly one draft by its local ID")
        .argument(CHANGE_COMMAND.idOperand)
        .allowExcessArguments(false)
        .action(async (draftId: string) =>
          writeDraftResult(invocation, () =>
            deleteDraftCommand(
              { cwd: invocation.resolveEffectiveInvocationDir() },
              draftId,
            ))
        );
    },
  };
}

export const changeDomain: Domain = createChangeDomain();
