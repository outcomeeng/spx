import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { DEFAULT_METHODOLOGY_SOURCE } from "@/config/methodology";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { arbitraryManifestFacts, arbitrarySpxFloor, manifestJson } from "@testing/generators/diagnose/manifest";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { METHODOLOGY_FIXTURE_VERSION } from "@testing/harnesses/spec/context";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export interface DiagnoseCliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface DiagnoseCliEnvironment {
  readonly productDir: string;
  readonly isolatedEnvironment: NodeJS.ProcessEnv;
  readonly noColorEnvironment: NodeJS.ProcessEnv;
  run(args: readonly string[], options?: { readonly env?: NodeJS.ProcessEnv }): Promise<DiagnoseCliRun>;
  writeConfig(config: unknown): Promise<void>;
  writeReachabilityManifest(): Promise<{ readonly manifestPath: string; readonly spxFloor: string }>;
  writeAllChecksManifest(): Promise<string>;
  absentManifestPath(infix: string): string;
  writeManifestNamingCheck(checkName: string): Promise<string>;
}

/** Owns the real subprocess and temporary product for each diagnose interaction. */
export async function withDiagnoseCli<T>(callback: (env: DiagnoseCliEnvironment) => Promise<T>): Promise<T> {
  return withTempDir("diagnose-cli-", async (productDir) => {
    const manifestPath = join(productDir, "diagnose.json");
    return callback({
      productDir,
      isolatedEnvironment: { HOME: productDir, PATH: process.env.PATH },
      noColorEnvironment: { ...process.env, NO_COLOR: String(true) },
      run: async (args, options) => {
        const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
          reject: false,
          extendEnv: options?.env === undefined,
          env: options?.env,
          cwd: productDir,
        });
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
      },
      writeConfig: async (config) => {
        await writeFile(join(productDir, DEFAULT_CONFIG_FILENAME), JSON.stringify(config));
      },
      writeReachabilityManifest: async () => {
        const spxFloor = sampleGeneratedValue(arbitrarySpxFloor());
        await writeFile(manifestPath, JSON.stringify({ checks: [CHECK_NAME.SPX_REACHABILITY], spx_floor: spxFloor }));
        return { manifestPath, spxFloor };
      },
      writeAllChecksManifest: async () => {
        await writeFile(
          manifestPath,
          manifestJson({
            ...sampleGeneratedValue(arbitraryManifestFacts()),
            checks: Object.values(CHECK_NAME),
            methodologySource: DEFAULT_METHODOLOGY_SOURCE,
            methodologyVersion: METHODOLOGY_FIXTURE_VERSION,
          }),
        );
        return manifestPath;
      },
      absentManifestPath: (infix) => join(productDir, `manifest${infix}.json`),
      writeManifestNamingCheck: async (checkName) => {
        await writeFile(manifestPath, JSON.stringify({ checks: [checkName] }));
        return manifestPath;
      },
    });
  });
}
