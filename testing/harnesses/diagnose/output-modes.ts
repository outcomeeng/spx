import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

import { diagnoseCommand } from "@/commands/diagnose";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { DEFAULT_METHODOLOGY_SOURCE, METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import type { CheckRegistry } from "@/domains/diagnose/engine";
import { CHECK_NAME, type CheckName, type DiagnoseManifest } from "@/domains/diagnose/manifest";
import type { DiagnoseFormat } from "@/domains/diagnose/report";
import { DIAGNOSE_CLI, DIAGNOSE_CONCISE_SELECTORS } from "@/interfaces/cli/diagnose";
import { manifestJson } from "@testing/generators/diagnose/manifest";
import type { OutputModeScenario } from "@testing/generators/diagnose/output-modes";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE, VERSION_FLAG } from "@testing/harnesses/constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export const DIAGNOSE_OUTPUT_TEST_POLICY = { timeout: CLI_TIMEOUTS_MS.E2E_BATCH } as const;

/**
 * A methodology coordinate no shipped tree provides, so the methodology-context
 * check degrades rather than resolving. Its major is far above any released
 * line, which is what makes the outcome independent of what is installed.
 */
export const UNPROVIDED_METHODOLOGY = { source: DEFAULT_METHODOLOGY_SOURCE, version: "9999.0.0" } as const;

/** Initializes the temp product as a repository so the worktree-pool and session-store checks can read it. */
async function initProductRepository(productDir: string): Promise<void> {
  await execa("git", ["init", "--quiet", "--initial-branch", "main"], { cwd: productDir });
  await execa("git", [
    "-c",
    "user.email=harness@example.invalid",
    "-c",
    "user.name=harness",
    "commit",
    "--quiet",
    "--allow-empty",
    "--message",
    "init",
  ], { cwd: productDir });
}

export async function withDiagnoseOutputCli<T>(
  callback: (env: {
    readonly version: string;
    readonly missingManifest: string;
    readonly run: (args: readonly string[]) => Promise<{
      readonly stdout: string;
      readonly stderr: string;
      readonly exitCode: number;
    }>;
  }) => Promise<T>,
): Promise<T> {
  return withTempDir("diagnose-output-", async (productDir) => {
    // The product is a real repository and declares a methodology version no
    // shipped tree provides, so the run carries healthy checks and an actionable
    // one together: the worktree pool and the session store classify healthy,
    // and the methodology context degrades. A render that hides healthy detail
    // is only observable where a healthy check is present to be hidden.
    await initProductRepository(productDir);
    await writeFile(
      join(productDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        [DIAGNOSE_SECTION]: {
          [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [
            CHECK_NAME.WORKTREE_POOL,
            CHECK_NAME.SESSION_STORE,
            CHECK_NAME.METHODOLOGY_CONTEXT,
          ],
        },
        [METHODOLOGY_SECTION]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: UNPROVIDED_METHODOLOGY.source,
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: UNPROVIDED_METHODOLOGY.version,
        },
      }),
    );
    const version = await execa(NODE_EXECUTABLE, [CLI_PATH, VERSION_FLAG]);
    return callback({
      version: version.stdout,
      missingManifest: join(productDir, "absent.json"),
      run: async (args) => {
        const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
          cwd: productDir,
          env: { HOME: productDir, PATH: process.env.PATH },
          extendEnv: false,
          reject: false,
        });
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
      },
    });
  });
}

/** Recording providers expose calls and inputs; the real handler still resolves, folds, and renders. */
export async function withDiagnoseOutputScenario<T>(
  scenario: OutputModeScenario,
  callback: (
    run: (format: DiagnoseFormat) => Promise<{
      readonly result: Awaited<ReturnType<typeof diagnoseCommand>>;
      readonly calls: readonly string[];
      readonly manifests: readonly DiagnoseManifest[];
    }>,
  ) => Promise<T>,
): Promise<T> {
  return withTempDir("diagnose-output-property-", async (productDir) => {
    const manifestPath = join(productDir, "manifest.json");
    await writeFile(manifestPath, manifestJson(scenario.facts));
    return callback(async (format) => {
      const calls: string[] = [];
      const manifests: DiagnoseManifest[] = [];
      const registry: CheckRegistry = Object.fromEntries(scenario.report.checks.map((check) => [
        check.name as CheckName,
        async (manifest: DiagnoseManifest) => {
          calls.push(check.name);
          manifests.push(structuredClone(manifest));
          return structuredClone(check);
        },
      ]));
      const result = await diagnoseCommand({
        productDir,
        manifestPath,
        format,
        color: scenario.color,
        version: scenario.version,
        selectors: DIAGNOSE_CONCISE_SELECTORS,
        registry,
        fs: { readFile: (path) => readFile(path, "utf8") },
      });
      return { result, calls, manifests };
    });
  });
}
