import type { Command } from "commander";

import { verificationContextCreateCommand } from "@/commands/verification-context/cli";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";

import { reportCliResult } from "./lib/stream-report";

export const VERIFICATION_CONTEXT_CLI = {
  commandName: "verification-context",
  description: "Create an immutable verification context document",
  createCommandName: "create",
  subjectOption: "--subject <subject>",
  pathOption: "--path <path>",
  baseOption: "--base <ref>",
  headOption: "--head <ref>",
  predicateOption: "--predicate <predicate>",
  workflowOption: "--workflow <workflow>",
} as const;

interface VerificationContextCreateOptions {
  readonly subject: string;
  readonly path?: string;
  readonly base?: string;
  readonly head?: string;
  readonly predicate: string;
  readonly workflow: string;
}

export const verificationContextDomain: Domain = {
  name: VERIFICATION_CONTEXT_CLI.commandName,
  description: VERIFICATION_CONTEXT_CLI.description,
  register: (program: Command, invocation: CliInvocation) => {
    const command = program
      .command(VERIFICATION_CONTEXT_CLI.commandName)
      .description(VERIFICATION_CONTEXT_CLI.description);

    command
      .command(VERIFICATION_CONTEXT_CLI.createCommandName)
      .description("Create a canonical verification context and report its path and digest")
      .requiredOption(VERIFICATION_CONTEXT_CLI.subjectOption, "Subject kind: file or changeset")
      .option(VERIFICATION_CONTEXT_CLI.pathOption, "Product-relative file path for a file subject")
      .option(VERIFICATION_CONTEXT_CLI.baseOption, "Base ref for a changeset subject")
      .option(VERIFICATION_CONTEXT_CLI.headOption, "Head ref for a changeset subject")
      .requiredOption(VERIFICATION_CONTEXT_CLI.predicateOption, "Caller-supplied predicate identifier")
      .requiredOption(VERIFICATION_CONTEXT_CLI.workflowOption, "Caller-supplied workflow identifier")
      .action(async (options: VerificationContextCreateOptions) => {
        reportCliResult(
          await verificationContextCreateCommand(options, { cwd: invocation.resolveEffectiveInvocationDir() }),
          invocation.io,
        );
      });
  },
};
