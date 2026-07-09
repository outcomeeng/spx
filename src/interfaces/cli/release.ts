import type { Command } from "commander";

import { ClaudeAgentRunner } from "@/agent/claude-agent-runner";
import { releaseNotesCommand } from "@/commands/release";
import type { Domain } from "@/domains/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

export const RELEASE_CLI = {
  COMMAND: "release",
  NOTES_COMMAND: "notes",
  CHANGELOG_PATH_OPTION: "--changelog-path <path>",
} as const;

const RELEASE_DOMAIN_DESCRIPTION = "Prepare release artifacts from the current product history";
const RELEASE_NOTES_DESCRIPTION = "Generate release notes for the current package version";

export const releaseDomain: Domain = {
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
          const output = await releaseNotesCommand({
            productDir: invocation.resolveProductContext().productDir,
            config: { changelogPath: options.changelogPath },
            agentRunner: new ClaudeAgentRunner(),
          });
          invocation.io.writeStdout(`${output}\n`);
        } catch (error) {
          invocation.io.writeStderr(`Error: ${sanitizeCliArgument(errorMessage(error))}\n`);
          invocation.io.exit(1);
        }
      });
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
