import { inspect } from "node:util";

import { type Command } from "commander";

import {
  type AgentResumeCommandDeps,
  type AgentResumeCommandOptions,
  type AgentSearchCommandDeps,
  jsonAgentResumeSessions,
  jsonAgentSearchSessions,
  listAgentResumeSessions,
  listAgentSearchSessions,
  loadAgentResumeCandidates,
} from "@/commands/agent";
import {
  AGENT_RESUME_MODE,
  AGENT_RESUME_TEXT,
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SESSION_KIND,
  type AgentResumeCandidate,
  type AgentResumeMode,
  type AgentResumeScope,
  agentSearchQueryFromOptions,
  type AgentSearchQueryOptions,
  type AgentSessionKind,
  branchResumeScope,
  buildAgentResumeLaunchCommand,
  resolveAgentResumeMode,
  worktreeResumeScope,
} from "@/domains/agent";
import type { Domain } from "@/domains/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { foregroundProcessRunner, lifecycleSignalSuspender } from "@/lib/process-lifecycle";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

import { launchAgentResume } from "./agent/resume/launch-agent-resume";
import {
  AGENT_RESUME_PICKER_RESULT,
  type AgentResumePickerResult,
  runAgentResumePicker,
} from "./agent/resume/run-picker";

export const AGENT_CLI = {
  commandName: "agent",
  resumeCommandName: "resume",
  searchCommandName: "search",
  flags: {
    latest: "--latest",
    list: "--list",
    json: "--json",
    branch: "--branch",
    all: "--all",
    pickupId: "--pickup-id",
    contains: "--contains",
    sessionId: "--session-id",
    agent: "--agent",
    limit: "--limit",
  },
  optionArgs: {
    branch: "--branch <name>",
    pickupId: "--pickup-id <id>",
    contains: "--contains <literal>",
    sessionId: "--session-id <id>",
    agent: "--agent <kind>",
    limit: "--limit <count>",
  },
} as const;

export const AGENT_CLI_EXIT = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

export interface AgentCliDependencies {
  readonly resumeDeps?: AgentResumeCommandDeps;
  readonly searchDeps?: AgentSearchCommandDeps;
  readonly isInteractiveTerminal: () => boolean;
  readonly pickCandidate: (candidates: readonly AgentResumeCandidate[]) => Promise<AgentResumePickerResult>;
  readonly launchCandidate: (candidate: AgentResumeCandidate) => Promise<number>;
}

export interface AgentResumeCliOptions {
  readonly latest?: boolean;
  readonly list?: boolean;
  readonly json?: boolean;
  readonly branch?: string;
}

export interface AgentSearchCliOptions {
  readonly json?: boolean;
  readonly pickupId?: string;
  readonly contains?: string;
  readonly sessionId?: string;
  readonly branch?: string;
  readonly agent?: string;
  readonly all?: boolean;
  readonly limit?: string;
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

const POSITIVE_DECIMAL_INTEGER_PATTERN = /^[1-9][0-9]*$/;

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

function resumeScopeFromOptions(options: AgentResumeCliOptions): AgentResumeScope {
  return options.branch === undefined ? worktreeResumeScope() : branchResumeScope(options.branch);
}

function parseSearchLimit(value: string): number {
  if (!POSITIVE_DECIMAL_INTEGER_PATTERN.test(value)) {
    throw new Error(`agent search limit must be a positive integer: ${sanitizeCliArgument(value)}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`agent search limit must be a positive integer: ${sanitizeCliArgument(value)}`);
  }
  return parsed;
}

function parseSearchAgentKind(value: string): AgentSessionKind {
  if (value === AGENT_SESSION_KIND.CODEX || value === AGENT_SESSION_KIND.CLAUDE_CODE) {
    return value;
  }
  throw new Error(`agent search kind must be codex or claude-code: ${sanitizeCliArgument(value)}`);
}

function searchQueryFromOptions(options: AgentSearchCliOptions): AgentSearchQueryOptions {
  return {
    pickupId: options.pickupId,
    contains: options.contains,
    sessionId: options.sessionId,
    branch: options.branch,
    agent: options.agent === undefined ? undefined : parseSearchAgentKind(options.agent),
    all: options.all,
    limit: options.limit === undefined ? AGENT_SEARCH_DEFAULT_LIMIT : parseSearchLimit(options.limit),
  };
}

async function dispatchInteractiveResume(
  mode: AgentResumeMode,
  commandOptions: AgentResumeCommandOptions,
  deps: AgentCliDependencies,
  invocation: CliInvocation,
): Promise<number> {
  const candidates = await loadAgentResumeCandidates(commandOptions);
  if (candidates.length === 0) {
    writeError(invocation, AGENT_RESUME_TEXT.NO_MATCHES);
    return AGENT_CLI_EXIT.FAILURE;
  }
  if (mode === AGENT_RESUME_MODE.LATEST) {
    return deps.launchCandidate(candidates[0]);
  }
  const pickerResult = await deps.pickCandidate(candidates);
  return pickerResult.kind === AGENT_RESUME_PICKER_RESULT.SELECTED
    ? deps.launchCandidate(pickerResult.candidate)
    : AGENT_CLI_EXIT.SUCCESS;
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
        .option(AGENT_CLI.optionArgs.branch, "Scope to sessions started on the named branch, across worktrees")
        .action(async (options: AgentResumeCliOptions) => {
          let requestedExitCode: number = AGENT_CLI_EXIT.SUCCESS;
          try {
            const mode = resolveAgentResumeMode(options);
            const productContext = invocation.resolveProductContext();
            if (mode === AGENT_RESUME_MODE.PICK && !resolvedDeps.isInteractiveTerminal()) {
              writeError(invocation, AGENT_RESUME_TEXT.INTERACTIVE_REQUIRED);
              requestedExitCode = AGENT_CLI_EXIT.FAILURE;
            } else {
              const commandOptions: AgentResumeCommandOptions = {
                cwd: productContext.effectiveInvocationDir,
                fallbackWorktreeRoot: productContext.productDir,
                scope: resumeScopeFromOptions(options),
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
              requestedExitCode = await dispatchInteractiveResume(mode, commandOptions, resolvedDeps, invocation);
            }
          } catch (error) {
            handleError(invocation, error);
          }
          return invocation.io.exit(requestedExitCode);
        });
      agentCmd
        .command(AGENT_CLI.searchCommandName)
        .description("Search Codex and Claude Code agent session transcripts for this product")
        .option(AGENT_CLI.optionArgs.pickupId, "Search for an exact SPX pickup marker")
        .option(AGENT_CLI.optionArgs.contains, "Search transcript content for a literal string")
        .option(AGENT_CLI.optionArgs.sessionId, "Search for an agent session id")
        .option(AGENT_CLI.optionArgs.branch, "Search by branch association")
        .option(AGENT_CLI.optionArgs.agent, "Search only one agent kind")
        .option(AGENT_CLI.flags.all, "Include sessions outside the recent-session window")
        .option(AGENT_CLI.optionArgs.limit, "Maximum number of results")
        .option(AGENT_CLI.flags.json, "Print matching sessions as JSON")
        .action(async (options: AgentSearchCliOptions) => {
          try {
            const productContext = invocation.resolveProductContext();
            const commandOptions = {
              cwd: productContext.effectiveInvocationDir,
              fallbackProductScopeRoot: productContext.productDir,
              query: agentSearchQueryFromOptions(searchQueryFromOptions(options)),
              deps: resolvedDeps.searchDeps,
            };
            const output = options.json === true
              ? await jsonAgentSearchSessions(commandOptions)
              : await listAgentSearchSessions(commandOptions);
            writeOutput(invocation, output);
          } catch (error) {
            handleError(invocation, error);
          }
        });
    },
  };
}

export const agentDomain: Domain = createAgentDomain();
