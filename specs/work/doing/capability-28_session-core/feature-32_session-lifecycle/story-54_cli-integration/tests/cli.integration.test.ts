/**
 * CLI integration tests for session commands.
 *
 * Test Level: 2 (Integration)
 * - Tests full CLI command execution through Commander.js
 * - Verifies command routing, option parsing, and output
 *
 * @see cli-integration.story.md for requirements
 */

import { execa } from "execa";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("spx session commands", () => {
  let tempDir: string;
  let sessionsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "spx-session-cli-"));
    sessionsDir = join(tempDir, "sessions");
    await mkdir(join(sessionsDir, "todo"), { recursive: true });
    await mkdir(join(sessionsDir, "doing"), { recursive: true });
    await mkdir(join(sessionsDir, "archive"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("spx session --help", () => {
    it("GIVEN help flag WHEN session THEN shows all subcommands", async () => {
      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "--help"],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("pickup");
      expect(stdout).toContain("release");
      expect(stdout).toContain("list");
      expect(stdout).toContain("show");
      expect(stdout).toContain("handoff");
      expect(stdout).toContain("delete");
    });
  });

  describe("spx session list", () => {
    it("GIVEN empty directories WHEN list THEN shows no sessions", async () => {
      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "list", "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("(no sessions)");
    });

    it("GIVEN sessions in todo WHEN list THEN shows sessions", async () => {
      // Create a test session
      await writeFile(
        join(sessionsDir, "todo", "2026-01-13_08-00-00.md"),
        "---\npriority: high\n---\n# Test",
      );

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "list", "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("2026-01-13_08-00-00");
      expect(stdout).toContain("[high]");
    });

    it("GIVEN --json flag WHEN list THEN outputs JSON", async () => {
      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "list", "--json", "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      // Default list shows only doing + todo per DEFAULT_LIST_STATUSES
      expect(parsed).toHaveProperty("doing");
      expect(parsed).toHaveProperty("todo");
      expect(parsed).not.toHaveProperty("archive");
    });
  });

  describe("spx session show", () => {
    it("GIVEN session in todo WHEN show THEN displays content", async () => {
      const sessionId = "2026-01-13_08-00-00";
      await writeFile(
        join(sessionsDir, "todo", `${sessionId}.md`),
        "---\npriority: high\n---\n# Test Session\n\nContent here.",
      );

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "show", sessionId, "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Status: todo");
      expect(stdout).toContain("Priority: high");
      expect(stdout).toContain("# Test Session");
    });

    it("GIVEN non-existent session WHEN show THEN fails with error", async () => {
      const result = await execa(
        "node",
        ["bin/spx.js", "session", "show", "non-existent", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Session not found");
    });
  });

  describe("spx session pickup", () => {
    it("GIVEN session in todo WHEN pickup THEN moves to doing with PICKUP_ID tag", async () => {
      const sessionId = "2026-01-13_08-00-00";
      await writeFile(
        join(sessionsDir, "todo", `${sessionId}.md`),
        "---\npriority: medium\n---\n# Test",
      );

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "pickup", sessionId, "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`<PICKUP_ID>${sessionId}</PICKUP_ID>`);
      expect(stdout).toContain("Status: doing");
    });

    it("GIVEN sessions in todo WHEN pickup --auto THEN claims highest priority with PICKUP_ID tag", async () => {
      // Create sessions with different priorities
      await writeFile(
        join(sessionsDir, "todo", "2026-01-13_08-00-00.md"),
        "---\npriority: low\n---\n# Low",
      );
      await writeFile(
        join(sessionsDir, "todo", "2026-01-13_09-00-00.md"),
        "---\npriority: high\n---\n# High",
      );

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "pickup", "--auto", "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("<PICKUP_ID>2026-01-13_09-00-00</PICKUP_ID>");
    });

    it("GIVEN no sessions WHEN pickup --auto THEN fails with error", async () => {
      const result = await execa(
        "node",
        ["bin/spx.js", "session", "pickup", "--auto", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("No sessions available");
    });
  });

  describe("spx session release", () => {
    it("GIVEN claimed session WHEN release THEN moves to todo", async () => {
      const sessionId = "2026-01-13_08-00-00";
      await writeFile(
        join(sessionsDir, "doing", `${sessionId}.md`),
        "---\npriority: medium\n---\n# Test",
      );

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "release", sessionId, "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`Released session: ${sessionId}`);
      expect(stdout).toContain("returned to todo");
    });

    it("GIVEN no session in doing WHEN release THEN fails with error", async () => {
      const result = await execa(
        "node",
        ["bin/spx.js", "session", "release", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Session not claimed");
    });
  });

  describe("spx session handoff", () => {
    it("GIVEN no options WHEN handoff THEN creates session with HANDOFF_ID and SESSION_FILE tags", async () => {
      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "handoff", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), input: "" },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/<HANDOFF_ID>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}<\/HANDOFF_ID>/);
      expect(stdout).toMatch(/<SESSION_FILE>.*\.md<\/SESSION_FILE>/);
    });

    it("GIVEN content with frontmatter WHEN handoff THEN preserves priority and tags", async () => {
      // Priority and tags are now in frontmatter, not CLI args
      const contentWithFrontmatter = `---
priority: high
tags: [test, feature]
---
# Test Session

Content here.`;

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "handoff", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), input: contentWithFrontmatter },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/<HANDOFF_ID>/);

      // Verify the session was created with correct metadata
      const match = stdout.match(/<HANDOFF_ID>([^<]+)<\/HANDOFF_ID>/);
      expect(match).not.toBeNull();
      const sessionId = match![1];

      const showResult = await execa(
        "node",
        ["bin/spx.js", "session", "show", sessionId, "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );
      expect(showResult.stdout).toContain("Priority: high");
      expect(showResult.stdout).toContain("Tags: test, feature");
    });

    it("GIVEN content piped via stdin WHEN handoff THEN uses stdin content", async () => {
      const testContent = "# Session from stdin\n\nThis is piped content.";
      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "handoff", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), input: testContent },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/<HANDOFF_ID>/);

      // Extract session ID from HANDOFF_ID tag and verify content
      const match = stdout.match(/<HANDOFF_ID>([^<]+)<\/HANDOFF_ID>/);
      expect(match).not.toBeNull();
      const sessionId = match![1];

      const showResult = await execa(
        "node",
        ["bin/spx.js", "session", "show", sessionId, "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );
      expect(showResult.stdout).toContain("Session from stdin");
      expect(showResult.stdout).toContain("This is piped content");
    });
  });

  describe("spx session delete", () => {
    it("GIVEN session in todo WHEN delete THEN removes file", async () => {
      const sessionId = "2026-01-13_08-00-00";
      await writeFile(
        join(sessionsDir, "todo", `${sessionId}.md`),
        "# Test",
      );

      const { stdout, exitCode } = await execa(
        "node",
        ["bin/spx.js", "session", "delete", sessionId, "--sessions-dir", sessionsDir],
        { cwd: process.cwd() },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`Deleted session: ${sessionId}`);
    });

    it("GIVEN non-existent session WHEN delete THEN fails with error", async () => {
      const result = await execa(
        "node",
        ["bin/spx.js", "session", "delete", "non-existent", "--sessions-dir", sessionsDir],
        { cwd: process.cwd(), reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Session not found");
    });
  });

  describe("End-to-end workflow", () => {
    it(
      "GIVEN session WHEN handoff -> pickup -> release -> delete THEN completes with parseable tags",
      { timeout: 15000 },
      async () => {
        // Handoff - creates session with HANDOFF_ID tag
        const handoffResult = await execa(
          "node",
          ["bin/spx.js", "session", "handoff", "--sessions-dir", sessionsDir],
          { cwd: process.cwd(), input: "" },
        );
        expect(handoffResult.exitCode).toBe(0);

        // Extract session ID from HANDOFF_ID tag
        const handoffMatch = handoffResult.stdout.match(/<HANDOFF_ID>([^<]+)<\/HANDOFF_ID>/);
        expect(handoffMatch).not.toBeNull();
        const sessionId = handoffMatch![1];

        // Pickup - returns session with PICKUP_ID tag
        const pickupResult = await execa(
          "node",
          ["bin/spx.js", "session", "pickup", sessionId, "--sessions-dir", sessionsDir],
          { cwd: process.cwd() },
        );
        expect(pickupResult.exitCode).toBe(0);
        expect(pickupResult.stdout).toContain(`<PICKUP_ID>${sessionId}</PICKUP_ID>`);

        // Release
        const releaseResult = await execa(
          "node",
          ["bin/spx.js", "session", "release", sessionId, "--sessions-dir", sessionsDir],
          { cwd: process.cwd() },
        );
        expect(releaseResult.exitCode).toBe(0);

        // Delete
        const deleteResult = await execa(
          "node",
          ["bin/spx.js", "session", "delete", sessionId, "--sessions-dir", sessionsDir],
          { cwd: process.cwd() },
        );
        expect(deleteResult.exitCode).toBe(0);
      },
    );
  });
});
