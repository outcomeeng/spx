import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import { z } from "zod";

import { diagnoseCommand } from "@/commands/diagnose";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import type { CheckRegistry } from "@/domains/diagnose/engine";
import { CHECK_NAME, type CheckName, type DiagnoseManifest } from "@/domains/diagnose/manifest";
import type { DiagnoseFormat } from "@/domains/diagnose/report";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { manifestJson } from "@testing/generators/diagnose/manifest";
import type { OutputModeScenario } from "@testing/generators/diagnose/output-modes";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE, VERSION_FLAG } from "@testing/harnesses/constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export const DIAGNOSE_OUTPUT_TEST_POLICY = { timeout: CLI_TIMEOUTS_MS.E2E_BATCH } as const;

/** Reads the retired invocation as one inert CLI request payload. */
export async function retiredDiagnoseArgv(): Promise<readonly string[]> {
  return z.array(z.string()).parse(JSON.parse(
    await readFile(
      new URL("../../fixtures/diagnose/retired-format.argv.json", import.meta.url),
      "utf8",
    ),
  ));
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
    await writeFile(
      join(productDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({
        diagnose: { checks: [CHECK_NAME.WORKTREE_POOL, CHECK_NAME.MARKETPLACE_INSTALL] },
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
        registry,
        fs: { readFile: (path) => readFile(path, "utf8") },
      });
      return { result, calls, manifests };
    });
  });
}
