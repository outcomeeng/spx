/**
 * Init command implementation
 *
 * Wrapper around `claude plugin marketplace` to install/update outcomeeng marketplace
 */
import { execa } from "execa";

/**
 * Options for init command
 */
export interface InitOptions {
  /** Working directory (for testing) */
  cwd?: string;
}

/**
 * Execute claude init command
 *
 * Wraps the Claude CLI's `plugin marketplace` commands to manage
 * the outcomeeng marketplace installation.
 *
 * Behavior:
 * 1. Check if outcomeeng marketplace exists via `claude plugin marketplace list`
 * 2. If missing: shell `claude plugin marketplace add outcomeeng/claude`
 * 3. If exists: shell `claude plugin marketplace update outcomeeng`
 * 4. Parse output and return status message
 *
 * @param options - Command options
 * @returns Status message
 * @throws Error if claude CLI not available or commands fail
 *
 * @example
 * ```typescript
 * const output = await initCommand();
 * console.log(output);
 * // Output: "✓ outcomeeng marketplace installed successfully"
 * //    or: "✓ outcomeeng marketplace updated successfully"
 * ```
 */
export async function initCommand(
  options: InitOptions = {},
): Promise<string> {
  const cwd = options.cwd || process.cwd();

  try {
    // Step 1: Check if outcomeeng marketplace exists
    const { stdout: listOutput } = await execa(
      "claude",
      ["plugin", "marketplace", "list"],
      { cwd },
    );

    const exists = listOutput.includes("outcomeeng");

    // Step 2: Add or update based on existence
    if (!exists) {
      // Add marketplace
      await execa(
        "claude",
        ["plugin", "marketplace", "add", "outcomeeng/claude"],
        { cwd },
      );

      return "✓ outcomeeng marketplace installed successfully\n\nRun 'claude plugin marketplace list' to view all marketplaces.";
    } else {
      // Update marketplace
      await execa("claude", ["plugin", "marketplace", "update", "outcomeeng"], {
        cwd,
      });

      return "✓ outcomeeng marketplace updated successfully\n\nThe marketplace is now up to date.";
    }
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific error conditions
      if (
        error.message.includes("ENOENT")
        || error.message.includes("command not found")
      ) {
        throw new Error(
          "Claude CLI not found. Please install Claude Code first.\n\nVisit: https://docs.anthropic.com/claude-code",
        );
      }

      throw new Error(`Failed to initialize marketplace: ${error.message}`);
    }
    throw error;
  }
}
