/**
 * Git test environment harness for pre-commit integration tests
 *
 * Creates an isolated git repository with:
 * - Symlinked node_modules from project (fast, no install needed)
 * - Minimal vitest config for spx test
 * - Lefthook pre-commit hook configured
 *
 * Used for Level 2 integration tests that verify real git + lefthook + spx test behavior.
 */
import { execa, type Options as ExecaOptions } from "execa";
import { mkdir, readFile, symlink, writeFile as writeFileFs } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PREPARE_HOOK_ENTRYPOINT } from "@/interfaces/cli/invocation";
import { PRECOMMIT_PATH } from "@/lib/precommit/precommit-path";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  runGit,
  runTsxFile,
} from "./git-test-constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root resolved from this helper's location */
const PRODUCT_ROOT = resolve(__dirname, "../..");
const BASELINE_COMMIT_MESSAGE = "baseline fixture";

/**
 * Result from executing a command
 */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Context provided to test callback
 */
export interface GitTestEnvContext {
  /** Absolute path to test environment root */
  path: string;

  /**
   * Execute a shell command in the test environment
   * @param command - Command and arguments as single string or array
   * @param options - Execa options (reject: false to not throw on non-zero exit)
   */
  exec: (
    command: string | string[],
    options?: { reject?: boolean },
  ) => Promise<ExecResult>;

  /**
   * Write a file relative to test environment root
   * @param relativePath - Path relative to test root
   * @param content - File content
   */
  writeFile: (relativePath: string, content: string) => Promise<void>;
}

type GitEnvExecOptions = { reject?: boolean };

interface ExecaResultLike {
  exitCode?: number;
  stdout?: unknown;
  stderr?: unknown;
}

function toExecResult(result: ExecaResultLike): ExecResult {
  return {
    exitCode: result.exitCode ?? 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function execResultFromError(error: unknown): ExecResult | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const failedProcess = error as ExecaResultLike;
  return typeof failedProcess.exitCode === "number"
    ? toExecResult(failedProcess)
    : undefined;
}

async function runGitEnvCommand(
  tempDir: string,
  command: string | string[],
  options?: GitEnvExecOptions,
): Promise<ExecResult> {
  const execaOpts: ExecaOptions = {
    cwd: tempDir,
    reject: options?.reject ?? true,
    env: buildGitTestEnvironment(),
    extendEnv: false,
  };

  try {
    const result = Array.isArray(command)
      ? await execa(command[0], command.slice(1), execaOpts)
      : await execa(command, { ...execaOpts, shell: true });
    return toExecResult(result);
  } catch (error) {
    const result = execResultFromError(error);
    if (result) {
      return result;
    }
    throw error;
  }
}

/**
 * Execute test with isolated git environment
 *
 * @example
 * await withGitEnv(async ({ path, exec, writeFile }) => {
 *   await writeFile("src/math.ts", "export const add = (a, b) => a + b;");
 *   await writeFile("tests/math.test.ts", `
 *     import { expect, it } from "vitest";
 *     it("passes", () => expect(1).toBe(1));
 *   `);
 *
 *   await exec("git add .");
 *   const result = await exec("git commit -m 'test'", { reject: false });
 *   expect(result.exitCode).toBe(0);
 * });
 */
export function withGitEnv<T>(
  fn: (ctx: GitTestEnvContext) => Promise<T>,
): Promise<T> {
  return withTempDir("spx-git-test-", async (tempDir) => {
    const precommitRelativePath = relative(PRODUCT_ROOT, PRECOMMIT_PATH);
    const configFilenamesRelativePath = "src/config/filenames.ts";
    const sourceRootsRelativePath = "src/config/source-roots.ts";
    const configDomainRelativePath = "src/domains/config";
    const gitLibRelativePath = "src/lib/git";

    // Symlink project config files (ensures tests verify ACTUAL configuration)
    const filesToSymlink = ["node_modules", "lefthook.yml"];
    const filesToCopy = ["package.json", "vitest.config.ts", "tsconfig.json"];

    for (const file of filesToSymlink) {
      await symlink(join(PRODUCT_ROOT, file), join(tempDir, file));
    }
    for (const file of filesToCopy) {
      await writeFileFs(join(tempDir, file), await readFile(join(PRODUCT_ROOT, file)));
    }

    // Symlink src/lib/precommit specifically (NOT all of src/)
    // This allows lefthook to find src/lib/precommit/run.ts while letting
    // tests create their own src/ files without leaking to the real project

    await mkdir(join(tempDir, dirname(precommitRelativePath)), { recursive: true });
    await symlink(
      join(PRECOMMIT_PATH),
      join(tempDir, precommitRelativePath),
    );
    await mkdir(join(tempDir, dirname(configFilenamesRelativePath)), { recursive: true });
    await symlink(
      join(PRODUCT_ROOT, configFilenamesRelativePath),
      join(tempDir, configFilenamesRelativePath),
    );
    await symlink(
      join(PRODUCT_ROOT, sourceRootsRelativePath),
      join(tempDir, sourceRootsRelativePath),
    );
    await mkdir(join(tempDir, dirname(configDomainRelativePath)), { recursive: true });
    await symlink(
      join(PRODUCT_ROOT, configDomainRelativePath),
      join(tempDir, configDomainRelativePath),
    );
    await mkdir(join(tempDir, dirname(gitLibRelativePath)), { recursive: true });
    await symlink(
      join(PRODUCT_ROOT, gitLibRelativePath),
      join(tempDir, gitLibRelativePath),
    );

    // Initialize git repo
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL]);
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME]);
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.ADD, "."]);
    await runGit(tempDir, [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      BASELINE_COMMIT_MESSAGE,
    ]);

    // Install hooks through the entrypoint that the product prepare script invokes.
    await runTsxFile(tempDir, PREPARE_HOOK_ENTRYPOINT);

    // Create context helpers
    const exec = async (
      command: string | string[],
      options?: GitEnvExecOptions,
    ): Promise<ExecResult> => {
      return await runGitEnvCommand(tempDir, command, options);
    };

    const writeFile = async (
      relativePath: string,
      content: string,
    ): Promise<void> => {
      const fullPath = join(tempDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFileFs(fullPath, content);
    };

    return await fn({ path: tempDir, exec, writeFile });
  });
}
