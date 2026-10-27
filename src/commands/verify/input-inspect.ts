import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { defaultGitDependencies, detectGitCommonDirProductRoot, type GitDependencies } from "@/lib/git/root";
import {
  authoredText,
  externalValue,
  jsonDocument,
  renderTerminalText,
  terminal,
} from "@/lib/terminal-text/terminal-text";
import { inspectVerificationInput, type ListProductFiles, listProductFilesWithGit } from "@/lib/verification-input";

export const VERIFY_INPUT_INSPECT_ERROR = {
  REJECTED: "spx verification input inspect rejected the operand",
} as const;

export interface VerifyInputInspectCliOptions {
  /** The product file the caller names, as one positional operand. */
  readonly operand: string;
}

export interface VerifyInputInspectDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly listFiles?: ListProductFiles;
}

/**
 * Report one product file's canonical product-relative path and content digests. The command
 * reads the file and the worktree's file listing and writes nothing: it opens no run and appends
 * no journal event.
 */
export async function verifyInputInspectCommand(
  options: VerifyInputInspectCliOptions,
  deps: VerifyInputInspectDeps,
): Promise<CliCommandResult> {
  const invocationDir = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const product = await detectGitCommonDirProductRoot(invocationDir, deps.git ?? defaultGitDependencies);
  const inspection = await inspectVerificationInput(
    { operand: options.operand, invocationDir, worktreeRoot: product.worktreeRoot },
    deps.listFiles ?? listProductFilesWithGit,
  );
  if (!inspection.ok) {
    const diagnostic = terminal`${authoredText(VERIFY_INPUT_INSPECT_ERROR.REJECTED)}: ${
      externalValue(inspection.diagnostic.operand)
    } (${authoredText(inspection.diagnostic.reason)})`;
    return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: renderTerminalText(diagnostic) };
  }
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output: renderTerminalText(jsonDocument(inspection.value)) };
}
