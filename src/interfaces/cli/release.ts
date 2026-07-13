import type { Command } from "commander";

import type { AgentRunner } from "@/agent/agent-runner";
import { ClaudeAgentRunner } from "@/agent/claude-agent-runner";
import {
  documentationSyncCommand,
  type DocumentationSyncCommandDependencies,
  type DocumentationSyncCommandOptions,
  releaseNotesCommand,
  UNIMPLEMENTED_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
} from "@/commands/release";
import type { DocumentationFaithfulnessAuditor } from "@/domains/release/documentation-sync";
import { createReleaseNotesFaithfulnessAuditor } from "@/domains/release/release-notes";
import type { Domain } from "@/domains/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

export const RELEASE_CLI = {
  COMMAND: "release",
  NOTES_COMMAND: "notes",
  DOCS_COMMAND: "docs",
  SYNC_COMMAND: "sync",
  CHANGELOG_PATH_OPTION: "--changelog-path <path>",
} as const;

const RELEASE_DOMAIN_DESCRIPTION = "Prepare release artifacts from the current product history";
const RELEASE_NOTES_DESCRIPTION = "Generate release notes for the current package version";
const RELEASE_DOCS_DESCRIPTION = "Manage release documentation";
const RELEASE_DOCS_SYNC_DESCRIPTION = "Update release documentation for the current package version";
const RELEASE_DOCS_SYNC_OUTPUT_PREFIX = "Updated documentation";

export interface ReleaseCliDependencies {
  readonly createDocumentationAgentRunner: () => AgentRunner;
  readonly createDocumentationFaithfulnessAuditor: (
    agentRunner: AgentRunner,
    productDir: string,
  ) => DocumentationFaithfulnessAuditor;
  readonly documentationSyncCommandDependencies: DocumentationSyncCommandDependencies;
}

const DEFAULT_RELEASE_CLI_DEPENDENCIES: ReleaseCliDependencies = {
  createDocumentationAgentRunner: () => new ClaudeAgentRunner(),
  createDocumentationFaithfulnessAuditor: () => async () => {
    throw new Error("documentation sync faithfulness audit is not implemented");
  },
  documentationSyncCommandDependencies: UNIMPLEMENTED_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
};

export function createReleaseDomain(
  overrides: Partial<ReleaseCliDependencies> = {},
): Domain {
  const deps = { ...DEFAULT_RELEASE_CLI_DEPENDENCIES, ...overrides };
  return {
    name: RELEASE_CLI.COMMAND,
    description: RELEASE_DOMAIN_DESCRIPTION,
    register: (program: Command, invocation: CliInvocation) => {
      const release = program
        .command(RELEASE_CLI.COMMAND)
        .description(RELEASE_DOMAIN_DESCRIPTION);

      release
        .command(RELEASE_CLI.NOTES_COMMAND)
        .description(RELEASE_NOTES_DESCRIPTION)
        .option(RELEASE_CLI.CHANGELOG_PATH_OPTION, "Changelog path within the product working tree")
        .action(async (options: { changelogPath?: string }) => {
          try {
            const productDir = invocation.resolveProductContext().productDir;
            const agentRunner = new ClaudeAgentRunner();
            const output = await releaseNotesCommand({
              productDir,
              config: { changelogPath: options.changelogPath },
              agentRunner,
              faithfulnessAuditor: createReleaseNotesFaithfulnessAuditor(
                agentRunner,
                productDir,
              ),
            });
            invocation.io.writeStdout(`${output}\n`);
          } catch (error) {
            invocation.io.writeStderr(`Error: ${sanitizeCliArgument(errorMessage(error))}\n`);
            invocation.io.exit(1);
          }
        });

      release
        .command(RELEASE_CLI.DOCS_COMMAND)
        .description(RELEASE_DOCS_DESCRIPTION)
        .command(RELEASE_CLI.SYNC_COMMAND)
        .description(RELEASE_DOCS_SYNC_DESCRIPTION)
        .action(async () => {
          try {
            const productDir = invocation.resolveProductContext().productDir;
            const agentRunner = deps.createDocumentationAgentRunner();
            const options: DocumentationSyncCommandOptions = {
              productDir,
              agentRunner,
              faithfulnessAuditor: deps.createDocumentationFaithfulnessAuditor(agentRunner, productDir),
            };
            const paths = await documentationSyncCommand(options, deps.documentationSyncCommandDependencies);
            for (const path of paths) {
              invocation.io.writeStdout(`${RELEASE_DOCS_SYNC_OUTPUT_PREFIX}: ${path}\n`);
            }
          } catch (error) {
            invocation.io.writeStderr(`Error: ${sanitizeCliArgument(errorMessage(error))}\n`);
            invocation.io.exit(1);
          }
        });
    },
  };
}

export const releaseDomain: Domain = createReleaseDomain();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
