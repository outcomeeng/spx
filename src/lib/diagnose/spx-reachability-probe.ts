/**
 * The default spx-reachability probe — the real boundary the check reads its
 * reading through: it resolves `spx` on `PATH` and reads its reported version.
 * The pure classification lives in the domain; this module is the injected I/O
 * default the descriptor wires in.
 *
 * @module lib/diagnose/spx-reachability-probe
 */

import { execa } from "execa";
import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";

import type { SpxReachabilityProbe, SpxReachabilityReading } from "@/domains/diagnose/checks/spx-reachability";

const SPX_BINARY = "spx";
const VERSION_FLAG = "--version";

async function resolveOnPath(binary: string, pathValue: string | undefined): Promise<string | null> {
  if (pathValue === undefined || pathValue.length === 0) return null;
  for (const dir of pathValue.split(delimiter)) {
    if (dir.length === 0) continue;
    const candidate = join(dir, binary);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not an executable on this PATH entry; keep scanning.
    }
  }
  return null;
}

function extractVersion(output: string): string | null {
  const match = /\d{1,9}\.\d{1,9}\.\d{1,9}/.exec(output);
  return match === null ? null : match[0];
}

/** Resolves `spx` on PATH and reads its version; an absent binary is a clean reading, a thrown probe is errored. */
export const defaultSpxReachabilityProbe: SpxReachabilityProbe = {
  async probe(): Promise<SpxReachabilityReading> {
    try {
      const resolvedPath = await resolveOnPath(SPX_BINARY, process.env.PATH);
      if (resolvedPath === null) {
        return { resolvedPath: null, version: null, errored: false };
      }
      const result = await execa(resolvedPath, [VERSION_FLAG], { reject: false });
      const version = result.exitCode === 0 ? extractVersion(result.stdout) : null;
      return { resolvedPath, version, errored: false };
    } catch {
      return { resolvedPath: null, version: null, errored: true };
    }
  },
};
