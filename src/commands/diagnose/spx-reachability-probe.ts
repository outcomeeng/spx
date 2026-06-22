/**
 * The default spx-reachability probe — the real boundary the check reads its
 * reading through: it resolves `spx` on `PATH` and reads its reported version.
 * The pure classification lives in the domain; this module is the injected I/O
 * default the descriptor wires in.
 *
 * @module commands/diagnose/spx-reachability-probe
 */

import { execa } from "execa";

import type { SpxReachabilityProbe, SpxReachabilityReading } from "@/domains/diagnose/checks/spx-reachability";
import { findExecutableOnPath } from "@/lib/executable-on-path";

const SPX_BINARY = "spx";
const VERSION_FLAG = "--version";

function extractVersion(output: string): string | null {
  const match = /\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,64})?/.exec(output);
  return match === null ? null : match[0];
}

/** Resolves `spx` on PATH and reads its version; an absent binary is a clean reading, a thrown probe is errored. */
export const defaultSpxReachabilityProbe: SpxReachabilityProbe = {
  async probe(): Promise<SpxReachabilityReading> {
    try {
      const resolvedPath = findExecutableOnPath(SPX_BINARY);
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
