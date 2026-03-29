/**
 * Integration tests for session list and todo CLI subcommands.
 *
 * Test Level: 2 (Integration)
 * - Exercises Commander.js routing via real CLI execution
 * - Verifies subcommand wiring, option parsing, and output
 *
 * Assertions covered from core-operations.md:
 * - S4: spx session todo shows only todo sessions
 * - S2: spx session list default shows doing + todo
 * - Input validation: --status with invalid value shows error
 */

import { execa } from "execa";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { DEFAULT_LIST_STATUSES, SESSION_STATUSES, type SessionStatus } from "@/session/types";
import { createTempSessionsDir } from "./helpers";

const { statusDirs } = DEFAULT_CONFIG.sessions;
const [TODO] = SESSION_STATUSES;
const CLI_ENTRY = "bin/spx.js";

function statusDir(sessionsRoot: string, status: SessionStatus): string {
  return join(sessionsRoot, statusDirs[status]);
}

async function writeSession(dir: string, id: string, priority: string = "medium"): Promise<void> {
  await writeFile(join(dir, `${id}.md`), `---\npriority: ${priority}\n---\n# Session ${id}\n`);
}

async function runSpx(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [CLI_ENTRY, ...args], { cwd: process.cwd(), reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

describe("spx session todo (CLI integration)", () => {
  let sessionsDir: string;

  beforeEach(async () => {
    sessionsDir = await createTempSessionsDir();
    for (const status of SESSION_STATUSES) {
      await mkdir(statusDir(sessionsDir, status), { recursive: true });
    }
  });

  afterEach(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });

  it("GIVEN sessions in todo WHEN spx session todo THEN shows only todo sessions", async () => {
    await writeSession(statusDir(sessionsDir, TODO), "2026-01-10_10-00-00", "high");
    await writeSession(statusDir(sessionsDir, SESSION_STATUSES[1]), "2026-01-11_10-00-00");

    const { stdout, exitCode } = await runSpx("session", "todo", "--sessions-dir", sessionsDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${TODO.toUpperCase()}:`);
    expect(stdout).toContain("2026-01-10_10-00-00");
    // Must not contain other status sections
    for (const other of SESSION_STATUSES) {
      if (other !== TODO) {
        expect(stdout).not.toContain(`${other.toUpperCase()}:`);
      }
    }
  });

  it("GIVEN empty todo WHEN spx session todo THEN shows no sessions", async () => {
    const { stdout, exitCode } = await runSpx("session", "todo", "--sessions-dir", sessionsDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${TODO.toUpperCase()}:`);
    expect(stdout).toContain("(no sessions)");
  });

  it("GIVEN --json flag WHEN spx session todo --json THEN JSON has only todo key", async () => {
    await writeSession(statusDir(sessionsDir, TODO), "2026-01-10_10-00-00");

    const { stdout, exitCode } = await runSpx("session", "todo", "--json", "--sessions-dir", sessionsDir);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty(TODO);
    for (const other of SESSION_STATUSES) {
      if (other !== TODO) {
        expect(parsed).not.toHaveProperty(other);
      }
    }
  });
});

describe("spx session list --status validation (CLI integration)", () => {
  let sessionsDir: string;

  beforeEach(async () => {
    sessionsDir = await createTempSessionsDir();
    for (const status of SESSION_STATUSES) {
      await mkdir(statusDir(sessionsDir, status), { recursive: true });
    }
  });

  afterEach(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });

  it("GIVEN invalid --status WHEN spx session list --status all THEN exits non-zero with valid values", async () => {
    const { stderr, exitCode } = await runSpx("session", "list", "--status", "all", "--sessions-dir", sessionsDir);

    expect(exitCode).toBe(1);
    for (const status of SESSION_STATUSES) {
      expect(stderr).toContain(status);
    }
  });

  it("GIVEN default WHEN spx session list THEN output matches DEFAULT_LIST_STATUSES", async () => {
    for (const status of SESSION_STATUSES) {
      await writeSession(statusDir(sessionsDir, status), `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
    }

    const { stdout, exitCode } = await runSpx("session", "list", "--sessions-dir", sessionsDir);

    expect(exitCode).toBe(0);
    for (const status of DEFAULT_LIST_STATUSES) {
      expect(stdout).toContain(`${status.toUpperCase()}:`);
    }
    for (const status of SESSION_STATUSES) {
      if (!DEFAULT_LIST_STATUSES.includes(status)) {
        expect(stdout).not.toContain(`${status.toUpperCase()}:`);
      }
    }
  });
});
