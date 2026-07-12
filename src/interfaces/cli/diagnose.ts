/**
 * Diagnose CLI — Commander registration descriptor for `spx diagnose`. Owns the
 * `--manifest` / `--format` parsing, wires the default check registry over the
 * real probes, and is the sole site of the process exit keyed to the overall
 * verdict.
 */
import { readFile } from "node:fs/promises";

import { type Command, Option } from "commander";

import { diagnoseCommand, type ManifestFileSystem } from "@/commands/diagnose";
import {
  createWorktreePoolSnapshotProvider,
  defaultMarketplaceInstallProbe,
  defaultMethodologyContextProbe,
  sessionEnvironmentProbeFromSnapshotProvider,
  sessionStoreProbeFromSnapshotProvider,
  worktreePoolProbeFromSnapshotProvider,
} from "@/commands/diagnose/probes";
import { defaultSpxReachabilityProbe } from "@/commands/diagnose/spx-reachability-probe";
import { marketplaceInstallRunner } from "@/domains/diagnose/checks/marketplace-install";
import { methodologyContextRunner } from "@/domains/diagnose/checks/methodology-context";
import { sessionEnvironmentRunner } from "@/domains/diagnose/checks/session-environment";
import { sessionStoreRunner } from "@/domains/diagnose/checks/session-store";
import { spxReachabilityRunner } from "@/domains/diagnose/checks/spx-reachability";
import { worktreePoolRunner } from "@/domains/diagnose/checks/worktree-pool";
import type { CheckRegistry } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_OUTPUT_MODE, type DiagnoseOutputMode } from "@/domains/diagnose/report";
import type { Domain } from "@/domains/types";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { resolveColorChoice } from "@/lib/styled-output/styled-output";

/** Source-owned `spx diagnose` command and flag vocabulary, shared with the CLI tests. */
export const DIAGNOSE_CLI = {
  COMMAND: "diagnose",
  MANIFEST_FLAG: "--manifest",
  VERBOSE_FLAG: "--verbose",
  JSON_FLAG: "--json",
  REMOVED_FORMAT_FLAG: "--format",
  COLOR_FLAG: "--color",
  NO_COLOR_FLAG: "--no-color",
} as const;

const DIAGNOSE_OPTION_NAME = {
  VERBOSE: "verbose",
  JSON: "json",
} as const;

const DIAGNOSE_DOMAIN_DESCRIPTION =
  "Run deterministic environment-diagnostics checks, resolving facts from spx.config or a --manifest";

function defaultRegistry(): CheckRegistry {
  const worktreePoolSnapshot = createWorktreePoolSnapshotProvider();
  return {
    [CHECK_NAME.SPX_REACHABILITY]: spxReachabilityRunner(defaultSpxReachabilityProbe),
    [CHECK_NAME.SESSION_ENVIRONMENT]: sessionEnvironmentRunner(
      sessionEnvironmentProbeFromSnapshotProvider(worktreePoolSnapshot),
    ),
    [CHECK_NAME.WORKTREE_POOL]: worktreePoolRunner(worktreePoolProbeFromSnapshotProvider(worktreePoolSnapshot)),
    [CHECK_NAME.SESSION_STORE]: sessionStoreRunner(sessionStoreProbeFromSnapshotProvider(worktreePoolSnapshot)),
    [CHECK_NAME.MARKETPLACE_INSTALL]: marketplaceInstallRunner(defaultMarketplaceInstallProbe),
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner(defaultMethodologyContextProbe),
  };
}

const DEFAULT_MANIFEST_FILE_SYSTEM: ManifestFileSystem = {
  readFile: (path) => readFile(path, "utf8"),
};

function handleError(error: string, io: CliIo): never {
  // Sanitize before echoing: the error embeds user-supplied manifest path and
  // check-name bytes.
  io.writeStderr(`Error: ${sanitizeCliArgument(error)}\n`);
  return io.exit(1);
}

export interface DiagnoseDomainDependencies {
  readonly registry?: CheckRegistry;
  readonly fs?: ManifestFileSystem;
}

/** Creates the Commander descriptor with injectable diagnostic providers and manifest I/O. */
export function createDiagnoseDomain(dependencies: DiagnoseDomainDependencies = {}): Domain {
  return {
    name: DIAGNOSE_CLI.COMMAND,
    description: DIAGNOSE_DOMAIN_DESCRIPTION,
    register: (program: Command, invocation: CliInvocation) => {
      program.configureOutput({
        writeErr: (value) => invocation.io.writeStderr(sanitizeCliArgument(value)),
      });
      program
        .command(DIAGNOSE_CLI.COMMAND)
        .description(DIAGNOSE_DOMAIN_DESCRIPTION)
        .option(
          `${DIAGNOSE_CLI.MANIFEST_FLAG} <path>`,
          "Path to a declarative diagnose manifest that fully instruments the diagnosis",
        )
        .addOption(new Option(DIAGNOSE_CLI.VERBOSE_FLAG, "Render every diagnostic fact").conflicts(
          DIAGNOSE_OPTION_NAME.JSON,
        ))
        .addOption(new Option(DIAGNOSE_CLI.JSON_FLAG, "Render the complete machine-readable report").conflicts(
          DIAGNOSE_OPTION_NAME.VERBOSE,
        ))
        .addOption(new Option(`${DIAGNOSE_CLI.COLOR_FLAG}`, "Force colored output"))
        .addOption(new Option(`${DIAGNOSE_CLI.NO_COLOR_FLAG}`, "Disable colored output"))
        .action(async (options: { manifest?: string; verbose?: boolean; json?: boolean; color?: boolean }) => {
          const outputMode: DiagnoseOutputMode = options.json
            ? DIAGNOSE_OUTPUT_MODE.JSON
            : options.verbose
            ? DIAGNOSE_OUTPUT_MODE.VERBOSE
            : DIAGNOSE_OUTPUT_MODE.CONCISE;
          const result = await diagnoseCommand({
            manifestPath: options.manifest,
            productDir: invocation.resolveProductContext().productDir,
            outputMode,
            color: resolveColorChoice({
              flag: options.color,
              noColor: process.env.NO_COLOR,
              isTty: Boolean(process.stdout.isTTY),
            }),
            registry: dependencies.registry ?? defaultRegistry(),
            fs: dependencies.fs ?? DEFAULT_MANIFEST_FILE_SYSTEM,
          });
          if (!result.ok) {
            handleError(result.error, invocation.io);
          }
          invocation.io.writeStdout(`${result.value.output}\n`);
          invocation.io.setExitCode(result.value.exitCode);
        });
    },
  };
}

/** Diagnose CLI — Commander registration descriptor for the `spx diagnose` command. */
export const diagnoseDomain: Domain = createDiagnoseDomain();
