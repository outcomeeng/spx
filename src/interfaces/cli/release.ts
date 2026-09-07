import type { Command } from "commander";

import type { AgentRunner } from "@/agent/agent-runner";
import { ClaudeAgentRunner } from "@/agent/claude-agent-runner";
import {
  DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
  documentationSyncCommand,
  type DocumentationSyncCommandDependencies,
  type DocumentationSyncCommandOptions,
  publishReleaseCommand,
  releaseNotesCommand,
} from "@/commands/release";
import {
  createDocumentationFaithfulnessAuditor,
  type DocumentationFaithfulnessAuditor,
} from "@/domains/release/documentation-sync";
import { RELEASE_PUBLICATION_WORKFLOW } from "@/domains/release/publication-workflow";
import { createReleaseNotesFaithfulnessAuditor } from "@/domains/release/release-notes";
import type { Domain } from "@/interfaces/cli/domain";
import { PACKAGED_CLI_INVOCATION } from "@/interfaces/cli/invocation";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import {
  formatDocumentationSyncOutput,
  formatReleaseNotesOutput,
  formatReleasePublicationOutput,
} from "@/interfaces/cli/release-output";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

const RELEASE_TAG_FLAG = "--tag";

export const RELEASE_CLI = {
  COMMAND: "release",
  NOTES_COMMAND: "notes",
  DOCS_COMMAND: "docs",
  SYNC_COMMAND: "sync",
  PUBLISH_COMMAND: "publish",
  CHANGELOG_PATH_OPTION: "--changelog-path <path>",
  TAG_FLAG: RELEASE_TAG_FLAG,
  TAG_OPTION: `${RELEASE_TAG_FLAG} <tag>`,
} as const;

/** The packaged-executable invocation the publication workflow must run, handing it the triggering tag. */
export const RELEASE_PUBLISH_INVOCATION = [
  PACKAGED_CLI_INVOCATION,
  RELEASE_CLI.COMMAND,
  RELEASE_CLI.PUBLISH_COMMAND,
  RELEASE_CLI.TAG_FLAG,
  `"${RELEASE_PUBLICATION_WORKFLOW.TRIGGERING_REF}"`,
].join(" ");

const RELEASE_DOMAIN_DESCRIPTION = "Prepare release artifacts from the current product history";
const RELEASE_NOTES_DESCRIPTION = "Generate release notes for the current package version";
const RELEASE_DOCS_DESCRIPTION = "Manage release documentation";
const RELEASE_DOCS_SYNC_DESCRIPTION = "Update release documentation for the current package version";
const RELEASE_PUBLISH_DESCRIPTION = "Publish the tagged package and reconcile its GitHub Release";
const RELEASE_PUBLISH_TAG_DESCRIPTION = "Release tag that triggered publication, verified against the package version";

export interface ReleaseCliDependencies {
  readonly createDocumentationAgentRunner: () => AgentRunner;
  readonly createDocumentationFaithfulnessAuditor: (
    agentRunner: AgentRunner,
    productDir: string,
  ) => DocumentationFaithfulnessAuditor;
  readonly documentationSyncCommandDependencies: DocumentationSyncCommandDependencies;
  readonly publishReleaseCommand: typeof publishReleaseCommand;
}

const DEFAULT_RELEASE_CLI_DEPENDENCIES: ReleaseCliDependencies = {
  createDocumentationAgentRunner: () => new ClaudeAgentRunner(),
  createDocumentationFaithfulnessAuditor: (_agentRunner, productDir) =>
    createDocumentationFaithfulnessAuditor(new ClaudeAgentRunner(), productDir),
  documentationSyncCommandDependencies: DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
  publishReleaseCommand,
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
            invocation.io.writeStdout(formatReleaseNotesOutput(output));
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
              invocation.io.writeStdout(formatDocumentationSyncOutput(path));
            }
          } catch (error) {
            invocation.io.writeStderr(`Error: ${sanitizeCliArgument(errorMessage(error))}\n`);
            invocation.io.exit(1);
          }
        });

      release
        .command(RELEASE_CLI.PUBLISH_COMMAND)
        .description(RELEASE_PUBLISH_DESCRIPTION)
        .requiredOption(RELEASE_CLI.TAG_OPTION, RELEASE_PUBLISH_TAG_DESCRIPTION)
        .option(RELEASE_CLI.CHANGELOG_PATH_OPTION, "Changelog path within the product working tree")
        .action(async (options: { tag: string; changelogPath?: string }) => {
          try {
            const tag = await deps.publishReleaseCommand({
              productDir: invocation.resolveProductContext().productDir,
              tag: options.tag,
              changelogPath: options.changelogPath,
            });
            invocation.io.writeStdout(formatReleasePublicationOutput(tag));
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
