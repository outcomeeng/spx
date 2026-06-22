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

import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { arbitrarySpxFloor } from "@testing/generators/diagnose/manifest";

async function diagnoseTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "diagnose-cli-"));
}

/** Writes a minimal spx-reachability manifest to a fresh temp dir and returns its path. */
export async function writeSpxReachabilityManifest(): Promise<string> {
  const [floor] = fc.sample(arbitrarySpxFloor(), { numRuns: 1, seed: 7 });
  const dir = await diagnoseTempDir();
  const manifestPath = join(dir, "diagnose.json");
  await writeFile(manifestPath, JSON.stringify({ checks: [CHECK_NAME.SPX_REACHABILITY], spx_floor: floor }));
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
