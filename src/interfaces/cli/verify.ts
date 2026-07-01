import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import { verifyInputCommand, verifyStartCommand } from "@/commands/verify/cli";
import type { Domain } from "@/domains/types";
import { VERIFY_INPUT_SOURCE, VERIFY_VERB } from "@/domains/verify/verify";
import type { CliInvocation } from "@/interfaces/cli/product-context";

import { reportCliResult } from "./lib/stream-report";

export const VERIFY_CLI = {
  commandName: "verify",
  description: "Record and replay a typed verification run",
  startCommandName: VERIFY_VERB.START,
  inputCommandName: VERIFY_VERB.INPUT,
  verificationTypeOption: "--verification-type <type>",
  scopeTypeOption: "--scope-type <scope-type>",
  scopeOption: "--scope <base>..<head>",
  inputOption: "--input <input-source>",
  runOption: "--run <token>",
} as const;

const INPUT_SOURCE_ENCODING = "utf8";

interface VerifySharedCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
}

interface VerifyStartActionOptions extends VerifySharedCliOptions {
  readonly input: string;
}

interface VerifyInputActionOptions extends VerifySharedCliOptions {
  readonly run: string;
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString(INPUT_SOURCE_ENCODING);
}

/** Read the verification input from stdin when the source is `stdin`, otherwise from a file path. */
async function readInputSource(source: string): Promise<string> {
  if (source === VERIFY_INPUT_SOURCE.STDIN) return readStdinText();
  return readFile(source, INPUT_SOURCE_ENCODING);
}

export const verifyDomain: Domain = {
  name: VERIFY_CLI.commandName,
  description: VERIFY_CLI.description,
  register: (program: Command, invocation: CliInvocation) => {
    const deps = () => ({ cwd: invocation.resolveEffectiveInvocationDir(), readInputSource });
    const command = program.command(VERIFY_CLI.commandName).description(VERIFY_CLI.description);

    command
      .command(VERIFY_CLI.startCommandName)
      .description("Start a changeset-scoped verification run and report its run locator")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.inputOption, "Verification input source; stdin or a file path")
      .action(async (options: VerifyStartActionOptions) => {
        reportCliResult(await verifyStartCommand(options, deps()), invocation.io);
      });

    command
      .command(VERIFY_CLI.inputCommandName)
      .description("Replay the verification input recorded at start")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
      .action(async (options: VerifyInputActionOptions) => {
        reportCliResult(await verifyInputCommand(options, deps()), invocation.io);
      });
  },
};
