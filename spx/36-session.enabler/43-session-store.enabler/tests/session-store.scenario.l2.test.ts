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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_LIST_EMPTY_TEXT } from "@/commands/session/list";
import { DEFAULT_LIST_STATUSES, SESSION_PRIORITY, SESSION_STATUSES } from "@/domains/session/types";
import type { SessionHarness } from "@testing/harnesses/session/harness";
import { createSessionHarness } from "@testing/harnesses/session/harness";

const [TODO] = SESSION_STATUSES;
const CLI_ENTRY = "bin/spx.js";

async function runSpx(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [CLI_ENTRY, ...args], { cwd: process.cwd(), reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

describe("spx session todo (CLI integration)", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN sessions in todo WHEN spx session todo THEN shows only todo sessions", async () => {
    const todoSessionId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, todoSessionId, { priority: SESSION_PRIORITY.HIGH });
    await harness.writeSession(SESSION_STATUSES[1], "2026-01-11_10-00-00");

    const { stdout, exitCode } = await runSpx("session", "todo", "--sessions-dir", harness.sessionsDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${TODO.toUpperCase()}:`);
    expect(stdout).toContain(todoSessionId);
    for (const other of SESSION_STATUSES) {
      if (other !== TODO) {
        expect(stdout).not.toContain(`${other.toUpperCase()}:`);
      }
    }
  });

  it("GIVEN empty todo WHEN spx session todo THEN shows no sessions", async () => {
    const { stdout, exitCode } = await runSpx("session", "todo", "--sessions-dir", harness.sessionsDir);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${TODO.toUpperCase()}:`);
    expect(stdout).toContain(SESSION_LIST_EMPTY_TEXT);
  });

  it("GIVEN --json flag WHEN spx session todo --json THEN JSON has only todo key", async () => {
    await harness.writeSession(TODO, "2026-01-10_10-00-00");

    const { stdout, exitCode } = await runSpx("session", "todo", "--json", "--sessions-dir", harness.sessionsDir);

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
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN invalid --status WHEN spx session list --status all THEN exits non-zero with valid values", async () => {
    const { stderr, exitCode } = await runSpx(
      "session",
      "list",
      "--status",
      "all",
      "--sessions-dir",
      harness.sessionsDir,
    );

    expect(exitCode).toBe(1);
    for (const status of SESSION_STATUSES) {
      expect(stderr).toContain(status);
    }
  });

  it("GIVEN default WHEN spx session list THEN output matches DEFAULT_LIST_STATUSES", async () => {
    for (const status of SESSION_STATUSES) {
      await harness.writeSession(status, `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
    }

    const { stdout, exitCode } = await runSpx("session", "list", "--sessions-dir", harness.sessionsDir);

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
