/**
 * Diagnose CLI test harness — owns the temp-dir prefix and manifest filenames the
 * l2 CLI scenarios write, so the scenario and compliance tests share one source
 * of those values instead of duplicating them.
 *
 * @module testing/harnesses/diagnose/cli
 */

import fc from "fast-check";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";

import { DEFAULT_METHODOLOGY_SOURCE, DEFAULT_METHODOLOGY_VERSION } from "@/config/methodology";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { arbitraryManifestFacts, arbitrarySpxFloor, manifestJson } from "@testing/generators/diagnose/manifest";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";

export interface DiagnoseCliRun {
  readonly stdout: string;
  readonly exitCode: number;
}

export async function runDiagnoseCli(
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string },
): Promise<DiagnoseCliRun> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
    reject: false,
    env: options?.env,
    cwd: options?.cwd,
  });
  return { stdout: result.stdout, exitCode: result.exitCode ?? 1 };
}

export interface SpxReachabilityManifestFixture {
  readonly manifestPath: string;
  readonly spxFloor: string;
}

async function diagnoseTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "diagnose-cli-"));
}

/** Writes a minimal spx-reachability manifest to a fresh temp dir and returns its path and generated facts. */
export async function writeSpxReachabilityManifestFixture(): Promise<SpxReachabilityManifestFixture> {
  const [floor] = fc.sample(arbitrarySpxFloor(), { numRuns: 1, seed: 7 });
  const dir = await diagnoseTempDir();
  const manifestPath = join(dir, "diagnose.json");
  await writeFile(manifestPath, JSON.stringify({ checks: [CHECK_NAME.SPX_REACHABILITY], spx_floor: floor }));
  return { manifestPath, spxFloor: floor };
}

/** Writes a minimal spx-reachability manifest to a fresh temp dir and returns its path. */
export async function writeSpxReachabilityManifest(): Promise<string> {
  const { manifestPath } = await writeSpxReachabilityManifestFixture();
  return manifestPath;
}

/** Writes a manifest selecting every known check, with the consumer facts each check requires. */
export async function writeAllChecksManifest(): Promise<string> {
  const [facts] = fc.sample(arbitraryManifestFacts(), { numRuns: 1, seed: 7 });
  const dir = await diagnoseTempDir();
  const manifestPath = join(dir, "diagnose.json");
  await writeFile(
    manifestPath,
    manifestJson({
      ...facts,
      checks: Object.values(CHECK_NAME),
      methodologySource: DEFAULT_METHODOLOGY_SOURCE,
      methodologyVersion: DEFAULT_METHODOLOGY_VERSION,
    }),
  );
  return manifestPath;
}

/** Returns a path to a manifest that does not exist, with the given infix spliced into the filename. */
export async function absentManifestPath(infix: string): Promise<string> {
  const dir = await diagnoseTempDir();
  return join(dir, `manifest${infix}.json`);
}

/** Writes a manifest whose check set is the single given name to a fresh temp dir and returns its path. */
export async function writeManifestNamingCheck(checkName: string): Promise<string> {
  const dir = await diagnoseTempDir();
  const manifestPath = join(dir, "diagnose.json");
  await writeFile(manifestPath, JSON.stringify({ checks: [checkName] }));
  return manifestPath;
}
