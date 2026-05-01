/**
 * Session test harness — reusable fixture factory for session tests.
 *
 * Provides temp directory creation, session file writing, and status directory
 * lookup. All values derive from SESSION_STATUSES and DEFAULT_CONFIG — no
 * hardcoded status strings.
 *
 * @module session/testing/harness
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { buildSessionFrontMatterContent } from "@/domains/session/create";
import { SESSION_STATUSES, type SessionStatus } from "@/domains/session/types";

const { statusDirs } = DEFAULT_CONFIG.sessions;

export function buildSessionMarkdownBody(title: string): string {
  return `# ${title}`;
}

/**
 * Metadata options for writing a session file.
 */
export interface SessionMetadataOptions {
  /** Priority level. Defaults to "medium". */
  priority?: string;
  /** Free-form tags. */
  tags?: string[];
  /** Additional YAML fields as raw string lines. */
  extraYaml?: string[];
}

/**
 * Session test harness interface.
 */
export interface SessionHarness {
  /** Absolute path to the temp sessions root directory. */
  readonly sessionsDir: string;

  /** Returns the absolute path to the directory for the given status. */
  statusDir(status: SessionStatus): string;

  /** Writes a session file with YAML front matter in the given status directory. */
  writeSession(status: SessionStatus, id: string, opts?: SessionMetadataOptions): Promise<string>;

  /** Removes the temp directory and all contents. */
  cleanup(): Promise<void>;
}

/**
 * Creates a session test harness with a temp directory containing
 * one subdirectory per member of SESSION_STATUSES.
 *
 * @returns A harness with helpers for writing sessions and cleanup
 */
export async function createSessionHarness(): Promise<SessionHarness> {
  const sessionsDir = await mkdtemp(join(tmpdir(), "spx-session-harness-"));

  // Create one subdirectory per status, derived from DEFAULT_CONFIG
  for (const status of SESSION_STATUSES) {
    await mkdir(join(sessionsDir, statusDirs[status]), { recursive: true });
  }

  return {
    sessionsDir,

    statusDir(status: SessionStatus): string {
      return join(sessionsDir, statusDirs[status]);
    },

    async writeSession(
      status: SessionStatus,
      id: string,
      opts: SessionMetadataOptions = {},
    ): Promise<string> {
      const priority = opts.priority ?? "medium";
      const lines = [`priority: ${priority}`];

      if (opts.tags?.length) {
        lines.push(`tags: [${opts.tags.join(", ")}]`);
      }

      if (opts.extraYaml) {
        lines.push(...opts.extraYaml);
      }

      const content = buildSessionFrontMatterContent(lines, `# Session ${id}\n`);
      const filePath = join(sessionsDir, statusDirs[status], `${id}.md`);
      await writeFile(filePath, content);
      return filePath;
    },

    async cleanup(): Promise<void> {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}
