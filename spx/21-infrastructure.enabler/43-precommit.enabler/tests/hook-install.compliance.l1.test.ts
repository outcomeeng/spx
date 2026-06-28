import { chmod as chmodFs, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
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
  isPortableLefthookShim,
  LEFTHOOK_CONFIG_FILE,
  LEFTHOOK_INSTALL_ARGS,
  LEFTHOOK_INSTALL_COMMAND,
  PORTABLE_HOOK_MARKER,
  PORTABLE_HOOK_TOKENS,
  type PortableHookInstallDeps,
  renderPortableLefthookHook,
} from "@/lib/precommit/install-hooks";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const executableModeMask = 0o111;
const yamlCommandStub = "commands: {}";
const unknownLefthookSection = "not-a-git-hook";
const handwrittenHookContent = "#!/bin/sh\ncustom-hook \"$@\"\n";

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
    expect(hookContent).not.toContain(PORTABLE_HOOK_TOKENS.ABSOLUTE_PNPM_STORE_FRAGMENT);
  });

  it("provisions dependencies with a frozen-lockfile install before running lefthook when no binary is reachable", () => {
    const [hookName] = sampleHookNames();

    const hookContent = renderPortableLefthookHook(hookName);

    expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.FROZEN_INSTALL);
    expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.NON_INTERACTIVE_ENV);
    expect(hookContent).not.toContain(PORTABLE_HOOK_TOKENS.PNPM_EXEC_DELEGATION);
    expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.FALLBACK_WORKTREE_RUN);
  });

  it("recognizes a portable shim by a marker present in every rendered template version", () => {
    const [hookName] = sampleHookNames();
    const currentShim = renderPortableLefthookHook(hookName);
    const priorTemplateShim = currentShim.replace(
      PORTABLE_HOOK_TOKENS.FROZEN_INSTALL,
      PORTABLE_HOOK_TOKENS.PNPM_EXEC_DELEGATION,
    );

    expect(currentShim).toContain(PORTABLE_HOOK_MARKER);
    expect(priorTemplateShim).not.toBe(currentShim);
    expect(isPortableLefthookShim(currentShim)).toBe(true);
    expect(isPortableLefthookShim(priorTemplateShim)).toBe(true);
    expect(isPortableLefthookShim(handwrittenHookContent)).toBe(false);
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
        unlink,
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

  it("removes obsolete portable shims without deleting handwritten hooks", async () => {
    await withTempDir("spx-hook-install-", async (productDir) => {
      const [configuredHook, obsoletePortableHook, handwrittenHook] = GIT_HOOK_NAMES;
      if (
        configuredHook === undefined
        || obsoletePortableHook === undefined
        || handwrittenHook === undefined
      ) {
        throw new Error("Git hook registry must contain at least three names");
      }

      const hooksDir = join(productDir, GIT_DIRECTORY_NAME, GIT_HOOKS_DIRECTORY_NAME);
      // Install the obsolete shim as a prior-template render — it carries the shim marker
      // but differs from the current render — so the cleanup must recognize it across versions.
      const priorTemplateShim = renderPortableLefthookHook(obsoletePortableHook).replace(
        PORTABLE_HOOK_TOKENS.FROZEN_INSTALL,
        PORTABLE_HOOK_TOKENS.PNPM_EXEC_DELEGATION,
      );
      await mkdir(hooksDir, { recursive: true });
      await writeFile(join(productDir, LEFTHOOK_CONFIG_FILE), renderHookConfig([configuredHook]));
      await writeFile(join(hooksDir, obsoletePortableHook), priorTemplateShim);
      await writeFile(join(hooksDir, handwrittenHook), handwrittenHookContent);

      const deps: PortableHookInstallDeps = {
        run: async (command) => command === GIT_COMMAND ? hooksDir : "",
        readFile,
        writeFile,
        mkdir,
        chmod: chmodFs,
        unlink,
      };

      await installPortableLefthookHooks(productDir, deps);

      const installedHookNames = await readdir(hooksDir);

      expect(installedHookNames).not.toContain(obsoletePortableHook);
      expect(installedHookNames).toContain(handwrittenHook);
      expect(installedHookNames).toContain(configuredHook);
      await expect(readFile(join(hooksDir, handwrittenHook), HOOK_FILE_ENCODING)).resolves.toBe(handwrittenHookContent);
      await expect(readFile(join(hooksDir, configuredHook), HOOK_FILE_ENCODING)).resolves.toBe(
        renderPortableLefthookHook(configuredHook),
      );
    });
  });
});
