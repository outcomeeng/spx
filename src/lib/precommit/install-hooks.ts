import { execa } from "execa";
import { constants as fsConstants } from "node:fs";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";

import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "./entrypoint";

export const EXECUTABLE_HOOK_MODE = fsConstants.S_IRWXU
  | fsConstants.S_IRGRP
  | fsConstants.S_IXGRP
  | fsConstants.S_IROTH
  | fsConstants.S_IXOTH;
export const HOOK_FILE_ENCODING = "utf-8";
export const GIT_COMMAND = "git";
export const GIT_DIRECTORY_NAME = ".git";
export const GIT_HOOKS_DIRECTORY_NAME = "hooks";
export const LEFTHOOK_CONFIG_FILE = "lefthook.yml";
export const GIT_HOOKS_PATH_ARGS = ["rev-parse", "--git-path", GIT_HOOKS_DIRECTORY_NAME] as const;
export const LEFTHOOK_INSTALL_COMMAND = "lefthook";
export const LEFTHOOK_INSTALL_ARGS = ["install"] as const;

export const PORTABLE_HOOK_TOKENS = {
  FROZEN_INSTALL: "pnpm install --frozen-lockfile",
  NON_INTERACTIVE_ENV: "CI=true",
  PNPM_EXEC_DELEGATION: "pnpm exec lefthook",
  WORKTREE_RESOLUTION: "git rev-parse --show-toplevel",
  WORKTREE_BINARY: "node_modules/.bin/lefthook",
  FALLBACK_WORKTREE_RUN: "&& \"$worktree_lefthook\" run",
  ABSOLUTE_PNPM_STORE_FRAGMENT: "node_modules/.pnpm",
} as const;

// Every portable shim, in every rendered template version, defines this dispatcher
// function. Obsolete-hook cleanup recognizes a portable shim by this stable marker
// rather than by exact equality with the current render, so a de-configured hook
// installed by an earlier template is still removed while a handwritten hook — which
// never contains the marker — is preserved.
export const PORTABLE_HOOK_MARKER = "call_lefthook()";

export const GIT_HOOK_NAMES = [
  "applypatch-msg",
  "commit-msg",
  "fsmonitor-watchman",
  "post-applypatch",
  "post-checkout",
  "post-commit",
  "post-merge",
  "post-receive",
  "post-rewrite",
  "post-update",
  "pre-applypatch",
  "pre-auto-gc",
  "pre-commit",
  "pre-merge-commit",
  "pre-push",
  "pre-rebase",
  "pre-receive",
  "prepare-commit-msg",
  "push-to-checkout",
  "sendemail-validate",
  "update",
] as const;

export type GitHookName = (typeof GIT_HOOK_NAMES)[number];

export interface PortableHookInstallDeps {
  readonly run: (command: string, args: readonly string[], options: { readonly cwd: string }) => Promise<string>;
  readonly readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  readonly writeFile: (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
  readonly mkdir: (path: string, options: { readonly recursive: boolean }) => Promise<string | undefined>;
  readonly chmod: (path: string, mode: number) => Promise<void>;
  readonly unlink: (path: string) => Promise<void>;
}

export function configuredHookNames(configText: string): GitHookName[] {
  const parsed = parse(configText);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [];
  }

  const sections = new Set(Object.keys(parsed));
  return GIT_HOOK_NAMES.filter((hookName) => sections.has(hookName));
}

export function renderPortableLefthookHook(hookName: GitHookName): string {
  return `#!/bin/sh

if [ "$LEFTHOOK_VERBOSE" = "1" ] || [ "$LEFTHOOK_VERBOSE" = "true" ]; then
  set -x
fi

if [ "$LEFTHOOK" = "0" ]; then
  exit 0
fi

hook_name="${hookName}"

find_worktree_root()
{
  ${PORTABLE_HOOK_TOKENS.WORKTREE_RESOLUTION} 2>/dev/null || pwd
}

call_lefthook()
{
  if [ -n "$LEFTHOOK_BIN" ]; then
    "$LEFTHOOK_BIN" run "$hook_name" "$@"
  else
    worktree_root="$(find_worktree_root)"
    worktree_lefthook="$worktree_root/${PORTABLE_HOOK_TOKENS.WORKTREE_BINARY}"
    if [ -x "$worktree_lefthook" ]; then
      "$worktree_lefthook" run "$hook_name" "$@"
    elif command -v lefthook >/dev/null 2>&1; then
      lefthook run "$hook_name" "$@"
    elif command -v pnpm >/dev/null 2>&1; then
      (cd "$worktree_root" && ${PORTABLE_HOOK_TOKENS.NON_INTERACTIVE_ENV} ${PORTABLE_HOOK_TOKENS.FROZEN_INSTALL} ${PORTABLE_HOOK_TOKENS.FALLBACK_WORKTREE_RUN} "$hook_name" "$@")
    else
      echo "Can't find lefthook in PATH or current worktree"
      exit 1
    fi
  fi
}

call_lefthook "$@"
`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

async function readOptionalHook(hookPath: string, deps: PortableHookInstallDeps): Promise<string | undefined> {
  try {
    return await deps.readFile(hookPath, HOOK_FILE_ENCODING);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function isPortableLefthookShim(hookContent: string): boolean {
  return hookContent.includes(PORTABLE_HOOK_MARKER);
}

async function removeObsoletePortableHooks(
  hooksDir: string,
  configuredHooks: ReadonlySet<GitHookName>,
  deps: PortableHookInstallDeps,
): Promise<void> {
  for (const hookName of GIT_HOOK_NAMES) {
    if (configuredHooks.has(hookName)) {
      continue;
    }

    const hookPath = join(hooksDir, hookName);
    const hookContent = await readOptionalHook(hookPath, deps);
    if (hookContent !== undefined && isPortableLefthookShim(hookContent)) {
      await deps.unlink(hookPath);
    }
  }
}

export async function installPortableLefthookHooks(
  productDir: string,
  deps: PortableHookInstallDeps = createProductionDeps(),
): Promise<void> {
  await deps.run(LEFTHOOK_INSTALL_COMMAND, LEFTHOOK_INSTALL_ARGS, { cwd: productDir });

  const configText = await deps.readFile(join(productDir, LEFTHOOK_CONFIG_FILE), HOOK_FILE_ENCODING);
  const hookNames = configuredHookNames(configText);
  const hooksPath = await deps.run(GIT_COMMAND, GIT_HOOKS_PATH_ARGS, { cwd: productDir });
  const hooksDir = hooksPath.trim();
  const configuredHooks = new Set(hookNames);

  await deps.mkdir(hooksDir, { recursive: true });
  await removeObsoletePortableHooks(hooksDir, configuredHooks, deps);
  for (const hookName of hookNames) {
    const hookPath = join(hooksDir, hookName);
    await deps.writeFile(hookPath, renderPortableLefthookHook(hookName), HOOK_FILE_ENCODING);
    await deps.chmod(hookPath, EXECUTABLE_HOOK_MODE);
  }
}

export function createProductionDeps(): PortableHookInstallDeps {
  return {
    run: async (command, args, options) => {
      const result = await execa(command, [...args], { cwd: options.cwd });
      return result.stdout;
    },
    readFile,
    writeFile,
    mkdir,
    chmod,
    unlink,
  };
}

async function main(): Promise<void> {
  await installPortableLefthookHooks(CONFIG_PROCESS_CWD.read());
}

const isDirectExecution = typeof import.meta.url === "string"
  && isDirectPrecommitEntrypoint(
    import.meta.url,
    process.argv[1],
    PRECOMMIT_ENTRYPOINT.INSTALL_HOOKS,
  );

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error("Hook installation failed:", error);
    process.exit(1);
  }
}
