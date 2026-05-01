/**
 * Scanner class for discovering work items in a project
 *
 * Encapsulates directory walking, filtering, and work item building with
 * configurable paths via dependency injection.
 *
 * @module scanner/scanner
 */
import type { SpxConfig } from "@/config/defaults";
import path from "node:path";
import type { WorkItem } from "../types";
import { buildWorkItemList, filterWorkItemDirectories, walkDirectory } from "./walk";

/**
 * Scanner for discovering work items in a project
 *
 * Uses dependency injection for configuration, eliminating hardcoded paths.
 * All directory paths are derived from the injected SpxConfig.
 *
 * @example
 * ```typescript
 * import { DEFAULT_CONFIG } from "@/config/defaults";
 *
 * const scanner = new Scanner("/path/to/project", DEFAULT_CONFIG);
 * const workItems = await scanner.scan();
 * ```
 */
export class Scanner {
  /**
   * Create a new Scanner instance
   *
   * @param projectRoot - Absolute path to the project root directory
   * @param config - Configuration object defining directory structure
   */
  constructor(
    private readonly projectRoot: string,
    private readonly config: SpxConfig,
  ) {}

  /**
   * Scan the project for work items in the "doing" status directory
   *
   * Walks the configured specs/work/doing directory, filters for valid
   * work item directories, and returns structured work item data.
   *
   * @returns Array of work items found in the doing directory
   * @throws Error if the directory doesn't exist or is inaccessible
   */
  async scan(): Promise<WorkItem[]> {
    const doingPath = this.getDoingPath();

    // Walk directory to find all subdirectories
    const allEntries = await walkDirectory(doingPath);

    // Filter to only valid work item directories
    const workItemEntries = filterWorkItemDirectories(allEntries);

    // Build work item list with metadata
    return buildWorkItemList(workItemEntries);
  }

  /**
   * Get the full path to the "doing" status directory
   *
   * Constructs path from config: {projectRoot}/{specs.root}/{work.dir}/{statusDirs.doing}
   *
   * @returns Absolute path to the doing directory
   */
  getDoingPath(): string {
    return path.join(
      this.projectRoot,
      this.config.specs.root,
      this.config.specs.work.dir,
      this.config.specs.work.statusDirs.doing,
    );
  }

  /**
   * Get the full path to the "backlog" status directory
   *
   * @returns Absolute path to the backlog directory
   */
  getBacklogPath(): string {
    return path.join(
      this.projectRoot,
      this.config.specs.root,
      this.config.specs.work.dir,
      this.config.specs.work.statusDirs.backlog,
    );
  }

  /**
   * Get the full path to the "done" status directory
   *
   * @returns Absolute path to the done/archive directory
   */
  getDonePath(): string {
    return path.join(
      this.projectRoot,
      this.config.specs.root,
      this.config.specs.work.dir,
      this.config.specs.work.statusDirs.done,
    );
  }

  /**
   * Get the full path to the specs root directory
   *
   * @returns Absolute path to the specs root
   */
  getSpecsRootPath(): string {
    return path.join(this.projectRoot, this.config.specs.root);
  }

  /**
   * Get the full path to the work directory
   *
   * @returns Absolute path to the work directory
   */
  getWorkPath(): string {
    return path.join(
      this.projectRoot,
      this.config.specs.root,
      this.config.specs.work.dir,
    );
  }
}
