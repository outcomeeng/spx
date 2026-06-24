import { chmod as chmodFs, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  configuredHookNames,
  EXECUTABLE_HOOK_MODE,
  GIT_COMMAND,
  GIT_DIRECTORY_NAME,
  GIT_HOOK_NAMES,
  GIT_HOOKS_DIRECTORY_NAME,
  GIT_HOOKS_PATH_ARGS,
  type GitHookName,
  HOOK_FILE_ENCODING,
  installPortableLefthookHooks,
  LEFTHOOK_CONFIG_FILE,
  LEFTHOOK_INSTALL_ARGS,
  LEFTHOOK_INSTALL_COMMAND,
  PORTABLE_HOOK_TOKENS,
  type PortableHookInstallDeps,
  renderPortableLefthookHook,
} from "@/lib/precommit/install-hooks";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const executableModeMask = 0o111;
const yamlCommandStub = "commands: {}";
const unknownLefthookSection = "not-a-git-hook";

function sampleHookNames(): readonly [GitHookName, GitHookName] {
  const [firstHook, secondHook] = GIT_HOOK_NAMES;
  if (firstHook === undefined || secondHook === undefined) {
    throw new Error("Git hook registry must contain at least two names");
  }
  return [firstHook, secondHook];
}

function renderHookConfig(hookNames: readonly GitHookName[]): string {
  return [
    ...hookNames.map((hookName) => `${hookName}:\n  ${yamlCommandStub}`),
    `${unknownLefthookSection}:\n  ${yamlCommandStub}`,
  ].join("\n");
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

describe("portable lefthook hook installation", () => {
  it("maps only configured Git hook sections from lefthook config", () => {
    const hookNames = sampleHookNames();

    expect(configuredHookNames(renderHookConfig(hookNames))).toEqual(hookNames);
  });

  it("renders hooks that resolve lefthook from the invoking worktree at runtime", () => {
    const [hookName] = sampleHookNames();

    const hookContent = renderPortableLefthookHook(hookName);

    expect(hookContent).toContain(`hook_name="${hookName}"`);
    expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.WORKTREE_RESOLUTION);
    expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.WORKTREE_BINARY);
    expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.PNPX_FALLBACK);
    expect(hookContent).not.toContain(PORTABLE_HOOK_TOKENS.ABSOLUTE_PNPM_STORE_FRAGMENT);
  });

  it("replaces lefthook-generated hooks with executable portable shims", async () => {
    await withTempDir("spx-hook-install-", async (productDir) => {
      const hookNames = sampleHookNames();
      const hooksDir = join(productDir, GIT_DIRECTORY_NAME, GIT_HOOKS_DIRECTORY_NAME);
      const commands: string[] = [];

      await writeFile(join(productDir, LEFTHOOK_CONFIG_FILE), renderHookConfig(hookNames));

      const deps: PortableHookInstallDeps = {
        run: async (command, args) => {
          commands.push([command, ...args].join(" "));
          return command === GIT_COMMAND ? hooksDir : "";
        },
        readFile,
        writeFile,
        mkdir,
        chmod: chmodFs,
      };

      await installPortableLefthookHooks(productDir, deps);

      expect(commands).toEqual([
        formatCommand(LEFTHOOK_INSTALL_COMMAND, LEFTHOOK_INSTALL_ARGS),
        formatCommand(GIT_COMMAND, GIT_HOOKS_PATH_ARGS),
      ]);

      for (const hookName of hookNames) {
        const hookPath = join(hooksDir, hookName);
        const hookContent = await readFile(hookPath, HOOK_FILE_ENCODING);
        const hookStats = await stat(hookPath);

        expect(hookContent).toBe(renderPortableLefthookHook(hookName));
        expect(hookStats.mode & executableModeMask).toBe(EXECUTABLE_HOOK_MODE & executableModeMask);
      }
    });
  });
});
