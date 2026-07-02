import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import {
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyFinishCommand,
  verifyInputCommand,
  verifyRenderCommand,
  verifyStartCommand,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import type { Domain } from "@/domains/types";
import { VERIFY_INPUT_SOURCE, VERIFY_VERB } from "@/domains/verify/verify";
import type { CliInvocation } from "@/interfaces/cli/product-context";

import { createJournalStreamBinding, stderrStreamSink } from "./lib/journal-stream-binding";
import { reportCliResult } from "./lib/stream-report";

export const VERIFY_CLI = {
  commandName: "verify",
  description: "Record and replay a typed verification run",
  startCommandName: VERIFY_VERB.START,
  inputCommandName: VERIFY_VERB.INPUT,
  appendScopeCommandName: VERIFY_VERB.APPEND_SCOPE,
  appendFindingCommandName: VERIFY_VERB.APPEND_FINDING,
  finishCommandName: VERIFY_VERB.FINISH,
  statusCommandName: VERIFY_VERB.STATUS,
  renderCommandName: VERIFY_VERB.RENDER,
  verificationTypeOption: "--verification-type <type>",
  scopeTypeOption: "--scope-type <scope-type>",
  scopeOption: "--scope <base>..<head>",
  inputOption: "--input <input-source>",
  runOption: "--run <token>",
  payloadOption: "--payload <payload-source>",
  idempotencyKeyOption: "--idempotency-key <key>",
  terminalStatusOption: "--terminal-status <status>",
} as const;

const CLI_SOURCE_ENCODING = "utf8";

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

interface VerifyAppendActionOptions extends VerifySharedCliOptions {
  readonly run: string;
  readonly payload: string;
  readonly idempotencyKey: string;
}

interface VerifyFinishActionOptions extends VerifySharedCliOptions {
  readonly run: string;
  readonly terminalStatus: string;
}

interface VerifyRunActionOptions extends VerifySharedCliOptions {
  readonly run: string;
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString(CLI_SOURCE_ENCODING);
}

/** Read a verification input or append payload from stdin when the source is `stdin`, otherwise a file path. */
async function readCliSource(source: string): Promise<string> {
  if (source === VERIFY_INPUT_SOURCE.STDIN) return readStdinText();
  return readFile(source, CLI_SOURCE_ENCODING);
}

export const verifyDomain: Domain = {
  name: VERIFY_CLI.commandName,
  description: VERIFY_CLI.description,
  register: (program: Command, invocation: CliInvocation) => {
    const deps = () => ({
      cwd: invocation.resolveEffectiveInvocationDir(),
      readInputSource: readCliSource,
      readPayloadSource: readCliSource,
      // The append verbs write a single structured JSON result to stdout, so the run's event
      // stream goes to stderr under the local backend rather than sharing the result channel.
      journalBinding: createJournalStreamBinding(invocation.io, stderrStreamSink(invocation.io)),
    });
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

    command
      .command(VERIFY_CLI.appendScopeCommandName)
      .description("Record the inspected scope for a started run")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
      .requiredOption(VERIFY_CLI.payloadOption, "Append payload source; stdin or a file path")
      .requiredOption(VERIFY_CLI.idempotencyKeyOption, "Caller-supplied idempotency key for the append")
      .action(async (options: VerifyAppendActionOptions) => {
        reportCliResult(await verifyAppendScopeCommand(options, deps()), invocation.io);
      });

    command
      .command(VERIFY_CLI.appendFindingCommandName)
      .description("Record a validated verification finding for a started run")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
      .requiredOption(VERIFY_CLI.payloadOption, "Append payload source; stdin or a file path")
      .requiredOption(VERIFY_CLI.idempotencyKeyOption, "Caller-supplied idempotency key for the append")
      .action(async (options: VerifyAppendActionOptions) => {
        reportCliResult(await verifyAppendFindingCommand(options, deps()), invocation.io);
      });

    command
      .command(VERIFY_CLI.finishCommandName)
      .description("Record terminal completion, seal the run journal, and report its terminal projection")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
      .requiredOption(VERIFY_CLI.terminalStatusOption, "Terminal status recorded before sealing")
      .action(async (options: VerifyFinishActionOptions) => {
        reportCliResult(await verifyFinishCommand(options, deps()), invocation.io);
      });

    command
      .command(VERIFY_CLI.statusCommandName)
      .description("Report the run's resumable status projected from its journal history")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
      .action(async (options: VerifyRunActionOptions) => {
        reportCliResult(await verifyStatusCommand(options, deps()), invocation.io);
      });

    command
      .command(VERIFY_CLI.renderCommandName)
      .description("Render the run's journal projection with its authoritative finding count")
      .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
      .requiredOption(VERIFY_CLI.scopeTypeOption, "Scope type; changeset")
      .requiredOption(VERIFY_CLI.scopeOption, "Changeset scope as <base>..<head>")
      .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
      .action(async (options: VerifyRunActionOptions) => {
        reportCliResult(await verifyRenderCommand(options, deps()), invocation.io);
      });
  },
};
