/**
 * Hook CLI — Commander registration descriptor for `spx hook run <event>`.
 *
 * @module interfaces/cli/hook
 */

import { randomBytes as nodeRandomBytes } from "node:crypto";

import type { Command } from "commander";

import { resolveConfig } from "@/config/index";
import type { Result } from "@/config/types";
import {
  AGENT,
  type Agent,
  type HarnessEnvironmentConfig,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import {
  HOOK_SESSION_START_ENV,
  type HookSessionStartEnv,
  parseHookSessionStartPayload,
  resolveHookSessionStartEnvFile,
  resolveHookSessionStartProductDir,
} from "@/domains/hooks/session-start";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import {
  ERROR_DETAIL_SEPARATOR,
  HOOK_CONFIG_ERROR_PREFIX,
  type HookCliRunOptions,
  processHookIo,
  runHookCli,
} from "@/interfaces/hooks/cli-runner";
import { HOOK_ERROR, HOOK_EVENT, isHookEvent } from "@/interfaces/hooks/registry";
import { defaultGitDependencies } from "@/lib/git/root";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultProcessTable } from "@/lib/worktree-process-table";

/** Source-owned `spx hook` command and flag vocabulary, shared with CLI tests. */
export const HOOK_CLI = {
  COMMAND: "hook",
  RUN: "run",
  EVENT_ARGUMENT: "<event>",
  ENV_FILE_FLAG: "--hook-env-file",
  WORKTREES_DIR_FLAG: "--worktrees-dir",
} as const;

const HOOK_DOMAIN_DESCRIPTION = "Run host lifecycle hook events";

interface HookCommandOptions {
  readonly hookEnvFile?: string;
  readonly worktreesDir?: string;
}

interface HookExecutionContext {
  readonly runOptions: Omit<HookCliRunOptions, "event">;
  readonly warnings: readonly string[];
}

function resolveHookCliAgent(env: HookSessionStartEnv): Agent {
  if (env[HOOK_SESSION_START_ENV.CODEX_THREAD_ID]?.trim()) return AGENT.CODEX;
  if (env[HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]?.trim()) return AGENT.CLAUDE_CODE;
  if (env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]?.trim()) return AGENT.CLAUDE_CODE;
  return AGENT.CODEX;
}

async function resolveHookCliCompactStdout(productDir: string, env: HookSessionStartEnv): Promise<Result<boolean>> {
  const loaded = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
  if (!loaded.ok) return loaded;
  const harnessEnvironment = loaded.value[harnessEnvironmentConfigDescriptor.section] as HarnessEnvironmentConfig;
  return {
    ok: true,
    value: harnessEnvironment.agents[resolveHookCliAgent(env)].hooks.sessionStart.compactStdout,
  };
}

function defaultHookCliCompactStdout(env: HookSessionStartEnv): boolean {
  return harnessEnvironmentConfigDescriptor.defaults.agents[resolveHookCliAgent(env)].hooks.sessionStart
    .compactStdout;
}

async function resolveHookExecutionContext(
  invocation: CliInvocation,
  event: string,
  options: HookCommandOptions,
): Promise<HookExecutionContext> {
  const env = process.env;
  const cwd = invocation.resolveEffectiveInvocationDir();
  const stdinContent = await processHookIo.readStdin();
  const productDir = resolveHookCliConfigProductDir(invocation, event, cwd, stdinContent);
  const compactStdout = await resolveHookCliCompactStdout(productDir, env);
  return {
    runOptions: {
      compactStdout: compactStdout.ok ? compactStdout.value : defaultHookCliCompactStdout(env),
      cwd,
      env,
      envFile: resolveHookSessionStartEnvFile(env, options.hookEnvFile),
      fs: defaultOccupancyFileSystem,
      gitDeps: defaultGitDependencies,
      io: processHookIo,
      onWarning: (warning) => writeInvocationWarning(invocation, warning),
      processTable: defaultProcessTable,
      claimRandomBytes: nodeRandomBytes,
      selfPid: process.pid,
      stdinContent,
      worktreesDir: options.worktreesDir,
    },
    warnings: compactStdout.ok
      ? []
      : [`${HOOK_CONFIG_ERROR_PREFIX}${ERROR_DETAIL_SEPARATOR}${compactStdout.error}`],
  };
}

function resolveHookCliConfigProductDir(
  invocation: CliInvocation,
  event: string,
  cwd: string,
  stdinContent: Result<string | undefined>,
): string {
  if (event === HOOK_EVENT.SESSION_START && stdinContent.ok) {
    const payload = parseHookSessionStartPayload(stdinContent.value);
    if (payload.ok) return resolveHookSessionStartProductDir(payload.value, cwd);
  }
  return invocation.resolveProductContext().productDir;
}

function writeError(invocation: CliInvocation, output: string): void {
  invocation.io.writeStderr(`${output}\n`);
}

function writeInvocationWarning(invocation: CliInvocation, warning: string | undefined): void {
  if (warning !== undefined) {
    writeError(invocation, warning);
  }
}

function registerHookCommands(hookCmd: Command, invocation: CliInvocation): void {
  hookCmd
    .command(`${HOOK_CLI.RUN} ${HOOK_CLI.EVENT_ARGUMENT}`)
    .description("Run a hook lifecycle event")
    .option(`${HOOK_CLI.ENV_FILE_FLAG} <path>`, "Hook env file to append; defaults to $CLAUDE_ENV_FILE")
    .option(`${HOOK_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (event: string, options: HookCommandOptions) => {
      if (!isHookEvent(event)) {
        writeError(invocation, `${HOOK_ERROR.UNKNOWN_EVENT}: ${sanitizeCliArgument(event)}`);
        invocation.io.exit(1);
        return;
      }
      const hookContext = await resolveHookExecutionContext(invocation, event, options);
      for (const warning of hookContext.warnings) {
        writeInvocationWarning(invocation, warning);
      }
      const result = await runHookCli({
        ...hookContext.runOptions,
        event,
      });
      if (!result.ok) invocation.io.exit(1);
    });
}

/** Hook CLI — Commander registration descriptor for hook events. */
export const hookDomain: Domain = {
  name: HOOK_CLI.COMMAND,
  description: HOOK_DOMAIN_DESCRIPTION,
  register: (program: Command, invocation: CliInvocation) => {
    const hookCmd = program.command(HOOK_CLI.COMMAND).description(HOOK_DOMAIN_DESCRIPTION);

    registerHookCommands(hookCmd, invocation);
  },
};
