/**
 * Default configuration for spx CLI
 *
 * This module defines the default directory structure and configuration
 * constants used throughout the spx CLI. All directory paths should reference
 * this configuration instead of using hardcoded strings.
 *
 * @module config/defaults
 */

/**
 * Configuration schema for spx CLI directory structure
 */
export interface SpxConfig {
  /**
   * Specifications directory configuration
   */
  specs: {
    /**
     * Base directory for all specification files
     * @default "specs"
     */
    root: string;

    /**
     * Work items organization
     */
    work: {
      /**
       * Container directory for all work items
       * @default "work"
       */
      dir: string;

      /**
       * Status-based subdirectories for work items
       */
      statusDirs: {
        /**
         * Active work directory
         * @default "doing"
         */
        doing: string;

        /**
         * Future work directory
         * @default "backlog"
         */
        backlog: string;

        /**
         * Completed work directory
         * @default "archive"
         */
        done: string;
      };
    };

    /**
     * Product-level architecture decision records directory
     * @default "decisions"
     */
    decisions: string;

    /**
     * Templates directory (optional)
     * @default "templates"
     */
    templates?: string;
  };

  /**
   * Session handoff files configuration
   */
  sessions: {
    /**
     * Directory for session handoff files
     * @default ".spx/sessions"
     */
    dir: string;

    /**
     * Status-based subdirectories for sessions
     */
    statusDirs: {
      /**
       * Available sessions directory
       * @default "todo"
       */
      todo: string;

      /**
       * Claimed sessions directory
       * @default "doing"
       */
      doing: string;

      /**
       * Archived sessions directory
       * @default "archive"
       */
      archive: string;
    };
  };
}

/**
 * Default configuration constant
 *
 * This is the embedded default configuration that spx uses when no
 * .spx/config.json file exists in the product.
 *
 * DO NOT modify this constant at runtime - it should remain immutable.
 */
export const DEFAULT_CONFIG = {
  specs: {
    root: "specs",
    work: {
      dir: "work",
      statusDirs: {
        doing: "doing",
        backlog: "backlog",
        done: "archive",
      },
    },
    decisions: "decisions",
    templates: "templates",
  },
  sessions: {
    dir: ".spx/sessions",
    statusDirs: {
      todo: "todo",
      doing: "doing",
      archive: "archive",
    },
  },
} as const satisfies SpxConfig;
