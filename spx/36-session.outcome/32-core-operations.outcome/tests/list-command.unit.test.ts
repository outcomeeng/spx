/**
 * Unit tests for session list command behavior.
 *
 * Test Level: 1 (Unit)
 * - listCommand with real temp directories (fs is Level 1)
 * - Verifies default status filtering, explicit status filtering, text/JSON output
 *
 * Assertions covered from core-operations.md:
 * - list without --status shows only DEFAULT_LIST_STATUSES
 * - list --status <valid> shows only that status
 * - SessionStatus derives from SESSION_STATUSES constant
 * - Input validation rejects invalid status values (property-based)
 */

import fc from "fast-check";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listCommand } from "@/commands/session/list";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { DEFAULT_LIST_STATUSES, SESSION_STATUSES, type SessionStatus } from "@/session/types";
import { createTempSessionsDir } from "./helpers";

// -- Derived constants (no hardcoded status strings) --

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;
const { statusDirs } = DEFAULT_CONFIG.sessions;

/**
 * Maps a status to its directory within a sessions root.
 */
function statusDir(sessionsRoot: string, status: SessionStatus): string {
  return join(sessionsRoot, statusDirs[status]);
}

/**
 * Creates a minimal session file with YAML front matter.
 */
async function writeSession(
  dir: string,
  id: string,
  opts: { priority?: string; tags?: string[] } = {},
): Promise<void> {
  const priority = opts.priority ?? "medium";
  const tags = opts.tags?.length ? `\ntags: [${opts.tags.join(", ")}]` : "";
  const content = `---\npriority: ${priority}${tags}\n---\n# Session ${id}\n`;
  await writeFile(join(dir, `${id}.md`), content);
}

describe("listCommand", () => {
  let sessionsDir: string;
  let dirs: Record<SessionStatus, string>;

  beforeEach(async () => {
    sessionsDir = await createTempSessionsDir();
    dirs = {} as Record<SessionStatus, string>;
    for (const status of SESSION_STATUSES) {
      dirs[status] = statusDir(sessionsDir, status);
      await mkdir(dirs[status], { recursive: true });
    }
  });

  afterEach(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });

  // -- Default behavior (no --status) --

  describe("GIVEN sessions in all directories WHEN list invoked without --status", () => {
    it("THEN shows only DEFAULT_LIST_STATUSES, not others", async () => {
      await writeSession(dirs[TODO], "2026-01-10_10-00-00", { priority: "low", tags: ["backlog"] });
      await writeSession(dirs[DOING], "2026-01-11_10-00-00", { priority: "high", tags: ["active"] });
      await writeSession(dirs[ARCHIVE], "2026-01-09_10-00-00", { priority: "medium" });

      const output = await listCommand({ sessionsDir });

      for (const status of DEFAULT_LIST_STATUSES) {
        expect(output).toContain(`${status.toUpperCase()}:`);
      }
      for (const status of SESSION_STATUSES) {
        if (!DEFAULT_LIST_STATUSES.includes(status)) {
          expect(output).not.toContain(`${status.toUpperCase()}:`);
        }
      }
    });

    it("THEN default statuses appear in DEFAULT_LIST_STATUSES order", async () => {
      await writeSession(dirs[TODO], "2026-01-10_10-00-00");
      await writeSession(dirs[DOING], "2026-01-11_10-00-00");

      const output = await listCommand({ sessionsDir });

      let lastIndex = -1;
      for (const status of DEFAULT_LIST_STATUSES) {
        const idx = output.indexOf(`${status.toUpperCase()}:`);
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    });
  });

  describe("GIVEN empty directories WHEN list invoked without --status", () => {
    it("THEN shows DEFAULT_LIST_STATUSES sections with no-sessions message", async () => {
      const output = await listCommand({ sessionsDir });

      for (const status of DEFAULT_LIST_STATUSES) {
        expect(output).toContain(`${status.toUpperCase()}:`);
      }
      expect(output).toContain("(no sessions)");
      for (const status of SESSION_STATUSES) {
        if (!DEFAULT_LIST_STATUSES.includes(status)) {
          expect(output).not.toContain(`${status.toUpperCase()}:`);
        }
      }
    });
  });

  // -- Explicit --status filter --

  describe("GIVEN sessions in all directories WHEN list invoked with explicit --status", () => {
    it("THEN each valid status shows only that status section", async () => {
      await writeSession(dirs[TODO], "2026-01-10_10-00-00");
      await writeSession(dirs[DOING], "2026-01-11_10-00-00");
      await writeSession(dirs[ARCHIVE], "2026-01-09_10-00-00", { priority: "high" });

      for (const targetStatus of SESSION_STATUSES) {
        const output = await listCommand({ status: targetStatus, sessionsDir });

        expect(output).toContain(`${targetStatus.toUpperCase()}:`);
        for (const otherStatus of SESSION_STATUSES) {
          if (otherStatus !== targetStatus) {
            expect(output).not.toContain(`${otherStatus.toUpperCase()}:`);
          }
        }
      }
    });
  });

  describe("GIVEN sessions in todo WHEN list invoked with --status todo", () => {
    it("THEN sessions are sorted by priority then timestamp", async () => {
      await writeSession(dirs[TODO], "2026-01-10_10-00-00", { priority: "low" });
      await writeSession(dirs[TODO], "2026-01-12_10-00-00", { priority: "high" });
      await writeSession(dirs[TODO], "2026-01-11_10-00-00", { priority: "high" });

      const output = await listCommand({ status: TODO, sessionsDir });

      const lines = output.split("\n").filter((l) => l.trim().startsWith("2026-"));
      expect(lines[0]).toContain("2026-01-12_10-00-00");
      expect(lines[1]).toContain("2026-01-11_10-00-00");
      expect(lines[2]).toContain("2026-01-10_10-00-00");
    });
  });

  // -- JSON output --

  describe("GIVEN sessions WHEN list invoked with --json and no --status", () => {
    it("THEN JSON keys match DEFAULT_LIST_STATUSES only", async () => {
      for (const status of SESSION_STATUSES) {
        await writeSession(dirs[status], `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
      }

      const output = await listCommand({ format: "json", sessionsDir });
      const parsed = JSON.parse(output);

      for (const status of DEFAULT_LIST_STATUSES) {
        expect(parsed).toHaveProperty(status);
      }
      for (const status of SESSION_STATUSES) {
        if (!DEFAULT_LIST_STATUSES.includes(status)) {
          expect(parsed).not.toHaveProperty(status);
        }
      }
    });
  });

  describe("GIVEN sessions WHEN list invoked with --json and explicit --status", () => {
    it("THEN JSON contains only the requested status key", async () => {
      for (const status of SESSION_STATUSES) {
        await writeSession(dirs[status], `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
      }

      for (const targetStatus of SESSION_STATUSES) {
        const output = await listCommand({ status: targetStatus, format: "json", sessionsDir });
        const parsed = JSON.parse(output);

        expect(parsed).toHaveProperty(targetStatus);
        for (const otherStatus of SESSION_STATUSES) {
          if (otherStatus !== targetStatus) {
            expect(parsed).not.toHaveProperty(otherStatus);
          }
        }
      }
    });
  });

  // -- Input validation (property-based per ADR 001-cli-framework) --

  describe("GIVEN valid status values WHEN list invoked", () => {
    it("THEN every member of SESSION_STATUSES is accepted", async () => {
      for (const status of SESSION_STATUSES) {
        const output = await listCommand({ status, sessionsDir });
        expect(output).toContain(`${status.toUpperCase()}:`);
      }
    });
  });

  describe("GIVEN invalid status value WHEN list invoked", () => {
    it("THEN arbitrary strings not in SESSION_STATUSES throw with valid values listed", async () => {
      const validSet = new Set<string>(SESSION_STATUSES);
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter((s) => !validSet.has(s)),
          async (invalidStatus) => {
            await expect(
              listCommand({ status: invalidStatus, sessionsDir }),
            ).rejects.toThrow(new RegExp(SESSION_STATUSES.join(".*")));
          },
        ),
      );
    });
  });

  // -- SESSION_STATUSES derivation (P3) --

  describe("GIVEN SESSION_STATUSES constant", () => {
    it("THEN SessionStatus type is derived from it (contains exactly the expected members)", () => {
      // SESSION_STATUSES is the single source of truth — verify it has the members
      // that the directory structure expects (from DEFAULT_CONFIG)
      const configKeys = Object.keys(DEFAULT_CONFIG.sessions.statusDirs);
      expect([...SESSION_STATUSES]).toEqual(expect.arrayContaining(configKeys));
      expect(configKeys).toEqual(expect.arrayContaining([...SESSION_STATUSES]));
    });

    it("THEN DEFAULT_LIST_STATUSES is a subset of SESSION_STATUSES", () => {
      for (const status of DEFAULT_LIST_STATUSES) {
        expect(SESSION_STATUSES).toContain(status);
      }
    });
  });

  // -- Priority and tag display --

  describe("GIVEN sessions with priorities and tags WHEN listed", () => {
    it("THEN non-medium priorities are shown in brackets and tags in parens", async () => {
      await writeSession(dirs[TODO], "2026-01-10_10-00-00", { priority: "high", tags: ["ci", "fix"] });
      await writeSession(dirs[TODO], "2026-01-11_10-00-00"); // medium priority, no tags

      const output = await listCommand({ status: TODO, sessionsDir });

      expect(output).toContain("[high]");
      expect(output).toContain("(ci, fix)");
      expect(output).not.toContain("[medium]");
    });
  });
});
