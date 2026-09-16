import { constants } from "node:fs";
import { access, chmod, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { withTempDir } from "@testing/harnesses/with-temp-dir";

/** One production Git invocation observed at the process boundary. */
export interface RecordedGitInvocation {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface ProductionGitObservation<T> {
  readonly value: T;
  readonly invocations: readonly RecordedGitInvocation[];
}

export const GIT_REMOTE_SUBCOMMANDS = ["clone", "fetch", "pull", "push", "ls-remote", "remote", "submodule"] as const;

const OBSERVER_TEMP_PREFIX = "spx-release-git-observer-";
const OBSERVER_SCRIPT_NAME = "git-observer.cjs";
const OBSERVER_LOG_NAME = "git-invocations.jsonl";
const GIT_EXECUTABLE_NAME = "git";
const WINDOWS_GIT_EXECUTABLE_NAME = "git.exe";
const WINDOWS_LAUNCHER_NAME = "git.cmd";
const MODEL_CREDENTIAL_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;

export async function observeProductionGitInvocations<T>(
  operation: () => Promise<T>,
): Promise<ProductionGitObservation<T>> {
  return withTempDir(OBSERVER_TEMP_PREFIX, async (observerDir) => {
    const originalPath = process.env.PATH;
    if (originalPath === undefined) throw new Error("PATH is required to observe production Git invocations");
    const realGit = await resolveExecutable(originalPath);
    const logPath = join(observerDir, OBSERVER_LOG_NAME);
    const scriptPath = join(observerDir, OBSERVER_SCRIPT_NAME);
    await writeFile(scriptPath, observerScript(realGit, logPath));
    await writeLaunchers(observerDir, scriptPath);
    const capturedCredentials = MODEL_CREDENTIAL_KEYS.map((key) => [key, process.env[key]] as const);
    process.env.PATH = observerDir;
    for (const key of MODEL_CREDENTIAL_KEYS) delete process.env[key];
    try {
      const value = await operation();
      return { value, invocations: await readInvocations(logPath) };
    } finally {
      process.env.PATH = originalPath;
      for (const [key, value] of capturedCredentials) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}

async function resolveExecutable(pathValue: string): Promise<string> {
  const executableNames = process.platform === "win32"
    ? [WINDOWS_GIT_EXECUTABLE_NAME, GIT_EXECUTABLE_NAME]
    : [GIT_EXECUTABLE_NAME];
  for (const directory of pathValue.split(delimiter)) {
    for (const executable of executableNames) {
      const candidate = join(directory, executable);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  }
  throw new Error("Git executable was not found on PATH");
}

async function writeLaunchers(observerDir: string, scriptPath: string): Promise<void> {
  const posixLauncher = join(observerDir, GIT_EXECUTABLE_NAME);
  await writeFile(posixLauncher, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} "$@"\n`);
  await chmod(posixLauncher, constants.S_IRUSR | constants.S_IWUSR | constants.S_IXUSR);
  await writeFile(
    join(observerDir, WINDOWS_LAUNCHER_NAME),
    `@"${process.execPath.replaceAll("\"", "\"\"")}" "${scriptPath.replaceAll("\"", "\"\"")}" %*\r\n`,
  );
}

function observerScript(realGit: string, logPath: string): string {
  return [
    "const { appendFileSync } = require(\"node:fs\");",
    "const { spawnSync } = require(\"node:child_process\");",
    "const args = process.argv.slice(2);",
    String.raw`appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + "\n");`,
    `const result = spawnSync(${JSON.stringify(realGit)}, args, { env: process.env, stdio: "inherit" });`,
    "if (result.error !== undefined) throw result.error;",
    "process.exit(result.status ?? 1);",
    "",
  ].join("\n");
}

async function readInvocations(logPath: string): Promise<readonly RecordedGitInvocation[]> {
  let content: string;
  try {
    content = await readFile(logPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
  return content.split("\n").filter(Boolean).map((line) => ({
    executable: GIT_EXECUTABLE_NAME,
    args: JSON.parse(line) as string[],
  }));
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
