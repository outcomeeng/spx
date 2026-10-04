import { chmod as chmodFs, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { parse } from "yaml";

import { BUILD_INVOCATION, VITEST_RUN_INVOCATION } from "@/interfaces/cli/invocation";
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
const rebuildCommandName = "rebuild-dist";
const installDepsCommandName = "install-deps";
const preCommitSectionName = "pre-commit";
const prePushSectionName = "pre-push";
const postCheckoutSectionName = "post-checkout";
const postMergeSectionName = "post-merge";
const postRewriteSectionName = "post-rewrite";
const commandsKey = "commands";
const runKey = "run";
const prePushValidationCommandFragments = [
  BUILD_INVOCATION,
  "pnpm run validate",
  "pnpm test",
  "pnpm run test",
  VITEST_RUN_INVOCATION,
  "spx test",
].map((fragment) => fragment.toLowerCase());
const sonarCloudCommitBoundaryFragments = ["sonar", "spx_sonar", "testing/fixtures", "fixture-exclusion"] as const;

type LefthookConfig = Record<string, unknown>;

function sampleHookNames(): readonly [GitHookName, GitHookName] {
  return [GIT_HOOK_NAMES[0], GIT_HOOK_NAMES[1]];
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

function asConfigRecord(value: unknown): LefthookConfig {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as LefthookConfig;
}

function readConfigSection(config: LefthookConfig, sectionName: string): LefthookConfig {
  return asConfigRecord(config[sectionName]);
}

function readCommands(config: LefthookConfig, sectionName: string): LefthookConfig {
  return asConfigRecord(readConfigSection(config, sectionName)[commandsKey]);
}

function readCommand(config: LefthookConfig, sectionName: string, commandName: string): LefthookConfig {
  return asConfigRecord(readCommands(config, sectionName)[commandName]);
}

function readCommandRun(config: LefthookConfig, sectionName: string, commandName: string): string {
  const run = readCommand(config, sectionName, commandName)[runKey];
  expect(run).toBeTypeOf("string");
  return run as string;
}

function hasConfigSection(config: LefthookConfig, sectionName: string): boolean {
  return Object.hasOwn(config, sectionName);
}

function serializedConfigSection(config: LefthookConfig, sectionName: string): string | null {
  if (!hasConfigSection(config, sectionName)) {
    return null;
  }

  return JSON.stringify(readConfigSection(config, sectionName)).toLowerCase();
}

async function readProductLefthookConfig(): Promise<LefthookConfig> {
  return asConfigRecord(parse(await readFile(join(process.cwd(), LEFTHOOK_CONFIG_FILE), HOOK_FILE_ENCODING)));
}

export function assertConfiguredHookNameParsing(): void {
  expect(configuredHookNames(renderHookConfig(sampleHookNames()))).toEqual(sampleHookNames());
}

export async function assertLefthookConfigAvoidsCommitBoundaryValidationHooks(): Promise<void> {
  const config = await readProductLefthookConfig();
  const prePushSection = serializedConfigSection(config, prePushSectionName);

  expect(config).not.toHaveProperty(preCommitSectionName);
  if (prePushSection !== null) {
    for (const fragment of prePushValidationCommandFragments) {
      expect(prePushSection).not.toContain(fragment);
    }
  }
}

export async function assertLefthookConfigDeclaresNoSonarCloudCommitBoundaryHook(): Promise<void> {
  const config = await readProductLefthookConfig();
  const commitBoundarySections = [preCommitSectionName, prePushSectionName] as const;

  for (const sectionName of commitBoundarySections) {
    const section = serializedConfigSection(config, sectionName);
    if (section === null) {
      continue;
    }

    for (const fragment of sonarCloudCommitBoundaryFragments) {
      expect(section).not.toContain(fragment);
    }
  }
}

export async function assertLefthookConfigRoutesLifecycleHooksThroughGates(): Promise<void> {
  const config = await readProductLefthookConfig();
  const postMergeRun = readCommandRun(config, postMergeSectionName, rebuildCommandName);
  const postRewriteRun = readCommandRun(config, postRewriteSectionName, rebuildCommandName);
  const postCheckoutRun = readCommandRun(config, postCheckoutSectionName, installDepsCommandName);

  expect(Object.keys(readCommands(config, postMergeSectionName))).toEqual([rebuildCommandName]);
  expect(Object.keys(readCommands(config, postRewriteSectionName))).toEqual([rebuildCommandName]);
  expect(Object.keys(readCommands(config, postCheckoutSectionName))).toEqual([installDepsCommandName]);
  expect(postMergeRun).toContain("src/lib/precommit/main-checkout-gate.ts");
  expect(postRewriteRun).toContain("src/lib/precommit/main-checkout-gate.ts");
  expect(postCheckoutRun).toContain("src/lib/precommit/deps-install-gate.ts");
  expect(postCheckoutRun).toContain("pnpm install --frozen-lockfile");
}

export function assertRenderedHookUsesWorktreeResolution(): void {
  const [hookName] = sampleHookNames();
  const hookContent = renderPortableLefthookHook(hookName);
  const worktreeBinaryIndex = hookContent.indexOf(PORTABLE_HOOK_TOKENS.WORKTREE_BINARY);
  const pathBinaryIndex = hookContent.indexOf("command -v lefthook");

  expect(hookContent).toContain(`hook_name="${hookName}"`);
  expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.WORKTREE_RESOLUTION);
  expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.WORKTREE_BINARY);
  expect(worktreeBinaryIndex).toBeGreaterThan(-1);
  expect(pathBinaryIndex).toBeGreaterThan(-1);
  expect(worktreeBinaryIndex).toBeLessThan(pathBinaryIndex);
  expect(hookContent).not.toContain(PORTABLE_HOOK_TOKENS.ABSOLUTE_PNPM_STORE_FRAGMENT);
}

export function assertRenderedHookHonorsExplicitOverrideFirst(): void {
  const [hookName] = sampleHookNames();
  const hookContent = renderPortableLefthookHook(hookName);
  const explicitOverrideIndex = hookContent.indexOf("LEFTHOOK_BIN");
  const worktreeBinaryIndex = hookContent.indexOf(PORTABLE_HOOK_TOKENS.WORKTREE_BINARY);

  expect(explicitOverrideIndex).toBeGreaterThan(-1);
  expect(worktreeBinaryIndex).toBeGreaterThan(-1);
  expect(explicitOverrideIndex).toBeLessThan(worktreeBinaryIndex);
}

export function assertRenderedHookProvisionsWithFrozenInstall(): void {
  const [hookName] = sampleHookNames();
  const hookContent = renderPortableLefthookHook(hookName);

  expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.FROZEN_INSTALL);
  expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.NON_INTERACTIVE_ENV);
  expect(hookContent).not.toContain(PORTABLE_HOOK_TOKENS.PNPM_EXEC_DELEGATION);
  expect(hookContent).toContain(PORTABLE_HOOK_TOKENS.FALLBACK_WORKTREE_RUN);
}

export function assertPortableShimMarkerRecognition(): void {
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
}

export async function assertPortableHookInstallWritesExecutableShims(): Promise<void> {
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
      unlink: async () => {},
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
}

export async function assertObsoletePortableHooksAreRemoved(): Promise<void> {
  await withTempDir("spx-hook-install-", async (productDir) => {
    const [configuredHook, obsoletePortableHook, handwrittenHook] = GIT_HOOK_NAMES;

    const hooksDir = join(productDir, GIT_DIRECTORY_NAME, GIT_HOOKS_DIRECTORY_NAME);
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
      unlink: async (path) => {
        await unlink(path);
      },
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
}
