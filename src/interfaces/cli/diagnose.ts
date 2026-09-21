/**
 * Diagnose CLI — Commander registration descriptor for `spx diagnose`. Owns the
 * manifest and output-selector parsing, wires the default check registry over the
 * real probes, and is the sole site of the process exit keyed to the overall
 * verdict.
 */
import { readFile } from "node:fs/promises";

import { type Command, Option } from "commander";

import { diagnoseCommand } from "@/commands/diagnose";
import {
  createMethodologyContextProbe,
  createWorktreePoolSnapshotProvider,
  defaultMarketplaceInstallProbe,
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
import { DIAGNOSE_FORMAT, type DiagnoseFormat } from "@/domains/diagnose/report";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { resolveColorChoice } from "@/lib/styled-output/styled-output";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

/** Source-owned `spx diagnose` command and flag vocabulary, shared with the CLI tests. */
export const DIAGNOSE_CLI = {
  COMMAND: "diagnose",
  MANIFEST_FLAG: "--manifest",
  VERBOSE_FLAG: "--verbose",
  JSON_FLAG: "--json",
  COLOR_FLAG: "--color",
  NO_COLOR_FLAG: "--no-color",
} as const;

const DIAGNOSE_DOMAIN_DESCRIPTION =
  "Run deterministic environment-diagnostics checks, resolving facts from spx.config or a --manifest";

function defaultRegistry(productDir: string, methodologyTreeRoot: string | undefined): CheckRegistry {
  const worktreePoolSnapshot = createWorktreePoolSnapshotProvider();
  return {
    [CHECK_NAME.SPX_REACHABILITY]: spxReachabilityRunner(defaultSpxReachabilityProbe),
    [CHECK_NAME.SESSION_ENVIRONMENT]: sessionEnvironmentRunner(
      sessionEnvironmentProbeFromSnapshotProvider(worktreePoolSnapshot),
    ),
    [CHECK_NAME.WORKTREE_POOL]: worktreePoolRunner(worktreePoolProbeFromSnapshotProvider(worktreePoolSnapshot)),
    [CHECK_NAME.SESSION_STORE]: sessionStoreRunner(sessionStoreProbeFromSnapshotProvider(worktreePoolSnapshot)),
    [CHECK_NAME.MARKETPLACE_INSTALL]: marketplaceInstallRunner(defaultMarketplaceInstallProbe),
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner(
      createMethodologyContextProbe({ treeRoot: methodologyTreeRoot, productDir }),
    ),
  };
}

function handleError(error: string, io: CliIo): never {
  io.writeStderr(renderTerminalText(terminal`Error: ${externalValue(error)}\n`));
  return io.exit(1);
}

export interface DiagnoseOutputSelection {
  readonly verbose?: boolean;
  readonly json?: boolean;
}

/** Maps the mutually exclusive selectors accepted by Commander to their presentation. */
export function resolveDiagnoseFormat(options: DiagnoseOutputSelection): DiagnoseFormat {
  if (options.json) return DIAGNOSE_FORMAT.JSON;
  return options.verbose ? DIAGNOSE_FORMAT.TEXT : DIAGNOSE_FORMAT.CONCISE;
}

/**
 * Diagnose CLI — Commander registration descriptor for the `spx diagnose` command.
 */
export const diagnoseDomain: Domain = {
  name: DIAGNOSE_CLI.COMMAND,
  description: DIAGNOSE_DOMAIN_DESCRIPTION,
  register: (program: Command, invocation: CliInvocation) => {
    const verbose = new Option(DIAGNOSE_CLI.VERBOSE_FLAG, "Show every check and its detailed diagnosis");
    const json = new Option(DIAGNOSE_CLI.JSON_FLAG, "Print the complete machine-readable report");
    verbose.conflicts(json.attributeName());
    json.conflicts(verbose.attributeName());
    program
      .command(DIAGNOSE_CLI.COMMAND)
      .description(DIAGNOSE_DOMAIN_DESCRIPTION)
      .option(
        `${DIAGNOSE_CLI.MANIFEST_FLAG} <path>`,
        "Path to a declarative diagnose manifest that fully instruments the diagnosis",
      )
      .addOption(verbose)
      .addOption(json)
      .addOption(new Option(`${DIAGNOSE_CLI.COLOR_FLAG}`, "Force colored output"))
      .addOption(new Option(`${DIAGNOSE_CLI.NO_COLOR_FLAG}`, "Disable colored output"))
      .action(async (options: DiagnoseOutputSelection & { manifest?: string; color?: boolean }) => {
        const { productDir } = invocation.resolveProductContext();
        const result = await diagnoseCommand({
          manifestPath: options.manifest,
          productDir,
          format: resolveDiagnoseFormat(options),
          version: invocation.version,
          color: resolveColorChoice({
            flag: options.color,
            noColor: process.env.NO_COLOR,
            isTty: Boolean(process.stdout.isTTY),
          }),
          registry: defaultRegistry(productDir, invocation.methodologyTreeRoot),
          fs: { readFile: (path) => readFile(path, "utf8") },
        });
        if (!result.ok) {
          handleError(result.error, invocation.io);
        }
        invocation.io.writeStdout(renderTerminalText(terminal`${result.value.output}\n`));
        invocation.io.setExitCode(result.value.exitCode);
      });
  },
};
