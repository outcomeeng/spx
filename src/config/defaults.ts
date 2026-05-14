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
  sessions: {
    dir: ".spx/sessions",
    statusDirs: {
      todo: "todo",
      doing: "doing",
      archive: "archive",
    },
  },
} as const satisfies SpxConfig;
