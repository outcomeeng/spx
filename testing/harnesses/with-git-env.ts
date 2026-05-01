/**
 * Git test environment harness for pre-commit integration tests
 *
 * Creates an isolated git repository with:
 * - Symlinked node_modules from project (fast, no install needed)
 * - Minimal vitest config
 * - Lefthook pre-commit hook configured
 *
 * Used for Level 2 integration tests that verify real git + lefthook + vitest behavior.
 */
import { execa, type Options as ExecaOptions } from "execa";
import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink, writeFile as writeFileFs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRECOMMIT_PATH } from "@/lib/precommit/precommit-path";
import { buildGitTestEnvironment, GIT_TEST_CONFIG, GIT_TEST_SUBCOMMANDS, runGit } from "./git-test-constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root resolved from this helper's location */
const PROJECT_ROOT = resolve(__dirname, "../..");

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
export async function withGitEnv<T>(
  fn: (ctx: GitTestEnvContext) => Promise<T>,
): Promise<T> {
  const tempDir = join(tmpdir(), `spx-git-test-${randomUUID()}`);
  const precommitRelativePath = relative(PROJECT_ROOT, PRECOMMIT_PATH);
  await mkdir(tempDir, { recursive: true });

  try {
    // Symlink project config files (ensures tests verify ACTUAL configuration)
    const filesToSymlink = [
      "node_modules",
      "package.json",
      "vitest.config.ts",
      "tsconfig.json",
      "lefthook.yml",
    ];

    for (const file of filesToSymlink) {
      await symlink(join(PROJECT_ROOT, file), join(tempDir, file));
    }

    // Symlink src/lib/precommit specifically (NOT all of src/)
    // This allows lefthook to find src/lib/precommit/run.ts while letting
    // tests create their own src/ files without leaking to the real project

    await mkdir(join(tempDir, dirname(precommitRelativePath)), { recursive: true });
    await symlink(
      join(PRECOMMIT_PATH),
      join(tempDir, precommitRelativePath),
    );

    // Initialize git repo
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL]);
    await runGit(tempDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME]);

    // Install lefthook hooks
    await execa("npx", ["lefthook", "install"], {
      cwd: tempDir,
      env: buildGitTestEnvironment(),
      extendEnv: false,
    });

    // Create context helpers
    const exec = async (
      command: string | string[],
      options?: { reject?: boolean },
    ): Promise<ExecResult> => {
      const execaOpts: ExecaOptions = {
        cwd: tempDir,
        reject: options?.reject ?? true,
        env: buildGitTestEnvironment(),
        extendEnv: false,
      };

      try {
        let result;
        if (Array.isArray(command)) {
          // Array form: first element is command, rest are args
          const [cmd, ...args] = command;
          result = await execa(cmd, args, execaOpts);
        } else {
          // String form: use shell to parse (handles quotes, etc.)
          result = await execa(command, { ...execaOpts, shell: true });
        }
        return {
          exitCode: result.exitCode ?? 0,
          stdout: typeof result.stdout === "string" ? result.stdout : "",
          stderr: typeof result.stderr === "string" ? result.stderr : "",
        };
      } catch (error) {
        if (
          error
          && typeof error === "object"
          && "exitCode" in error
          && "stdout" in error
          && "stderr" in error
        ) {
          return {
            exitCode: (error as { exitCode: number }).exitCode,
            stdout: (error as { stdout: string }).stdout ?? "",
            stderr: (error as { stderr: string }).stderr ?? "",
          };
        }
        throw error;
      }
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
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });
  }
}
