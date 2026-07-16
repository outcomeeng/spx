import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import {
  type VerifyAppendCliOptions,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  type VerifyFinishCliOptions,
  verifyFinishCommand,
  type VerifyInputCliOptions,
  verifyInputCommand,
  type VerifyRenderCliOptions,
  verifyRenderCommand,
  type VerifyStartCliOptions,
  verifyStartCommand,
  type VerifyStatusCliOptions,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { Domain } from "@/domains/types";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_TYPE, VERIFY_VERB } from "@/domains/verify/verify";
import type { CliInvocation } from "@/interfaces/cli/product-context";

import { createJournalStreamBinding, stderrStreamSink } from "./lib/journal-stream-binding";
import { reportCliResult } from "./lib/stream-report";

export const VERIFICATION_RUN_CLI_SURFACE = {
  addCommandName: "add",
  findingResourceCommandName: "finding",
  forbiddenRootCommandName: "verify",
  forbiddenRunHelpTerms: ["Append", "append"],
  forbiddenRunCommandNames: ["journal", "event", "append-scope", "append-finding"],
  rootCommandName: "verification",
  runCommandName: "run",
  scopeResourceCommandName: "scope",
} as const;

export const VERIFY_CLI = {
  addCommandName: VERIFICATION_RUN_CLI_SURFACE.addCommandName,
  commandName: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
  description: "Record and replay a typed verification run",
  startCommandName: VERIFY_VERB.START,
  startCommandDescription: "Start a changeset- or file-scoped verification run and report its run locator",
  inputCommandName: VERIFY_VERB.INPUT,
  findingCommandName: VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName,
  runCommandName: VERIFICATION_RUN_CLI_SURFACE.runCommandName,
  scopeCommandName: VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName,
  finishCommandName: VERIFY_VERB.FINISH,
  statusCommandName: VERIFY_VERB.STATUS,
  renderCommandName: VERIFY_VERB.RENDER,
  verificationTypeOption: "--verification-type <type>",
  scopeTypeOption: "--scope-type <scope-type>",
  scopeOption: "--scope <scope>",
  scopeTypeOptionDescription: `Scope type; ${VERIFY_SCOPE_TYPE.CHANGESET} or ${VERIFY_SCOPE_TYPE.FILE}`,
  scopeOptionDescription: "Scope identity; <base>..<head> or a product-relative file path",
  inputOption: "--input <input-source>",
  runOption: "--run <token>",
  payloadOption: "--payload <payload-source>",
  payloadOptionDescription: "Evidence payload source; stdin or a file path",
  idempotencyKeyOption: "--idempotency-key <key>",
  idempotencyKeyOptionDescription: "Caller-supplied idempotency key for the evidence add",
  terminalMetadataOption: "--terminal-metadata <payload-source>",
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
  readonly terminalMetadata?: string;
}

interface VerifyRunActionOptions extends VerifySharedCliOptions {
  readonly run: string;
}

export interface VerifyCliHandlers {
  readonly appendFinding: (options: VerifyAppendCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
  readonly appendScope: (options: VerifyAppendCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
  readonly finish: (options: VerifyFinishCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
  readonly input: (options: VerifyInputCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
  readonly render: (options: VerifyRenderCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
  readonly start: (options: VerifyStartCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
  readonly status: (options: VerifyStatusCliOptions, deps: VerifyCliDeps) => Promise<CliCommandResult>;
}

const DEFAULT_VERIFY_CLI_HANDLERS: VerifyCliHandlers = {
  appendFinding: verifyAppendFindingCommand,
  appendScope: verifyAppendScopeCommand,
  finish: verifyFinishCommand,
  input: verifyInputCommand,
  render: verifyRenderCommand,
  start: verifyStartCommand,
  status: verifyStatusCommand,
};

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
  register: (program: Command, invocation: CliInvocation) => registerVerifyCommands(program, invocation),
};

export function registerVerifyCommands(
  program: Command,
  invocation: CliInvocation,
  handlers: VerifyCliHandlers = DEFAULT_VERIFY_CLI_HANDLERS,
): void {
  const deps = () => ({
    cwd: invocation.resolveEffectiveInvocationDir(),
    readInputSource: readCliSource,
    readPayloadSource: readCliSource,
    // The append verbs write a single structured JSON result to stdout, so the run's event
    // stream goes to stderr under the local backend rather than sharing the result channel.
    journalBinding: createJournalStreamBinding(invocation.io, stderrStreamSink(invocation.io)),
  });
  const command = program.command(VERIFY_CLI.commandName).description(VERIFY_CLI.description);
  const runCommand = command
    .command(VERIFY_CLI.runCommandName)
    .description("Manage a typed verification run lifecycle");

  runCommand
    .command(VERIFY_CLI.startCommandName)
    .description(VERIFY_CLI.startCommandDescription)
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.inputOption, "Verification input source; stdin or a file path")
    .action(async (options: VerifyStartActionOptions) => {
      reportCliResult(await handlers.start(options, deps()), invocation.io);
    });

  runCommand
    .command(VERIFY_CLI.inputCommandName)
    .description("Replay the verification input recorded at start")
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
    .action(async (options: VerifyInputActionOptions) => {
      reportCliResult(await handlers.input(options, deps()), invocation.io);
    });

  const scopeCommand = runCommand
    .command(VERIFY_CLI.scopeCommandName)
    .description("Manage inspected scope evidence for a started verification run");

  scopeCommand
    .command(VERIFY_CLI.addCommandName)
    .description("Record the inspected scope for a started run")
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
    .requiredOption(VERIFY_CLI.payloadOption, VERIFY_CLI.payloadOptionDescription)
    .requiredOption(VERIFY_CLI.idempotencyKeyOption, VERIFY_CLI.idempotencyKeyOptionDescription)
    .action(async (options: VerifyAppendActionOptions) => {
      reportCliResult(await handlers.appendScope(options, deps()), invocation.io);
    });

  const findingCommand = runCommand
    .command(VERIFY_CLI.findingCommandName)
    .description("Manage finding evidence for a started verification run");

  findingCommand
    .command(VERIFY_CLI.addCommandName)
    .description("Record a validated verification finding for a started run")
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
    .requiredOption(VERIFY_CLI.payloadOption, VERIFY_CLI.payloadOptionDescription)
    .requiredOption(VERIFY_CLI.idempotencyKeyOption, VERIFY_CLI.idempotencyKeyOptionDescription)
    .action(async (options: VerifyAppendActionOptions) => {
      reportCliResult(await handlers.appendFinding(options, deps()), invocation.io);
    });

  runCommand
    .command(VERIFY_CLI.finishCommandName)
    .description("Record terminal completion, seal the run journal, and report its terminal projection")
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
    .requiredOption(VERIFY_CLI.terminalStatusOption, "Terminal status recorded before sealing")
    .option(VERIFY_CLI.terminalMetadataOption, "Verification-type terminal metadata source; stdin or a file path")
    .action(async (options: VerifyFinishActionOptions) => {
      reportCliResult(await handlers.finish(options, deps()), invocation.io);
    });

  runCommand
    .command(VERIFY_CLI.statusCommandName)
    .description("Report the run's resumable status projected from its journal history")
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
    .action(async (options: VerifyRunActionOptions) => {
      reportCliResult(await handlers.status(options, deps()), invocation.io);
    });

  runCommand
    .command(VERIFY_CLI.renderCommandName)
    .description("Render the run's journal projection with its authoritative finding count")
    .requiredOption(VERIFY_CLI.verificationTypeOption, "Verification type recorded for the run")
    .requiredOption(VERIFY_CLI.scopeTypeOption, VERIFY_CLI.scopeTypeOptionDescription)
    .requiredOption(VERIFY_CLI.scopeOption, VERIFY_CLI.scopeOptionDescription)
    .requiredOption(VERIFY_CLI.runOption, "Run token reported by start")
    .action(async (options: VerifyRunActionOptions) => {
      reportCliResult(await handlers.render(options, deps()), invocation.io);
    });
}
