import { inspect } from "node:util";

import type { Command } from "commander";

import {
  type AgentResumeCommandDeps,
  jsonAgentResumeSessions,
  listAgentResumeSessions,
  loadAgentResumeCandidates,
} from "@/commands/agent";
import {
  AGENT_RESUME_MODE,
  AGENT_RESUME_TEXT,
  type AgentResumeCandidate,
  buildAgentResumeLaunchCommand,
  resolveAgentResumeMode,
} from "@/domains/agent";
import type { Domain } from "@/domains/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { foregroundProcessRunner, lifecycleSignalSuspender } from "@/lib/process-lifecycle";

import { launchAgentResume } from "./agent/resume/launch-agent-resume";
import {
  AGENT_RESUME_PICKER_RESULT,
  type AgentResumePickerResult,
  runAgentResumePicker,
} from "./agent/resume/run-picker";

export const AGENT_CLI = {
  commandName: "agent",
  resumeCommandName: "resume",
  flags: {
    latest: "--latest",
    list: "--list",
    json: "--json",
  },
} as const;

export const AGENT_CLI_EXIT = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

export interface AgentCliDependencies {
  readonly resumeDeps?: AgentResumeCommandDeps;
  readonly isInteractiveTerminal: () => boolean;
  readonly pickCandidate: (candidates: readonly AgentResumeCandidate[]) => Promise<AgentResumePickerResult>;
  readonly launchCandidate: (candidate: AgentResumeCandidate) => Promise<number>;
}

export interface AgentResumeCliOptions {
  readonly latest?: boolean;
  readonly list?: boolean;
  readonly json?: boolean;
}

const DEFAULT_AGENT_CLI_DEPENDENCIES: AgentCliDependencies = {
  isInteractiveTerminal: () => Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY),
  pickCandidate: runAgentResumePicker,
  launchCandidate: async (candidate) => {
    return launchAgentResume(
      foregroundProcessRunner,
      lifecycleSignalSuspender,
      buildAgentResumeLaunchCommand(candidate),
    );
  },
};

function writeOutput(invocation: CliInvocation, output: string): void {
  invocation.io.writeStdout(`${output}\n`);
}

function writeError(invocation: CliInvocation, output: string): void {
  invocation.io.writeStderr(`${output}\n`);
}

function handleError(invocation: CliInvocation, error: unknown): never {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : inspect(error);
  writeError(invocation, `Error: ${message}`);
  return invocation.io.exit(AGENT_CLI_EXIT.FAILURE);
}

export function createAgentDomain(deps: Partial<AgentCliDependencies> = {}): Domain {
  const resolvedDeps: AgentCliDependencies = {
    ...DEFAULT_AGENT_CLI_DEPENDENCIES,
    ...deps,
  };

  return {
    name: AGENT_CLI.commandName,
    description: "Find and resume coding-agent sessions",
    register: (program: Command, invocation: CliInvocation) => {
      const agentCmd = program.command(AGENT_CLI.commandName).description("Find and resume coding-agent sessions");
      agentCmd
        .command(AGENT_CLI.resumeCommandName)
        .description("Resume a Codex or Claude Code agent session for this worktree")
        .option(AGENT_CLI.flags.latest, "Launch the newest matching session")
        .option(AGENT_CLI.flags.list, "List matching sessions")
        .option(AGENT_CLI.flags.json, "Print matching sessions as JSON")
        .action(async (options: AgentResumeCliOptions) => {
          let requestedExitCode: number = AGENT_CLI_EXIT.SUCCESS;
          try {
            const mode = resolveAgentResumeMode(options);
            if (mode === AGENT_RESUME_MODE.PICK && !resolvedDeps.isInteractiveTerminal()) {
              writeError(invocation, AGENT_RESUME_TEXT.INTERACTIVE_REQUIRED);
              requestedExitCode = AGENT_CLI_EXIT.FAILURE;
            } else {
              const commandOptions = {
                cwd: invocation.resolveEffectiveInvocationDir(),
                deps: resolvedDeps.resumeDeps,
              };

              if (mode === AGENT_RESUME_MODE.JSON) {
                writeOutput(invocation, await jsonAgentResumeSessions(commandOptions));
                return;
              }
              if (mode === AGENT_RESUME_MODE.LIST) {
                writeOutput(invocation, await listAgentResumeSessions(commandOptions));
                return;
              }
              const candidates = await loadAgentResumeCandidates(commandOptions);
              if (candidates.length === 0) {
                writeError(invocation, AGENT_RESUME_TEXT.NO_MATCHES);
                requestedExitCode = AGENT_CLI_EXIT.FAILURE;
              } else if (mode === AGENT_RESUME_MODE.LATEST) {
                requestedExitCode = await resolvedDeps.launchCandidate(candidates[0]);
              } else {
                const pickerResult = await resolvedDeps.pickCandidate(candidates);
                if (pickerResult.kind === AGENT_RESUME_PICKER_RESULT.SELECTED) {
                  requestedExitCode = await resolvedDeps.launchCandidate(pickerResult.candidate);
                }
              }
            }
          } catch (error) {
            handleError(invocation, error);
          }
          return invocation.io.exit(requestedExitCode);
        });
    },
  };
}

export const agentDomain: Domain = createAgentDomain();
