/**
 * Integration tests for session list and claimable-list CLI subcommands.
 *
 * Test Level: 2 (Integration)
 * - Exercises Commander.js routing via real CLI execution
 * - Verifies subcommand wiring, option parsing, and output
 *
 * Assertions covered from core-operations.md:
 * - S4: the claimable-list command shows only claimable sessions
 * - S2: the default list shows doing + claimable sessions
 * - Input validation: --status with invalid value shows error
 */
import { SESSION_LIST_EMPTY_TEXT } from "@/commands/session/list";
import { DEFAULT_LIST_STATUSES, SESSION_PRIORITY, SESSION_STATUSES } from "@/domains/session/types";
import { sessionCliDefinition } from "@/interfaces/cli/session/definition";
import { sampleDistinctSessionIds, sampleSessionId } from "@testing/generators/session/session";
import type { SessionHarness } from "@testing/harnesses/session/harness";
import { createSessionHarness, runSessionCli } from "@testing/harnesses/session/harness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const [TODO] = SESSION_STATUSES;
const sessionDomain = sessionCliDefinition.domain.commandName;
const sessionSubcommand = sessionCliDefinition.subcommands;
const sessionOption = sessionCliDefinition.options;
async function runSpx(...args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return runSessionCli(args);
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
    const [todoSessionId, doingSessionId] = sampleDistinctSessionIds(2);
    await harness.writeSession(TODO, todoSessionId, { priority: SESSION_PRIORITY.HIGH });
    await harness.writeSession(SESSION_STATUSES[1], doingSessionId);
    const { stdout, exitCode } = await runSpx(
      sessionDomain,
      sessionSubcommand.todo.commandName,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    );
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
    const { stdout, exitCode } = await runSpx(
      sessionDomain,
      sessionSubcommand.todo.commandName,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${TODO.toUpperCase()}:`);
    expect(stdout).toContain(SESSION_LIST_EMPTY_TEXT);
  });
  it("GIVEN --json flag WHEN spx session todo --json THEN JSON has only todo key", async () => {
    await harness.writeSession(TODO, sampleSessionId());
    const { stdout, exitCode } = await runSpx(
      sessionDomain,
      sessionSubcommand.todo.commandName,
      sessionOption.json.flag,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    );
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
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.status.flag,
      "all",
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    );
    expect(exitCode).toBe(1);
    for (const status of SESSION_STATUSES) {
      expect(stderr).toContain(status);
    }
  });
  it("GIVEN default WHEN spx session list THEN output matches DEFAULT_LIST_STATUSES", async () => {
    const ids = sampleDistinctSessionIds(SESSION_STATUSES.length);
    for (const [index, status] of SESSION_STATUSES.entries()) {
      await harness.writeSession(status, ids[index]);
    }
    const { stdout, exitCode } = await runSpx(
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    );
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
