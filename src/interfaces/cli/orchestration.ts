import type { Command } from "commander";

import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import {
  createHostCommandLock,
  DEFAULT_WAIT_SECONDS,
  type HostCommandLockDeps,
  NOT_READY_EXIT_CODE,
  OUTCOME_KIND,
  RESULT_SCHEMA,
  terminalOutcome,
} from "@/lib/host-command-lock";

export const ORCHESTRATION_CLI = {
  commandName: "orchestration",
  description: "Coordinate heavy commands on this host",
  lockCommandName: "lock",
  lockDescription: "Run a command under the one host-wide command lock",
  runIdFlag: "--run-id",
  runIdOption: "--run-id <id>",
  waitSecondsOption: "--wait-seconds <n>",
  argumentSeparator: "--",
  commandArgument: "[command...]",
} as const;

const WAIT_SECONDS_OPTION_NAME = "--wait-seconds";
const LINE_SEPARATOR = "\n";
const DECIMAL_INTEGER = /^[1-9][0-9]*$/;

export const ORCHESTRATION_CLI_HELP = {
  RUN_ID: "Identifier echoed in the result line (default: generated)",
  WAIT_SECONDS:
    `Wait cap in seconds, a positive integer at most ${DEFAULT_WAIT_SECONDS} (default: ${DEFAULT_WAIT_SECONDS})`,
  FOOTER: [
    "",
    "Invocation: spx orchestration lock [options] -- <command> [arguments...]",
    "",
    `Result: one JSON line on standard error, schema ${RESULT_SCHEMA}, with runId, started, status,`,
    "and childExitCode or signal.",
    "",
    "Exit codes:",
    "  the command's own exit code when it ran",
    "  128 + signal number when a signal ended it",
    "  2    invalid arguments",
    `  ${NOT_READY_EXIT_CODE}    wait cap expired before the command started`,
    "  4    unsupported platform",
    "  5    lock file error",
    "  6    nested context invalid",
    "  7    nested lock mismatch",
    "  127  the command could not be started",
  ].join(LINE_SEPARATOR),
} as const;

interface LockCliOptions {
  readonly runId?: string;
  readonly waitSeconds?: string;
}

function parseWaitSeconds(raw: string | undefined): { ok: true; value?: number } | { ok: false } {
  if (raw === undefined) return { ok: true };
  if (!DECIMAL_INTEGER.test(raw)) return { ok: false };
  const value = Number(raw);
  return value <= DEFAULT_WAIT_SECONDS ? { ok: true, value } : { ok: false };
}

function hasArgumentSeparator(program: Command): boolean {
  return (program as Command & { readonly rawArgs: readonly string[] }).rawArgs.includes(
    ORCHESTRATION_CLI.argumentSeparator,
  );
}

export function createOrchestrationDomain(lockDeps: Partial<HostCommandLockDeps> = {}): Domain {
  return {
    name: ORCHESTRATION_CLI.commandName,
    description: ORCHESTRATION_CLI.description,
    register: (program: Command, invocation: CliInvocation) => {
      const orchestration = program
        .command(ORCHESTRATION_CLI.commandName)
        .description(ORCHESTRATION_CLI.description);

      orchestration
        .command(ORCHESTRATION_CLI.lockCommandName)
        .description(ORCHESTRATION_CLI.lockDescription)
        .option(ORCHESTRATION_CLI.runIdOption, ORCHESTRATION_CLI_HELP.RUN_ID)
        .option(ORCHESTRATION_CLI.waitSecondsOption, ORCHESTRATION_CLI_HELP.WAIT_SECONDS)
        .argument(ORCHESTRATION_CLI.commandArgument)
        .addHelpText("after", ORCHESTRATION_CLI_HELP.FOOTER)
        .action(async (command: string[], options: LockCliOptions) => {
          const writeReport = (report: ReturnType<typeof terminalOutcome>): void => {
            invocation.io.writeStderr(`${JSON.stringify(report.result)}${LINE_SEPARATOR}`);
            invocation.io.setExitCode(report.exitCode);
          };

          const waitSeconds = parseWaitSeconds(options.waitSeconds);
          if (!waitSeconds.ok) {
            invocation.io.writeStderr(
              `${WAIT_SECONDS_OPTION_NAME} must be a positive integer at most ${DEFAULT_WAIT_SECONDS}${LINE_SEPARATOR}`,
            );
            writeReport(terminalOutcome({ kind: OUTCOME_KIND.INVALID_ARGUMENTS }, options.runId));
            return;
          }

          const guarded = hasArgumentSeparator(program) ? command : [];
          const report = await createHostCommandLock(lockDeps).run({
            command: guarded,
            cwd: invocation.resolveEffectiveInvocationDir(),
            ...(options.runId === undefined ? {} : { runId: options.runId }),
            ...(waitSeconds.value === undefined ? {} : { waitSeconds: waitSeconds.value }),
          });
          if (report.result !== undefined) {
            invocation.io.writeStderr(`${JSON.stringify(report.result)}${LINE_SEPARATOR}`);
          }
          invocation.io.setExitCode(report.exitCode);
        });
    },
  };
}

export const orchestrationDomain: Domain = createOrchestrationDomain();
