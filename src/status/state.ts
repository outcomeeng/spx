/**
 * Status determination state machine for work items
 */
import { access, readdir, stat } from "fs/promises";
import path from "path";
import type { WorkItemStatus } from "../types";

/**
 * Input flags for status determination
 */
export interface StatusFlags {
  /** Whether tests/ directory exists */
  hasTestsDir: boolean;
  /** Whether tests/DONE.md exists */
  hasDoneMd: boolean;
  /** Whether tests/ directory is empty (excluding DONE.md) */
  testsIsEmpty: boolean;
}

/**
 * Determines work item status based on tests/ directory state
 *
 * Truth Table:
 * | hasTestsDir | testsIsEmpty | hasDoneMd | Status      |
 * |-------------|--------------|-----------|-------------|
 * | false       | N/A          | N/A       | OPEN        |
 * | true        | true         | false     | OPEN        |
 * | true        | true         | true      | DONE        |
 * | true        | false        | false     | IN_PROGRESS |
 * | true        | false        | true      | DONE        |
 *
 * @param flags - Status determination flags
 * @returns Work item status as OPEN, IN_PROGRESS, or DONE
 *
 * @example
 * ```typescript
 * // No tests directory
 * determineStatus({ hasTestsDir: false, hasDoneMd: false, testsIsEmpty: true })
 * // => "OPEN"
 *
 * // Tests directory with files, no DONE.md
 * determineStatus({ hasTestsDir: true, hasDoneMd: false, testsIsEmpty: false })
 * // => "IN_PROGRESS"
 *
 * // Tests directory with DONE.md
 * determineStatus({ hasTestsDir: true, hasDoneMd: true, testsIsEmpty: false })
 * // => "DONE"
 * ```
 */
export function determineStatus(flags: StatusFlags): WorkItemStatus {
  // No tests directory → OPEN
  if (!flags.hasTestsDir) {
    return "OPEN";
  }

  // Has DONE.md → DONE (regardless of other files)
  if (flags.hasDoneMd) {
    return "DONE";
  }

  // Has tests directory but empty → OPEN
  if (flags.testsIsEmpty) {
    return "OPEN";
  }

  // Has tests directory with files, no DONE.md → IN_PROGRESS
  return "IN_PROGRESS";
}

/**
 * Checks if a work item has a tests/ directory
 *
 * @param workItemPath - Absolute path to the work item directory
 * @returns Promise resolving to true if tests/ exists, false otherwise
 *
 * @example
 * ```typescript
 * const hasTests = await hasTestsDirectory('/path/to/story-21');
 * // => true if /path/to/story-21/tests exists
 * ```
 */
export async function hasTestsDirectory(
  workItemPath: string,
): Promise<boolean> {
  try {
    const testsPath = path.join(workItemPath, "tests");
    await access(testsPath);
    return true;
  } catch (error) {
    // ENOENT means directory doesn't exist → return false
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    // Re-throw permission errors and other failures
    throw error;
  }
}

/**
 * Checks if a tests/ directory is empty (has no test files)
 *
 * A directory is considered empty if it contains no files, or only contains:
 * - DONE.md (completion marker, not a test)
 * - Dotfiles like .gitkeep (version control artifacts, not tests)
 *
 * @param testsPath - Absolute path to the tests/ directory
 * @returns Promise resolving to true if empty, false if has test files
 *
 * @example
 * ```typescript
 * // Directory with only DONE.md
 * await isTestsDirectoryEmpty('/path/to/tests');
 * // => true (DONE.md doesn't count as a test)
 *
 * // Directory with test files
 * await isTestsDirectoryEmpty('/path/to/tests');
 * // => false
 * ```
 */
export async function isTestsDirectoryEmpty(
  testsPath: string,
): Promise<boolean> {
  try {
    const entries = await readdir(testsPath);

    // Filter out DONE.md and dotfiles
    const testFiles = entries.filter((entry) => {
      // Exclude DONE.md
      if (entry === "DONE.md") {
        return false;
      }
      // Exclude dotfiles (.gitkeep, .DS_Store, etc.)
      if (entry.startsWith(".")) {
        return false;
      }
      return true;
    });

    // Empty if no test files remain after filtering
    return testFiles.length === 0;
  } catch (error) {
    // ENOENT means directory doesn't exist → treat as empty
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return true;
    }
    // Re-throw permission errors and other failures
    throw error;
  }
}

/**
 * Checks if a tests/ directory contains a DONE.md file
 *
 * Verifies that DONE.md exists and is a regular file (not a directory).
 * The check is case-sensitive: only "DONE.md" is accepted.
 *
 * @param testsPath - Absolute path to the tests/ directory
 * @returns Promise resolving to true if DONE.md exists, false otherwise
 *
 * @example
 * ```typescript
 * // Tests directory with DONE.md
 * await hasDoneMd('/path/to/tests');
 * // => true
 *
 * // Tests directory without DONE.md
 * await hasDoneMd('/path/to/tests');
 * // => false
 * ```
 */
export async function hasDoneMd(testsPath: string): Promise<boolean> {
  try {
    // Case-sensitive check: read directory and verify exact filename
    const entries = await readdir(testsPath);

    // Check if "DONE.md" exists in the directory listing (case-sensitive)
    if (!entries.includes("DONE.md")) {
      return false;
    }

    // Verify it's a regular file, not a directory
    const donePath = path.join(testsPath, "DONE.md");
    const stats = await stat(donePath);
    return stats.isFile();
  } catch (error) {
    // ENOENT means directory doesn't exist → return false
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    // Re-throw permission errors and other failures
    throw error;
  }
}

/**
 * Custom error for status determination failures
 */
export class StatusDeterminationError extends Error {
  constructor(
    public readonly workItemPath: string,
    public readonly cause: unknown,
  ) {
    const errorMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to determine status for ${workItemPath}: ${errorMessage}`);
    this.name = "StatusDeterminationError";
  }
}

/**
 * Determines the status of a work item by checking its tests/ directory
 *
 * This is the main orchestration function that combines all status checks:
 * 1. Checks if tests/ directory exists
 * 2. Checks if tests/ has DONE.md
 * 3. Checks if tests/ is empty (excluding DONE.md)
 * 4. Determines final status based on these flags
 *
 * Performance: Uses caching strategy to minimize filesystem calls.
 * All checks for a single work item are performed in one pass.
 *
 * @param workItemPath - Absolute path to the work item directory
 * @returns Promise resolving to OPEN, IN_PROGRESS, or DONE
 * @throws {StatusDeterminationError} If work item doesn't exist or has permission errors
 *
 * @example
 * ```typescript
 * // Work item with no tests directory
 * await getWorkItemStatus('/path/to/story-21');
 * // => "OPEN"
 *
 * // Work item with tests but no DONE.md
 * await getWorkItemStatus('/path/to/story-32');
 * // => "IN_PROGRESS"
 *
 * // Work item with DONE.md
 * await getWorkItemStatus('/path/to/story-43');
 * // => "DONE"
 * ```
 */
export async function getWorkItemStatus(
  workItemPath: string,
): Promise<WorkItemStatus> {
  try {
    // Step 0: Verify work item path exists
    try {
      await access(workItemPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Work item not found: ${workItemPath}`);
      }
      // Permission error or other failure
      throw error;
    }

    // Step 1: Check if tests/ directory exists
    const testsPath = path.join(workItemPath, "tests");
    let hasTests: boolean;
    try {
      await access(testsPath);
      hasTests = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        hasTests = false;
      } else {
        // Permission error or other failure
        throw error;
      }
    }

    // Early return if no tests directory
    if (!hasTests) {
      return determineStatus({
        hasTestsDir: false,
        hasDoneMd: false,
        testsIsEmpty: true,
      });
    }

    // Step 2: Read tests/ directory once (caching strategy)
    // This single readdir call gives us all the data we need
    const entries = await readdir(testsPath);

    // Step 3: Check for DONE.md (from cached entries)
    const hasDone = entries.includes("DONE.md");
    if (hasDone) {
      // Verify it's a file, not a directory
      const donePath = path.join(testsPath, "DONE.md");
      const stats = await stat(donePath);
      if (!stats.isFile()) {
        // DONE.md is a directory, treat as no DONE.md
        return determineStatus({
          hasTestsDir: true,
          hasDoneMd: false,
          testsIsEmpty: isEmptyFromEntries(entries),
        });
      }
    }

    // Step 4: Check if empty (from cached entries)
    const isEmpty = isEmptyFromEntries(entries);

    // Step 5: Determine final status
    return determineStatus({
      hasTestsDir: true,
      hasDoneMd: hasDone,
      testsIsEmpty: isEmpty,
    });
  } catch (error) {
    // Wrap all errors with work item context
    throw new StatusDeterminationError(workItemPath, error);
  }
}

/**
 * Helper: Check if directory is empty from readdir entries
 * @param entries - Directory entries from readdir
 * @returns true if no test files (excluding DONE.md and dotfiles)
 */
function isEmptyFromEntries(entries: string[]): boolean {
  const testFiles = entries.filter((entry) => {
    // Exclude DONE.md
    if (entry === "DONE.md") {
      return false;
    }
    // Exclude dotfiles (.gitkeep, .DS_Store, etc.)
    if (entry.startsWith(".")) {
      return false;
    }
    return true;
  });
  return testFiles.length === 0;
}
