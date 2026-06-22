/**
 * Diagnose CLI — Commander registration descriptor for `spx diagnose`. Owns the
 * `--manifest` / `--format` parsing, wires the default check registry over the
 * real probes, and is the sole site of the process exit keyed to the overall
 * verdict.
 */
import { readFile } from "node:fs/promises";

import { type Command, Option } from "commander";

import { diagnoseCommand } from "@/commands/diagnose";
import { spxReachabilityRunner } from "@/domains/diagnose/checks/spx-reachability";
import type { CheckRegistry } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT, type DiagnoseFormat } from "@/domains/diagnose/report";
import type { Domain } from "@/domains/types";
import { defaultSpxReachabilityProbe } from "@/lib/diagnose/spx-reachability-probe";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

/** Source-owned `spx diagnose` command and flag vocabulary, shared with the CLI tests. */
export const DIAGNOSE_CLI = {
  COMMAND: "diagnose",
  MANIFEST_FLAG: "--manifest",
  FORMAT_FLAG: "--format",
} as const;

const DIAGNOSE_DOMAIN_DESCRIPTION = "Run deterministic environment-diagnostics checks from a declarative manifest";

/** The check runners `spx diagnose` dispatches to, over the real probes. */
const DEFAULT_REGISTRY: CheckRegistry = {
  [CHECK_NAME.SPX_REACHABILITY]: spxReachabilityRunner(defaultSpxReachabilityProbe),
};

function handleError(error: string): never {
  // The error can embed user-supplied bytes — the manifest path and manifest-named
  // checks — so sanitize before the diagnostic echo per spx/13-cli.enabler/cli.md.
  console.error("Error:", sanitizeCliArgument(error));
  process.exit(1);
}

/**
 * Diagnose CLI — Commander registration descriptor for the `spx diagnose` command.
 */
export const diagnoseDomain: Domain = {
  name: DIAGNOSE_CLI.COMMAND,
  description: DIAGNOSE_DOMAIN_DESCRIPTION,
  register: (program: Command) => {
    program
      .command(DIAGNOSE_CLI.COMMAND)
      .description(DIAGNOSE_DOMAIN_DESCRIPTION)
      .requiredOption(`${DIAGNOSE_CLI.MANIFEST_FLAG} <path>`, "Path to the declarative diagnose manifest")
      .addOption(
        new Option(`${DIAGNOSE_CLI.FORMAT_FLAG} <format>`, "Output format")
          .choices([DIAGNOSE_FORMAT.TEXT, DIAGNOSE_FORMAT.JSON])
          .default(DIAGNOSE_FORMAT.TEXT),
      )
      .action(async (options: { manifest: string; format: DiagnoseFormat }) => {
        const result = await diagnoseCommand({
          manifestPath: options.manifest,
          format: options.format,
          registry: DEFAULT_REGISTRY,
          fs: { readFile: (path) => readFile(path, "utf8") },
        });
        if (!result.ok) handleError(result.error);
        console.log(result.value.output);
        process.exit(result.value.exitCode);
      });
  },
};
