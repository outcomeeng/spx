import { Option } from "commander";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { createDraftCommand, deleteDraftCommand, listDraftsCommand } from "@/commands/change/draft";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

async function readDraftInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeDraftResult(invocation: CliInvocation, action: () => Promise<unknown>): Promise<void> {
  try {
    invocation.io.writeStdout(`${JSON.stringify(await action())}\n`);
  } catch (error) {
    invocation.io.writeStderr(renderTerminalText(terminal`${error instanceof Error ? error.message : error}\n`));
    invocation.io.setExitCode(1);
  }
}

export const changeDomain: Domain = {
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
            await readDraftInput(),
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
